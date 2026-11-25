import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import type { SubAdminPermission, UserRole } from './auth.js';

/**
 * Authoritative Super Admin email address.
 * Access requires a cryptographically verified Firebase Authentication ID token
 * with email_verified === true matching this exact address.
 * No Firebase Admin SDK custom claims or IAM permissions are required.
 */
export const SUPER_ADMIN_EMAIL = 'riyazmohmmad80@gmail.com';

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

const REMIX_PROJECT_PLACEHOLDER = 'remixed-project-id';
const REMIX_DB_PLACEHOLDER = 'remixed-firestore-database-id';

let cachedConfig: FirebaseAppletConfig | null = null;
let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Firebase configuration file (firebase-applet-config.json) was not found.');
  }
  const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseAppletConfig;
  if (
    !parsed.projectId ||
    parsed.projectId === REMIX_PROJECT_PLACEHOLDER ||
    parsed.firestoreDatabaseId === REMIX_DB_PLACEHOLDER
  ) {
    throw new Error('Firebase project is not provisioned yet. Please complete Firebase setup first.');
  }
  cachedConfig = parsed;
  return parsed;
}

export function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;
  const cfg = loadFirebaseAppletConfig();
  // Initialize with projectId only — verifyIdToken(token) needs no IAM and works on Starter Tier
  cachedApp = getApps().length ? getApp() : initializeApp({ projectId: cfg.projectId });
  return cachedApp;
}

export function getFirebaseAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseAdminApp());
  return cachedAuth;
}

export function isSuperAdminEmailAddress(email?: string | null): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isVerifiedSuperAdminEmail(email?: string | null, emailVerified?: boolean): boolean {
  return emailVerified === true && isSuperAdminEmailAddress(email);
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  isSuperAdminEmail: boolean;
  isVerifiedSuperAdmin: boolean;
  name?: string;
  roleClaim?: UserRole;
  isAdminClaim: boolean;
  isSuperAdminClaim: boolean;
  permissionsClaim?: SubAdminPermission[];
}

/**
 * Cryptographically verifies a Firebase Auth ID token using Google's public certs.
 * Requires NO IAM roles and works on both Starter Tier and standard Google Cloud projects.
 */
export async function verifyFirebaseIdTokenWithAdmin(
  idToken: string
): Promise<VerifiedFirebaseToken | null> {
  try {
    const adminAuth = getFirebaseAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.uid) return null;

    const cleanEmail = typeof decoded.email === 'string' ? decoded.email.toLowerCase().trim() : '';
    const emailVerified = decoded.email_verified === true;
    const isSuperAdminEmail = isSuperAdminEmailAddress(cleanEmail);
    const isVerifiedSuperAdmin = isVerifiedSuperAdminEmail(cleanEmail, emailVerified);

    const rawRole = typeof decoded.role === 'string' ? decoded.role : undefined;
    const validRole: UserRole | undefined =
      rawRole === 'super_admin' ||
      rawRole === 'admin' ||
      rawRole === 'sub_admin' ||
      rawRole === 'teacher' ||
      rawRole === 'student'
        ? rawRole
        : undefined;

    // Never allow a custom claim to grant super_admin to any email other than the verified Super Admin
    const isSuperAdminClaim = isVerifiedSuperAdmin;
    const isAdminClaim =
      isVerifiedSuperAdmin ||
      (emailVerified &&
        (decoded.admin === true || validRole === 'admin' || validRole === 'sub_admin'));

    const permissionsClaim = Array.isArray(decoded.permissions)
      ? (decoded.permissions.filter((p): p is SubAdminPermission => typeof p === 'string') as SubAdminPermission[])
      : undefined;

    return {
      uid: decoded.uid,
      email: cleanEmail,
      emailVerified,
      isSuperAdminEmail,
      isVerifiedSuperAdmin,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      roleClaim: validRole === 'super_admin' && !isVerifiedSuperAdmin ? undefined : validRole,
      isAdminClaim,
      isSuperAdminClaim,
      permissionsClaim,
    };
  } catch (err) {
    console.error('Firebase ID token verification failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface InitialAdminSetupStatus {
  setupAvailable: boolean;
  initialized: boolean;
  iamRequired?: boolean;
  superAdminMode?: 'verified_email';
  error?: string;
}

/**
 * Super Admin access is configured automatically for the verified Super Admin Firebase email
 * without requiring manual setup or Admin SDK IAM permissions.
 */
export async function getInitialAdminSetupStatus(): Promise<InitialAdminSetupStatus> {
  return {
    setupAvailable: false,
    initialized: true,
    iamRequired: false,
    superAdminMode: 'verified_email',
  };
}
