import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmailAddress,
  verifyFirebaseIdTokenWithAdmin,
} from './firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'visualearn_super_secure_jwt_secret_key_2026';

export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin' | 'sub_admin';

export type SubAdminPermission =
  | 'manage_students'
  | 'manage_teachers'
  | 'manage_subjects_classes'
  | 'manage_content'
  | 'manage_live_classes'
  | 'view_analytics';

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  institution?: string;
  status?: 'active' | 'disabled';
  permissions?: SubAdminPermission[];
  adminSetupCompleted?: boolean;
  temporaryCredentials?: boolean;
  emailVerified?: boolean;
  studentId?: string;
  teacherId?: string;
  adminId?: string;
  avatar?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// Lightweight secure JWT implementation without external deps
export function signJwt(payload: UserPayload, expiresInSeconds = 7 * 24 * 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodeBase64Url = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(fullPayload);

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string): UserPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSignature) {
      return null;
    }

    const payloadJson = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      institution: payload.institution,
      status: payload.status,
      permissions: payload.permissions,
      adminSetupCompleted: payload.adminSetupCompleted,
      temporaryCredentials: payload.temporaryCredentials,
      emailVerified: payload.emailVerified === true,
    };
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

function sanitizeResolvedRole(role: UserRole, email: string, emailVerified: boolean): UserRole {
  if (role === 'super_admin') {
    return emailVerified && isSuperAdminEmailAddress(email) ? 'super_admin' : 'student';
  }
  return role;
}

export async function resolveUserFromBearerToken(token: string): Promise<UserPayload | null> {
  // 1. Primary path: verify backend-issued HS256 JWT
  const jwtUser = verifyJwt(token);
  if (jwtUser) {
    const dbUser =
      db.users.find((u) => u.id === jwtUser.id) ||
      (jwtUser.email ? db.users.find((u) => u.email.toLowerCase() === jwtUser.email.toLowerCase()) : undefined);

    if (dbUser) {
      const verified = jwtUser.emailVerified === true || dbUser.emailVerified === true;
      const safeRole = sanitizeResolvedRole(dbUser.role, dbUser.email, verified);
      return {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: safeRole,
        institution: dbUser.institution,
        status: dbUser.status || 'active',
        permissions: dbUser.permissions,
        adminSetupCompleted: safeRole === 'super_admin' ? true : dbUser.adminSetupCompleted,
        temporaryCredentials: false,
        emailVerified: verified,
      };
    }

    const safeJwtRole = sanitizeResolvedRole(jwtUser.role, jwtUser.email, jwtUser.emailVerified === true);
    return {
      ...jwtUser,
      role: safeJwtRole,
    };
  }

  // 2. Fallback path: cryptographically verify a Firebase Auth ID token (requires no IAM)
  const verifiedFirebase = await verifyFirebaseIdTokenWithAdmin(token);
  if (!verifiedFirebase || !verifiedFirebase.uid) {
    return null;
  }

  // Require verified email before granting Super Admin role
  if (verifiedFirebase.isVerifiedSuperAdmin) {
    const dbUser =
      db.users.find((u) => u.id === verifiedFirebase.uid) ||
      db.users.find((u) => u.email.toLowerCase() === SUPER_ADMIN_EMAIL);

    return {
      id: dbUser?.id || verifiedFirebase.uid,
      name: dbUser?.name || verifiedFirebase.name || 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      role: 'super_admin',
      institution: dbUser?.institution || 'VisuaLearn Administration',
      status: 'active',
      adminSetupCompleted: true,
      temporaryCredentials: false,
      emailVerified: true,
    };
  }

  // Unverified token for the Super Admin email must NEVER receive Super Admin privileges
  if (verifiedFirebase.isSuperAdminEmail && !verifiedFirebase.emailVerified) {
    return null;
  }

  const dbUser =
    db.users.find((u) => u.id === verifiedFirebase.uid) ||
    (verifiedFirebase.email
      ? db.users.find((u) => u.email.toLowerCase() === verifiedFirebase.email.toLowerCase())
      : undefined);

  if (dbUser) {
    const safeRole = sanitizeResolvedRole(dbUser.role, dbUser.email, verifiedFirebase.emailVerified);
    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: safeRole,
      institution: dbUser.institution,
      status: dbUser.status || 'active',
      permissions: dbUser.permissions,
      adminSetupCompleted: dbUser.adminSetupCompleted,
      temporaryCredentials: false,
      emailVerified: verifiedFirebase.emailVerified,
    };
  }

  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Please sign in.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please sign in.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  resolveUserFromBearerToken(token)
    .then((user) => {
      if (!user) {
        res.status(401).json({
          error: 'Session expired or invalid token. Please sign in again.',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      if (user.status === 'disabled') {
        console.warn(`[Auth 403] Disabled account rejected on ${req.method} ${req.originalUrl}: userId=${user.id}`);
        res.status(403).json({
          error: 'Your account has been deactivated. Please contact an administrator.',
          code: 'ACCOUNT_DISABLED',
        });
        return;
      }

      req.user = user;
      next();
    })
    .catch((err) => {
      console.error('[Auth] Token verification error:', err instanceof Error ? err.message : err);
      res.status(401).json({
        error: 'Session verification failed. Please sign in again.',
        code: 'INVALID_TOKEN',
      });
    });
}

export function requireTeacher(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'teacher') {
      console.warn(
        `[Auth 403] Teacher role required on ${req.method} ${req.originalUrl}: userId=${req.user?.id} role=${req.user?.role}`
      );
      res.status(403).json({
        error: 'Access denied: Only instructor (teacher) accounts are authorized to perform this action.',
        code: 'TEACHER_ROLE_REQUIRED',
      });
      return;
    }
    next();
  });
}

// Special authorization middleware for Super Admin security routes
export function requireSuperAdminForSecuritySetup(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'super_admin' || !isSuperAdminEmailAddress(req.user.email)) {
      res.status(403).json({ error: 'Access denied: Verified Super Administrator privileges required.' });
      return;
    }
    next();
  });
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?.role !== 'sub_admin') {
      res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
      return;
    }
    if (req.user.role === 'super_admin' && !isSuperAdminEmailAddress(req.user.email)) {
      res.status(403).json({ error: 'Access denied: Unauthorized Super Administrator account.' });
      return;
    }
    next();
  });
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'super_admin' || !isSuperAdminEmailAddress(req.user.email)) {
      res.status(403).json({ error: 'Access denied: Verified Super Administrator privileges required.' });
      return;
    }
    next();
  });
}

export function requirePermission(permission: SubAdminPermission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (req.user?.role === 'super_admin' && isSuperAdminEmailAddress(req.user.email)) {
        return next();
      }
      if (req.user?.role === 'admin') {
        return next();
      }
      if (req.user?.role === 'sub_admin' && req.user?.permissions?.includes(permission)) {
        return next();
      }
      res.status(403).json({
        error: `Access denied: You do not possess the required permission [${permission}].`,
      });
    });
  };
}
