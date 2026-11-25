import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  db,
  User,
  Subject,
  Chapter,
  Topic,
  Subtopic,
  NoteDocument,
  MaterialItem,
  Quiz,
  QuizAttempt,
  QuizSubmission,
  Assignment,
  AssignmentSubmission,
  StudentProgress,
  Enrollment,
  LiveClass,
  DoubtItem,
  DoubtReply,
  SimulationItem,
  SimulationProgressItem,
  SmartStudyPlan,
  SmartStudyStep,
  VideoProgressItem,
  MaterialAccessLog,
  AiChatSession,
  AiChatMessage,
  generateClassCode,
} from './db.js';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  resolveUserFromBearerToken,
  requireAuth,
  requireTeacher,
  requireAdmin,
  requireSuperAdmin,
  requireSuperAdminForSecuritySetup,
  requirePermission,
  AuthenticatedRequest,
} from './auth.js';
import { closeRoomByClassId } from './liveSocket.js';
import { sendAdminVerificationEmail, sendProfileEmailVerification } from './email.js';
import { solveAcademicDoubt } from './gemini.js';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmailAddress,
  verifyFirebaseIdTokenWithAdmin,
  getInitialAdminSetupStatus,
} from './firebaseAdmin.js';
import {
  getVerifiedAdminDataset,
  getValidSubjectEnrollments,
  isFirebaseUid,
  migrateUserIdReferences,
  reconcileFirestoreDirectoryToBackend,
  sanitizePermissions,
} from './adminDataIntegrity.js';
import type { StudentAnalyticsData, TeacherClassAnalytics, AdminAnalyticsData } from '../src/types/index.ts';

export const router = Router();

// Persistent Uploads Directory Configuration
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Format bytes helper
function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Multer Storage Configuration for PDF materials
const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    cb(null, `${safeBase}_${unique}${ext}`);
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' || file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  },
});

// Multer Storage Configuration for doubt attachments
const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    cb(null, `${safeBase}_${unique}${ext}`);
  },
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Multer Storage & Validation for Curriculum Videos, Simulations, and Thumbnails
const curriculumMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const unique = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    cb(null, `${safeBase || 'media'}_${unique}${ext}`);
  },
});

const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.m4v']);
const videoMediaUpload = multer({
  storage: curriculumMediaStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_VIDEO_EXTS.has(ext) && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Unsupported video format. Please upload MP4, WebM, OGG, or MOV files.'));
    }
    cb(null, true);
  },
});

const ALLOWED_SIM_EXTS = new Set(['.html', '.htm', '.svg', '.pdf']);
const simulationMediaUpload = multer({
  storage: curriculumMediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_SIM_EXTS.has(ext)) {
      return cb(new Error('Unsupported simulation file. Please upload an HTML (.html/.htm), SVG, or PDF simulation file.'));
    }
    cb(null, true);
  },
});

const ALLOWED_THUMB_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const thumbnailMediaUpload = multer({
  storage: curriculumMediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_THUMB_EXTS.has(ext) && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Unsupported thumbnail format. Please upload JPG, PNG, WebP, or GIF images.'));
    }
    cb(null, true);
  },
});

// Teacher Curriculum Media Upload Endpoints (store binaries on disk, save URL references in Firestore)
router.post('/uploads/video', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  videoMediaUpload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Video upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No video file provided.' });
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      size: req.file.size,
      formattedSize: formatBytes(req.file.size),
      mimeType: req.file.mimetype,
    });
  });
});

router.post('/uploads/simulation', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  simulationMediaUpload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Simulation file upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No simulation file provided.' });
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      size: req.file.size,
      formattedSize: formatBytes(req.file.size),
      mimeType: req.file.mimetype,
    });
  });
});

router.post('/uploads/thumbnail', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  thumbnailMediaUpload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Thumbnail upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No thumbnail image provided.' });
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      size: req.file.size,
      formattedSize: formatBytes(req.file.size),
      mimeType: req.file.mimetype,
    });
  });
});

// Assignment file upload configuration (safe document, archive & image extensions only; max 25 MB)
const SAFE_ASSIGNMENT_FILE_EXTS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.zip',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

const assignmentFileUpload = multer({
  storage: curriculumMediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // Hard server ceiling: 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SAFE_ASSIGNMENT_FILE_EXTS.has(ext)) {
      return cb(new Error(`Unsupported file type (${ext || 'unknown'}). Allowed formats: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, CSV, ZIP, PNG, JPG, WEBP.`));
    }
    cb(null, true);
  },
});

function sanitizeOptionalIsoDate(val: unknown): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  const parsed = new Date(val.trim());
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function isSafeAttachmentUrlServer(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (trimmed === '#') return false;
  if (trimmed.startsWith('/uploads/') && !trimmed.includes('..')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeAllowedFileTypes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ['.pdf', '.docx', '.zip', '.png', '.jpg'];
  }
  const normalized = raw
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .map((ext) => (ext && !ext.startsWith('.') ? `.${ext}` : ext))
    .filter((ext) => SAFE_ASSIGNMENT_FILE_EXTS.has(ext));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['.pdf', '.docx', '.zip', '.png', '.jpg'];
}

function stripQuizAnswersForStudent(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: (quiz.questions || []).map((q) => ({
      id: q.id,
      question: q.question,
      question_type: q.question_type,
      options: q.options,
      correct_answer: '',
      explanation: '',
    })),
  };
}

function getQuizTeacherName(quiz: Quiz, subj?: Subject): string {
  if (quiz.teacher_name) return quiz.teacher_name;
  if (subj?.teacher_name) return subj.teacher_name;
  const t = db.users.find((u) => u.id === (quiz.teacher_id || subj?.teacher_id));
  return t?.name || 'Course Instructor';
}

function getAssignmentTeacherName(asg: Assignment, subj?: Subject): string {
  if (asg.teacher_name) return asg.teacher_name;
  if (subj?.teacher_name) return subj.teacher_name;
  const t = db.users.find((u) => u.id === (asg.teacher_id || subj?.teacher_id));
  return t?.name || 'Course Instructor';
}

// Authoritative server time endpoint for synced live countdowns
router.get('/time', (_req: Request, res: Response): void => {
  res.json({ serverTime: new Date().toISOString() });
});

// Teacher upload reference attachment (PDF / worksheet / archive) for an assignment
router.post('/uploads/assignment-attachment', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  assignmentFileUpload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Assignment attachment upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No attachment file provided.' });
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      size: req.file.size,
      formattedSize: formatBytes(req.file.size),
      mimeType: req.file.mimetype,
    });
  });
});

// Helper to verify student enrollment in a subject/class
function isStudentEnrolled(studentId: string, subjectId: string): boolean {
  return db.enrollments.some((e) => e.student_id === studentId && e.subject_id === subjectId);
}

// Helper: Format user object for client authentication and profile responses
function formatAuthUser(user: User) {
  const isSetupCompleted = user.role === 'super_admin' ? (user.adminSetupCompleted === true) : true;
  const isTemporary = user.role === 'super_admin' ? (user.temporaryCredentials === true || !user.adminSetupCompleted) : false;
  return {
    id: user.id,
    uid: user.id,
    name: user.name,
    fullName: user.name,
    email: user.email,
    role: user.role,
    institution: user.institution || '',
    status: user.status || 'active',
    accountStatus: user.status || 'active',
    profileCompleted: true,
    permissions: user.permissions,
    adminSetupCompleted: isSetupCompleted,
    temporaryCredentials: isTemporary,
    phone: user.phone || '',
    dateOfBirth: user.dateOfBirth || '',
    gender: user.gender || '',
    bio: user.bio || '',
    avatar: user.avatar || '',
    qualification: user.qualification || '',
    specialization: user.specialization || '',
    studentId: user.studentId || (user.role === 'student' ? `STU-${user.id.slice(-4).toUpperCase()}` : ''),
    teacherId: user.teacherId || (user.role === 'teacher' ? `FAC-${user.id.slice(-4).toUpperCase()}` : ''),
    adminId: user.adminId || (user.role === 'admin' || user.role === 'super_admin' || user.role === 'sub_admin' ? `ADM-${user.id.slice(-4).toUpperCase()}` : ''),
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

// ==========================================
// 1. AUTHENTICATION & INITIAL ADMIN SETUP ROUTES
// ==========================================

// GET /api/auth/initial-admin-status - Check whether one-time Initial Admin Setup is still available
router.get('/auth/initial-admin-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await getInitialAdminSetupStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({
      setupAvailable: false,
      initialized: false,
      error: err?.message || 'Unable to verify initial administrator setup status.',
    });
  }
});

// POST /api/auth/initial-admin-setup - Disabled: Super Admin is exclusively bound to verified Super Admin Firebase email
router.post('/auth/initial-admin-setup', (_req: Request, res: Response): void => {
  res.status(403).json({
    error:
      'Public Administrator registration is permanently disabled. Sign in with the authorized verified Super Admin Firebase account.',
  });
});

router.post('/auth/firebase-sync', async (req: Request, res: Response): Promise<void> => {
  const {
    idToken,
    fullName,
    role,
    institution,
    avatar,
    phone,
    dateOfBirth,
    gender,
    bio,
    qualification,
    specialization,
    studentId,
    teacherId,
    accountStatus,
  } = req.body || {};

  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'Firebase ID token is required.' });
    return;
  }

  // Verify token cryptographically via Firebase ID token verification (requires no IAM)
  const verified = await verifyFirebaseIdTokenWithAdmin(idToken);
  if (!verified || !verified.uid || !verified.email) {
    res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
    return;
  }

  const uid = verified.uid;
  const email = verified.email;

  // Strictly require email_verified === true before granting Super Admin access
  if (verified.isSuperAdminEmail && !verified.emailVerified) {
    res.status(403).json({
      error:
        'Email verification is required before Super Admin access can be granted. Please verify your email address in your inbox and sign in again.',
      code: 'EMAIL_VERIFICATION_REQUIRED',
      requiresEmailVerification: true,
    });
    return;
  }

  // Match existing record by canonical Firebase UID first, or normalized email match
  let user = db.users.find((u) => u.id === uid) || db.users.find((u) => u.email.toLowerCase() === email);

  if (user) {
    if (!verified.isVerifiedSuperAdmin && (user.status === 'disabled' || accountStatus === 'disabled')) {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
      return;
    }

    // Re-bind legacy local usr_* ID to the authoritative Firebase Auth UID and migrate foreign keys
    if (user.id !== uid && user.email.toLowerCase() === email && (!isFirebaseUid(user.id) || verified.isVerifiedSuperAdmin)) {
      const oldId = user.id;
      migrateUserIdReferences(oldId, uid);
      user.id = uid;
    }

    // Preserve existing user data and authoritative role; update safe profile metadata
    if (typeof fullName === 'string' && fullName.trim()) {
      user.name = fullName.trim();
    }
    if (typeof institution === 'string' && institution.trim()) {
      user.institution = institution.trim();
    }
    if (typeof avatar === 'string' && avatar.trim()) {
      user.avatar = avatar;
    }
    if (typeof phone === 'string' && phone.trim()) {
      user.phone = phone.trim();
    }
    if (typeof dateOfBirth === 'string' && dateOfBirth.trim()) {
      user.dateOfBirth = dateOfBirth.trim();
    }
    if (typeof gender === 'string' && gender.trim()) {
      user.gender = gender.trim();
    }
    if (typeof bio === 'string' && bio.trim()) {
      user.bio = bio.trim();
    }
    if (typeof qualification === 'string' && qualification.trim()) {
      user.qualification = qualification.trim();
    }
    if (typeof specialization === 'string' && specialization.trim()) {
      user.specialization = specialization.trim();
    }

    user.emailVerified = verified.emailVerified;

    if (verified.isVerifiedSuperAdmin) {
      // Authoritatively recognize the verified Super Admin email without custom claims
      user.role = 'super_admin';
      user.status = 'active';
      user.adminId = user.adminId || `ADM-${uid.slice(0, 6).toUpperCase()}`;
      user.adminSetupCompleted = true;
      user.temporaryCredentials = false;
      db.settings.adminSetupCompleted = true;
    } else if (user.role === 'super_admin') {
      // Defense in depth: reject unauthorized super_admin record rather than silently disguising as student
      res.status(403).json({
        error: 'Account role configuration conflict. Please contact the Super Administrator.',
        code: 'ROLE_CONFIGURATION_CONFLICT',
      });
      return;
    }

    user.last_login_at = new Date().toISOString();
    db.persist();
  } else {
    // New Firebase user synced to backend: NEVER allow ordinary self-escalation to admin roles
    if (!verified.isVerifiedSuperAdmin && (role === 'admin' || role === 'super_admin' || role === 'sub_admin')) {
      res.status(403).json({
        error: 'Access denied: Administrator roles cannot be self-assigned from the client.',
      });
      return;
    }

    // Never silently guess a missing/invalid role as 'student'
    if (!verified.isVerifiedSuperAdmin && role !== 'teacher' && role !== 'student') {
      res.status(400).json({
        error: 'A valid account role ("student" or "teacher") is required to initialize this account.',
        code: 'INVALID_USER_ROLE',
      });
      return;
    }

    const assignedRole: User['role'] = verified.isVerifiedSuperAdmin
      ? 'super_admin'
      : role === 'teacher'
      ? 'teacher'
      : 'student';

    const idSuffix = uid.slice(0, 6).toUpperCase();
    user = {
      id: uid,
      name: (typeof fullName === 'string' && fullName.trim()) || verified.name || email.split('@')[0],
      email,
      password_hash: 'FIREBASE_AUTH_MANAGED',
      role: assignedRole,
      institution:
        typeof institution === 'string' && institution.trim()
          ? institution.trim()
          : verified.isVerifiedSuperAdmin
          ? 'VisuaLearn Administration'
          : '',
      status: 'active',
      emailVerified: verified.emailVerified,
      adminSetupCompleted: verified.isVerifiedSuperAdmin ? true : undefined,
      temporaryCredentials: false,
      phone: typeof phone === 'string' ? phone.trim() : '',
      dateOfBirth: typeof dateOfBirth === 'string' ? dateOfBirth.trim() : '',
      gender: typeof gender === 'string' ? gender.trim() : '',
      bio: typeof bio === 'string' ? bio.trim() : '',
      avatar: typeof avatar === 'string' ? avatar : '',
      qualification: typeof qualification === 'string' ? qualification.trim() : '',
      specialization: typeof specialization === 'string' ? specialization.trim() : '',
      studentId: assignedRole === 'student' ? studentId || `STU-${idSuffix}` : undefined,
      teacherId: assignedRole === 'teacher' ? teacherId || `FAC-${idSuffix}` : undefined,
      adminId: verified.isVerifiedSuperAdmin ? `ADM-${idSuffix}` : undefined,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    if (verified.isVerifiedSuperAdmin) {
      db.settings.adminSetupCompleted = true;
    }

    db.users.push(user);
    db.persist();
  }

  const token = signJwt({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institution: user.institution,
    status: user.status || 'active',
    permissions: user.permissions,
    emailVerified: verified.emailVerified,
    adminSetupCompleted:
      user.role === 'super_admin' || user.role === 'admin' ? true : user.adminSetupCompleted,
    temporaryCredentials: false,
  });

  res.json({
    message: 'Firebase session synchronized',
    token,
    user: formatAuthUser(user),
  });
});

router.post('/auth/register', (req: Request, res: Response): void => {
  const { name, email, password, confirmPassword, role, institution } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'Please provide full name, email, password, and role.' });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (role !== 'student' && role !== 'teacher') {
    res.status(400).json({ error: 'Invalid role specified. Must be student or teacher.' });
    return;
  }

  if (isSuperAdminEmailAddress(email)) {
    res.status(403).json({
      error: 'This email is reserved for the Super Admin Firebase account. Please sign in with Firebase Authentication.',
    });
    return;
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const idSuffix = crypto.randomUUID().slice(0, 8);
  const newUser: User = {
    id: `usr_${idSuffix}`,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password_hash: hashPassword(password),
    role,
    institution: institution?.trim() || (role === 'teacher' ? 'Faculty Member' : 'Student'),
    studentId: role === 'student' ? `STU-2026-${idSuffix.slice(0, 4).toUpperCase()}` : undefined,
    teacherId: role === 'teacher' ? `FAC-2026-${idSuffix.slice(0, 4).toUpperCase()}` : undefined,
    created_at: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.persist();

  const token = signJwt({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    institution: newUser.institution,
  });

  res.status(201).json({
    message: 'Registration successful',
    token,
    user: formatAuthUser(newUser),
  });
});

router.post('/auth/login', (req: Request, res: Response): void => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanInput = email.toLowerCase().trim();
  const user = db.users.find(
    (u) =>
      u.email.toLowerCase() === cleanInput ||
      u.name.toLowerCase() === cleanInput ||
      u.id.toLowerCase() === cleanInput
  );
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status === 'disabled') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
    return;
  }

  // Super Admin must authenticate via verified Firebase Authentication (never legacy local password bypass)
  if (user.role === 'super_admin' || isSuperAdminEmailAddress(user.email)) {
    res.status(403).json({
      error:
        'Super Admin sign-in requires verified Firebase Authentication. Please sign in using Firebase Email/Password or Google Sign-In.',
    });
    return;
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (role) {
    const isAdminRequested = role === 'admin' || role === 'super_admin' || role === 'sub_admin';
    const isUserAdmin = user.role === 'admin' || user.role === 'sub_admin';
    if (isAdminRequested && !isUserAdmin) {
      res.status(403).json({
        error: `Account role mismatch: Administrator privileges required. This account is registered as a ${user.role}.`,
      });
      return;
    }
    if (!isAdminRequested && user.role !== role) {
      res.status(403).json({
        error: `Account role mismatch: This account is registered as a ${user.role}. Please select ${user.role} to proceed.`,
      });
      return;
    }
  }

  const token = signJwt({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institution: user.institution,
    status: user.status || 'active',
    permissions: user.permissions,
    adminSetupCompleted: true,
    temporaryCredentials: false,
  });

  res.json({
    message: 'Login successful',
    token,
    requiresSecuritySetup: false,
    adminSetupCompleted: true,
    user: formatAuthUser(user),
  });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const isSetupCompleted = user.role === 'super_admin' ? (user.adminSetupCompleted === true) : true;

  res.json({
    user: formatAuthUser(user),
    requiresSecuritySetup: user.role === 'super_admin' && !isSetupCompleted,
    adminSetupCompleted: isSetupCompleted,
  });
});

router.post('/auth/forgot-password', (req: Request, res: Response): void => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user) {
    res.json({ message: 'If an account matches this email, reset instructions have been dispatched.' });
    return;
  }

  res.json({
    message: `Password reset instructions have been sent to ${email}. Check your inbox.`,
  });
});

// ==========================================
// 1B. USER PROFILE & EDIT PROFILE ROUTES
// ==========================================

// GET /api/profile - Fetch current authenticated user's complete profile
router.get('/profile', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: formatAuthUser(user) });
});

// PATCH /api/profile - Update current authenticated user's own profile
router.patch('/profile', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  // STRICT ACCESS CONTROL CHECKS
  // 1. Role modification is strictly forbidden through normal profile editing
  if (req.body.role !== undefined && req.body.role !== user.role) {
    res.status(403).json({ error: 'Role modification is strictly prohibited.' });
    return;
  }

  // 2. User ID cannot be altered
  if (req.body.id !== undefined && req.body.id !== user.id) {
    res.status(403).json({ error: 'User ID cannot be altered.' });
    return;
  }

  // 3. Sub Admin permissions cannot be altered by normal profile editing
  if (req.body.permissions !== undefined) {
    res.status(403).json({ error: 'Permissions cannot be modified through the profile editor.' });
    return;
  }

  // 4. Account status cannot be modified
  if (req.body.status !== undefined && req.body.status !== user.status) {
    res.status(403).json({ error: 'Account status cannot be altered through profile settings.' });
    return;
  }

  // 5. System IDs cannot be modified
  if (req.body.studentId !== undefined && user.studentId && req.body.studentId !== user.studentId) {
    res.status(403).json({ error: 'Student ID cannot be modified.' });
    return;
  }
  if (req.body.teacherId !== undefined && user.teacherId && req.body.teacherId !== user.teacherId) {
    res.status(403).json({ error: 'Teacher ID cannot be modified.' });
    return;
  }
  if (req.body.adminId !== undefined && user.adminId && req.body.adminId !== user.adminId) {
    res.status(403).json({ error: 'Admin ID cannot be modified.' });
    return;
  }

  // 6. Direct email change rejection (must undergo verified email change flow)
  if (req.body.email !== undefined && req.body.email.toLowerCase().trim() !== user.email.toLowerCase()) {
    res.status(400).json({
      error: 'Direct email changes are not permitted. Please use the verified email change process.',
      requiresVerification: true,
    });
    return;
  }

  const { name, phone, dateOfBirth, gender, bio, avatar, qualification, specialization, institution } = req.body;

  // Validate Name (Required, cannot be empty)
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Name cannot be empty.' });
      return;
    }
    user.name = name.trim();

    // Propagate updated name across related active collections
    if (user.role === 'teacher') {
      db.subjects.forEach((s) => {
        if (s.teacher_id === user.id) s.teacher_name = user.name;
      });
      db.liveClasses.forEach((c) => {
        if (c.teacher_id === user.id) c.teacher_name = user.name;
      });
    }
  }

  // Validate Phone Number
  if (phone !== undefined) {
    if (phone === null || phone === '') {
      user.phone = '';
    } else if (typeof phone === 'string') {
      const trimmedPhone = phone.trim();
      const digitsOnly = trimmedPhone.replace(/\D/g, '');
      const validChars = /^[+]?[\d\s().-]{7,25}$/.test(trimmedPhone);
      if (trimmedPhone && (!validChars || digitsOnly.length < 7 || digitsOnly.length > 16)) {
        res.status(400).json({ error: 'Please enter a valid phone number.' });
        return;
      }
      user.phone = trimmedPhone;
    }
  }

  // Date of Birth
  if (dateOfBirth !== undefined) {
    user.dateOfBirth = typeof dateOfBirth === 'string' ? dateOfBirth.trim() : '';
  }

  // Gender
  if (gender !== undefined) {
    user.gender = typeof gender === 'string' ? gender.trim() : '';
  }

  // Bio
  if (bio !== undefined) {
    if (typeof bio === 'string' && bio.length > 2000) {
      res.status(400).json({ error: 'Bio must not exceed 2000 characters.' });
      return;
    }
    user.bio = typeof bio === 'string' ? bio.trim() : '';
  }

  // Profile Photo / Avatar
  if (avatar !== undefined) {
    if (avatar === null || avatar === '') {
      user.avatar = undefined;
    } else if (typeof avatar === 'string') {
      if (avatar.startsWith('data:')) {
        const matches = avatar.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || !matches[1].startsWith('image/')) {
          res.status(400).json({ error: 'Unsupported file format. Please upload a valid image (JPEG, PNG, WebP, GIF).' });
          return;
        }
        if (avatar.length > 7 * 1024 * 1024) {
          res.status(400).json({ error: 'Profile image size exceeds 5MB limit. Please upload a smaller image.' });
          return;
        }
      }
      user.avatar = avatar;
    }
  }

  // Teacher-specific attributes
  if (user.role === 'teacher') {
    if (qualification !== undefined) {
      user.qualification = typeof qualification === 'string' ? qualification.trim() : '';
    }
    if (specialization !== undefined) {
      user.specialization = typeof specialization === 'string' ? specialization.trim() : '';
    }
  }

  // Institution
  if (institution !== undefined && typeof institution === 'string') {
    user.institution = institution.trim();
  }

  db.persist();

  res.json({
    message: 'Profile updated successfully.',
    user: formatAuthUser(user),
  });
});

// Guard: Disallow modifying another user's profile through /api/users/:id
router.patch('/users/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  if (req.user?.id !== req.params.id) {
    res.status(403).json({ error: 'Access denied: You are not authorized to edit another user\'s profile.' });
    return;
  }
  // Re-route to profile handler
  (router as any).handle({ ...req, url: '/profile', method: 'PATCH' }, res);
});

router.put('/users/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  if (req.user?.id !== req.params.id) {
    res.status(403).json({ error: 'Access denied: You are not authorized to edit another user\'s profile.' });
    return;
  }
  (router as any).handle({ ...req, url: '/profile', method: 'PATCH' }, res);
});

// POST /api/profile/request-email-change - Send verification email to requested new address
router.post('/profile/request-email-change', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { newEmail } = req.body;
  if (!newEmail || typeof newEmail !== 'string') {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const cleanEmail = newEmail.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (cleanEmail === user.email.toLowerCase()) {
    res.status(400).json({ error: 'New email address must be different from current email.' });
    return;
  }

  // Check if email already belongs to another account
  const emailExists = db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === cleanEmail);
  if (emailExists) {
    res.status(409).json({ error: 'Email is already registered.' });
    return;
  }

  // Generate real 6-digit code
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  user.pendingNewEmail = cleanEmail;
  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpiresAt = expiresAt;
  db.persist();

  // Send real verification email via Nodemailer
  const emailResult = await sendProfileEmailVerification(cleanEmail, verificationCode, user.name);

  if (!emailResult.success) {
    console.warn('[PROFILE EMAIL] Verification email dispatch issue:', emailResult.error);
  }

  res.json({
    success: true,
    message: `Verification code sent to ${cleanEmail}. Please enter the 6-digit code to confirm.`,
    pendingEmail: cleanEmail,
    expiresInMinutes: 15,
  });
});

// POST /api/profile/verify-email-change - Confirm code and commit new email
router.post('/profile/verify-email-change', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { verificationCode } = req.body;
  if (!verificationCode || typeof verificationCode !== 'string') {
    res.status(400).json({ error: 'Verification code is required.' });
    return;
  }

  if (!user.pendingNewEmail || !user.emailVerificationCode) {
    res.status(400).json({ error: 'No pending email change request found. Please request a verification code first.' });
    return;
  }

  // Expiration check
  if (user.emailVerificationExpiresAt && new Date() > new Date(user.emailVerificationExpiresAt)) {
    res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    return;
  }

  if (verificationCode.trim() !== user.emailVerificationCode.trim()) {
    res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
    return;
  }

  const cleanEmail = user.pendingNewEmail.toLowerCase().trim();
  const emailExists = db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === cleanEmail);
  if (emailExists) {
    res.status(409).json({ error: 'Email is already registered.' });
    return;
  }

  // Update email
  user.email = cleanEmail;
  user.pendingNewEmail = undefined;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpiresAt = undefined;
  db.persist();

  // Re-issue JWT token with updated email
  const isSetupCompleted = user.role === 'super_admin' ? (user.adminSetupCompleted === true) : true;
  const isTemporary = user.role === 'super_admin' ? (user.temporaryCredentials === true || !user.adminSetupCompleted) : false;

  const newToken = signJwt({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institution: user.institution,
    status: user.status || 'active',
    permissions: user.permissions,
    adminSetupCompleted: isSetupCompleted,
    temporaryCredentials: isTemporary,
  });

  res.json({
    success: true,
    message: 'Email address updated successfully.',
    token: newToken,
    user: formatAuthUser(user),
  });
});

// POST /api/profile/resend-email-code - Resend code to pending email
router.post('/profile/resend-email-code', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user || !user.pendingNewEmail) {
    res.status(400).json({ error: 'No pending email change request found.' });
    return;
  }

  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpiresAt = expiresAt;
  db.persist();

  await sendProfileEmailVerification(user.pendingNewEmail, verificationCode, user.name);

  res.json({
    success: true,
    message: `A fresh verification code has been dispatched to ${user.pendingNewEmail}.`,
    pendingEmail: user.pendingNewEmail,
  });
});

// POST /api/profile/cancel-email-change - Cancel pending email change
router.post('/profile/cancel-email-change', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  user.pendingNewEmail = undefined;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpiresAt = undefined;
  db.persist();

  res.json({
    success: true,
    message: 'Pending email change cancelled.',
  });
});

// POST /api/profile/change-password - Change account password (requires current password)
router.post('/profile/change-password', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db.users.find((u) => u.id === req.user?.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword) {
    res.status(400).json({ error: 'Current password is required.' });
    return;
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    return;
  }

  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: 'New passwords do not match.' });
    return;
  }

  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'New password must be different from current password.' });
    return;
  }

  user.password_hash = hashPassword(newPassword);
  user.passwordChangedAt = new Date().toISOString();
  db.persist();

  res.json({
    success: true,
    message: 'Password changed successfully.',
  });
});

// ==========================================
// 2. CLASS ENROLLMENT & CODE VERIFICATION ROUTES
// ==========================================

// Verify class code without revealing private content (Requirement #4, #10, #11, #12)
router.post('/classes/verify-code', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Class code is required.' });
    return;
  }

  const cleanCode = code.trim().toUpperCase();
  const subject = db.subjects.find((s) => s.class_code && s.class_code.toUpperCase() === cleanCode);

  if (!subject) {
    res.status(404).json({ error: 'Invalid class code. Please check the code provided by your teacher.' });
    return;
  }

  if (subject.status && subject.status !== 'active') {
    res.status(400).json({ error: 'This class is no longer available for enrollment.' });
    return;
  }

  const isAlready = isStudentEnrolled(req.user!.id, subject.id);

  res.json({
    valid: true,
    alreadyEnrolled: isAlready,
    class: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      classCode: subject.class_code,
      teacherId: subject.teacher_id || '',
      teacherName: subject.teacher_name || 'Faculty Instructor',
      section: subject.section || 'A1',
      description: subject.description,
    },
  });
});

// Immediately enroll student upon confirmation (Requirement #4, #10, #19 - NO APPROVAL)
router.post('/classes/join', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  if (req.user?.role !== 'student') {
    res.status(403).json({ error: 'Only student accounts can join classes.' });
    return;
  }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Class code is required.' });
    return;
  }

  const cleanCode = code.trim().toUpperCase();
  const subject = db.subjects.find((s) => s.class_code && s.class_code.toUpperCase() === cleanCode);

  if (!subject) {
    res.status(404).json({ error: 'Invalid or expired class code.' });
    return;
  }

  if (subject.status && subject.status !== 'active') {
    res.status(400).json({ error: 'Invalid or expired class code.' });
    return;
  }

  // Check duplicate enrollment — NEVER delete or overwrite existing valid enrollment
  const existingEnrollment = db.enrollments.find(
    (e) => e.student_id === req.user!.id && e.subject_id === subject.id
  );
  if (existingEnrollment) {
    res.status(400).json({
      error: 'You are already enrolled in this class.',
      message: 'You are already enrolled in this class.',
      alreadyEnrolled: true,
      classId: subject.id,
      enrollmentId: existingEnrollment.id,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        classCode: subject.class_code,
        teacherId: subject.teacher_id || '',
        teacherName: subject.teacher_name || 'Faculty Instructor',
        section: subject.section,
        description: subject.description,
      },
    });
    return;
  }

  // Create enrollment immediately with deterministic composite ID (prevents duplicate records)
  const deterministicId = `${req.user!.id}_${subject.id}`;
  const newEnrollment: Enrollment = {
    id: deterministicId,
    student_id: req.user!.id,
    subject_id: subject.id,
    joined_at: new Date().toISOString(),
  };

  db.enrollments.push(newEnrollment);
  db.persist();

  res.status(201).json({
    message: 'Successfully enrolled in class',
    alreadyEnrolled: false,
    classId: subject.id,
    enrollmentId: newEnrollment.id,
    subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      classCode: subject.class_code,
      teacherId: subject.teacher_id || '',
      teacherName: subject.teacher_name || 'Faculty Instructor',
      section: subject.section,
      description: subject.description,
    },
  });
});

// Non-destructive Firestore-to-Backend Enrollment & Class Reconciliation
// Restores permanent Cloud Firestore enrollments/classes into the backend store after
// container restarts, page refreshes, or cross-session logins.
// CRITICAL INVARIANT: NEVER deletes any existing enrollments on empty or partial syncs.
router.post('/classes/sync-enrollments', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const caller = req.user!;
  const incomingEnrollments = Array.isArray(req.body?.enrollments) ? req.body.enrollments : [];
  const incomingClasses = Array.isArray(req.body?.classes) ? req.body.classes : [];

  const isCallerAdmin =
    caller.role === 'super_admin' || caller.role === 'admin' || caller.role === 'sub_admin';

  let addedClasses = 0;
  let updatedClasses = 0;
  let addedEnrollments = 0;
  let mutated = false;

  // 1. Reconcile Firestore class records (non-destructive)
  for (const rawCls of incomingClasses) {
    if (!rawCls || typeof rawCls.id !== 'string' || !rawCls.id.trim()) continue;
    const classId = rawCls.id.trim();
    const teacherId = typeof rawCls.teacherId === 'string' ? rawCls.teacherId.trim() : '';
    const classCode = typeof rawCls.classCode === 'string' ? rawCls.classCode.trim().toUpperCase() : '';
    const className = typeof rawCls.name === 'string' ? rawCls.name.trim() : '';
    if (!teacherId || !classCode || !className) continue;

    // Role check for class sync:
    // - Admins can sync any class
    // - Teachers can sync their own classes
    // - Students can only restore a missing class referenced by one of their own active enrollments
    const isReferencedByOwnEnrollment =
      caller.role === 'student' &&
      incomingEnrollments.some(
        (e: any) =>
          e &&
          e.status === 'active' &&
          e.studentId === caller.id &&
          e.classId === classId
      );

    const canSyncClass =
      isCallerAdmin ||
      (caller.role === 'teacher' && teacherId === caller.id) ||
      isReferencedByOwnEnrollment;

    if (!canSyncClass) continue;

    const existingSubj = db.subjects.find((s) => s.id === classId);
    if (!existingSubj) {
      db.subjects.push({
        id: classId,
        name: className,
        code: (typeof rawCls.code === 'string' && rawCls.code.trim())
          ? rawCls.code.trim().toUpperCase()
          : classCode.split('-')[0] || 'CLS',
        description:
          typeof rawCls.description === 'string' && rawCls.description.trim()
            ? rawCls.description.trim()
            : `Course curriculum for ${className}`,
        teacher_id: teacherId,
        teacher_name:
          typeof rawCls.teacherName === 'string' && rawCls.teacherName.trim()
            ? rawCls.teacherName.trim()
            : 'Faculty Instructor',
        section:
          typeof rawCls.section === 'string' && rawCls.section.trim()
            ? rawCls.section.trim().toUpperCase()
            : 'B21',
        class_code: classCode,
        status: rawCls.status || 'active',
        iconName: typeof rawCls.iconName === 'string' ? rawCls.iconName : 'BookOpen',
        color: typeof rawCls.color === 'string' ? rawCls.color : '#2563EB',
        thumbnail: typeof rawCls.thumbnail === 'string' ? rawCls.thumbnail : 'subject_custom_cover',
        created_at:
          typeof rawCls.createdAt === 'string' && rawCls.createdAt
            ? rawCls.createdAt
            : new Date().toISOString(),
      });
      addedClasses += 1;
      mutated = true;
    } else if (isCallerAdmin || (caller.role === 'teacher' && existingSubj.teacher_id === caller.id)) {
      if (classCode && existingSubj.class_code !== classCode) {
        existingSubj.class_code = classCode;
        updatedClasses += 1;
        mutated = true;
      }
      if (className && existingSubj.name !== className) {
        existingSubj.name = className;
        updatedClasses += 1;
        mutated = true;
      }
    }
  }

  // 2. Reconcile active Firestore enrollments (strictly non-destructive, zero deletions)
  for (const rawEnr of incomingEnrollments) {
    if (!rawEnr || rawEnr.status !== 'active') continue;
    const studentId = typeof rawEnr.studentId === 'string' ? rawEnr.studentId.trim() : '';
    const classId = typeof rawEnr.classId === 'string' ? rawEnr.classId.trim() : '';
    const teacherId = typeof rawEnr.teacherId === 'string' ? rawEnr.teacherId.trim() : '';
    if (!studentId || !classId || !teacherId) continue;

    // Enforce strict RBAC on who can sync which enrollments
    const canSyncEnrollment =
      isCallerAdmin ||
      (caller.role === 'student' && studentId === caller.id) ||
      (caller.role === 'teacher' && teacherId === caller.id);

    if (!canSyncEnrollment) continue;

    // Ensure the class shell exists in backend if ephemeral JSON restarted
    let subject = db.subjects.find((s) => s.id === classId);
    if (!subject && typeof rawEnr.className === 'string' && rawEnr.className.trim()) {
      const restoredCode =
        typeof rawEnr.classCode === 'string' && rawEnr.classCode.trim()
          ? rawEnr.classCode.trim().toUpperCase()
          : generateClassCode(rawEnr.className, rawEnr.section || 'B21');
      subject = {
        id: classId,
        name: rawEnr.className.trim(),
        code: restoredCode.split('-')[0] || 'CLS',
        description: `Course curriculum for ${rawEnr.className.trim()}`,
        teacher_id: teacherId,
        teacher_name:
          typeof rawEnr.teacherName === 'string' && rawEnr.teacherName.trim()
            ? rawEnr.teacherName.trim()
            : 'Faculty Instructor',
        section:
          typeof rawEnr.section === 'string' && rawEnr.section.trim()
            ? rawEnr.section.trim().toUpperCase()
            : 'B21',
        class_code: restoredCode,
        status: 'active',
        iconName: 'BookOpen',
        color: '#2563EB',
        thumbnail: 'subject_custom_cover',
        created_at:
          typeof rawEnr.enrolledAt === 'string' && rawEnr.enrolledAt
            ? rawEnr.enrolledAt
            : new Date().toISOString(),
      };
      db.subjects.push(subject);
      addedClasses += 1;
      mutated = true;
    }

    if (!subject) continue;

    // Ensure student profile exists in backend if container restarted and teacher/admin is syncing
    const existingStudent = db.users.find((u) => u.id === studentId);
    if (!existingStudent && typeof rawEnr.studentEmail === 'string' && rawEnr.studentEmail.includes('@')) {
      const normalizedEmail = rawEnr.studentEmail.trim().toLowerCase();
      const emailMatch = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
      if (!emailMatch) {
        db.users.push({
          id: studentId,
          name:
            typeof rawEnr.studentName === 'string' && rawEnr.studentName.trim()
              ? rawEnr.studentName.trim()
              : normalizedEmail.split('@')[0],
          email: normalizedEmail,
          password_hash: '',
          role: 'student',
          status: 'active',
          created_at:
            typeof rawEnr.enrolledAt === 'string' && rawEnr.enrolledAt
              ? rawEnr.enrolledAt
              : new Date().toISOString(),
        });
        mutated = true;
      }
    }

    // Upsert enrollment without duplicating
    const alreadyExists = db.enrollments.some(
      (e) => e.student_id === studentId && e.subject_id === classId
    );
    if (!alreadyExists) {
      db.enrollments.push({
        id:
          typeof rawEnr.id === 'string' && rawEnr.id.trim()
            ? rawEnr.id.trim()
            : `${studentId}_${classId}`,
        student_id: studentId,
        subject_id: classId,
        joined_at:
          typeof rawEnr.enrolledAt === 'string' && rawEnr.enrolledAt
            ? rawEnr.enrolledAt
            : new Date().toISOString(),
      });
      addedEnrollments += 1;
      mutated = true;
    }
  }

  if (mutated) {
    db.persist();
  }

  const activeEnrolledClassIds =
    caller.role === 'student'
      ? db.enrollments.filter((e) => e.student_id === caller.id).map((e) => e.subject_id)
      : undefined;

  res.json({
    synced: true,
    addedClasses,
    updatedClasses,
    addedEnrollments,
    activeEnrolledClassIds,
  });
});

// Live Class Endpoints (Requirement #1, #2, #6, #8, #12, #13, #14, #15)
router.post('/classes/:id/live/start', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  // Strict teacher ownership check (Requirement #13)
  if (!subject.teacher_id || subject.teacher_id !== req.user!.id) {
    console.warn(
      `[LiveClass 403] Start denied: classId=${id} ownerId=${subject.teacher_id || 'none'} requesterId=${req.user!.id} role=${req.user!.role}`
    );
    res.status(403).json({
      error: 'Access denied: Only the instructor assigned to this class can start or control its live sessions.',
      code: 'NOT_CLASS_OWNER',
    });
    return;
  }

  // Maintain consistent session ID across reloads (Requirement #14)
  const sessionId = subject.live_session?.is_active && subject.live_session?.id
    ? subject.live_session.id
    : `lsess_${subject.id}_${Date.now()}`;
  const roomId = sessionId;
  const session_title = req.body.session_title || `${subject.name} - Live Lecture Session`;
  const started_at = subject.live_session?.is_active && subject.live_session.started_at
    ? subject.live_session.started_at
    : new Date().toISOString();

  subject.live_session = {
    id: sessionId,
    room_id: roomId,
    status: 'live_now',
    is_active: true,
    session_title,
    started_at,
    room_url: `/live-classroom/${sessionId}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
  };

  // Record into persistent liveClasses collection
  let liveClassRecord = db.liveClasses.find((lc) => lc.id === sessionId || (lc.class_id === subject.id && lc.status === 'live_now'));
  if (liveClassRecord) {
    liveClassRecord.status = 'live_now';
    liveClassRecord.active_room_id = roomId;
    liveClassRecord.started_at = started_at;
  } else {
    liveClassRecord = {
      id: sessionId,
      class_id: subject.id,
      subject_name: subject.name,
      section: subject.section || 'B21',
      teacher_id: req.user!.id,
      teacher_name: req.user!.name,
      title: session_title,
      description: req.body.description || `Interactive live lecture for ${subject.name}`,
      scheduled_date: new Date().toISOString().split('T')[0],
      start_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      end_time: '',
      status: 'live_now',
      active_room_id: roomId,
      started_at,
      created_at: new Date().toISOString(),
    };
    db.liveClasses.push(liveClassRecord);
  }

  db.persist();

  res.json({
    message: 'Live class started successfully',
    live_session: subject.live_session,
    classId: subject.id,
    sessionId,
    roomId,
    class: {
      id: subject.id,
      name: subject.name,
      teacherName: subject.teacher_name || req.user!.name,
      section: subject.section,
    },
  });
});

router.post('/classes/:id/live/end', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  // Strict teacher ownership check (Requirement #13)
  if (!subject.teacher_id || subject.teacher_id !== req.user!.id) {
    console.warn(
      `[LiveClass 403] End denied: classId=${id} ownerId=${subject.teacher_id || 'none'} requesterId=${req.user!.id}`
    );
    res.status(403).json({
      error: 'Access denied: Only the instructor assigned to this class can end its live session.',
      code: 'NOT_CLASS_OWNER',
    });
    return;
  }

  const endedAt = new Date().toISOString();

  // Close live session on subject
  if (subject.live_session) {
    subject.live_session.is_active = false;
    subject.live_session.status = 'ended';
    subject.live_session.ended_at = endedAt;
  }

  // Update liveClasses table
  db.liveClasses.forEach((lc) => {
    if (lc.class_id === id && lc.status === 'live_now') {
      lc.status = 'ended';
      lc.ended_at = endedAt;
    }
  });

  // Notify and disconnect WebSocket room
  closeRoomByClassId(id, req.user!.id);

  db.persist();
  res.json({ message: 'Live class ended successfully' });
});

router.get('/classes/:id/live/join', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  // Strict authorization check for students & teachers
  if (req.user?.role === 'student') {
    if (!isStudentEnrolled(req.user.id, id)) {
      console.warn(`[LiveClass 403] Student join denied: classId=${id} studentId=${req.user.id}`);
      res.status(403).json({
        error: 'You are not enrolled in this class.',
        code: 'NOT_ENROLLED',
      });
      return;
    }
  } else if (req.user?.role === 'teacher') {
    if (!subject.teacher_id || subject.teacher_id !== req.user.id) {
      console.warn(
        `[LiveClass 403] Teacher join denied: classId=${id} ownerId=${subject.teacher_id || 'none'} requesterId=${req.user.id}`
      );
      res.status(403).json({
        error: 'Access denied: Only the instructor assigned to this class can host or join as teacher.',
        code: 'NOT_CLASS_OWNER',
      });
      return;
    }
  }

  if (!subject.live_session || !subject.live_session.is_active) {
    res.status(400).json({ error: 'No live class is currently active for this class.' });
    return;
  }

  res.json({
    live_session: subject.live_session,
    sessionId: subject.live_session.id || subject.live_session.room_id,
    roomId: subject.live_session.room_id || subject.live_session.id,
    class: {
      id: subject.id,
      name: subject.name,
      teacherName: subject.teacher_name || 'Faculty Member',
      section: subject.section,
      description: subject.description,
    },
  });
});

// Schedule a live class (Requirement #2)
router.post('/classes/schedule-live', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { class_id, title, scheduled_date, start_time, end_time, description } = req.body;

  if (!class_id || !title || !scheduled_date || !start_time) {
    res.status(400).json({ error: 'Class, title, date, and start time are required.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === class_id);
  if (!subject) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  if (!subject.teacher_id || subject.teacher_id !== req.user!.id) {
    console.warn(
      `[LiveClass 403] Schedule denied: classId=${class_id} ownerId=${subject.teacher_id || 'none'} requesterId=${req.user!.id}`
    );
    res.status(403).json({
      error: 'Access denied: You can only schedule live classes for your own courses.',
      code: 'NOT_CLASS_OWNER',
    });
    return;
  }

  const newLiveClass: LiveClass = {
    id: `live_${crypto.randomUUID().slice(0, 8)}`,
    class_id,
    subject_name: subject.name,
    section: subject.section || 'B21',
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    title: title.trim(),
    description: (description || `Scheduled interactive lecture for ${subject.name}`).trim(),
    scheduled_date,
    start_time,
    end_time: end_time || '',
    status: 'scheduled',
    created_at: new Date().toISOString(),
  };

  db.liveClasses.push(newLiveClass);
  db.persist();

  res.status(201).json({
    message: 'Live class scheduled successfully',
    liveClass: newLiveClass,
  });
});

// Get Live Classes (Role-filtered)
router.get('/classes/live/all', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  if (req.user?.role === 'teacher') {
    // Teachers see sessions for their subjects
    const teacherClasses = db.liveClasses.filter((lc) => lc.teacher_id === req.user!.id);
    res.json({ liveClasses: teacherClasses });
  } else {
    // Students only see live classes for subjects they are enrolled in (Requirement #3)
    const enrolledIds = db.enrollments
      .filter((e) => e.student_id === req.user!.id)
      .map((e) => e.subject_id);

    const studentLiveClasses = db.liveClasses.filter(
      (lc) => enrolledIds.includes(lc.class_id) && lc.status !== 'cancelled'
    );
    res.json({ liveClasses: studentLiveClasses });
  }
});

// ==========================================
// 3. DASHBOARD ROUTES
// ==========================================

router.get('/student/dashboard', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const studentId = req.user!.id;

  // STRICT REQUIREMENT #2 & #15:
  // Only query subjects where student is enrolled!
  const enrolledSubjectIds = db.enrollments
    .filter((e) => e.student_id === studentId)
    .map((e) => e.subject_id);

  const enrolledSubjects = db.subjects.filter((s) => enrolledSubjectIds.includes(s.id));

  // Get student progress records strictly within enrolled subjects
  const userProgress = db.progress.filter(
    (p) => p.student_id === studentId && enrolledSubjectIds.includes(p.subject_id)
  );

  // Chapters & subtopics belonging to enrolled subjects only
  const enrolledChapters = db.chapters.filter((c) => enrolledSubjectIds.includes(c.subject_id));
  const enrolledChapterIds = enrolledChapters.map((c) => c.id);
  const enrolledSubtopics = db.subtopics.filter((s) => enrolledChapterIds.includes(s.chapter_id));

  // Calculate stats
  const totalSubtopics = enrolledSubtopics.length;
  const completedSubtopics = userProgress.filter((p) => p.completed).length;
  const videosWatched = userProgress.filter((p) => p.video_progress > 50).length;
  const notesStudied = userProgress.filter((p) => p.notes_viewed).length;
  const quizzesTaken = userProgress.filter((p) => typeof p.quiz_score === 'number').length;

  const totalScore = userProgress.reduce((acc, curr) => acc + (curr.quiz_score || 0), 0);
  const averageQuizScore = quizzesTaken > 0 ? Math.round(totalScore / quizzesTaken) : 0;

  // Find Continue Learning target (strictly from enrolled classes)
  let continueItem = null;
  const sortedProg = [...userProgress].sort(
    (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
  );

  const activeProg = sortedProg.find((p) => !p.completed) || sortedProg[0];
  if (activeProg && enrolledSubjectIds.includes(activeProg.subject_id)) {
    const sub = enrolledSubtopics.find((s) => s.id === activeProg.subtopic_id);
    const chap = enrolledChapters.find((c) => c.id === activeProg.chapter_id);
    const subj = enrolledSubjects.find((s) => s.id === activeProg.subject_id);
    if (sub && chap && subj) {
      continueItem = {
        subjectId: subj.id,
        subjectName: subj.name,
        chapterId: chap.id,
        chapterTitle: chap.title,
        subtopicId: sub.id,
        subtopicTitle: sub.title,
        progress: Math.max(activeProg.video_progress || 0, activeProg.quiz_score || 0),
        lastActivity: activeProg.last_activity_at,
      };
    }
  }

  // Fallback continue item if none yet but has enrolled subtopics
  if (!continueItem && enrolledSubtopics.length > 0) {
    const sub = enrolledSubtopics[0];
    const chap = enrolledChapters.find((c) => c.id === sub.chapter_id);
    const subj = chap ? enrolledSubjects.find((s) => s.id === chap.subject_id) : null;
    if (chap && subj) {
      continueItem = {
        subjectId: subj.id,
        subjectName: subj.name,
        chapterId: chap.id,
        chapterTitle: chap.title,
        subtopicId: sub.id,
        subtopicTitle: sub.title,
        progress: 0,
        lastActivity: new Date().toISOString(),
      };
    }
  }

  // Subject cards with progress (ONLY enrolled subjects)
  const subjectCards = enrolledSubjects.map((subj) => {
    const subjChapters = db.chapters.filter((c) => c.subject_id === subj.id);
    const chapterIds = subjChapters.map((c) => c.id);
    const subjSubtopics = db.subtopics.filter((s) => chapterIds.includes(s.chapter_id));
    const completedCount = subjSubtopics.filter((s) => {
      const p = userProgress.find((prog) => prog.subtopic_id === s.id);
      return p?.completed;
    }).length;

    const progressPct = subjSubtopics.length > 0 ? Math.round((completedCount / subjSubtopics.length) * 100) : 0;

    return {
      id: subj.id,
      name: subj.name,
      description: subj.description,
      teacher_name: subj.teacher_name,
      section: subj.section,
      iconName: subj.iconName,
      color: subj.color,
      thumbnail: subj.thumbnail,
      totalChapters: subjChapters.length,
      totalSubtopics: subjSubtopics.length,
      progress: progressPct,
      live_session: subj.live_session,
    };
  });

  // Recently Added items (ONLY from enrolled subjects)
  const recentChapters = enrolledChapters.slice(-3).map((c) => {
    const s = enrolledSubjects.find((subj) => subj.id === c.subject_id);
    return {
      type: 'chapter',
      id: c.id,
      title: c.title,
      subjectName: s?.name || 'Subject',
      createdAt: c.created_at,
    };
  });

  const recentNotes = db.notes
    .filter((n) => enrolledSubjectIds.includes(n.subject_id))
    .slice(-3)
    .map((n) => {
      const sub = enrolledSubtopics.find((s) => s.id === n.subtopic_id);
      return {
        type: 'note',
        id: n.id,
        title: n.title,
        subtopicTitle: sub?.title || 'Subtopic',
        createdAt: n.created_at,
      };
    });

  const recentQuizzes = db.quizzes
    .filter((q) => {
      const sub = db.subtopics.find((s) => s.id === q.subtopic_id);
      if (!sub) return false;
      const c = db.chapters.find((ch) => ch.id === sub.chapter_id);
      return c && enrolledSubjectIds.includes(c.subject_id);
    })
    .slice(-3)
    .map((q) => {
      const sub = db.subtopics.find((s) => s.id === q.subtopic_id);
      return {
        type: 'quiz',
        id: q.id,
        title: q.title,
        subtopicTitle: sub?.title || 'Subtopic',
        questionCount: q.questions.length,
      };
    });

  const serverNow = new Date();
  const serverNowMs = serverNow.getTime();

  const upcomingDeadlines: {
    id: string;
    kind: 'quiz' | 'assignment';
    title: string;
    subjectId: string;
    subjectName: string;
    teacherName: string;
    start_date?: string;
    due_date?: string;
    status: 'upcoming' | 'available' | 'overdue';
    allow_late_submission?: boolean;
    durationMinutes?: number;
  }[] = [];

  db.quizzes
    .filter((q) => {
      const ids = [q.subject_id, q.class_id].filter(Boolean) as string[];
      return ids.some((cid) => enrolledSubjectIds.includes(cid)) && q.status !== 'draft';
    })
    .forEach((q) => {
      const subs = db.quizSubmissions.filter((qs) => qs.quiz_id === q.id && qs.student_id === studentId);
      const maxAttempts = Math.max(1, Number(q.max_attempts || 1));
      const hasPassed = subs.some((s) => s.passed);
      if (hasPassed || subs.length >= maxAttempts) return;

      const startMs = q.start_date ? new Date(q.start_date).getTime() : null;
      const dueMs = q.due_date ? new Date(q.due_date).getTime() : null;
      let status: 'upcoming' | 'available' | 'overdue' = 'available';
      if (startMs && serverNowMs < startMs) status = 'upcoming';
      else if (dueMs && serverNowMs > dueMs) status = 'overdue';

      const subj = enrolledSubjects.find((s) => s.id === q.subject_id || s.id === q.class_id);
      upcomingDeadlines.push({
        id: q.id,
        kind: 'quiz',
        title: q.title,
        subjectId: subj?.id || q.subject_id || '',
        subjectName: subj?.name || 'Class Assessment',
        teacherName: getQuizTeacherName(q, subj),
        start_date: q.start_date,
        due_date: q.due_date,
        status,
        allow_late_submission: Boolean(q.allow_late_submission),
        durationMinutes: q.time_limit || 20,
      });
    });

  db.assignments
    .filter((a) => {
      const ids = [a.subject_id, a.class_id].filter(Boolean) as string[];
      return ids.some((cid) => enrolledSubjectIds.includes(cid)) && a.status === 'published';
    })
    .forEach((a) => {
      const sub = db.assignmentSubmissions.find((s) => s.assignment_id === a.id && s.student_id === studentId);
      if (sub) return;
      const startMs = a.start_date ? new Date(a.start_date).getTime() : null;
      const dueMs = a.due_date ? new Date(a.due_date).getTime() : null;
      let status: 'upcoming' | 'available' | 'overdue' = 'available';
      if (startMs && serverNowMs < startMs) status = 'upcoming';
      else if (dueMs && serverNowMs > dueMs) status = 'overdue';

      const subj = enrolledSubjects.find((s) => s.id === a.subject_id || s.id === a.class_id);
      upcomingDeadlines.push({
        id: a.id,
        kind: 'assignment',
        title: a.title,
        subjectId: subj?.id || a.subject_id,
        subjectName: subj?.name || 'Class Assignment',
        teacherName: getAssignmentTeacherName(a, subj),
        start_date: a.start_date,
        due_date: a.due_date,
        status,
        allow_late_submission: Boolean(a.allow_late_submission),
      });
    });

  upcomingDeadlines.sort((a, b) => {
    const aRef = a.status === 'upcoming' ? a.start_date : a.due_date;
    const bRef = b.status === 'upcoming' ? b.start_date : b.due_date;
    const aTs = aRef ? new Date(aRef).getTime() : Number.MAX_SAFE_INTEGER;
    const bTs = bRef ? new Date(bRef).getTime() : Number.MAX_SAFE_INTEGER;
    return aTs - bTs;
  });

  res.json({
    serverTime: serverNow.toISOString(),
    student: req.user,
    continueItem,
    subjects: subjectCards,
    upcomingDeadlines: upcomingDeadlines.slice(0, 6),
    stats: {
      chaptersCompleted: enrolledChapters.filter((chap) => {
        const subs = db.subtopics.filter((s) => s.chapter_id === chap.id);
        return subs.length > 0 && subs.every((s) => userProgress.some((p) => p.subtopic_id === s.id && p.completed));
      }).length,
      subtopicsCompleted: completedSubtopics,
      totalSubtopics,
      videosWatched,
      notesStudied,
      quizzesCompleted: quizzesTaken,
      averageQuizScore,
    },
    recentlyAdded: {
      chapters: recentChapters,
      notes: recentNotes,
      quizzes: recentQuizzes,
    },
  });
});

router.get('/teacher/dashboard', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const teacherId = req.user!.id;
  // Strictly scope dashboard to subjects owned by the authenticated teacher
  const teacherSubjects = db.subjects.filter((s) => s.teacher_id === teacherId);
  const teacherSubjectIds = new Set(teacherSubjects.map((s) => s.id));

  const teacherChapters = db.chapters.filter((c) => teacherSubjectIds.has(c.subject_id));
  const teacherChapterIds = new Set(teacherChapters.map((c) => c.id));
  const teacherSubtopics = db.subtopics.filter((st) => teacherChapterIds.has(st.chapter_id));
  const teacherSubtopicIds = new Set(teacherSubtopics.map((st) => st.id));
  const teacherNotes = db.notes.filter((n) => teacherSubjectIds.has(n.subject_id));
  const teacherQuizzes = db.quizzes.filter(
    (q) =>
      (q.subject_id ? teacherSubjectIds.has(q.subject_id) : false) ||
      (q.subtopic_id ? teacherSubtopicIds.has(q.subtopic_id) : false)
  );

  const totalSubjects = teacherSubjects.length;
  const totalChapters = teacherChapters.length;
  const totalSubtopics = teacherSubtopics.length;
  const totalVideos = db.learningContents.filter(
    (c) => teacherSubtopicIds.has(c.subtopic_id) && !!c.video?.video_url
  ).length;
  const totalNotes = teacherNotes.length;
  const totalQuizzes = teacherQuizzes.length;

  const { validEnrollmentsBySubject, verifiedUsers } = getVerifiedAdminDataset();
  const verifiedUserMap = new Map(verifiedUsers.map((u) => [u.id, u]));

  const uniqueEnrolledStudentIds = new Set<string>();
  teacherSubjects.forEach((s) => {
    const classEnrs = validEnrollmentsBySubject.get(s.id) || [];
    classEnrs.forEach((e) => uniqueEnrolledStudentIds.add(e.student_id));
  });
  const totalStudents = uniqueEnrolledStudentIds.size;

  // Student progress overview scoped to this teacher's subjects
  const teacherProgress = db.progress.filter((p) => teacherSubjectIds.has(p.subject_id));
  const totalAttempts = teacherProgress.filter((p) => typeof p.quiz_score === 'number').length;
  const passedAttempts = teacherProgress.filter((p) => p.quiz_passed).length;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

  // Enhanced subjects with strictly per-class counts and validated enrollment roster
  const subjectsWithRoster = teacherSubjects.map((s) => {
    const subjectEnrollments = validEnrollmentsBySubject.get(s.id) || [];
    const subjectChapters = teacherChapters.filter((c) => c.subject_id === s.id);
    const subjectChapterIds = new Set(subjectChapters.map((c) => c.id));
    const subjectSubtopicIds = new Set(
      teacherSubtopics.filter((st) => subjectChapterIds.has(st.chapter_id)).map((st) => st.id)
    );

    const subjectNoteMaterials = db.materials.filter(
      (m) => m.subject_id === s.id && (m.type === 'notes' || m.type === 'document')
    );
    const subjectLegacyNotes = teacherNotes.filter(
      (n) => n.subject_id === s.id && !subjectNoteMaterials.some((m) => `note_${m.id}` === n.id || `mat_${n.id}` === m.id)
    );
    const subjectTotalNotes = subjectNoteMaterials.length + subjectLegacyNotes.length;

    const subjectVideoMaterials = db.materials.filter((m) => m.subject_id === s.id && m.type === 'video');
    const subjectLegacyVideos = db.learningContents.filter(
      (lc) => subjectSubtopicIds.has(lc.subtopic_id) && !!lc.video?.video_url
    );
    const subjectTotalVideos = subjectVideoMaterials.length + subjectLegacyVideos.length;

    const subjectTotalQuizzes = db.quizzes.filter(
      (q) =>
        q.subject_id === s.id ||
        q.class_id === s.id ||
        (!!q.subtopic_id && subjectSubtopicIds.has(q.subtopic_id))
    ).length;

    const subjectTotalAssignments = db.assignments.filter(
      (a) => a.subject_id === s.id || a.class_id === s.id
    ).length;

    const students = subjectEnrollments
      .map((e) => {
        const u = verifiedUserMap.get(e.student_id);
        if (!u || u.role !== 'student') return null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          institution: u.institution || '',
          joined_at: e.joined_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      ...s,
      totalStudents: students.length,
      totalChapters: subjectChapters.length,
      totalNotes: subjectTotalNotes,
      totalVideos: subjectTotalVideos,
      totalQuizzes: subjectTotalQuizzes,
      totalAssignments: subjectTotalAssignments,
      enrolledStudentCount: students.length,
      enrolledStudents: students,
    };
  });

  // Recent notes created within this teacher's classes
  const recentNotes = teacherNotes.slice(-5).map((n) => {
    const s = teacherSubjects.find((sub) => sub.id === n.subject_id);
    const c = teacherChapters.find((chap) => chap.id === n.chapter_id);
    const sub = teacherSubtopics.find((st) => st.id === n.subtopic_id);
    return {
      ...n,
      subjectName: s?.name,
      chapterTitle: c?.title,
      subtopicTitle: sub?.title,
    };
  });

  res.json({
    teacher: req.user,
    metrics: {
      totalSubjects,
      totalChapters,
      totalSubtopics,
      totalVideos,
      totalNotes,
      totalQuizzes,
      totalStudents,
      passRate,
    },
    recentNotes,
    subjects: subjectsWithRoster,
    chapters: teacherChapters,
    subtopics: teacherSubtopics,
  });
});

// ==========================================
// 4. SUBJECTS, CHAPTERS & SUBTOPICS ROUTES
// ==========================================

router.get('/subjects', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;

  // Strict RBAC scoping:
  // - Students see ONLY classes they are enrolled in
  // - Teachers see ONLY classes they own/teach
  // - Admins see all classes
  let allowedSubjects = db.subjects;
  let userProgress: StudentProgress[] = [];

  if (user.role === 'student') {
    const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);
    allowedSubjects = db.subjects.filter((s) => enrolledIds.includes(s.id));
    userProgress = db.progress.filter((p) => p.student_id === user.id);
  } else if (user.role === 'teacher') {
    allowedSubjects = db.subjects.filter((s) => s.teacher_id === user.id);
  }

  const subjects = allowedSubjects.map((subj) => {
    const chapters = db.chapters.filter((c) => c.subject_id === subj.id);
    const chapterIds = chapters.map((c) => c.id);
    const subtopics = db.subtopics.filter((s) => chapterIds.includes(s.chapter_id));

    const completed = subtopics.filter((s) => {
      const p = userProgress.find((prog) => prog.subtopic_id === s.id);
      return p?.completed;
    }).length;

    const progress = subtopics.length > 0 ? Math.round((completed / subtopics.length) * 100) : 0;

    return {
      id: subj.id,
      name: subj.name,
      description: subj.description,
      teacher_name: subj.teacher_name,
      section: subj.section,
      iconName: subj.iconName,
      color: subj.color,
      thumbnail: subj.thumbnail,
      totalChapters: chapters.length,
      totalSubtopics: subtopics.length,
      progress,
      live_session: subj.live_session,
      // Class code is visible to teacher or already-enrolled students
      class_code: user?.role === 'teacher' ? subj.class_code : undefined,
    };
  });

  res.json({ subjects });
});

router.get('/subjects/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const user = req.user!;

  if (user.role === 'student' && !isStudentEnrolled(user.id, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  if (user.role === 'teacher' && subject.teacher_id !== user.id) {
    res.status(403).json({ error: 'You do not have permission to access this class.' });
    return;
  }

  const isStudent = user.role === 'student';
  const userProgress = db.progress.filter((p) => p.student_id === user.id && p.subject_id === id);

  const rawChapters = db.chapters
    .filter((c) => c.subject_id === id)
    .sort((a, b) => a.order - b.order);

  const visibleChapters = isStudent ? rawChapters.filter((c) => c.status !== 'draft') : rawChapters;

  const chapters = visibleChapters.map((c) => {
    const rawSubtopics = db.subtopics
      .filter((s) => s.chapter_id === c.id)
      .sort((a, b) => a.order - b.order);
    const subtopics = isStudent ? rawSubtopics.filter((s) => s.status !== 'draft') : rawSubtopics;

    const completed = subtopics.filter((s) => {
      const p = userProgress.find((prog) => prog.subtopic_id === s.id);
      return p?.completed;
    }).length;

    const progress = subtopics.length > 0 ? Math.round((completed / subtopics.length) * 100) : 0;

    return {
      ...c,
      subtopics: subtopics.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        order: s.order,
        estimated_minutes: s.estimated_minutes,
        completed: !!userProgress.find((p) => p.subtopic_id === s.id)?.completed,
      })),
      progress,
    };
  });

  // Strict per-class validated, deduplicated student enrollments
  const validSubjectEnrollments = getValidSubjectEnrollments(id);
  const enrolledStudents = validSubjectEnrollments.map(({ enrollment, student }) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    institution: student.institution || '',
    joined_at: enrollment.joined_at,
  }));

  const subjectChapterIds = new Set(visibleChapters.map((c) => c.id));
  const subjectSubtopicIds = new Set(
    db.subtopics
      .filter((s) => subjectChapterIds.has(s.chapter_id) && (!isStudent || s.status !== 'draft'))
      .map((s) => s.id)
  );

  const subjectMaterials = db.materials.filter(
    (m) => m.subject_id === id && (!isStudent || m.status === 'published')
  );
  const subjectNoteMaterials = subjectMaterials.filter((m) => m.type === 'notes' || m.type === 'document');
  const subjectLegacyNotes = db.notes.filter(
    (n) =>
      n.subject_id === id &&
      !subjectNoteMaterials.some((m) => `note_${m.id}` === n.id || `mat_${n.id}` === m.id)
  );
  const totalNotes = subjectNoteMaterials.length + subjectLegacyNotes.length;

  const subjectVideoMaterials = subjectMaterials.filter((m) => m.type === 'video');
  const subjectLegacyVideos = db.learningContents.filter(
    (lc) => subjectSubtopicIds.has(lc.subtopic_id) && !!lc.video?.video_url
  );
  const totalVideos = subjectVideoMaterials.length + subjectLegacyVideos.length;

  const subjectQuizzes = db.quizzes.filter(
    (q) =>
      (q.subject_id === id || q.class_id === id || (!!q.subtopic_id && subjectSubtopicIds.has(q.subtopic_id))) &&
      (!isStudent || q.status !== 'draft')
  );
  const subjectAssignments = db.assignments.filter(
    (a) => (a.subject_id === id || a.class_id === id) && (!isStudent || a.status === 'published')
  );

  const recentActivity = [
    ...visibleChapters.map((c) => ({
      id: `act_chap_${c.id}`,
      type: 'chapter' as const,
      title: `Chapter added: ${c.title}`,
      subtitle: c.description || 'Curriculum chapter',
      created_at: c.created_at || subject.created_at || new Date().toISOString(),
    })),
    ...subjectNoteMaterials.map((m) => ({
      id: `act_mat_${m.id}`,
      type: 'note' as const,
      title: `Notes uploaded: ${m.title}`,
      subtitle: m.file_name || m.description || 'Study document',
      created_at: m.created_at,
    })),
    ...subjectLegacyNotes.map((n) => ({
      id: `act_note_${n.id}`,
      type: 'note' as const,
      title: `Notes uploaded: ${n.title}`,
      subtitle: n.file_name || n.description || 'Study document',
      created_at: n.created_at,
    })),
    ...subjectVideoMaterials.map((v) => ({
      id: `act_vid_${v.id}`,
      type: 'video' as const,
      title: `Video lecture added: ${v.title}`,
      subtitle: v.description || 'Recorded walkthrough',
      created_at: v.created_at,
    })),
    ...subjectQuizzes.map((q) => ({
      id: `act_quiz_${q.id}`,
      type: 'quiz' as const,
      title: `Quiz published: ${q.title}`,
      subtitle: `${q.questions?.length || 0} questions · Passing ${q.passing_score || 70}%`,
      created_at: q.created_at || subject.created_at || new Date().toISOString(),
    })),
    ...subjectAssignments.map((a) => ({
      id: `act_asg_${a.id}`,
      type: 'assignment' as const,
      title: `Assignment posted: ${a.title}`,
      subtitle: a.due_date ? `Due ${a.due_date}` : `Max marks ${a.max_marks || 100}`,
      created_at: a.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  res.json({
    subject: {
      ...subject,
      class_code: user.role === 'teacher' || user.role === 'super_admin' || user.role === 'sub_admin' ? subject.class_code : undefined,
      totalChapters: chapters.length,
      totalStudents: enrolledStudents.length,
      enrolledStudentCount: enrolledStudents.length,
      enrolledStudents,
      totalNotes,
      totalVideos,
      totalQuizzes: subjectQuizzes.length,
      totalAssignments: subjectAssignments.length,
      recentActivity,
    },
    chapters,
  });
});

// Helper to check if a teacher owns or has permission to edit a subject
function canTeacherManageSubject(user: { id: string; role: string }, subjectId: string): boolean {
  if (user.role === 'super_admin' || user.role === 'sub_admin') return true;
  const s = db.subjects.find((sub) => sub.id === subjectId);
  return !!s && s.teacher_id === user.id;
}

// Helper to guarantee a chapter belongs strictly to the specified subject/class
function chapterBelongsToSubject(subjectId: string, chapterId?: string): boolean {
  if (!chapterId) return true;
  const chap = db.chapters.find((c) => c.id === chapterId);
  return !!chap && chap.subject_id === subjectId;
}

// Teacher creates a Subject / Class (Requirement #1, #3 & #4)
router.post('/subjects', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { name, code, description, section, iconName, color, thumbnail, status } = req.body;
  if (!name || !description) {
    res.status(400).json({ error: 'Subject name and description are required.' });
    return;
  }

  let generatedCode = generateClassCode(name, section);
  while (db.subjects.some((s) => s.class_code && s.class_code.toUpperCase() === generatedCode.toUpperCase())) {
    generatedCode = generateClassCode(name, section);
  }
  const subjectCode = (code || '').trim().toUpperCase() || generatedCode.split('-')[0] || 'CSE101';

  const newSubject: Subject = {
    id: `subj_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24)}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
    name: name.trim(),
    code: subjectCode,
    description: description.trim(),
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    section: (section || 'B21').trim().toUpperCase(),
    class_code: generatedCode,
    status: (status as any) || 'active',
    iconName: iconName || 'BookOpen',
    color: color || '#2563EB',
    thumbnail: thumbnail || 'subject_custom_cover',
    created_at: new Date().toISOString(),
  };

  db.subjects.push(newSubject);
  db.persist();

  res.status(201).json({
    message: 'Subject created successfully',
    subject: {
      ...newSubject,
      totalStudents: 0,
      enrolledStudentCount: 0,
      enrolledStudents: [],
      totalChapters: 0,
      totalNotes: 0,
      totalVideos: 0,
      totalQuizzes: 0,
      totalAssignments: 0,
      recentActivity: [],
    },
    classCode: generatedCode,
  });
});

// Teacher or Admin updates Subject (Requirement #3)
router.put('/subjects/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, id)) {
    res.status(403).json({ error: 'You do not have permission to modify this subject.' });
    return;
  }

  const { name, code, description, section, iconName, color, thumbnail, status } = req.body;
  if (name !== undefined) subject.name = name.trim();
  if (code !== undefined) subject.code = code.trim().toUpperCase();
  if (description !== undefined) subject.description = description.trim();
  if (section !== undefined) subject.section = section.trim().toUpperCase();
  if (iconName !== undefined) subject.iconName = iconName;
  if (color !== undefined) subject.color = color;
  if (thumbnail !== undefined) subject.thumbnail = thumbnail;
  if (status !== undefined) subject.status = status;

  db.persist();
  res.json({ message: 'Subject updated successfully', subject });
});

// Teacher or Admin deletes Subject with safe cascading (Requirement #3 & #24)
router.delete('/subjects/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.subjects.findIndex((s) => s.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, id)) {
    res.status(403).json({ error: 'You do not have permission to delete this subject.' });
    return;
  }

  // Find all chapters under this subject
  const subjectChapters = db.chapters.filter((c) => c.subject_id === id);
  const chapterIds = subjectChapters.map((c) => c.id);

  // Find all topics under these chapters or subject
  const subjectTopics = db.topics.filter(
    (t) => t.subject_id === id || chapterIds.includes(t.chapter_id)
  );
  const topicIds = subjectTopics.map((t) => t.id);

  // Find all subtopics under these chapters or topics
  const subjectSubtopics = db.subtopics.filter(
    (s) => chapterIds.includes(s.chapter_id) || (s.topic_id && topicIds.includes(s.topic_id))
  );
  const subtopicIds = subjectSubtopics.map((s) => s.id);

  // Cascade delete subtopics, topics, chapters, materials, quizzes, assignments, enrollments
  const initialCounts = {
    chapters: subjectChapters.length,
    topics: subjectTopics.length,
    subtopics: subjectSubtopics.length,
  };

  // Remove subtopics
  for (let i = db.subtopics.length - 1; i >= 0; i--) {
    if (subtopicIds.includes(db.subtopics[i].id)) db.subtopics.splice(i, 1);
  }

  // Remove topics
  for (let i = db.topics.length - 1; i >= 0; i--) {
    if (topicIds.includes(db.topics[i].id)) db.topics.splice(i, 1);
  }

  // Remove chapters
  for (let i = db.chapters.length - 1; i >= 0; i--) {
    if (chapterIds.includes(db.chapters[i].id)) db.chapters.splice(i, 1);
  }

  // Remove materials
  for (let i = db.materials.length - 1; i >= 0; i--) {
    if (db.materials[i].subject_id === id) db.materials.splice(i, 1);
  }

  // Remove notes
  for (let i = db.notes.length - 1; i >= 0; i--) {
    if (db.notes[i].subject_id === id) db.notes.splice(i, 1);
  }

  // Remove quizzes
  for (let i = db.quizzes.length - 1; i >= 0; i--) {
    if (db.quizzes[i].subject_id === id || (db.quizzes[i].subtopic_id && subtopicIds.includes(db.quizzes[i].subtopic_id!))) {
      db.quizzes.splice(i, 1);
    }
  }

  // Remove assignments
  for (let i = db.assignments.length - 1; i >= 0; i--) {
    if (db.assignments[i].subject_id === id || db.assignments[i].class_id === id) {
      db.assignments.splice(i, 1);
    }
  }

  // Remove enrollments
  for (let i = db.enrollments.length - 1; i >= 0; i--) {
    if (db.enrollments[i].subject_id === id) db.enrollments.splice(i, 1);
  }

  // Remove subject
  db.subjects.splice(index, 1);
  db.persist();

  res.json({
    message: 'Subject and child curriculum items deleted successfully',
    deletedCounts: initialCounts,
  });
});

// Teacher or Admin regenerates class code (Requirements #2 & #3)
router.post('/subjects/:id/regenerate-code', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Class / Subject not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, id)) {
    res.status(403).json({ error: 'You do not have permission to manage this class.' });
    return;
  }

  let newCode = generateClassCode(subject.name, subject.section);
  while (db.subjects.some((s) => s.class_code && s.class_code.toUpperCase() === newCode.toUpperCase())) {
    newCode = generateClassCode(subject.name, subject.section);
  }

  subject.class_code = newCode;
  db.persist();

  res.json({
    message: 'Class code regenerated successfully.',
    class_code: newCode,
    subject,
  });
});

// Teacher (of this class) or Admin explicitly removes a student from a class
router.delete('/subjects/:id/enrollments/:studentId', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id, studentId } = req.params;
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    res.status(404).json({ error: 'Class not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, id)) {
    res.status(403).json({ error: 'Only the assigned teacher or an administrator can remove students from this class.' });
    return;
  }

  const idx = db.enrollments.findIndex((e) => e.subject_id === id && e.student_id === studentId);
  if (idx === -1) {
    res.status(404).json({ error: 'Student enrollment record not found.' });
    return;
  }

  db.enrollments.splice(idx, 1);
  db.persist();
  res.json({ message: 'Student removed from class successfully.' });
});

router.get('/chapters/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const chapter = db.chapters.find((c) => c.id === id);
  if (!chapter) {
    res.status(404).json({ error: 'Chapter not found.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === chapter.subject_id);
  if (!subject) {
    res.status(404).json({ error: 'Parent subject not found.' });
    return;
  }

  const user = req.user!;

  if (user.role === 'student' && !isStudentEnrolled(user.id, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  if (user.role === 'teacher' && subject.teacher_id !== user.id) {
    res.status(403).json({ error: 'You do not have permission to access this class chapter.' });
    return;
  }

  const userProgress = db.progress.filter((p) => p.student_id === user.id);

  // Topics under this chapter
  const rawTopics = (db.topics || [])
    .filter((t) => t.chapter_id === id)
    .sort((a, b) => a.order - b.order);

  // Subtopics under this chapter
  const rawSubtopics = db.subtopics
    .filter((s) => s.chapter_id === id)
    .sort((a, b) => a.order - b.order);

  // Filter out draft content if student
  const subtopicsFiltered = user.role === 'student'
    ? rawSubtopics.filter((s) => s.status !== 'draft')
    : rawSubtopics;

  const topicsFiltered = user.role === 'student'
    ? rawTopics.filter((t) => t.status !== 'draft')
    : rawTopics;

  const subtopics = subtopicsFiltered.map((sub) => {
    const content = db.learningContents.find((lc) => lc.subtopic_id === sub.id);
    const note = db.notes.find((n) => n.subtopic_id === sub.id);
    const quiz = db.quizzes.find((q) => q.subtopic_id === sub.id);
    const prog = userProgress.find((p) => p.subtopic_id === sub.id);

    return {
      ...sub,
      hasVideo: !!content?.video?.video_url,
      hasAnimation: !!content?.animation,
      hasNotes: !!note,
      hasQuiz: !!quiz,
      completed: !!prog?.completed,
      videoProgress: prog?.video_progress || 0,
      quizScore: prog?.quiz_score,
      quizPassed: prog?.quiz_passed,
    };
  });

  const topics = topicsFiltered.map((top) => ({
    ...top,
    subtopics: subtopics.filter((s) => s.topic_id === top.id),
  }));

  const completedCount = subtopics.filter((s) => s.completed).length;
  const chapterProgress = subtopics.length > 0 ? Math.round((completedCount / subtopics.length) * 100) : 0;

  res.json({
    chapter,
    subject: {
      ...subject,
      class_code: user.role === 'teacher' ? subject.class_code : undefined,
    },
    topics,
    subtopics,
    progress: chapterProgress,
  });
});

router.post('/chapters', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { subject_id, title, description, order, status } = req.body;
  if (!subject_id || !title || !description) {
    res.status(400).json({ error: 'Subject ID, title, and description are required.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === subject_id);
  if (!subject) {
    res.status(404).json({ error: 'Target subject does not exist.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this subject curriculum.' });
    return;
  }

  const existingInSubject = db.chapters.filter((c) => c.subject_id === subject_id);

  const newChapter: Chapter = {
    id: `chap_${crypto.randomUUID().slice(0, 8)}`,
    subject_id,
    title: title.trim(),
    description: description.trim(),
    order: Number(order) || existingInSubject.length + 1,
    status: status || 'published',
    created_at: new Date().toISOString(),
  };

  db.chapters.push(newChapter);
  db.persist();

  res.status(201).json({ message: 'Chapter created successfully', chapter: newChapter });
});

// Teacher edits Chapter (Requirement #5)
router.put('/chapters/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const chapter = db.chapters.find((c) => c.id === id);
  if (!chapter) {
    res.status(404).json({ error: 'Chapter not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this chapter.' });
    return;
  }

  const { title, description, order, status } = req.body;
  if (title !== undefined) chapter.title = title.trim();
  if (description !== undefined) chapter.description = description.trim();
  if (order !== undefined) chapter.order = Number(order);
  if (status !== undefined) chapter.status = status;

  db.persist();
  res.json({ message: 'Chapter updated successfully', chapter });
});

// Teacher deletes Chapter with safety cascading (Requirement #5 & #24)
router.delete('/chapters/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.chapters.findIndex((c) => c.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Chapter not found.' });
    return;
  }

  const chapter = db.chapters[index];
  if (!canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to delete this chapter.' });
    return;
  }

  // Find child topics and subtopics
  const childTopics = db.topics.filter((t) => t.chapter_id === id);
  const childTopicIds = childTopics.map((t) => t.id);

  const childSubtopics = db.subtopics.filter(
    (s) => s.chapter_id === id || (s.topic_id && childTopicIds.includes(s.topic_id))
  );
  const childSubtopicIds = childSubtopics.map((s) => s.id);

  // Clean up subtopics
  for (let i = db.subtopics.length - 1; i >= 0; i--) {
    if (childSubtopicIds.includes(db.subtopics[i].id)) db.subtopics.splice(i, 1);
  }

  // Clean up topics
  for (let i = db.topics.length - 1; i >= 0; i--) {
    if (childTopicIds.includes(db.topics[i].id)) db.topics.splice(i, 1);
  }

  // Clean up materials
  for (let i = db.materials.length - 1; i >= 0; i--) {
    if (db.materials[i].chapter_id === id) db.materials.splice(i, 1);
  }

  // Delete chapter
  db.chapters.splice(index, 1);
  db.persist();

  res.json({
    message: 'Chapter and child topics/subtopics deleted successfully',
    deletedTopics: childTopics.length,
    deletedSubtopics: childSubtopics.length,
  });
});

// Teacher reorders Chapters (Requirement #5)
router.post('/chapters/reorder', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { subject_id, chapter_orders } = req.body;
  if (!subject_id || !Array.isArray(chapter_orders)) {
    res.status(400).json({ error: 'Subject ID and chapter_orders array required.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    res.status(403).json({ error: 'You do not have permission to reorder chapters.' });
    return;
  }

  chapter_orders.forEach((item: { id: string; order: number }) => {
    const c = db.chapters.find((chap) => chap.id === item.id && chap.subject_id === subject_id);
    if (c) c.order = Number(item.order);
  });

  db.persist();
  res.json({ message: 'Chapters reordered successfully' });
});

router.get('/subtopics/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subtopic = db.subtopics.find((s) => s.id === id);
  if (!subtopic) {
    res.status(404).json({ error: 'Subtopic not found.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === subtopic.chapter_id);
  const subject = chapter ? db.subjects.find((s) => s.id === chapter.subject_id) : null;

  if (!chapter || !subject) {
    res.status(404).json({ error: 'Curriculum structure missing.' });
    return;
  }

  const user = req.user!;

  if (user.role === 'student' && !isStudentEnrolled(user.id, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  if (user.role === 'teacher' && subject.teacher_id !== user.id) {
    res.status(403).json({ error: 'You do not have permission to access this class lesson.' });
    return;
  }

  // Strict Content Hierarchy Rule: Fetch ONLY content specifically linked to this subtopic!
  const content = db.learningContents.find((lc) => lc.subtopic_id === id);
  const notes = db.notes.filter((n) => n.subtopic_id === id);
  const rawQuiz = db.quizzes.find(
    (q) => q.subtopic_id === id && (user.role !== 'student' || q.status !== 'draft')
  );
  const nowIso = new Date().toISOString();
  let quiz: any = rawQuiz || null;
  if (rawQuiz && user.role === 'student') {
    const studentSubs = db.quizSubmissions.filter(
      (s) => s.quiz_id === rawQuiz.id && s.student_id === user.id
    );
    const activeAttempt =
      db.quizAttempts.find(
        (a) =>
          a.quiz_id === rawQuiz.id &&
          a.student_id === user.id &&
          a.status === 'in_progress' &&
          new Date(a.expires_at).getTime() > Date.now()
      ) || null;
    const maxAttempts = Math.max(1, Number(rawQuiz.max_attempts || 1));
    quiz = {
      ...stripQuizAnswersForStudent(rawQuiz),
      teacherName: getQuizTeacherName(rawQuiz),
      attemptsCount: studentSubs.length,
      maxAttempts,
      attemptsRemaining: Math.max(0, maxAttempts - studentSubs.length),
      activeAttempt,
      mySubmission: studentSubs[studentSubs.length - 1] || null,
    };
  }

  const progress = db.progress.find((p) => p.student_id === user.id && p.subtopic_id === id) || null;

  // Sibling navigation
  const siblingSubtopics = db.subtopics
    .filter((s) => s.chapter_id === chapter.id)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.id, title: s.title, order: s.order }));

  const currentIndex = siblingSubtopics.findIndex((s) => s.id === id);
  const prevSubtopic = currentIndex > 0 ? siblingSubtopics[currentIndex - 1] : null;
  const nextSubtopic = currentIndex < siblingSubtopics.length - 1 ? siblingSubtopics[currentIndex + 1] : null;

  res.json({
    serverTime: nowIso,
    subtopic,
    chapter,
    subject: {
      ...subject,
      class_code: user.role === 'teacher' ? subject.class_code : undefined,
    },
    content,
    notes,
    quiz,
    progress,
    navigation: {
      prev: prevSubtopic,
      next: nextSubtopic,
      total: siblingSubtopics.length,
      current: currentIndex + 1,
    },
  });
});

// ==========================================
// TOPIC MANAGEMENT ROUTES (Requirement #4, #6 & #8)
// ==========================================

// Teacher creates a Topic inside a Chapter
router.post('/topics', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { chapter_id, subject_id, title, description, order, status } = req.body;
  if (!chapter_id || !title || !description) {
    res.status(400).json({ error: 'Chapter ID, topic title, and description are required.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === chapter_id);
  if (!chapter) {
    res.status(404).json({ error: 'Parent chapter not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this chapter.' });
    return;
  }

  const existingInChap = db.topics.filter((t) => t.chapter_id === chapter_id);

  const newTopic: Topic = {
    id: `top_${crypto.randomUUID().slice(0, 8)}`,
    chapter_id,
    subject_id: subject_id || chapter.subject_id,
    title: title.trim(),
    description: description.trim(),
    order: Number(order) || existingInChap.length + 1,
    status: status || 'published',
    created_at: new Date().toISOString(),
  };

  db.topics.push(newTopic);
  db.persist();

  res.status(201).json({ message: 'Topic created successfully', topic: newTopic });
});

// Teacher edits Topic (Requirement #6)
router.put('/topics/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const topic = db.topics.find((t) => t.id === id);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === topic.chapter_id);
  if (!chapter || !canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this topic.' });
    return;
  }

  const { title, description, order, status } = req.body;
  if (title !== undefined) topic.title = title.trim();
  if (description !== undefined) topic.description = description.trim();
  if (order !== undefined) topic.order = Number(order);
  if (status !== undefined) topic.status = status;

  db.persist();
  res.json({ message: 'Topic updated successfully', topic });
});

// Teacher deletes Topic with safety cascading (Requirement #6 & #24)
router.delete('/topics/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.topics.findIndex((t) => t.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Topic not found.' });
    return;
  }

  const topic = db.topics[index];
  const chapter = db.chapters.find((c) => c.id === topic.chapter_id);
  if (!chapter || !canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to delete this topic.' });
    return;
  }

  // Find child subtopics
  const childSubtopics = db.subtopics.filter((s) => s.topic_id === id);
  const childSubtopicIds = childSubtopics.map((s) => s.id);

  // Remove child subtopics
  for (let i = db.subtopics.length - 1; i >= 0; i--) {
    if (childSubtopicIds.includes(db.subtopics[i].id)) db.subtopics.splice(i, 1);
  }

  // Remove materials under this topic
  for (let i = db.materials.length - 1; i >= 0; i--) {
    if (db.materials[i].topic_id === id) db.materials.splice(i, 1);
  }

  // Remove topic
  db.topics.splice(index, 1);
  db.persist();

  res.json({
    message: 'Topic and child subtopics deleted successfully',
    deletedSubtopics: childSubtopics.length,
  });
});

// Teacher reorders Topics (Requirement #6)
router.post('/topics/reorder', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { chapter_id, topic_orders } = req.body;
  if (!chapter_id || !Array.isArray(topic_orders)) {
    res.status(400).json({ error: 'Chapter ID and topic_orders array required.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === chapter_id);
  if (!chapter || !canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to reorder topics in this chapter.' });
    return;
  }

  topic_orders.forEach((item: { id: string; order: number }) => {
    const t = db.topics.find((top) => top.id === item.id && top.chapter_id === chapter_id);
    if (t) t.order = Number(item.order);
  });

  db.persist();
  res.json({ message: 'Topics reordered successfully' });
});

// ==========================================
// SUBTOPIC MANAGEMENT ROUTES (Requirement #4, #7 & #8)
// ==========================================

router.post('/subtopics', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { chapter_id, topic_id, title, description, learning_objectives, estimated_minutes, order, status } = req.body;
  if (!chapter_id || !title || !description) {
    res.status(400).json({ error: 'Chapter ID, title, and description are required.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === chapter_id);
  if (!chapter) {
    res.status(404).json({ error: 'Target chapter does not exist.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this curriculum.' });
    return;
  }

  const existingInChap = db.subtopics.filter((s) => s.chapter_id === chapter_id);

  const newSubtopic: Subtopic = {
    id: `sub_${crypto.randomUUID().slice(0, 8)}`,
    chapter_id,
    topic_id: topic_id || undefined,
    title: title.trim(),
    description: description.trim(),
    learning_objectives: Array.isArray(learning_objectives)
      ? learning_objectives
      : [description.slice(0, 80)],
    estimated_minutes: Number(estimated_minutes) || 20,
    order: Number(order) || existingInChap.length + 1,
    status: status || 'published',
    created_at: new Date().toISOString(),
  };

  db.subtopics.push(newSubtopic);

  // Initialize clean conceptual learning content (never inject unrelated demo videos or simulations)
  db.learningContents.push({
    id: `lc_${newSubtopic.id}`,
    subtopic_id: newSubtopic.id,
    explanation: {
      title: `${newSubtopic.title}: Overview`,
      summary: newSubtopic.description,
      keyPoints: newSubtopic.learning_objectives,
      deepDive: 'Review the conceptual notes, teacher-published videos, and interactive simulations attached to this topic.',
    },
    video: {
      title: '',
      video_url: '',
      video_type: 'embedded',
      duration_seconds: 0,
      description: '',
    },
    animation: {
      title: '',
      animation_type: 'none',
      interactive_config: {},
      description: '',
      guide_steps: [],
    },
  });

  db.persist();

  res.status(201).json({ message: 'Subtopic created successfully', subtopic: newSubtopic });
});

// Teacher edits Subtopic (Requirement #7)
router.put('/subtopics/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const subtopic = db.subtopics.find((s) => s.id === id);
  if (!subtopic) {
    res.status(404).json({ error: 'Subtopic not found.' });
    return;
  }

  const chapter = db.chapters.find((c) => c.id === subtopic.chapter_id);
  if (!chapter || !canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this subtopic.' });
    return;
  }

  const { title, description, topic_id, learning_objectives, estimated_minutes, order, status } = req.body;
  if (title !== undefined) subtopic.title = title.trim();
  if (description !== undefined) subtopic.description = description.trim();
  if (topic_id !== undefined) subtopic.topic_id = topic_id;
  if (learning_objectives !== undefined) subtopic.learning_objectives = Array.isArray(learning_objectives) ? learning_objectives : [learning_objectives];
  if (estimated_minutes !== undefined) subtopic.estimated_minutes = Number(estimated_minutes);
  if (order !== undefined) subtopic.order = Number(order);
  if (status !== undefined) subtopic.status = status;

  db.persist();
  res.json({ message: 'Subtopic updated successfully', subtopic });
});

// Teacher deletes Subtopic (Requirement #7 & #24)
router.delete('/subtopics/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.subtopics.findIndex((s) => s.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Subtopic not found.' });
    return;
  }

  const subtopic = db.subtopics[index];
  const chapter = db.chapters.find((c) => c.id === subtopic.chapter_id);
  if (!chapter || !canTeacherManageSubject(req.user!, chapter.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to delete this subtopic.' });
    return;
  }

  // Remove linked learning content, materials, notes, quizzes
  for (let i = db.learningContents.length - 1; i >= 0; i--) {
    if (db.learningContents[i].subtopic_id === id) db.learningContents.splice(i, 1);
  }
  for (let i = db.materials.length - 1; i >= 0; i--) {
    if (db.materials[i].subtopic_id === id) db.materials.splice(i, 1);
  }
  for (let i = db.notes.length - 1; i >= 0; i--) {
    if (db.notes[i].subtopic_id === id) db.notes.splice(i, 1);
  }
  for (let i = db.quizzes.length - 1; i >= 0; i--) {
    if (db.quizzes[i].subtopic_id === id) db.quizzes.splice(i, 1);
  }

  db.subtopics.splice(index, 1);
  db.persist();

  res.json({ message: 'Subtopic and linked content deleted successfully' });
});

// Teacher reorders Subtopics (Requirement #7)
router.post('/subtopics/reorder', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { chapter_id, topic_id, subtopic_orders } = req.body;
  if (!Array.isArray(subtopic_orders)) {
    res.status(400).json({ error: 'subtopic_orders array required.' });
    return;
  }

  subtopic_orders.forEach((item: { id: string; order: number }) => {
    const s = db.subtopics.find((sub) => sub.id === item.id);
    if (s) {
      s.order = Number(item.order);
      if (topic_id) s.topic_id = topic_id;
    }
  });

  db.persist();
  res.json({ message: 'Subtopics reordered successfully' });
});

// ==========================================
// CURRICULUM HIERARCHY TREE ENDPOINT (Requirement #4 & #8)
// SUBJECT -> CHAPTER -> TOPIC -> SUBTOPIC
// ==========================================
router.get('/curriculum/:subjectId', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { subjectId } = req.params;
  const subject = db.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const user = req.user!;
  // Check authorization
  if (user.role === 'student' && !isStudentEnrolled(user.id, subjectId)) {
    res.status(403).json({ error: 'You are not enrolled in this subject.' });
    return;
  }

  if (user.role === 'teacher' && subject.teacher_id !== user.id) {
    res.status(403).json({ error: 'You do not have permission to access this class curriculum.' });
    return;
  }

  const isStudent = user.role === 'student';

  // Get chapters
  const rawChapters = db.chapters
    .filter((c) => c.subject_id === subjectId)
    .sort((a, b) => a.order - b.order);

  const chapters = (isStudent ? rawChapters.filter((c) => c.status !== 'draft') : rawChapters).map((chap) => {
    // Topics in chapter
    const rawTopics = (db.topics || [])
      .filter((t) => t.chapter_id === chap.id)
      .sort((a, b) => a.order - b.order);

    const topicsList = isStudent ? rawTopics.filter((t) => t.status !== 'draft') : rawTopics;

    // Subtopics in chapter
    const rawSubtopics = db.subtopics
      .filter((s) => s.chapter_id === chap.id)
      .sort((a, b) => a.order - b.order);

    const subtopicsList = isStudent ? rawSubtopics.filter((s) => s.status !== 'draft') : rawSubtopics;

    const mappedTopics = topicsList.map((top) => {
      const topSubs = subtopicsList.filter((s) => s.topic_id === top.id);
      return {
        ...top,
        subtopics: topSubs.map((s) => {
          const notesCount = db.notes.filter((n) => n.subtopic_id === s.id).length;
          const materialsCount = db.materials.filter((m) => m.subtopic_id === s.id).length;
          const quiz = db.quizzes.find((q) => q.subtopic_id === s.id);
          const content = db.learningContents.find((lc) => lc.subtopic_id === s.id);
          const hasVideo = !!content?.video?.video_url || db.materials.some((m) => m.subtopic_id === s.id && m.type === 'video');

          return {
            ...s,
            notesCount,
            materialsCount,
            hasQuiz: !!quiz,
            quizId: quiz?.id,
            hasVideo,
          };
        }),
      };
    });

    // Unassigned subtopics in chapter (without topic_id)
    const unassignedSubs = subtopicsList.filter(
      (s) => !s.topic_id || !topicsList.some((t) => t.id === s.topic_id)
    );

    return {
      ...chap,
      topics: mappedTopics,
      unassignedSubtopics: unassignedSubs.map((s) => ({
        ...s,
        notesCount: db.notes.filter((n) => n.subtopic_id === s.id).length,
        materialsCount: db.materials.filter((m) => m.subtopic_id === s.id).length,
        hasQuiz: !!db.quizzes.find((q) => q.subtopic_id === s.id),
      })),
      totalSubtopics: subtopicsList.length,
    };
  });

  res.json({
    subject: {
      ...subject,
      class_code: user.role === 'teacher' ? subject.class_code : undefined,
    },
    chapters,
  });
});

// Update or set learning content
router.post('/learning-content', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { subtopic_id, explanation, video, animation } = req.body;
  if (!subtopic_id) {
    res.status(400).json({ error: 'Subtopic ID is required.' });
    return;
  }

  let content = db.learningContents.find((c) => c.subtopic_id === subtopic_id);
  if (content) {
    if (explanation) content.explanation = { ...content.explanation, ...explanation };
    if (video) content.video = { ...content.video, ...video };
    if (animation) content.animation = { ...content.animation, ...animation };
  } else {
    content = {
      id: `lc_${crypto.randomUUID().slice(0, 8)}`,
      subtopic_id,
      explanation: explanation || {
        title: 'Topic Overview',
        summary: '',
        keyPoints: [],
        deepDive: '',
      },
      video: video || {
        title: 'Topic Video',
        video_url: '',
        video_type: 'embedded',
        duration_seconds: 0,
        description: '',
      },
      animation: animation || {
        title: 'Topic Animation',
        animation_type: 'custom_svg',
        interactive_config: {},
        description: '',
        guide_steps: [],
      },
    };
    db.learningContents.push(content);
  }

  db.persist();
  res.json({ message: 'Learning content saved successfully', content });
});

// ==========================================
// 5. NOTES & PDF VIEWER ROUTES (SECURED)
// ==========================================

router.post('/notes/upload', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { subject_id, chapter_id, subtopic_id, title, description, file_name, pages_content } = req.body;

  if (!subject_id || !chapter_id || !subtopic_id || !title) {
    res.status(400).json({ error: 'Subject, chapter, subtopic, and note title are required.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    res.status(403).json({ error: 'You do not have permission to upload notes to this class.' });
    return;
  }

  if (!chapterBelongsToSubject(subject_id, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const pages = Array.isArray(pages_content) && pages_content.length > 0
    ? pages_content
    : [
        {
          pageNumber: 1,
          title: 'Document Overview & Key Definitions',
          content: [
            description || 'Overview of core subtopic concepts and analytical foundations.',
            'Comprehensive study guide compiled by course faculty.',
          ],
          diagramLabel: 'Conceptual Schema & Structural Overview',
        },
      ];

  const newNote: NoteDocument = {
    id: `note_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id,
    subtopic_id,
    title: title.trim(),
    description: description?.trim() || '',
    file_name: file_name?.trim() || `${title.replace(/\s+/g, '_')}_Notes.pdf`,
    file_size: `${(Math.random() * 1.5 + 1.2).toFixed(1)} MB`,
    pages_count: pages.length,
    pages,
    created_at: new Date().toISOString(),
  };

  db.notes.push(newNote);
  db.persist();

  res.status(201).json({ message: 'Notes uploaded and linked to subtopic successfully', note: newNote });
});

router.get('/notes/:id', async (req: Request, res: Response): Promise<void> => {
  const note = db.notes.find((n) => n.id === req.params.id);
  if (!note) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  // Security: Check student enrollment using canonical token resolution (JWT + Firebase ID token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const user = await resolveUserFromBearerToken(authHeader.substring(7));
    if (user && user.role === 'student' && !isStudentEnrolled(user.id, note.subject_id)) {
      res.status(403).json({ error: 'You are not enrolled in this class.' });
      return;
    }
  }

  const sub = db.subtopics.find((s) => s.id === note.subtopic_id);
  const chap = db.chapters.find((c) => c.id === note.chapter_id);
  const subj = db.subjects.find((s) => s.id === note.subject_id);

  res.json({
    note,
    subtopicTitle: sub?.title,
    chapterTitle: chap?.title,
    subjectName: subj?.name,
  });
});

router.get('/notes/:id/download', async (req: Request, res: Response): Promise<void> => {
  const note = db.notes.find((n) => n.id === req.params.id);
  if (!note) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  // Security: Check student enrollment using canonical token resolution (JWT + Firebase ID token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const user = await resolveUserFromBearerToken(authHeader.substring(7));
    if (user && user.role === 'student' && !isStudentEnrolled(user.id, note.subject_id)) {
      res.status(403).json({ error: 'You are not enrolled in this class.' });
      return;
    }
  }

  let docContent = `==========================================================\n`;
  docContent += `VISUALEARN ACADEMIC STUDY NOTES\n`;
  docContent += `==========================================================\n`;
  docContent += `Document: ${note.title}\n`;
  docContent += `Instructor: ${note.teacher_name}\n`;
  docContent += `File: ${note.file_name}\n`;
  docContent += `Date: ${new Date(note.created_at).toLocaleDateString()}\n`;
  docContent += `----------------------------------------------------------\n\n`;

  note.pages.forEach((p) => {
    docContent += `PAGE ${p.pageNumber}: ${p.title}\n`;
    docContent += `----------------------------------------------------------\n`;
    p.content.forEach((line) => {
      docContent += `${line}\n\n`;
    });
    if (p.diagramLabel) {
      docContent += `[DIAGRAM REFERENCE: ${p.diagramLabel}]\n\n`;
    }
    docContent += `\n`;
  });

  docContent += `==========================================================\n`;
  docContent += `End of Document - VisuaLearn Smart Study Learning Platform\n`;
  docContent += `==========================================================\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${note.file_name.replace(/\.pdf$/i, '')}_StudyNotes.txt"`);
  res.send(docContent);
});

// ==========================================
// 5. MATERIALS MANAGEMENT ROUTES (Requirement #9, #10 & #11)
// ==========================================

// GET /api/materials - List materials with strict student enrollment & draft privacy
router.get('/materials', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { subject_id, chapter_id, topic_id, subtopic_id, type } = req.query;

  let materialsList = db.materials || [];

  if (user.role === 'student') {
    const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);
    materialsList = materialsList.filter((m) => enrolledIds.includes(m.subject_id) && m.status === 'published');
  } else if (user.role === 'teacher') {
    const mySubjectIds = db.subjects.filter((s) => s.teacher_id === user.id).map((s) => s.id);
    materialsList = materialsList.filter((m) => m.teacher_id === user.id || mySubjectIds.includes(m.subject_id));
  }

  if (subject_id) materialsList = materialsList.filter((m) => m.subject_id === subject_id);
  if (chapter_id) materialsList = materialsList.filter((m) => m.chapter_id === chapter_id);
  if (topic_id) materialsList = materialsList.filter((m) => m.topic_id === topic_id);
  if (subtopic_id) materialsList = materialsList.filter((m) => m.subtopic_id === subtopic_id);
  if (type) materialsList = materialsList.filter((m) => m.type === type);

  // Enrich with subject, chapter, topic names
  const enriched = materialsList.map((m) => {
    const subj = db.subjects.find((s) => s.id === m.subject_id);
    const chap = db.chapters.find((c) => c.id === m.chapter_id);
    const top = db.topics.find((t) => t.id === m.topic_id);
    const sub = db.subtopics.find((s) => s.id === m.subtopic_id);

    return {
      ...m,
      subjectName: subj?.name || 'General Subject',
      chapterTitle: chap?.title || 'General Chapter',
      topicTitle: top?.title || 'General Topic',
      subtopicTitle: sub?.title || 'General Subtopic',
    };
  });

  res.json({ materials: enriched });
});

// POST /api/materials - Teacher uploads notes or adds video
router.post('/materials', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const {
    subject_id,
    chapter_id,
    topic_id,
    subtopic_id,
    type,
    title,
    description,
    file_name,
    file_url,
    file_size,
    pages_content,
    video_url,
    duration_seconds,
    status,
  } = req.body;

  if (!subject_id || !title || !type) {
    res.status(400).json({ error: 'Subject ID, title, and material type are required.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === subject_id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    res.status(403).json({ error: 'You do not have permission to add materials to this subject.' });
    return;
  }

  if (chapter_id && !chapterBelongsToSubject(subject_id, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const newMaterial: MaterialItem = {
    id: `mat_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id: chapter_id || '',
    topic_id: topic_id || undefined,
    subtopic_id: subtopic_id || undefined,
    type: type as 'notes' | 'video' | 'document',
    title: title.trim(),
    description: description?.trim() || '',
    file_name: file_name?.trim() || (type === 'notes' ? `${title.replace(/\s+/g, '_')}_Notes.pdf` : undefined),
    file_url: file_url || '#',
    file_size: file_size || (type === 'notes' ? '2.4 MB' : undefined),
    pages_count: Array.isArray(pages_content) ? pages_content.length : 3,
    pages_content: pages_content || undefined,
    video_url: video_url?.trim() || undefined,
    duration_seconds: Number(duration_seconds) || (type === 'video' ? 360 : undefined),
    status: (status as any) || 'published',
    created_at: new Date().toISOString(),
  };

  db.materials.push(newMaterial);

  // If notes and subtopic provided, also sync to notes list for PdfViewer
  if (type === 'notes' && subtopic_id) {
    const existingNoteIdx = db.notes.findIndex((n) => n.subtopic_id === subtopic_id && n.title === title);
    if (existingNoteIdx === -1) {
      db.notes.push({
        id: `note_${newMaterial.id}`,
        teacher_id: req.user!.id,
        teacher_name: req.user!.name,
        subject_id,
        chapter_id: chapter_id || '',
        subtopic_id,
        title: title.trim(),
        description: description?.trim() || '',
        file_name: newMaterial.file_name || 'Notes.pdf',
        file_size: newMaterial.file_size || '2.4 MB',
        pages_count: newMaterial.pages_count || 2,
        pages: Array.isArray(pages_content) && pages_content.length > 0 ? pages_content : [
          {
            pageNumber: 1,
            title: title.trim(),
            content: [description || 'Academic course document and verified study notes.'],
          },
        ],
        created_at: new Date().toISOString(),
      });
    }
  }

  db.persist();

  res.status(201).json({
    message: 'Material added successfully',
    material: newMaterial,
  });
});

// PUT /api/materials/:id - Teacher edits material (Requirement #10)
router.put('/materials/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, material.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this material.' });
    return;
  }

  const { title, description, file_name, file_url, video_url, duration_seconds, status } = req.body;
  if (title !== undefined) material.title = title.trim();
  if (description !== undefined) material.description = description.trim();
  if (file_name !== undefined) material.file_name = file_name.trim();
  if (file_url !== undefined) material.file_url = file_url;
  if (video_url !== undefined) material.video_url = video_url.trim();
  if (duration_seconds !== undefined) material.duration_seconds = Number(duration_seconds);
  if (status !== undefined) material.status = status;

  db.persist();
  res.json({ message: 'Material updated successfully', material });
});

// POST /api/materials/upload-file - Teacher uploads real PDF material from device (Requirements #6, #7, #8, #10, #12)
router.post('/materials/upload-file', requireTeacher, pdfUpload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'Only PDF files are allowed.' });
    return;
  }

  const { subject_id, chapter_id, topic_id, subtopic_id, title, description, status } = req.body;

  if (!subject_id || !title) {
    // Clean up uploaded file if missing parameters
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(400).json({ error: 'Subject and title are required.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === subject_id);
  if (!subject) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(403).json({ error: 'You do not have permission to add materials to this subject.' });
    return;
  }

  if (chapter_id && !chapterBelongsToSubject(subject_id, chapter_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const formattedSize = formatBytes(req.file.size);
  const fileUrl = `/api/files/${req.file.filename}`;

  const newMaterial: MaterialItem = {
    id: `mat_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id: chapter_id || '',
    topic_id: topic_id || undefined,
    subtopic_id: subtopic_id || undefined,
    type: 'notes',
    title: title.trim(),
    description: description?.trim() || '',
    file_name: req.file.originalname,
    file_url: fileUrl,
    file_size: formattedSize,
    storage_path: req.file.filename,
    pages_count: 1,
    status: (status as any) || 'published',
    created_at: new Date().toISOString(),
  };

  db.materials.push(newMaterial);

  // Also sync to notes collection
  if (subtopic_id) {
    db.notes.push({
      id: `note_${newMaterial.id}`,
      teacher_id: req.user!.id,
      teacher_name: req.user!.name,
      subject_id,
      chapter_id: chapter_id || '',
      subtopic_id,
      title: title.trim(),
      description: description?.trim() || '',
      file_name: req.file.originalname,
      file_size: formattedSize,
      file_url: fileUrl,
      storage_path: req.file.filename,
      pages_count: 1,
      pages: [
        {
          pageNumber: 1,
          title: title.trim(),
          content: [description?.trim() || 'Verified course study notes uploaded by instructor.'],
        },
      ],
      created_at: new Date().toISOString(),
    });
  }

  db.persist();

  res.status(201).json({
    message: 'PDF uploaded successfully',
    material: newMaterial,
  });
});

// POST /api/notes/upload-file - Dedicated endpoint for Upload Notes (Requirement #6, #7)
router.post('/notes/upload-file', requireTeacher, pdfUpload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'Only PDF files are allowed.' });
    return;
  }

  const { subject_id, chapter_id, subtopic_id, title, description } = req.body;

  if (!subject_id || !title) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(400).json({ error: 'Subject and title are required.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(403).json({ error: 'You do not have permission to upload notes to this subject.' });
    return;
  }

  if (chapter_id && !chapterBelongsToSubject(subject_id, chapter_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const formattedSize = formatBytes(req.file.size);
  const fileUrl = `/api/files/${req.file.filename}`;

  const newNote: NoteDocument = {
    id: `note_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id: chapter_id || '',
    subtopic_id: subtopic_id || '',
    title: title.trim(),
    description: description?.trim() || '',
    file_name: req.file.originalname,
    file_size: formattedSize,
    file_url: fileUrl,
    storage_path: req.file.filename,
    pages_count: 1,
    pages: [
      {
        pageNumber: 1,
        title: title.trim(),
        content: [description?.trim() || 'Academic course document and study notes.'],
      },
    ],
    created_at: new Date().toISOString(),
  };

  db.notes.push(newNote);

  // Sync to materials list as well
  db.materials.push({
    id: `mat_${newNote.id}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id: chapter_id || '',
    subtopic_id: subtopic_id || undefined,
    type: 'notes',
    title: title.trim(),
    description: description?.trim() || '',
    file_name: req.file.originalname,
    file_url: fileUrl,
    file_size: formattedSize,
    storage_path: req.file.filename,
    pages_count: 1,
    status: 'published',
    created_at: new Date().toISOString(),
  });

  db.persist();

  res.status(201).json({
    message: 'PDF note uploaded successfully',
    note: newNote,
  });
});

// PUT /api/materials/:id/replace-file - Teacher replaces existing material with new PDF (Requirement #10)
router.put('/materials/:id/replace-file', requireTeacher, pdfUpload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'Only PDF files are allowed.' });
    return;
  }

  const { id } = req.params;
  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, material.subject_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.status(403).json({ error: 'You do not have permission to modify this material.' });
    return;
  }

  // Remove previous stored file safely
  if (material.storage_path) {
    try {
      const oldPath = path.resolve(uploadsDir, material.storage_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch (e) {
      console.warn('Failed removing old file:', e);
    }
  }

  const formattedSize = formatBytes(req.file.size);
  const fileUrl = `/api/files/${req.file.filename}`;

  material.file_name = req.file.originalname;
  material.file_url = fileUrl;
  material.file_size = formattedSize;
  material.storage_path = req.file.filename;

  // Sync to associated note if present
  const relatedNote = db.notes.find((n) => n.id === `note_${material.id}` || n.title === material.title);
  if (relatedNote) {
    relatedNote.file_name = req.file.originalname;
    relatedNote.file_url = fileUrl;
    relatedNote.file_size = formattedSize;
    relatedNote.storage_path = req.file.filename;
  }

  db.persist();

  res.json({
    message: 'PDF file replaced successfully',
    material,
  });
});

// GET /api/files/:filename - Authenticated & Secure File Serving (Requirement #7, #9, #11)
router.get('/files/:filename', async (req: Request, res: Response): Promise<void> => {
  const { filename } = req.params;
  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.resolve(uploadsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  // Check enrollment authorization if student is accessing
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const user = await resolveUserFromBearerToken(authHeader.substring(7));
    if (user && user.role === 'student') {
      const mat = db.materials.find((m) => m.storage_path === safeFilename || (m.file_url && m.file_url.includes(safeFilename)));
      if (mat && !isStudentEnrolled(user.id, mat.subject_id)) {
        res.status(403).json({ error: 'You are not enrolled in this class.' });
        return;
      }
    }
  }

  // Determine original filename if known from database
  const knownRecord = db.materials.find((m) => m.storage_path === safeFilename) || db.notes.find((n) => n.storage_path === safeFilename);
  const downloadName = knownRecord?.file_name || safeFilename;

  const isPdf = safeFilename.toLowerCase().endsWith('.pdf');
  res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  res.sendFile(filePath);
});

// DELETE /api/materials/:id - Teacher deletes material (Requirement #10 & #24)
router.delete('/materials/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.materials.findIndex((m) => m.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  const material = db.materials[index];
  if (!canTeacherManageSubject(req.user!, material.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to delete this material.' });
    return;
  }

  // Safely delete file from disk if present
  if (material.storage_path) {
    try {
      const fPath = path.resolve(uploadsDir, material.storage_path);
      if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
    } catch (e) {
      console.warn('Failed unlinking deleted material file:', e);
    }
  }

  // Also remove synced note if present
  const noteIdx = db.notes.findIndex((n) => n.id === `note_${material.id}` || n.title === material.title);
  if (noteIdx !== -1) {
    db.notes.splice(noteIdx, 1);
  }

  db.materials.splice(index, 1);
  db.persist();

  res.json({ message: 'Material deleted successfully' });
});

// GET /api/materials/:id - View material with authorization check (Requirement #11)
router.get('/materials/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student') {
    if (!isStudentEnrolled(user.id, material.subject_id)) {
      res.status(403).json({ error: 'You are not enrolled in this class.' });
      return;
    }
    if (material.status === 'draft') {
      res.status(403).json({ error: 'This material is private or currently in draft.' });
      return;
    }
  }

  res.json({ material });
});

// ==========================================
// 5B. DOUBTS & INQUIRIES ROUTES (Requirement #1 & Security #5)
// ==========================================

// GET /api/doubts - List doubts with strict role authorization
router.get('/doubts', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { class_id, subject_id, chapter_id, topic_id, status } = req.query;

  let doubtsList = db.doubts || [];

  if (user.role === 'student') {
    // SECURITY: Students can ONLY see their own doubts
    doubtsList = doubtsList.filter((d) => d.student_id === user.id);
  } else if (user.role === 'teacher') {
    // SECURITY: Teachers can ONLY see doubts for classes/subjects they teach
    const teacherSubjectIds = db.subjects.filter((s) => s.teacher_id === user.id).map((s) => s.id);
    doubtsList = doubtsList.filter((d) => teacherSubjectIds.includes(d.subject_id));
  }

  const targetSubjectId = (subject_id || class_id) as string;
  if (targetSubjectId) {
    doubtsList = doubtsList.filter((d) => d.subject_id === targetSubjectId);
  }
  if (chapter_id) {
    doubtsList = doubtsList.filter((d) => d.chapter_id === chapter_id);
  }
  if (topic_id) {
    doubtsList = doubtsList.filter((d) => d.topic_id === topic_id);
  }
  if (status) {
    doubtsList = doubtsList.filter((d) => d.status.toLowerCase() === (status as string).toLowerCase());
  }

  // Sort latest first
  doubtsList.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

  res.json({ doubts: doubtsList });
});

// GET /api/doubts/:id - View single doubt with authorization check
router.get('/doubts/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const doubt = db.doubts.find((d) => d.id === id);
  if (!doubt) {
    res.status(404).json({ error: 'Doubt inquiry not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student' && doubt.student_id !== user.id) {
    res.status(403).json({ error: 'You are not authorized to view another student’s doubt.' });
    return;
  }

  if (user.role === 'teacher') {
    const isTeacherOfClass = canTeacherManageSubject(user, doubt.subject_id);
    if (!isTeacherOfClass) {
      res.status(403).json({ error: 'You are not authorized to view doubts for classes you do not teach.' });
      return;
    }
  }

  res.json({ doubt });
});

// POST /api/doubts - Student creates a new doubt
router.post('/doubts', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  if (user.role !== 'student') {
    res.status(403).json({ error: 'Only student accounts can ask academic doubts.' });
    return;
  }

  const {
    subject_id,
    chapter_id,
    topic_id,
    subtopic_id,
    title,
    description,
    attachment_url,
    attachment_name,
  } = req.body;

  if (!subject_id || !title || !description) {
    res.status(400).json({ error: 'Subject, question title, and description are required.' });
    return;
  }

  // SECURITY: Enforce enrollment check
  if (!isStudentEnrolled(user.id, subject_id)) {
    res.status(403).json({ error: 'You can only ask doubts for classes you are enrolled in.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === subject_id);
  const chapter = db.chapters.find((c) => c.id === chapter_id);
  const topic = db.topics.find((t) => t.id === topic_id);
  const subtopic = db.subtopics.find((s) => s.id === subtopic_id);

  const newDoubt: DoubtItem = {
    id: `dbt_${crypto.randomUUID().slice(0, 8)}`,
    student_id: user.id,
    student_name: user.name,
    student_email: user.email,
    student_avatar: (user as any).avatar || db.users.find((u) => u.id === user.id)?.avatar,
    subject_id,
    subject_name: subject?.name || 'General Subject',
    chapter_id: chapter_id || undefined,
    chapter_title: chapter?.title || undefined,
    topic_id: topic_id || undefined,
    topic_title: topic?.title || undefined,
    subtopic_id: subtopic_id || undefined,
    subtopic_title: subtopic?.title || undefined,
    title: title.trim(),
    description: description.trim(),
    attachment_url: attachment_url || undefined,
    attachment_name: attachment_name || undefined,
    status: 'Pending',
    teacher_id: subject?.teacher_id,
    replies: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.doubts.unshift(newDoubt);
  db.persist();

  res.status(201).json({
    message: 'Doubt submitted successfully to your instructor',
    doubt: newDoubt,
  });
});

// POST /api/doubts/:id/reply - Student or Teacher replies / continues conversation (Requirement #1)
router.post('/doubts/:id/reply', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const { message, attachment_url, attachment_name } = req.body;

  if (!message || !message.trim()) {
    res.status(400).json({ error: 'Reply message cannot be empty.' });
    return;
  }

  const doubt = db.doubts.find((d) => d.id === id);
  if (!doubt) {
    res.status(404).json({ error: 'Doubt not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student') {
    if (doubt.student_id !== user.id) {
      res.status(403).json({ error: 'You are not authorized to reply to another student’s doubt.' });
      return;
    }
  } else if (user.role === 'teacher') {
    if (!canTeacherManageSubject(user, doubt.subject_id)) {
      res.status(403).json({ error: 'You do not teach this class.' });
      return;
    }
  }

  const senderRole: 'student' | 'teacher' = user.role === 'teacher' ? 'teacher' : 'student';

  const newReply: DoubtReply = {
    id: `rep_${crypto.randomUUID().slice(0, 8)}`,
    sender_id: user.id,
    sender_name: user.name,
    sender_role: senderRole,
    message: message.trim(),
    attachment_url: attachment_url || undefined,
    attachment_name: attachment_name || undefined,
    created_at: new Date().toISOString(),
  };

  doubt.replies = doubt.replies || [];
  doubt.replies.push(newReply);
  doubt.updated_at = new Date().toISOString();

  // If teacher replied, set status to Answered (if pending) and update teacher_response
  if (senderRole === 'teacher') {
    if (doubt.status === 'Pending') {
      doubt.status = 'Answered';
    }
    doubt.teacher_response = message.trim();
  }

  db.persist();

  res.json({
    message: 'Reply posted successfully',
    reply: newReply,
    doubt,
  });
});

// PATCH /api/doubts/:id/status - Update doubt status (Requirement #1)
router.patch('/doubts/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['Pending', 'Answered', 'Resolved'].includes(status)) {
    res.status(400).json({ error: 'Status must be Pending, Answered, or Resolved.' });
    return;
  }

  const doubt = db.doubts.find((d) => d.id === id);
  if (!doubt) {
    res.status(404).json({ error: 'Doubt not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'teacher') {
    if (!canTeacherManageSubject(user, doubt.subject_id)) {
      res.status(403).json({ error: 'You do not teach this class.' });
      return;
    }
  } else if (user.role === 'student') {
    // Student can only mark their own answered doubt as Resolved
    if (doubt.student_id !== user.id) {
      res.status(403).json({ error: 'You cannot modify status of another student’s doubt.' });
      return;
    }
  }

  doubt.status = status as 'Pending' | 'Answered' | 'Resolved';
  doubt.updated_at = new Date().toISOString();
  db.persist();

  res.json({
    message: `Doubt marked as ${status}`,
    doubt,
  });
});

// POST /api/doubts/attachment - Upload attachment for doubts
router.post('/doubts/attachment', requireAuth, attachmentUpload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  res.json({
    message: 'Attachment uploaded successfully',
    file_url: `/api/files/${req.file.filename}`,
    file_name: req.file.originalname,
    file_size: formatBytes(req.file.size),
  });
});

// DELETE /api/doubts/:id - Delete a doubt (admin or doubt owner)
router.delete('/doubts/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const user = req.user!;
  const idx = db.doubts.findIndex((d) => d.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Doubt inquiry not found.' });
    return;
  }
  const doubt = db.doubts[idx];
  const isAdminUser = user.role === 'super_admin' || user.role === 'sub_admin' || user.role === 'admin';
  if (!isAdminUser && doubt.student_id !== user.id) {
    res.status(403).json({ error: 'You are not authorized to delete this doubt.' });
    return;
  }
  db.doubts.splice(idx, 1);
  db.persist();
  res.json({ message: 'Doubt deleted successfully.' });
});

// POST /api/ai/doubt-solver - Stateless Gemini AI Academic Doubt Solver
router.post('/ai/doubt-solver', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { question, subjectName, chapterTitle, topicTitle, detailLevel, language, history } = req.body || {};

  if (!question || typeof question !== 'string' || question.trim().length < 2) {
    res.status(400).json({ error: 'Please enter a clear academic question.' });
    return;
  }

  if (question.trim().length > 4000) {
    res.status(400).json({ error: 'Question is too long. Please keep it under 4,000 characters.' });
    return;
  }

  try {
    const answer = await solveAcademicDoubt({
      question: question.trim(),
      subjectName: typeof subjectName === 'string' ? subjectName.trim() : undefined,
      chapterTitle: typeof chapterTitle === 'string' ? chapterTitle.trim() : undefined,
      topicTitle: typeof topicTitle === 'string' ? topicTitle.trim() : undefined,
      detailLevel: detailLevel === 'concise' || detailLevel === 'detailed' ? detailLevel : 'balanced',
      language: language === 'english' || language === 'hinglish' ? language : 'auto',
      history: Array.isArray(history) ? history : [],
    });
    res.json({ answer });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err?.message || 'Unable to generate AI explanation right now.' });
  }
});

// ==========================================
// 5B. PERSISTENT PER-USER AI DOUBT SOLVER CHATS
// ==========================================

// GET /api/ai/chats - List authenticated user's own AI conversations
router.get('/ai/chats', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const sessions = db.aiChatSessions
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .map((s) => ({
      id: s.id,
      title: s.title,
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      chapter_title: s.chapter_title,
      topic_title: s.topic_title,
      language: s.language,
      detail_level: s.detail_level,
      messageCount: s.messages.length,
      lastMessagePreview: s.messages[s.messages.length - 1]?.content?.slice(0, 100) || '',
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

  res.json({ sessions });
});

// POST /api/ai/chats - Create a new AI chat conversation for authenticated user
router.post('/ai/chats', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const { subject_id, subject_name, chapter_title, topic_title, language, detail_level } = req.body || {};
  const now = new Date().toISOString();

  const session: AiChatSession = {
    id: `aichat_${crypto.randomUUID().slice(0, 12)}`,
    user_id: userId,
    title: 'New Doubt Chat',
    subject_id: typeof subject_id === 'string' && subject_id.trim() ? subject_id.trim() : undefined,
    subject_name: typeof subject_name === 'string' && subject_name.trim() ? subject_name.trim() : undefined,
    chapter_title: typeof chapter_title === 'string' && chapter_title.trim() ? chapter_title.trim() : undefined,
    topic_title: typeof topic_title === 'string' && topic_title.trim() ? topic_title.trim() : undefined,
    language: language === 'english' || language === 'hinglish' ? language : 'auto',
    detail_level: detail_level === 'concise' || detail_level === 'detailed' ? detail_level : 'balanced',
    messages: [],
    created_at: now,
    updated_at: now,
  };

  db.aiChatSessions.push(session);
  db.persist();
  res.status(201).json({ session });
});

// GET /api/ai/chats/:id - Fetch single conversation with full message history (strict owner check)
router.get('/ai/chats/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const session = db.aiChatSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Chat session not found.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You are not authorized to access this conversation.' });
    return;
  }
  res.json({ session });
});

// POST /api/ai/chats/:id/messages - Ask a question in a persisted chat session
router.post('/ai/chats/:id/messages', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const session = db.aiChatSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Chat session not found.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You are not authorized to post in this conversation.' });
    return;
  }

  const { question, subject_id, subject_name, chapter_title, topic_title, detail_level, language } = req.body || {};

  if (!question || typeof question !== 'string' || question.trim().length < 2) {
    res.status(400).json({ error: 'Please type a question to send.' });
    return;
  }

  if (question.trim().length > 4000) {
    res.status(400).json({ error: 'Question is too long. Please keep it under 4,000 characters.' });
    return;
  }

  const cleanQuestion = question.trim();
  const nextDetail =
    detail_level === 'concise' || detail_level === 'detailed'
      ? detail_level
      : detail_level === 'balanced'
      ? 'balanced'
      : session.detail_level || 'balanced';
  const nextLanguage =
    language === 'english' || language === 'hinglish'
      ? language
      : language === 'auto'
      ? 'auto'
      : session.language || 'auto';

  if (typeof subject_id === 'string') session.subject_id = subject_id.trim() || undefined;
  if (typeof subject_name === 'string') session.subject_name = subject_name.trim() || undefined;
  if (typeof chapter_title === 'string') session.chapter_title = chapter_title.trim() || undefined;
  if (typeof topic_title === 'string') session.topic_title = topic_title.trim() || undefined;
  session.detail_level = nextDetail;
  session.language = nextLanguage;

  const history = session.messages.slice(-12).map((m) => ({
    role: m.role,
    text: m.content,
  }));

  try {
    const answer = await solveAcademicDoubt({
      question: cleanQuestion,
      subjectName: session.subject_name,
      chapterTitle: session.chapter_title,
      topicTitle: session.topic_title,
      detailLevel: nextDetail,
      language: nextLanguage,
      history,
    });

    const userNow = new Date().toISOString();
    const userMessage: AiChatMessage = {
      id: `msg_u_${crypto.randomUUID().slice(0, 10)}`,
      role: 'user',
      content: cleanQuestion,
      detailLevel: nextDetail,
      language: nextLanguage,
      createdAt: userNow,
    };

    const assistantMessage: AiChatMessage = {
      id: `msg_a_${crypto.randomUUID().slice(0, 10)}`,
      role: 'assistant',
      content: answer.content,
      followUpQuestions: answer.followUpQuestions,
      modelUsed: answer.modelUsed,
      detailLevel: nextDetail,
      language: nextLanguage,
      createdAt: new Date().toISOString(),
    };

    if (session.messages.length === 0 || session.title === 'New Doubt Chat') {
      session.title = cleanQuestion.length > 56 ? `${cleanQuestion.slice(0, 56)}…` : cleanQuestion;
    }

    session.messages.push(userMessage, assistantMessage);
    session.updated_at = assistantMessage.createdAt;
    db.persist();

    res.json({
      userMessage,
      assistantMessage,
      session,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err?.message || 'Unable to generate AI explanation right now.' });
  }
});

// DELETE /api/ai/chats/:id/messages - Clear messages inside a chat session
router.delete('/ai/chats/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const session = db.aiChatSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Chat session not found.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You are not authorized to clear this conversation.' });
    return;
  }

  session.messages = [];
  session.title = 'New Doubt Chat';
  session.updated_at = new Date().toISOString();
  db.persist();
  res.json({ session });
});

// DELETE /api/ai/chats/:id - Delete a chat session permanently
router.delete('/ai/chats/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const idx = db.aiChatSessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Chat session not found.' });
    return;
  }
  if (db.aiChatSessions[idx].user_id !== req.user!.id) {
    res.status(403).json({ error: 'You are not authorized to delete this conversation.' });
    return;
  }
  db.aiChatSessions.splice(idx, 1);
  db.persist();
  res.json({ message: 'Conversation deleted.' });
});

// ==========================================
// 6. QUIZZES & ASSESSMENT ROUTES (Requirement #12, #13 & #16)
// ==========================================

// GET /api/quizzes - List quizzes for teacher or enrolled student
router.get('/quizzes', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { subject_id, class_id, chapter_id, topic_id, subtopic_id } = req.query;

  let quizzesList = db.quizzes || [];

  if (user.role === 'student') {
    const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);
    quizzesList = quizzesList.filter((q) => {
      const quizClassIds = [q.subject_id, q.class_id].filter(Boolean) as string[];
      return quizClassIds.length > 0 && quizClassIds.some((cid) => enrolledIds.includes(cid)) && q.status !== 'draft';
    });
  } else if (user.role === 'teacher') {
    const mySubjects = db.subjects.filter((s) => s.teacher_id === user.id).map((s) => s.id);
    quizzesList = quizzesList.filter((q) => {
      const quizClassIds = [q.subject_id, q.class_id].filter(Boolean) as string[];
      return (
        (quizClassIds.length > 0 && quizClassIds.some((cid) => mySubjects.includes(cid))) ||
        (quizClassIds.length === 0 && q.teacher_id === user.id)
      );
    });
  }

  if (subject_id) quizzesList = quizzesList.filter((q) => q.subject_id === subject_id || q.class_id === subject_id);
  if (class_id) quizzesList = quizzesList.filter((q) => q.class_id === class_id || q.subject_id === class_id);
  if (chapter_id) quizzesList = quizzesList.filter((q) => q.chapter_id === chapter_id);
  if (topic_id) quizzesList = quizzesList.filter((q) => q.topic_id === topic_id);
  if (subtopic_id) quizzesList = quizzesList.filter((q) => q.subtopic_id === subtopic_id);

  // Enrich with submission count, subject, teacher, and scheduling metadata
  const nowIso = new Date().toISOString();
  const enriched = quizzesList.map((q) => {
    const submissions = db.quizSubmissions.filter((qs) => qs.quiz_id === q.id);
    const subj = db.subjects.find((s) => s.id === q.subject_id || s.id === q.class_id);
    const chap = db.chapters.find((c) => c.id === q.chapter_id);
    const top = db.topics.find((t) => t.id === q.topic_id);
    const studentSubs = user.role === 'student' ? submissions.filter((qs) => qs.student_id === user.id) : [];
    const latestStudentSub = studentSubs.length > 0 ? studentSubs[studentSubs.length - 1] : null;
    const bestScore = studentSubs.length > 0 ? Math.max(...studentSubs.map((s) => s.score)) : undefined;
    const baseQuiz = user.role === 'student' ? stripQuizAnswersForStudent(q) : q;

    return {
      ...baseQuiz,
      teacherName: getQuizTeacherName(q, subj),
      subjectName: subj?.name || 'General Subject',
      chapterTitle: chap?.title,
      topicTitle: top?.title,
      totalQuestions: q.questions?.length || 0,
      totalSubmissions: submissions.length,
      attemptsCount: studentSubs.length,
      bestScore,
      mySubmission: latestStudentSub,
      passed: studentSubs.some((s) => s.passed),
      score: bestScore,
    };
  });

  res.json({ quizzes: enriched, serverTime: nowIso });
});

// GET /api/student/quizzes - Student-centric categorized quizzes (Upcoming, Available, Submitted, Overdue, Completed)
router.get('/student/quizzes', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);

  const eligibleQuizzes = db.quizzes.filter((q) => {
    const isEnrolled = (q.subject_id && enrolledIds.includes(q.subject_id)) || (q.class_id && enrolledIds.includes(q.class_id));
    return isEnrolled && q.status !== 'draft';
  });

  const now = new Date();
  const nowMs = now.getTime();

  const categorized = eligibleQuizzes.map((q) => {
    const subj = db.subjects.find((s) => s.id === q.subject_id || s.id === q.class_id);
    const chap = db.chapters.find((c) => c.id === q.chapter_id);
    const studentSubs = db.quizSubmissions
      .filter((qs) => qs.quiz_id === q.id && qs.student_id === user.id)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());

    const latestSub = studentSubs.length > 0 ? studentSubs[studentSubs.length - 1] : null;
    const bestScore = studentSubs.length > 0 ? Math.max(...studentSubs.map((s) => s.score)) : undefined;
    const bestMarks =
      studentSubs.length > 0
        ? Math.max(...studentSubs.map((s) => s.marks_obtained ?? Math.round((s.score / 100) * (q.marks || 100))))
        : undefined;
    const hasPassed = studentSubs.some((s) => s.passed);
    const maxAttempts = Math.max(1, Number(q.max_attempts || 1));
    const attemptsUsed = studentSubs.length;
    const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);

    // Check for any currently active in-progress attempt
    const activeAttempt =
      db.quizAttempts.find(
        (att) =>
          att.quiz_id === q.id &&
          att.student_id === user.id &&
          att.status === 'in_progress' &&
          new Date(att.expires_at).getTime() > nowMs
      ) || null;

    const startMs = q.start_date ? new Date(q.start_date).getTime() : null;
    const dueMs = q.due_date ? new Date(q.due_date).getTime() : null;
    const isBeforeStart = startMs !== null && !Number.isNaN(startMs) && nowMs < startMs;
    const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs;
    const allowLate = Boolean(q.allow_late_submission);

    let state: 'upcoming' | 'available' | 'submitted' | 'overdue' | 'completed' = 'available';
    if (attemptsUsed > 0) {
      if (hasPassed || attemptsRemaining === 0 || (isPastDue && !allowLate)) {
        state = 'completed';
      } else {
        state = 'submitted';
      }
    } else if (isBeforeStart) {
      state = 'upcoming';
    } else if (isPastDue) {
      state = 'overdue';
    } else {
      state = 'available';
    }

    const totalMarks = Number(q.marks || 100);
    const passingMarks =
      typeof q.passing_marks === 'number'
        ? q.passing_marks
        : Math.round(((q.passing_score || 70) / 100) * totalMarks);

    return {
      ...stripQuizAnswersForStudent(q),
      teacherName: getQuizTeacherName(q, subj),
      subjectName: subj?.name || 'Class Subject',
      chapterTitle: chap?.title,
      categoryState: state,
      mySubmission: latestSub,
      mySubmissions: studentSubs,
      activeAttempt,
      attemptsCount: attemptsUsed,
      maxAttempts,
      attemptsRemaining,
      bestScore,
      bestMarks,
      passed: hasPassed,
      isCompleted: state === 'completed',
      score: bestScore,
      totalMarks,
      passingMarks,
      timeLimitMinutes: q.time_limit || 20,
      questionsCount: q.questions?.length || 0,
    };
  });

  res.json({ quizzes: categorized, serverTime: now.toISOString() });
});

// POST /api/quizzes/:id/start - Server-authoritative start/resume timed quiz attempt
router.post('/quizzes/:id/start', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const quiz = db.quizzes.find((q) => q.id === req.params.id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const user = req.user!;
  const subjectId = quiz.subject_id || quiz.class_id || '';
  if (user.role === 'student') {
    if (quiz.status === 'draft') {
      res.status(403).json({ error: 'This quiz is not published yet.' });
      return;
    }
    if (subjectId && !isStudentEnrolled(user.id, subjectId)) {
      res.status(403).json({ error: 'You are not enrolled in this class.' });
      return;
    }
  }

  const now = new Date();
  const nowMs = now.getTime();
  const startMs = quiz.start_date ? new Date(quiz.start_date).getTime() : null;
  const dueMs = quiz.due_date ? new Date(quiz.due_date).getTime() : null;
  const allowLate = Boolean(quiz.allow_late_submission);

  if (user.role === 'student' && startMs !== null && !Number.isNaN(startMs) && nowMs < startMs) {
    res.status(403).json({
      error: `This quiz is not available yet. It opens on ${new Date(startMs).toLocaleString()}.`,
      code: 'QUIZ_NOT_STARTED',
      serverTime: now.toISOString(),
    });
    return;
  }

  if (user.role === 'student' && dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs && !allowLate) {
    res.status(403).json({
      error: 'The deadline for this quiz has passed and submissions are closed.',
      code: 'QUIZ_DEADLINE_PASSED',
      serverTime: now.toISOString(),
    });
    return;
  }

  // Mark any expired in-progress attempts for this student+quiz
  db.quizAttempts.forEach((att) => {
    if (
      att.quiz_id === quiz.id &&
      att.student_id === user.id &&
      att.status === 'in_progress' &&
      new Date(att.expires_at).getTime() <= nowMs
    ) {
      att.status = 'expired';
    }
  });

  // Resume active in-progress attempt if still within its authoritative window
  const existingActive = db.quizAttempts.find(
    (att) =>
      att.quiz_id === quiz.id &&
      att.student_id === user.id &&
      att.status === 'in_progress' &&
      new Date(att.expires_at).getTime() > nowMs
  );

  const studentSubs = db.quizSubmissions.filter((qs) => qs.quiz_id === quiz.id && qs.student_id === user.id);
  const maxAttempts = Math.max(1, Number(quiz.max_attempts || 1));

  if (existingActive) {
    db.persist();
    res.json({
      attempt: existingActive,
      quiz: user.role === 'student' ? stripQuizAnswersForStudent(quiz) : quiz,
      attemptsUsed: studentSubs.length,
      maxAttempts,
      serverTime: now.toISOString(),
    });
    return;
  }

  if (user.role === 'student' && studentSubs.length >= maxAttempts) {
    res.status(403).json({
      error: `You have already used all ${maxAttempts} allowed attempt${maxAttempts === 1 ? '' : 's'} for this quiz.`,
      code: 'MAX_ATTEMPTS_REACHED',
      serverTime: now.toISOString(),
    });
    return;
  }

  const durationMinutes = Math.max(1, Number(quiz.time_limit || 20));
  const durationEndMs = nowMs + durationMinutes * 60 * 1000;
  const effectiveExpiresMs =
    dueMs !== null && !Number.isNaN(dueMs) && !allowLate
      ? Math.min(durationEndMs, dueMs)
      : durationEndMs;

  const newAttempt: QuizAttempt = {
    id: `qatt_${crypto.randomUUID().slice(0, 10)}`,
    quiz_id: quiz.id,
    student_id: user.id,
    student_name: user.name,
    attempt_number: studentSubs.length + 1,
    started_at: now.toISOString(),
    expires_at: new Date(effectiveExpiresMs).toISOString(),
    duration_minutes: durationMinutes,
    status: 'in_progress',
  };

  db.quizAttempts.push(newAttempt);
  db.persist();

  res.status(201).json({
    attempt: newAttempt,
    quiz: user.role === 'student' ? stripQuizAnswersForStudent(quiz) : quiz,
    attemptsUsed: studentSubs.length,
    maxAttempts,
    serverTime: now.toISOString(),
  });
});

// POST /api/quizzes - Teacher creates quiz with full scheduling metadata
router.post('/quizzes', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const {
    subject_id,
    chapter_id,
    topic_id,
    subtopic_id,
    class_id,
    title,
    description,
    marks,
    time_limit,
    passing_score,
    passing_marks,
    max_attempts,
    allow_late_submission,
    start_date,
    due_date,
    status,
    questions,
  } = req.body;

  const targetSubjectId = subject_id || class_id;
  if (!targetSubjectId || !title || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'Class/Subject ID, title, and at least one question are required.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, targetSubjectId)) {
    res.status(403).json({ error: 'You do not have permission to create quizzes in this class.' });
    return;
  }

  if (chapter_id && !chapterBelongsToSubject(targetSubjectId, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const parsedStart = sanitizeOptionalIsoDate(start_date);
  const parsedDue = sanitizeOptionalIsoDate(due_date);
  if (start_date && !parsedStart) {
    res.status(400).json({ error: 'Invalid start date/time format.' });
    return;
  }
  if (due_date && !parsedDue) {
    res.status(400).json({ error: 'Invalid due date/time format.' });
    return;
  }
  if (parsedStart && parsedDue && new Date(parsedDue).getTime() <= new Date(parsedStart).getTime()) {
    res.status(400).json({ error: 'Quiz due date & time must be after the start date & time.' });
    return;
  }

  const maxMarksNum = Math.max(1, Math.round(Number(marks) || 100));
  let passingMarksNum: number;
  let passingPercentNum: number;
  if (passing_marks !== undefined && passing_marks !== null && passing_marks !== '') {
    passingMarksNum = Math.max(0, Math.min(maxMarksNum, Math.round(Number(passing_marks))));
    passingPercentNum = Math.round((passingMarksNum / maxMarksNum) * 100);
  } else {
    passingPercentNum = Math.max(0, Math.min(100, Math.round(Number(passing_score) || 70)));
    passingMarksNum = Math.round((passingPercentNum / 100) * maxMarksNum);
  }

  const durationMinutes = Math.max(1, Math.min(600, Math.round(Number(time_limit) || 20)));
  const attemptsAllowed = Math.max(1, Math.min(100, Math.round(Number(max_attempts) || 1)));

  const formattedQuestions = questions.map((q: any, i: number) => ({
    id: q.id || `q_${Date.now()}_${i}`,
    question: String(q.question || '').trim(),
    question_type: q.question_type || 'multiple_choice',
    options: Array.isArray(q.options) ? q.options : [],
    correct_answer: String(q.correct_answer || '').trim(),
    explanation: q.explanation || 'Review lesson material for thorough understanding.',
  }));

  const nowIso = new Date().toISOString();
  const quizObj: Quiz = {
    id: `quiz_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id: subject_id || class_id,
    chapter_id: chapter_id || undefined,
    topic_id: topic_id || undefined,
    subtopic_id: subtopic_id || undefined,
    class_id: class_id || subject_id,
    title: String(title).trim(),
    description: description?.trim() || 'Curriculum assessment quiz',
    passing_score: passingPercentNum,
    passing_marks: passingMarksNum,
    marks: maxMarksNum,
    time_limit: durationMinutes,
    max_attempts: attemptsAllowed,
    allow_late_submission: Boolean(allow_late_submission),
    start_date: parsedStart,
    due_date: parsedDue,
    status: status === 'draft' ? 'draft' : 'published',
    questions: formattedQuestions,
    created_at: nowIso,
    updated_at: nowIso,
  };

  db.quizzes.push(quizObj);
  db.persist();

  res.status(201).json({ message: 'Quiz created successfully', quiz: quizObj, serverTime: nowIso });
});

// PUT /api/quizzes/:id - Teacher edits quiz & schedule
router.put('/quizzes/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const ownerSubjId = quiz.subject_id || quiz.class_id || '';
  if (ownerSubjId && !canTeacherManageSubject(req.user!, ownerSubjId)) {
    res.status(403).json({ error: 'You do not have permission to edit this quiz.' });
    return;
  }

  const {
    title,
    description,
    passing_score,
    passing_marks,
    marks,
    time_limit,
    max_attempts,
    allow_late_submission,
    start_date,
    due_date,
    status,
    questions,
    class_id,
    subject_id,
    chapter_id,
  } = req.body;

  const nextStart =
    start_date === null || start_date === ''
      ? undefined
      : start_date !== undefined
      ? sanitizeOptionalIsoDate(start_date)
      : quiz.start_date;
  const nextDue =
    due_date === null || due_date === ''
      ? undefined
      : due_date !== undefined
      ? sanitizeOptionalIsoDate(due_date)
      : quiz.due_date;

  if (start_date && !nextStart) {
    res.status(400).json({ error: 'Invalid start date/time format.' });
    return;
  }
  if (due_date && !nextDue) {
    res.status(400).json({ error: 'Invalid due date/time format.' });
    return;
  }
  if (nextStart && nextDue && new Date(nextDue).getTime() <= new Date(nextStart).getTime()) {
    res.status(400).json({ error: 'Quiz due date & time must be after the start date & time.' });
    return;
  }

  const targetSubjectId = subject_id || class_id || ownerSubjId;
  if (targetSubjectId && targetSubjectId !== ownerSubjId && !canTeacherManageSubject(req.user!, targetSubjectId)) {
    res.status(403).json({ error: 'You do not have permission to move this quiz to the selected class.' });
    return;
  }
  if (chapter_id && targetSubjectId && !chapterBelongsToSubject(targetSubjectId, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  if (title !== undefined) quiz.title = String(title).trim();
  if (description !== undefined) quiz.description = String(description).trim();
  if (marks !== undefined) quiz.marks = Math.max(1, Math.round(Number(marks) || 100));
  const currentMaxMarks = quiz.marks || 100;

  if (passing_marks !== undefined && passing_marks !== null && passing_marks !== '') {
    quiz.passing_marks = Math.max(0, Math.min(currentMaxMarks, Math.round(Number(passing_marks))));
    quiz.passing_score = Math.round((quiz.passing_marks / currentMaxMarks) * 100);
  } else if (passing_score !== undefined) {
    quiz.passing_score = Math.max(0, Math.min(100, Math.round(Number(passing_score))));
    quiz.passing_marks = Math.round((quiz.passing_score / 100) * currentMaxMarks);
  }

  if (time_limit !== undefined) quiz.time_limit = Math.max(1, Math.min(600, Math.round(Number(time_limit) || 20)));
  if (max_attempts !== undefined) quiz.max_attempts = Math.max(1, Math.min(100, Math.round(Number(max_attempts) || 1)));
  if (allow_late_submission !== undefined) quiz.allow_late_submission = Boolean(allow_late_submission);
  if (start_date !== undefined) quiz.start_date = nextStart;
  if (due_date !== undefined) quiz.due_date = nextDue;
  if (status !== undefined) quiz.status = status === 'draft' ? 'draft' : 'published';
  if (subject_id !== undefined) quiz.subject_id = subject_id;
  if (class_id !== undefined) quiz.class_id = class_id;
  if (chapter_id !== undefined) quiz.chapter_id = chapter_id || undefined;
  if (Array.isArray(questions) && questions.length > 0) quiz.questions = questions;
  quiz.updated_at = new Date().toISOString();

  db.persist();
  res.json({ message: 'Quiz updated successfully', quiz });
});

// DELETE /api/quizzes/:id - Teacher deletes quiz
router.delete('/quizzes/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.quizzes.findIndex((q) => q.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const quiz = db.quizzes[index];
  const ownerSubjId = quiz.subject_id || quiz.class_id || '';
  if (ownerSubjId && !canTeacherManageSubject(req.user!, ownerSubjId)) {
    res.status(403).json({ error: 'You do not have permission to delete this quiz.' });
    return;
  }

  // Remove submissions & active attempts
  for (let i = db.quizSubmissions.length - 1; i >= 0; i--) {
    if (db.quizSubmissions[i].quiz_id === id) db.quizSubmissions.splice(i, 1);
  }
  for (let i = db.quizAttempts.length - 1; i >= 0; i--) {
    if (db.quizAttempts[i].quiz_id === id) db.quizAttempts.splice(i, 1);
  }

  db.quizzes.splice(index, 1);
  db.persist();

  res.json({ message: 'Quiz deleted successfully' });
});

// PATCH /api/quizzes/:id/publish - Toggle publish/draft
router.patch('/quizzes/:id/publish', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const ownerSubjId = quiz.subject_id || quiz.class_id || '';
  if (ownerSubjId && !canTeacherManageSubject(req.user!, ownerSubjId)) {
    res.status(403).json({ error: 'You do not have permission to modify this quiz.' });
    return;
  }

  quiz.status = quiz.status === 'published' ? 'draft' : 'published';
  quiz.updated_at = new Date().toISOString();
  db.persist();

  res.json({ message: `Quiz status updated to ${quiz.status}`, status: quiz.status });
});

// POST /api/quizzes/:id/assign - Assign quiz to class
router.post('/quizzes/:id/assign', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const { class_id } = req.body;
  if (!class_id) {
    res.status(400).json({ error: 'Target class ID required.' });
    return;
  }

  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const ownerSubjId = quiz.subject_id || quiz.class_id || '';
  if ((ownerSubjId && !canTeacherManageSubject(req.user!, ownerSubjId)) || !canTeacherManageSubject(req.user!, class_id)) {
    res.status(403).json({ error: 'You do not have permission to assign this quiz to the selected class.' });
    return;
  }

  quiz.class_id = class_id;
  quiz.subject_id = class_id;
  quiz.chapter_id = undefined;
  quiz.status = 'published';
  quiz.updated_at = new Date().toISOString();
  db.persist();

  res.json({ message: 'Quiz assigned to class successfully', quiz });
});

// GET /api/quizzes/:id/submissions - Teacher view submissions
router.get('/quizzes/:id/submissions', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  const ownerSubjId = quiz.subject_id || quiz.class_id || '';
  if (ownerSubjId && !canTeacherManageSubject(req.user!, ownerSubjId)) {
    res.status(403).json({ error: 'You do not have permission to view submissions for this quiz.' });
    return;
  }
  const submissions = db.quizSubmissions
    .filter((s) => s.quiz_id === id)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  res.json({ submissions });
});

// ==========================================
// 7. ASSIGNMENT MANAGEMENT ROUTES
// ==========================================

// GET /api/assignments - List assignments for teacher or student
router.get('/assignments', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { subject_id, class_id } = req.query;

  let assignmentsList = db.assignments || [];

  if (user.role === 'student') {
    const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);
    assignmentsList = assignmentsList.filter(
      (a) => (enrolledIds.includes(a.subject_id) || (a.class_id && enrolledIds.includes(a.class_id))) && a.status === 'published'
    );
  } else if (user.role === 'teacher') {
    const mySubjects = db.subjects.filter((s) => s.teacher_id === user.id).map((s) => s.id);
    assignmentsList = assignmentsList.filter(
      (a) => mySubjects.includes(a.subject_id) || (a.class_id && mySubjects.includes(a.class_id))
    );
  }

  if (subject_id) assignmentsList = assignmentsList.filter((a) => a.subject_id === subject_id || a.class_id === subject_id);
  if (class_id) assignmentsList = assignmentsList.filter((a) => a.class_id === class_id || a.subject_id === class_id);

  const enriched = assignmentsList.map((a) => {
    const submissions = db.assignmentSubmissions.filter((sub) => sub.assignment_id === a.id);
    const subj = db.subjects.find((s) => s.id === a.subject_id || s.id === a.class_id);
    const chap = db.chapters.find((c) => c.id === a.chapter_id);
    const studentSub = user.role === 'student' ? submissions.find((sub) => sub.student_id === user.id) : null;

    return {
      ...a,
      teacherName: getAssignmentTeacherName(a, subj),
      subjectName: subj?.name || 'Class Subject',
      chapterTitle: chap?.title,
      totalSubmissions: submissions.length,
      gradedCount: submissions.filter((s) => s.status === 'graded').length,
      lateCount: submissions.filter((s) => s.is_late).length,
      mySubmission: studentSub || null,
      submissionStatus: studentSub ? studentSub.status : 'pending',
    };
  });

  res.json({ assignments: enriched, serverTime: new Date().toISOString() });
});

// GET /api/student/assignments - Student enrolled assignments with authoritative server categorization
router.get('/student/assignments', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const enrolledIds = db.enrollments.filter((e) => e.student_id === user.id).map((e) => e.subject_id);

  const eligible = db.assignments.filter(
    (a) => (enrolledIds.includes(a.subject_id) || (a.class_id && enrolledIds.includes(a.class_id))) && a.status === 'published'
  );

  const now = new Date();
  const nowMs = now.getTime();

  const enriched = eligible.map((a) => {
    const subj = db.subjects.find((s) => s.id === a.subject_id || s.id === a.class_id);
    const chap = db.chapters.find((c) => c.id === a.chapter_id);
    const sub = db.assignmentSubmissions.find((s) => s.assignment_id === a.id && s.student_id === user.id);
    const startMs = a.start_date ? new Date(a.start_date).getTime() : null;
    const dueMs = a.due_date ? new Date(a.due_date).getTime() : null;
    const isBeforeStart = startMs !== null && !Number.isNaN(startMs) && nowMs < startMs;
    const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs;

    let categoryState: 'upcoming' | 'available' | 'submitted' | 'overdue' | 'completed' = 'available';
    let statusLabel: 'upcoming' | 'pending' | 'submitted' | 'graded' | 'overdue' = 'pending';

    if (sub) {
      if (sub.status === 'graded') {
        categoryState = 'completed';
        statusLabel = 'graded';
      } else {
        categoryState = 'submitted';
        statusLabel = 'submitted';
      }
    } else if (isBeforeStart) {
      categoryState = 'upcoming';
      statusLabel = 'upcoming';
    } else if (isPastDue) {
      categoryState = 'overdue';
      statusLabel = 'overdue';
    } else {
      categoryState = 'available';
      statusLabel = 'pending';
    }

    return {
      ...a,
      teacherName: getAssignmentTeacherName(a, subj),
      subjectName: subj?.name || 'Class Subject',
      chapterTitle: chap?.title,
      mySubmission: sub || null,
      categoryState,
      statusLabel,
      marksObtained: sub?.marks,
      teacherFeedback: sub?.feedback,
    };
  });

  res.json({ assignments: enriched, serverTime: now.toISOString() });
});

// POST /api/assignments - Teacher creates assignment with full scheduling & upload policy
router.post('/assignments', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const {
    title,
    description,
    subject_id,
    chapter_id,
    topic_id,
    subtopic_id,
    class_id,
    start_date,
    due_date,
    max_marks,
    allowed_file_types,
    max_file_size_mb,
    allow_late_submission,
    late_penalty_percent,
    attachment_name,
    attachment_url,
    attachment_size,
    status,
  } = req.body;

  if (!title || !subject_id) {
    res.status(400).json({ error: 'Title and Subject ID are required.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, subject_id)) {
    res.status(403).json({ error: 'You do not have permission to create assignments in this class.' });
    return;
  }

  if (chapter_id && !chapterBelongsToSubject(subject_id, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  const parsedStart = sanitizeOptionalIsoDate(start_date);
  const parsedDue = sanitizeOptionalIsoDate(due_date);
  if (start_date && !parsedStart) {
    res.status(400).json({ error: 'Invalid assignment start date/time.' });
    return;
  }
  if (due_date && !parsedDue) {
    res.status(400).json({ error: 'Invalid submission deadline date/time.' });
    return;
  }
  if (parsedStart && parsedDue && new Date(parsedDue).getTime() <= new Date(parsedStart).getTime()) {
    res.status(400).json({ error: 'Submission deadline must be after the assignment start date & time.' });
    return;
  }

  const cleanAttachmentUrl =
    attachment_url && isSafeAttachmentUrlServer(attachment_url) ? String(attachment_url).trim() : undefined;
  const allowLate = Boolean(allow_late_submission);
  const penaltyPct = allowLate
    ? Math.max(0, Math.min(100, Math.round(Number(late_penalty_percent) || 0)))
    : 0;
  const maxUploadMb = Math.max(1, Math.min(25, Math.round(Number(max_file_size_mb) || 10)));
  const nowIso = new Date().toISOString();

  const newAssignment: Assignment = {
    id: `asg_${crypto.randomUUID().slice(0, 8)}`,
    teacher_id: req.user!.id,
    teacher_name: req.user!.name,
    subject_id,
    chapter_id: chapter_id || undefined,
    topic_id: topic_id || undefined,
    subtopic_id: subtopic_id || undefined,
    class_id: class_id || subject_id,
    title: String(title).trim(),
    description: description?.trim() || '',
    start_date: parsedStart,
    due_date: parsedDue,
    max_marks: Math.max(1, Math.round(Number(max_marks) || 100)),
    allowed_file_types: normalizeAllowedFileTypes(allowed_file_types),
    max_file_size_mb: maxUploadMb,
    allow_late_submission: allowLate,
    late_penalty_percent: penaltyPct,
    attachment_name: attachment_name?.trim() || undefined,
    attachment_url: cleanAttachmentUrl,
    attachment_size: typeof attachment_size === 'string' ? attachment_size : undefined,
    status: status === 'draft' ? 'draft' : 'published',
    created_at: nowIso,
    updated_at: nowIso,
  };

  db.assignments.push(newAssignment);
  db.persist();

  res.status(201).json({ message: 'Assignment created successfully', assignment: newAssignment, serverTime: nowIso });
});

// PUT /api/assignments/:id - Teacher edits assignment & schedule
router.put('/assignments/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, assignment.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to edit this assignment.' });
    return;
  }

  const {
    title,
    description,
    subject_id,
    chapter_id,
    start_date,
    due_date,
    max_marks,
    allowed_file_types,
    max_file_size_mb,
    allow_late_submission,
    late_penalty_percent,
    attachment_name,
    attachment_url,
    attachment_size,
    status,
    class_id,
  } = req.body;

  const nextStart =
    start_date === null || start_date === ''
      ? undefined
      : start_date !== undefined
      ? sanitizeOptionalIsoDate(start_date)
      : assignment.start_date;
  const nextDue =
    due_date === null || due_date === ''
      ? undefined
      : due_date !== undefined
      ? sanitizeOptionalIsoDate(due_date)
      : assignment.due_date;

  if (start_date && !nextStart) {
    res.status(400).json({ error: 'Invalid start date/time format.' });
    return;
  }
  if (due_date && !nextDue) {
    res.status(400).json({ error: 'Invalid deadline date/time format.' });
    return;
  }
  if (nextStart && nextDue && new Date(nextDue).getTime() <= new Date(nextStart).getTime()) {
    res.status(400).json({ error: 'Submission deadline must be after the start date & time.' });
    return;
  }

  const targetSubjectId = subject_id || class_id || assignment.subject_id;
  if (targetSubjectId !== assignment.subject_id && !canTeacherManageSubject(req.user!, targetSubjectId)) {
    res.status(403).json({ error: 'You do not have permission to move this assignment to the selected class.' });
    return;
  }
  if (chapter_id && !chapterBelongsToSubject(targetSubjectId, chapter_id)) {
    res.status(400).json({ error: 'Selected chapter does not belong to the specified class.' });
    return;
  }

  if (title !== undefined) assignment.title = String(title).trim();
  if (description !== undefined) assignment.description = String(description).trim();
  if (subject_id !== undefined) assignment.subject_id = subject_id;
  if (class_id !== undefined) assignment.class_id = class_id;
  if (chapter_id !== undefined) assignment.chapter_id = chapter_id || undefined;
  if (start_date !== undefined) assignment.start_date = nextStart;
  if (due_date !== undefined) assignment.due_date = nextDue;
  if (max_marks !== undefined) assignment.max_marks = Math.max(1, Math.round(Number(max_marks) || 100));
  if (allowed_file_types !== undefined) assignment.allowed_file_types = normalizeAllowedFileTypes(allowed_file_types);
  if (max_file_size_mb !== undefined) assignment.max_file_size_mb = Math.max(1, Math.min(25, Math.round(Number(max_file_size_mb) || 10)));
  if (allow_late_submission !== undefined) assignment.allow_late_submission = Boolean(allow_late_submission);
  if (late_penalty_percent !== undefined) {
    assignment.late_penalty_percent = assignment.allow_late_submission
      ? Math.max(0, Math.min(100, Math.round(Number(late_penalty_percent) || 0)))
      : 0;
  }
  if (attachment_name !== undefined) assignment.attachment_name = attachment_name ? String(attachment_name).trim() : undefined;
  if (attachment_url !== undefined) {
    assignment.attachment_url = isSafeAttachmentUrlServer(attachment_url) ? String(attachment_url).trim() : undefined;
  }
  if (attachment_size !== undefined) assignment.attachment_size = attachment_size || undefined;
  if (status !== undefined) assignment.status = status === 'draft' ? 'draft' : 'published';
  assignment.updated_at = new Date().toISOString();

  db.persist();
  res.json({ message: 'Assignment updated successfully', assignment });
});

// DELETE /api/assignments/:id - Teacher deletes assignment
router.delete('/assignments/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const index = db.assignments.findIndex((a) => a.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, db.assignments[index].subject_id)) {
    res.status(403).json({ error: 'You do not have permission to delete this assignment.' });
    return;
  }

  for (let i = db.assignmentSubmissions.length - 1; i >= 0; i--) {
    if (db.assignmentSubmissions[i].assignment_id === id) db.assignmentSubmissions.splice(i, 1);
  }

  db.assignments.splice(index, 1);
  db.persist();

  res.json({ message: 'Assignment deleted successfully' });
});

// PATCH /api/assignments/:id/publish - Toggle assignment publish/draft
router.patch('/assignments/:id/publish', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  if (!canTeacherManageSubject(req.user!, assignment.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to modify this assignment.' });
    return;
  }

  assignment.status = assignment.status === 'published' ? 'draft' : 'published';
  assignment.updated_at = new Date().toISOString();
  db.persist();

  res.json({ message: `Assignment status updated to ${assignment.status}`, status: assignment.status });
});

// GET /api/assignments/:id/submissions - Teacher view submissions
router.get('/assignments/:id/submissions', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }
  if (!canTeacherManageSubject(req.user!, assignment.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to view submissions for this assignment.' });
    return;
  }
  const submissions = db.assignmentSubmissions
    .filter((s) => s.assignment_id === id)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  res.json({ submissions });
});

// POST /api/assignments/:id/submissions/:subId/grade - Teacher grades submission
router.post('/assignments/:id/submissions/:subId/grade', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { id, subId } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }
  if (!canTeacherManageSubject(req.user!, assignment.subject_id)) {
    res.status(403).json({ error: 'You do not have permission to grade submissions for this assignment.' });
    return;
  }

  const { marks, feedback } = req.body;
  const sub = db.assignmentSubmissions.find((s) => s.id === subId && s.assignment_id === id);
  if (!sub) {
    res.status(404).json({ error: 'Submission not found.' });
    return;
  }

  const numericMarks = Math.max(0, Math.min(assignment.max_marks || 100, Number(marks) || 0));
  sub.marks = numericMarks;
  sub.feedback = feedback?.trim() || 'Reviewed by instructor';
  sub.status = 'graded';
  sub.graded_at = new Date().toISOString();
  sub.graded_by = req.user!.id;

  db.persist();
  res.json({ message: 'Submission graded successfully', submission: sub });
});

// POST /api/assignments/:id/upload-submission - Student uploads completed work file with strict type, size & deadline validation
router.post('/assignments/:id/upload-submission', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment || assignment.status !== 'published') {
    res.status(404).json({ error: 'Assignment not found or unavailable.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student' && !isStudentEnrolled(user.id, assignment.subject_id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  const nowMs = Date.now();
  const startMs = assignment.start_date ? new Date(assignment.start_date).getTime() : null;
  const dueMs = assignment.due_date ? new Date(assignment.due_date).getTime() : null;

  if (user.role === 'student' && startMs !== null && !Number.isNaN(startMs) && nowMs < startMs) {
    res.status(403).json({ error: `Submissions are not open yet. Opens on ${new Date(startMs).toLocaleString()}.` });
    return;
  }
  if (user.role === 'student' && dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs && !assignment.allow_late_submission) {
    res.status(403).json({ error: 'Submission deadline has passed. Late submissions are not allowed.' });
    return;
  }

  assignmentFileUpload.single('file')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'File upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    const cleanupUploaded = () => {
      try {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch {
        // ignore
      }
    };

    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedTypes = normalizeAllowedFileTypes(assignment.allowed_file_types);
    // Treat .jpeg and .jpg interchangeably when either is allowed
    const matchesExt =
      allowedTypes.includes(ext) ||
      (ext === '.jpeg' && allowedTypes.includes('.jpg')) ||
      (ext === '.jpg' && allowedTypes.includes('.jpeg'));

    if (!matchesExt) {
      cleanupUploaded();
      res.status(400).json({
        error: `File type "${ext}" is not permitted for this assignment. Allowed types: ${allowedTypes.join(', ')}`,
      });
      return;
    }

    const maxBytes = Math.max(1, Math.min(25, Number(assignment.max_file_size_mb || 10))) * 1024 * 1024;
    if (req.file.size > maxBytes) {
      cleanupUploaded();
      res.status(400).json({
        error: `File exceeds the maximum allowed upload size of ${assignment.max_file_size_mb || 10} MB.`,
      });
      return;
    }

    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      size: req.file.size,
      formattedSize: formatBytes(req.file.size),
      mimeType: req.file.mimetype,
    });
  });
});

// POST /api/assignments/:id/submit - Student submits assignment with authoritative deadline & late policy validation
router.post('/assignments/:id/submit', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment || assignment.status !== 'published') {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student' && !isStudentEnrolled(user.id, assignment.subject_id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const startMs = assignment.start_date ? new Date(assignment.start_date).getTime() : null;
  const dueMs = assignment.due_date ? new Date(assignment.due_date).getTime() : null;

  if (user.role === 'student' && startMs !== null && !Number.isNaN(startMs) && nowMs < startMs) {
    res.status(403).json({
      error: `This assignment is not open for submission yet. It starts on ${new Date(startMs).toLocaleString()}.`,
      code: 'ASSIGNMENT_NOT_STARTED',
      serverTime: now.toISOString(),
    });
    return;
  }

  const isLate = dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs;
  if (user.role === 'student' && isLate && !assignment.allow_late_submission) {
    res.status(403).json({
      error: 'The submission deadline has passed and late submissions are disabled for this assignment.',
      code: 'ASSIGNMENT_DEADLINE_PASSED',
      serverTime: now.toISOString(),
    });
    return;
  }

  const { submission_text, attachment_name, attachment_url, attachment_size } = req.body;
  const cleanText = typeof submission_text === 'string' ? submission_text.trim() : '';
  const cleanFileName = typeof attachment_name === 'string' ? attachment_name.trim() : '';
  const cleanFileUrl =
    attachment_url && isSafeAttachmentUrlServer(attachment_url) ? String(attachment_url).trim() : undefined;

  if (attachment_url && !cleanFileUrl) {
    res.status(400).json({ error: 'Invalid attachment URL. Please upload a file or provide a valid http(s) link.' });
    return;
  }

  if (!cleanText && !cleanFileName && !cleanFileUrl) {
    res.status(400).json({ error: 'Please upload your completed file or enter written solution notes.' });
    return;
  }

  let sub = db.assignmentSubmissions.find((s) => s.assignment_id === id && s.student_id === user.id);
  if (sub && sub.status === 'graded') {
    res.status(403).json({ error: 'This submission has already been graded and can no longer be modified.' });
    return;
  }

  const lateByMinutes = isLate && dueMs ? Math.max(1, Math.ceil((nowMs - dueMs) / 60000)) : 0;
  const latePenalty = isLate ? Number(assignment.late_penalty_percent || 0) : 0;

  if (sub) {
    sub.submission_text = cleanText || sub.submission_text;
    sub.attachment_name = cleanFileName || sub.attachment_name;
    sub.attachment_url = cleanFileUrl || sub.attachment_url;
    sub.attachment_size = typeof attachment_size === 'string' ? attachment_size : sub.attachment_size;
    sub.submitted_at = now.toISOString();
    sub.is_late = isLate;
    sub.late_by_minutes = lateByMinutes;
    sub.late_penalty_percent = latePenalty;
    sub.status = 'submitted';
  } else {
    sub = {
      id: `subm_${crypto.randomUUID().slice(0, 8)}`,
      assignment_id: id,
      student_id: user.id,
      student_name: user.name,
      submission_text: cleanText,
      attachment_name: cleanFileName || undefined,
      attachment_url: cleanFileUrl,
      attachment_size: typeof attachment_size === 'string' ? attachment_size : undefined,
      submitted_at: now.toISOString(),
      is_late: isLate,
      late_by_minutes: lateByMinutes,
      late_penalty_percent: latePenalty,
      status: 'submitted',
    };
    db.assignmentSubmissions.push(sub);
  }

  db.persist();
  res.json({
    message: isLate
      ? 'Assignment submitted successfully (marked as late submission).'
      : 'Assignment submitted successfully',
    submission: sub,
    serverTime: now.toISOString(),
  });
});

// ==========================================
// 8. PROGRESS TRACKING ROUTES (Requirement #17, #18 & #19)
// ==========================================

// GET /api/teacher/progress - Teacher view comprehensive progress breakdown
router.get('/teacher/progress', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { subject_id } = req.query;
  const user = req.user!;

  let targetSubjects = db.subjects;
  if (user.role !== 'super_admin' && user.role !== 'sub_admin') {
    targetSubjects = targetSubjects.filter((s) => s.teacher_id === user.id);
  }
  if (subject_id) {
    targetSubjects = targetSubjects.filter((s) => s.id === subject_id);
  }

  const progressReports = targetSubjects.map((subj) => {
    const chapters = db.chapters.filter((c) => c.subject_id === subj.id);
    const chapterIds = chapters.map((c) => c.id);
    const topics = db.topics.filter((t) => t.subject_id === subj.id || chapterIds.includes(t.chapter_id));
    const subtopics = db.subtopics.filter((s) => chapterIds.includes(s.chapter_id));

    const enrollments = db.enrollments.filter((e) => e.subject_id === subj.id);
    const enrolledStudents = enrollments.map((enr) => {
      const student = db.users.find((u) => u.id === enr.student_id);
      const studentProg = db.progress.filter((p) => p.student_id === enr.student_id && p.subject_id === subj.id);
      const studentQuizSubs = db.quizSubmissions.filter((qs) => qs.student_id === enr.student_id && (qs.subject_id === subj.id || qs.class_id === subj.id));
      const studentAsgSubs = db.assignmentSubmissions.filter((asg) => {
        if (asg.student_id !== enr.student_id) return false;
        const parentAsg = db.assignments.find((a) => a.id === asg.assignment_id);
        return parentAsg?.subject_id === subj.id || parentAsg?.class_id === subj.id;
      });

      const completedSubtopicsCount = studentProg.filter((p) => p.completed).length;
      const notesViewedCount = studentProg.filter((p) => p.notes_viewed).length;
      const videosWatchedCount = studentProg.filter((p) => (p.video_progress || 0) >= 80).length;

      const subtopicPercent = subtopics.length > 0 ? Math.round((completedSubtopicsCount / subtopics.length) * 100) : 0;
      const avgQuizScore = studentQuizSubs.length > 0
        ? Math.round(studentQuizSubs.reduce((acc, q) => acc + (q.score || 0), 0) / studentQuizSubs.length)
        : 0;
      const avgAsgScore = studentAsgSubs.filter((a) => a.marks !== undefined).length > 0
        ? Math.round(
            studentAsgSubs.reduce((acc, a) => acc + (a.marks || 0), 0) /
            studentAsgSubs.filter((a) => a.marks !== undefined).length
          )
        : 0;

      return {
        id: enr.student_id,
        name: student?.name || 'Enrolled Student',
        email: student?.email || '',
        studentId: student?.studentId || `STU-${enr.student_id.slice(-4).toUpperCase()}`,
        joined_at: enr.joined_at,
        completedSubtopics: completedSubtopicsCount,
        totalSubtopics: subtopics.length,
        notesViewed: notesViewedCount,
        videosWatched: videosWatchedCount,
        quizzesCompleted: studentQuizSubs.length,
        averageQuizScore: avgQuizScore,
        assignmentsSubmitted: studentAsgSubs.length,
        averageAssignmentMarks: avgAsgScore,
        overallProgress: subtopicPercent,
      };
    });

    // Chapter-by-chapter completion rates
    const chapterBreakdown = chapters.map((chap) => {
      const chapSubs = subtopics.filter((s) => s.chapter_id === chap.id);
      let totalCompletedInChap = 0;
      enrollments.forEach((enr) => {
        totalCompletedInChap += db.progress.filter(
          (p) => p.student_id === enr.student_id && p.chapter_id === chap.id && p.completed
        ).length;
      });

      const maxPossible = enrollments.length * (chapSubs.length || 1);
      const chapterPercent = maxPossible > 0 ? Math.round((totalCompletedInChap / maxPossible) * 100) : 0;

      return {
        id: chap.id,
        title: chap.title,
        order: chap.order,
        totalSubtopics: chapSubs.length,
        completionRate: chapterPercent,
      };
    });

    const totalStudentProgress = enrolledStudents.reduce((acc, s) => acc + s.overallProgress, 0);
    const overallCourseProgress = enrolledStudents.length > 0 ? Math.round(totalStudentProgress / enrolledStudents.length) : 0;

    return {
      subjectId: subj.id,
      subjectName: subj.name,
      subjectCode: subj.code || (subj.class_code ? subj.class_code.split('-')[0] : 'CSE101'),
      totalStudents: enrolledStudents.length,
      totalChapters: chapters.length,
      totalTopics: topics.length,
      totalSubtopics: subtopics.length,
      overallProgress: overallCourseProgress,
      chapters: chapterBreakdown,
      students: enrolledStudents,
    };
  });

  res.json({ progressReports });
});

// GET /api/student/progress - Student view "My Progress" (Requirement #18 & #19)
router.get('/student/progress', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const enrollments = db.enrollments.filter((e) => e.student_id === user.id);
  const enrolledSubjectIds = enrollments.map((e) => e.subject_id);

  const subjectsBreakdown = enrolledSubjectIds.map((subjId) => {
    const subj = db.subjects.find((s) => s.id === subjId);
    const chapters = db.chapters.filter((c) => c.subject_id === subjId);
    const chapterIds = chapters.map((c) => c.id);
    const subtopics = db.subtopics.filter((s) => chapterIds.includes(s.chapter_id));

    const progList = db.progress.filter((p) => p.student_id === user.id && p.subject_id === subjId);
    const quizSubs = db.quizSubmissions.filter((qs) => qs.student_id === user.id && (qs.subject_id === subjId || qs.class_id === subjId));
    const asgSubs = db.assignmentSubmissions.filter((asg) => {
      const parentAsg = db.assignments.find((a) => a.id === asg.assignment_id);
      return parentAsg?.subject_id === subjId || parentAsg?.class_id === subjId;
    });

    const completedSubs = progList.filter((p) => p.completed).length;
    const completedVideos = progList.filter((p) => (p.video_progress || 0) >= 80).length;
    const completedNotes = progList.filter((p) => p.notes_viewed).length;

    const subjectProgressPercent = subtopics.length > 0 ? Math.round((completedSubs / subtopics.length) * 100) : 0;

    const chapterProgressList = chapters.map((chap) => {
      const chapSubs = subtopics.filter((s) => s.chapter_id === chap.id);
      const completedInChap = progList.filter((p) => p.chapter_id === chap.id && p.completed).length;
      const chapPercent = chapSubs.length > 0 ? Math.round((completedInChap / chapSubs.length) * 100) : 0;

      return {
        id: chap.id,
        title: chap.title,
        order: chap.order,
        progress: chapPercent,
        completedSubtopics: completedInChap,
        totalSubtopics: chapSubs.length,
      };
    });

    const avgQuizScore = quizSubs.length > 0
      ? Math.round(quizSubs.reduce((acc, q) => acc + (q.score || 0), 0) / quizSubs.length)
      : 0;

    const avgAsgScore = asgSubs.filter((a) => a.marks !== undefined).length > 0
      ? Math.round(
          asgSubs.reduce((acc, a) => acc + (a.marks || 0), 0) /
          asgSubs.filter((a) => a.marks !== undefined).length
        )
      : 0;

    return {
      subjectId: subjId,
      subjectName: subj?.name || 'Class Subject',
      subjectCode: subj?.code || (subj?.class_code ? subj.class_code.split('-')[0] : 'CSE101'),
      overallProgress: subjectProgressPercent,
      completedSubtopics: completedSubs,
      totalSubtopics: subtopics.length,
      completedVideos,
      completedNotes,
      completedQuizzes: quizSubs.length,
      submittedAssignments: asgSubs.length,
      averageQuizScore: avgQuizScore,
      averageAssignmentMarks: avgAsgScore,
      chapters: chapterProgressList,
    };
  });

  const totalSum = subjectsBreakdown.reduce((acc, s) => acc + s.overallProgress, 0);
  const totalOverall = subjectsBreakdown.length > 0 ? Math.round(totalSum / subjectsBreakdown.length) : 0;

  res.json({
    overallProgress: totalOverall,
    subjects: subjectsBreakdown,
  });
});
// POST /api/quizzes/:id/submit - Student submits a quiz with server-authoritative timing & attempt validation
router.post('/quizzes/:id/submit', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const quiz = db.quizzes.find((q) => q.id === req.params.id);
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const studentId = req.user!.id;
  const subtopic = db.subtopics.find((s) => s.id === quiz.subtopic_id);
  const chapter = subtopic ? db.chapters.find((c) => c.id === subtopic.chapter_id) : (quiz.chapter_id ? db.chapters.find((c) => c.id === quiz.chapter_id) : null);
  const subjectId = quiz.subject_id || quiz.class_id || (chapter ? chapter.subject_id : '');
  const subject = db.subjects.find((s) => s.id === subjectId);

  // Enrollment verification
  if (req.user?.role === 'student' && subject && !isStudentEnrolled(studentId, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  const { answers, attempt_id, auto_submitted } = req.body;
  if (!answers || typeof answers !== 'object') {
    res.status(400).json({ error: 'Answers must be provided as an object.' });
    return;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const GRACE_MS = 15_000; // 15s network grace buffer for automatic timer submission
  const startMs = quiz.start_date ? new Date(quiz.start_date).getTime() : null;
  const dueMs = quiz.due_date ? new Date(quiz.due_date).getTime() : null;
  const allowLate = Boolean(quiz.allow_late_submission);

  if (req.user?.role === 'student' && startMs !== null && !Number.isNaN(startMs) && nowMs < startMs) {
    res.status(403).json({
      error: `This quiz has not started yet. Scheduled start: ${new Date(startMs).toLocaleString()}.`,
      code: 'QUIZ_NOT_STARTED',
      serverTime: now.toISOString(),
    });
    return;
  }

  const existingStudentSubs = db.quizSubmissions.filter((qs) => qs.quiz_id === quiz.id && qs.student_id === studentId);
  const maxAttempts = Math.max(1, Number(quiz.max_attempts || 1));

  if (req.user?.role === 'student' && existingStudentSubs.length >= maxAttempts) {
    res.status(403).json({
      error: `Maximum allowed attempts (${maxAttempts}) already reached for this quiz.`,
      code: 'MAX_ATTEMPTS_REACHED',
      serverTime: now.toISOString(),
    });
    return;
  }

  // Resolve active attempt if started via /quizzes/:id/start
  const attempt =
    (attempt_id
      ? db.quizAttempts.find((a) => a.id === attempt_id && a.quiz_id === quiz.id && a.student_id === studentId)
      : null) ||
    db.quizAttempts.find((a) => a.quiz_id === quiz.id && a.student_id === studentId && a.status === 'in_progress') ||
    null;

  if (req.user?.role === 'student') {
    if (dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs + GRACE_MS && !allowLate) {
      if (attempt && attempt.status === 'in_progress') {
        attempt.status = 'expired';
        db.persist();
      }
      res.status(403).json({
        error: 'The quiz deadline has passed and submissions are closed.',
        code: 'QUIZ_DEADLINE_PASSED',
        serverTime: now.toISOString(),
      });
      return;
    }

    if (attempt) {
      if (attempt.status === 'submitted') {
        res.status(409).json({
          error: 'This quiz attempt has already been submitted.',
          code: 'ATTEMPT_ALREADY_SUBMITTED',
          serverTime: now.toISOString(),
        });
        return;
      }
      const attemptExpiresMs = new Date(attempt.expires_at).getTime();
      if (!Number.isNaN(attemptExpiresMs) && nowMs > attemptExpiresMs + GRACE_MS && !allowLate) {
        attempt.status = 'expired';
        db.persist();
        res.status(403).json({
          error: 'Your allowed attempt duration has expired.',
          code: 'ATTEMPT_EXPIRED',
          serverTime: now.toISOString(),
        });
        return;
      }
    }
  }

  let correctCount = 0;
  const feedback = quiz.questions.map((q) => {
    const studentAnswer = (answers[q.id] || '').toString().trim();
    const correctAnswer = q.correct_answer.toString().trim();

    const isCorrect =
      q.question_type === 'short_answer'
        ? studentAnswer.toLowerCase() === correctAnswer.toLowerCase()
        : studentAnswer === correctAnswer;

    if (isCorrect) correctCount++;

    return {
      questionId: q.id,
      question: q.question,
      questionType: q.question_type,
      studentAnswer,
      correctAnswer: q.correct_answer,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const totalQuestions = quiz.questions.length;
  const totalMarks = Number(quiz.marks || 100);
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const marksObtained = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * totalMarks) : 0;
  const passingMarks =
    typeof quiz.passing_marks === 'number'
      ? quiz.passing_marks
      : Math.round(((quiz.passing_score || 70) / 100) * totalMarks);
  const passed =
    typeof quiz.passing_marks === 'number'
      ? marksObtained >= passingMarks
      : scorePercent >= quiz.passing_score;

  const isLate = Boolean(dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs);
  const attemptNumber = existingStudentSubs.length + 1;

  if (attempt) {
    attempt.status = 'submitted';
    attempt.submitted_at = now.toISOString();
    attempt.auto_submitted = Boolean(auto_submitted);
  }

  const recommendations: string[] = [];
  if (!passed) {
    recommendations.push(`Review the ${quiz.title} topic notes and materials.`);
    if (attemptNumber < maxAttempts) {
      recommendations.push(`You have ${maxAttempts - attemptNumber} attempt(s) remaining to improve your score.`);
    }
  } else {
    recommendations.push(`Great job! You achieved a passing score (${marksObtained}/${totalMarks}) on ${quiz.title}.`);
  }

  // Store every attempt as its own submission record for accurate multi-attempt history
  const submissionRecord: QuizSubmission = {
    id: `qsub_${crypto.randomUUID().slice(0, 8)}`,
    quiz_id: quiz.id,
    attempt_id: attempt?.id,
    attempt_number: attemptNumber,
    student_id: studentId,
    student_name: req.user!.name,
    subject_id: subjectId,
    class_id: quiz.class_id || subjectId,
    score: scorePercent,
    marks_obtained: marksObtained,
    total_marks: totalMarks,
    passed,
    is_late: isLate,
    auto_submitted: Boolean(auto_submitted),
    started_at: attempt?.started_at,
    answers,
    submitted_at: now.toISOString(),
  };

  db.quizSubmissions.push(submissionRecord);

  // Update student progress record if subtopic exists
  if (quiz.subtopic_id) {
    let prog = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === quiz.subtopic_id);
    if (!prog && chapter && subject) {
      prog = {
        id: `prog_${crypto.randomUUID().slice(0, 8)}`,
        student_id: studentId,
        subject_id: subject.id,
        chapter_id: chapter.id,
        subtopic_id: quiz.subtopic_id,
        video_progress: 100,
        video_last_seconds: 0,
        notes_viewed: true,
        interactive_explored: true,
        quiz_score: scorePercent,
        quiz_total: 100,
        quiz_passed: passed,
        completed: passed,
        last_activity_at: new Date().toISOString(),
      };
      db.progress.push(prog);
    } else if (prog) {
      prog.quiz_score = scorePercent;
      prog.quiz_passed = passed;
      if (passed) prog.completed = true;
      prog.last_activity_at = new Date().toISOString();
    }
  }

  // ==================================================
  // SMART STUDY SYSTEM: Remedial Learning Trigger (Requirement #3 & #10)
  // ==================================================
  let smartStudyPlan: SmartStudyPlan | null = null;
  let smartStudyNotification: string | null = null;

  if (scorePercent < 80 || !passed) {
    const parentTopic = db.topics.find((t) => t.id === quiz.topic_id || (quiz.subtopic_id && db.subtopics.find((s) => s.id === quiz.subtopic_id)?.topic_id === t.id));
    const parentChap = db.chapters.find((c) => c.id === quiz.chapter_id || (parentTopic && parentTopic.chapter_id === c.id));
    const parentSubj = db.subjects.find((s) => s.id === quiz.subject_id || s.id === quiz.class_id || (parentChap && parentChap.subject_id === s.id));

    const topicTitle = parentTopic?.title || parentChap?.title || quiz.title;
    const weakSubtopic = db.subtopics.find((s) => s.id === quiz.subtopic_id || (parentTopic && s.topic_id === parentTopic.id)) || db.subtopics[0];
    const relatedNotes = db.materials.find((m) => m.type === 'notes' && (m.subtopic_id === weakSubtopic?.id || m.topic_id === parentTopic?.id || m.subject_id === parentSubj?.id)) || db.materials.find((m) => m.type === 'notes');
    const relatedVideo = db.materials.find((m) => m.type === 'video' && (m.subtopic_id === weakSubtopic?.id || m.topic_id === parentTopic?.id || m.subject_id === parentSubj?.id)) || db.materials.find((m) => m.type === 'video');
    const relatedSim = db.simulations.find((s) => s.subject_id === parentSubj?.id || s.topic_id === parentTopic?.id) || db.simulations[0];

    const planSteps: SmartStudyStep[] = [
      {
        id: `stp_1_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 1,
        type: 'subtopic_review',
        title: `Review Core Concept: ${weakSubtopic?.title || 'Key Subtopic'}`,
        description: `Revisit foundational explanations for ${weakSubtopic?.title || topicTitle}.`,
        resource_id: weakSubtopic?.id,
        resource_type: 'subtopic',
        resource_title: weakSubtopic?.title,
        completed: false,
      },
      {
        id: `stp_2_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 2,
        type: 'notes_reading',
        title: `Read Verified Faculty Notes: ${relatedNotes?.title || 'Course Notes'}`,
        description: 'Study verified definitions and structured summaries.',
        resource_id: relatedNotes?.id,
        resource_type: 'material',
        resource_title: relatedNotes?.title || 'Course Lecture Notes',
        completed: false,
      },
      {
        id: `stp_3_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 3,
        type: 'video_watch',
        title: `Watch Visual Lecture: ${relatedVideo?.title || 'Video Explanation'}`,
        description: 'Observe visual breakdown and concept walkthrough.',
        resource_id: relatedVideo?.id,
        resource_type: 'material',
        resource_title: relatedVideo?.title || 'Conceptual Video Lecture',
        completed: false,
      },
      {
        id: `stp_4_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 4,
        type: 'simulation_explore',
        title: `Explore Interactive Simulation: ${relatedSim?.title || 'Scientific Model'}`,
        description: 'Experiment with variables and observe real-time calculations.',
        resource_id: relatedSim?.id,
        resource_type: 'simulation',
        resource_title: relatedSim?.title || 'Interactive Model',
        completed: false,
      },
      {
        id: `stp_5_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 5,
        type: 'practice_review',
        title: `Review Incorrect Questions & Mistakes`,
        description: `Examine questions answered incorrectly on this quiz to understand where errors occurred.`,
        resource_id: quiz.id,
        resource_type: 'quiz',
        resource_title: quiz.title,
        completed: false,
      },
      {
        id: `stp_6_${crypto.randomUUID().slice(0, 6)}`,
        step_number: 6,
        type: 'quiz_retry',
        title: `Retake Quiz: ${quiz.title}`,
        description: 'Re-attempt the quiz to achieve concept mastery (target score >= 80%).',
        resource_id: quiz.id,
        resource_type: 'quiz',
        resource_title: quiz.title,
        completed: false,
      },
    ];

    const planId = `plan_${studentId}_${quiz.id}`;
    const existingPlanIdx = db.smartStudyPlans.findIndex((p) => p.student_id === studentId && (p.triggered_by_quiz_id === quiz.id || (p.topic_id && p.topic_id === parentTopic?.id)));

    smartStudyPlan = {
      id: existingPlanIdx >= 0 ? db.smartStudyPlans[existingPlanIdx].id : planId,
      student_id: studentId,
      student_name: req.user!.name,
      subject_id: parentSubj?.id || subjectId,
      subject_name: parentSubj?.name || 'Class Subject',
      chapter_id: parentChap?.id,
      chapter_title: parentChap?.title,
      topic_id: parentTopic?.id,
      topic_title: topicTitle,
      subtopic_id: weakSubtopic?.id,
      subtopic_title: weakSubtopic?.title,
      triggered_by_quiz_id: quiz.id,
      triggered_by_quiz_title: quiz.title,
      trigger_score: scorePercent,
      trigger_reason: `Recent quiz score of ${scorePercent}% on "${quiz.title}" is below mastery threshold.`,
      status: 'in_progress',
      steps: planSteps,
      progress_percentage: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingPlanIdx >= 0) {
      db.smartStudyPlans[existingPlanIdx] = smartStudyPlan;
    } else {
      db.smartStudyPlans.push(smartStudyPlan);
    }

    smartStudyNotification = `Your recent quiz shows that you may need more practice with ${topicTitle}. Your personalized study plan is ready.`;
    recommendations.push(smartStudyNotification);
  } else {
    // If passed with score >= 80, check if student had an open study plan for this quiz/topic and mark completed!
    const openPlan = db.smartStudyPlans.find((p) => p.student_id === studentId && (p.triggered_by_quiz_id === quiz.id || p.subtopic_id === quiz.subtopic_id) && p.status !== 'completed');
    if (openPlan) {
      openPlan.status = 'completed';
      openPlan.progress_percentage = 100;
      openPlan.completed_at = new Date().toISOString();
      openPlan.updated_at = new Date().toISOString();
      openPlan.steps.forEach((s) => (s.completed = true));
      smartStudyNotification = `Mastery achieved! Your Smart Study Plan for "${openPlan.topic_title || quiz.title}" has been marked completed!`;
      recommendations.push(smartStudyNotification);
    }
  }

  db.persist();

  res.json({
    scorePercent,
    marksObtained,
    totalMarks,
    passingMarks,
    correctCount,
    totalQuestions,
    passed,
    passingScore: quiz.passing_score,
    attemptNumber,
    maxAttempts,
    attemptsRemaining: Math.max(0, maxAttempts - attemptNumber),
    autoSubmitted: Boolean(auto_submitted),
    isLate,
    submittedAt: now.toISOString(),
    serverTime: now.toISOString(),
    feedback,
    recommendations,
    smart_study_plan: smartStudyPlan,
    smart_study_notification: smartStudyNotification,
  });
});

// ==========================================
// 7. PROGRESS TRACKING ROUTES
// ==========================================

router.post('/progress/video', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { subtopic_id, watched_percent, current_time } = req.body;
  if (!subtopic_id) {
    res.status(400).json({ error: 'Subtopic ID required.' });
    return;
  }

  const studentId = req.user!.id;
  const subtopic = db.subtopics.find((s) => s.id === subtopic_id);
  if (!subtopic) {
    res.status(404).json({ error: 'Subtopic not found.' });
    return;
  }
  const chapter = db.chapters.find((c) => c.id === subtopic.chapter_id);
  const subject = chapter ? db.subjects.find((s) => s.id === chapter.subject_id) : null;

  if (req.user?.role === 'student' && subject && !isStudentEnrolled(studentId, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  let prog = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === subtopic_id);
  const newProgress = Math.min(100, Math.max(0, Math.round(Number(watched_percent) || 0)));
  const currentTime = Math.round(Number(current_time) || 0);

  if (!prog && chapter && subject) {
    prog = {
      id: `prog_${crypto.randomUUID().slice(0, 8)}`,
      student_id: studentId,
      subject_id: subject.id,
      chapter_id: chapter.id,
      subtopic_id: subtopic.id,
      video_progress: newProgress,
      video_last_seconds: currentTime,
      notes_viewed: false,
      interactive_explored: false,
      completed: false,
      last_activity_at: new Date().toISOString(),
    };
    db.progress.push(prog);
  } else if (prog) {
    prog.video_progress = Math.max(prog.video_progress, newProgress);
    prog.video_last_seconds = currentTime;
    prog.last_activity_at = new Date().toISOString();
  }

  db.persist();
  res.json({ message: 'Video progress updated', video_progress: prog?.video_progress });
});

router.post('/progress/notes', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { subtopic_id } = req.body;
  const studentId = req.user!.id;

  const subtopic = db.subtopics.find((s) => s.id === subtopic_id);
  const chapter = subtopic ? db.chapters.find((c) => c.id === subtopic.chapter_id) : null;
  const subject = chapter ? db.subjects.find((s) => s.id === chapter.subject_id) : null;

  if (req.user?.role === 'student' && subject && !isStudentEnrolled(studentId, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  let prog = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === subtopic_id);
  if (prog) {
    prog.notes_viewed = true;
    prog.last_activity_at = new Date().toISOString();
  } else if (subtopic && chapter && subject) {
    prog = {
      id: `prog_${crypto.randomUUID().slice(0, 8)}`,
      student_id: studentId,
      subject_id: subject.id,
      chapter_id: chapter.id,
      subtopic_id: subtopic.id,
      video_progress: 0,
      video_last_seconds: 0,
      notes_viewed: true,
      interactive_explored: false,
      completed: false,
      last_activity_at: new Date().toISOString(),
    };
    db.progress.push(prog);
  }

  db.persist();
  res.json({ message: 'Notes viewed recorded' });
});

router.post('/progress/interactive', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { subtopic_id } = req.body;
  const studentId = req.user!.id;

  const subtopic = db.subtopics.find((s) => s.id === subtopic_id);
  const chapter = subtopic ? db.chapters.find((c) => c.id === subtopic.chapter_id) : null;
  const subject = chapter ? db.subjects.find((s) => s.id === chapter.subject_id) : null;

  if (req.user?.role === 'student' && subject && !isStudentEnrolled(studentId, subject.id)) {
    res.status(403).json({ error: 'You are not enrolled in this class.' });
    return;
  }

  let prog = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === subtopic_id);
  if (prog) {
    prog.interactive_explored = true;
    prog.last_activity_at = new Date().toISOString();
  }

  db.persist();
  res.json({ message: 'Interactive simulation progress recorded' });
});

// ==========================================
// 8. GLOBAL SEARCH (PRIVACY-RESTRICTED)
// ==========================================

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  if (!query) {
    res.json({ subjects: [], chapters: [], subtopics: [], notes: [] });
    return;
  }

  // STRICT REQUIREMENT #14:
  // Do NOT make all Teacher-created classes publicly searchable by students.
  // Student search should NOT return every class in the system.
  const authHeader = req.headers.authorization;
  const user = authHeader && authHeader.startsWith('Bearer ')
    ? await resolveUserFromBearerToken(authHeader.substring(7))
    : null;

  let allowedSubjectIds: string[] | null = null;
  if (user && user.role === 'student') {
    allowedSubjectIds = db.enrollments
      .filter((e) => e.student_id === user.id)
      .map((e) => e.subject_id);
  }

  const matchingSubjects = db.subjects
    .filter((s) => {
      if (allowedSubjectIds && !allowedSubjectIds.includes(s.id)) return false;
      return s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query);
    })
    .map((s) => ({
      ...s,
      class_code: undefined, // Never leak class code in search
    }))
    .slice(0, 5);

  const matchingChapters = db.chapters
    .filter((c) => {
      if (allowedSubjectIds && !allowedSubjectIds.includes(c.subject_id)) return false;
      return c.title.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
    })
    .map((c) => {
      const s = db.subjects.find((subj) => subj.id === c.subject_id);
      return { ...c, subjectName: s?.name };
    })
    .slice(0, 5);

  const matchingSubtopics = db.subtopics
    .filter((sub) => {
      const c = db.chapters.find((chap) => chap.id === sub.chapter_id);
      if (!c) return false;
      if (allowedSubjectIds && !allowedSubjectIds.includes(c.subject_id)) return false;
      return (
        sub.title.toLowerCase().includes(query) ||
        sub.description.toLowerCase().includes(query) ||
        sub.learning_objectives.some((obj) => obj.toLowerCase().includes(query))
      );
    })
    .map((sub) => {
      const c = db.chapters.find((chap) => chap.id === sub.chapter_id);
      const s = c ? db.subjects.find((subj) => subj.id === c.subject_id) : null;
      return {
        ...sub,
        chapterTitle: c?.title,
        subjectName: s?.name,
        subjectId: s?.id,
      };
    })
    .slice(0, 8);

  const matchingNotes = db.notes
    .filter((n) => {
      if (allowedSubjectIds && !allowedSubjectIds.includes(n.subject_id)) return false;
      return n.title.toLowerCase().includes(query) || n.description.toLowerCase().includes(query);
    })
    .map((n) => {
      const s = db.subjects.find((subj) => subj.id === n.subject_id);
      const c = db.chapters.find((chap) => chap.id === n.chapter_id);
      const sub = db.subtopics.find((st) => st.id === n.subtopic_id);
      return {
        ...n,
        subjectName: s?.name,
        chapterTitle: c?.title,
        subtopicTitle: sub?.title,
      };
    })
    .slice(0, 5);

  res.json({
    query,
    subjects: matchingSubjects,
    chapters: matchingChapters,
    subtopics: matchingSubtopics,
    notes: matchingNotes,
  });
});

// ==========================================
// 8. ADMIN & ROLE-BASED ACCESS CONTROL ROUTES
// ==========================================

// Helper: Sanitize user object (exclude password_hash)
function sanitizeUser(u: User) {
  const { password_hash, ...safeUser } = u;
  return safeUser;
}

// ==========================================
// 8A. AUTHENTICATED ADMIN ACCOUNT & SECURITY ROUTES
// ==========================================

// GET /api/admin/account - Get current admin security profile
router.get('/admin/account', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }

  res.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    pendingNewEmail: admin.pendingNewEmail || null,
    hasPendingEmailVerification: Boolean(admin.pendingNewEmail && admin.emailVerificationCode),
    passwordChangedAt: admin.passwordChangedAt || null,
    created_at: admin.created_at,
    last_login_at: admin.last_login_at,
  });
});

// POST /api/admin/account/request-email-change - Request email change with current password check & real verification email
router.post('/admin/account/request-email-change', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }

  const { currentPassword, newEmail } = req.body;

  // 1. Current password requirement
  if (!currentPassword) {
    res.status(400).json({ error: 'Current administrator password is required to request an email change.' });
    return;
  }

  if (!verifyPassword(currentPassword, admin.password_hash)) {
    res.status(401).json({ error: 'Current password verification failed. Please enter your correct password.' });
    return;
  }

  // 2. Validate new email
  if (!newEmail || typeof newEmail !== 'string') {
    res.status(400).json({ error: 'Please enter a valid new email address.' });
    return;
  }

  const cleanEmail = newEmail.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (cleanEmail === admin.email.toLowerCase()) {
    res.status(400).json({ error: 'New email address must be different from your current email.' });
    return;
  }

  // Check if already in use by another user
  const emailInUse = db.users.some((u) => u.id !== admin.id && u.email.toLowerCase() === cleanEmail);
  if (emailInUse) {
    res.status(409).json({ error: 'This email address is already in use by another account.' });
    return;
  }

  // 3. Generate real 6-digit cryptographically secure verification code
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  admin.pendingNewEmail = cleanEmail;
  admin.emailVerificationCode = hashPassword(verificationCode);
  admin.emailVerificationExpiresAt = expiresAt;
  db.persist();

  // 4. Send real email via nodemailer
  const emailResult = await sendAdminVerificationEmail(cleanEmail, verificationCode, admin.name);
  if (!emailResult.success) {
    console.error(`[ADMIN EMAIL] Verification dispatch failed for ${cleanEmail}:`, emailResult.error);
    res.status(500).json({
      error: `Failed to deliver verification email to ${cleanEmail}: ${emailResult.error}. Please check mail server settings.`,
    });
    return;
  }

  // SECURITY: Never return verificationCode in response or log it
  res.json({
    success: true,
    message: `Verification code dispatched to ${cleanEmail}. Please enter the 6-digit code to confirm.`,
    pendingEmail: cleanEmail,
    expiresInMinutes: 15,
  });
});

// POST /api/admin/account/verify-email-change - Verify code and commit admin email change
router.post('/admin/account/verify-email-change', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }

  const { verificationCode } = req.body;
  if (!verificationCode || typeof verificationCode !== 'string') {
    res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
    return;
  }

  if (!admin.pendingNewEmail || !admin.emailVerificationCode) {
    res.status(400).json({ error: 'No pending email change request found. Please request a verification code first.' });
    return;
  }

  // Expiration check
  if (admin.emailVerificationExpiresAt && new Date() > new Date(admin.emailVerificationExpiresAt)) {
    res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    return;
  }

  // Cryptographic code verification
  const isValid = verifyPassword(verificationCode.trim(), admin.emailVerificationCode);
  if (!isValid) {
    res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
    return;
  }

  const cleanNewEmail = admin.pendingNewEmail.toLowerCase().trim();
  const emailInUse = db.users.some((u) => u.id !== admin.id && u.email.toLowerCase() === cleanNewEmail);
  if (emailInUse) {
    res.status(409).json({ error: 'This email address is already in use by another account.' });
    return;
  }

  // Commit email update
  admin.email = cleanNewEmail;
  delete admin.pendingNewEmail;
  delete admin.emailVerificationCode;
  delete admin.emailVerificationExpiresAt;
  db.persist();

  // Re-issue JWT token with updated email
  const newToken = signJwt({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    institution: admin.institution,
    status: admin.status || 'active',
    permissions: admin.permissions,
    adminSetupCompleted: true,
    temporaryCredentials: false,
  });

  res.json({
    success: true,
    message: 'Administrator email updated successfully.',
    email: admin.email,
    token: newToken,
    user: formatAuthUser(admin),
  });
});

// POST /api/admin/account/resend-email-code - Resend verification code
router.post('/admin/account/resend-email-code', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin || !admin.pendingNewEmail) {
    res.status(400).json({ error: 'No pending email change request found.' });
    return;
  }

  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  admin.emailVerificationCode = hashPassword(verificationCode);
  admin.emailVerificationExpiresAt = expiresAt;
  db.persist();

  const emailResult = await sendAdminVerificationEmail(admin.pendingNewEmail, verificationCode, admin.name);
  if (!emailResult.success) {
    res.status(500).json({ error: `Failed to deliver verification email: ${emailResult.error}` });
    return;
  }

  res.json({
    success: true,
    message: `A fresh verification code has been dispatched to ${admin.pendingNewEmail}.`,
    pendingEmail: admin.pendingNewEmail,
  });
});

// POST /api/admin/account/cancel-email-change - Cancel pending email change
router.post('/admin/account/cancel-email-change', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }

  delete admin.pendingNewEmail;
  delete admin.emailVerificationCode;
  delete admin.emailVerificationExpiresAt;
  db.persist();

  res.json({
    success: true,
    message: 'Pending email change cancelled.',
  });
});

// POST /api/admin/account/change-password - Change admin password (requires current password & secure hashing)
router.post('/admin/account/change-password', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }

  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword) {
    res.status(400).json({ error: 'Current administrator password is required.' });
    return;
  }

  if (!verifyPassword(currentPassword, admin.password_hash)) {
    res.status(401).json({ error: 'Current password verification failed. Please check your credentials.' });
    return;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }

  if (newPassword === currentPassword) {
    res.status(400).json({ error: 'New password must be different from current password.' });
    return;
  }

  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: 'New password and confirmation password do not match.' });
    return;
  }

  // Securely hash new password
  admin.password_hash = hashPassword(newPassword);
  admin.passwordChangedAt = new Date().toISOString();
  db.persist();

  res.json({
    success: true,
    message: 'Administrator password updated successfully. Please log in again using your new password.',
    requireRelogin: true,
  });
});

// Backward-compatible endpoints forwarding to account security with requireAdmin enforcement
router.get('/admin/security-setup/status', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const admin = db.users.find((u) => u.id === req.user?.id);
  if (!admin) {
    res.status(404).json({ error: 'Administrator not found.' });
    return;
  }
  res.json({
    adminSetupCompleted: true,
    temporaryCredentials: false,
    currentEmail: admin.email,
    pendingNewEmail: admin.pendingNewEmail || null,
    emailVerificationPending: Boolean(admin.pendingNewEmail && admin.emailVerificationCode),
    emailVerified: true,
    passwordChanged: !!admin.passwordChangedAt,
  });
});

// ==========================================
// 8B. ADMIN DASHBOARD & MANAGEMENT ROUTES
// ==========================================

// GET /api/admin/overview - Verified dashboard stats & system overview (single source of truth)
router.get('/admin/overview', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const { stats, enrichedUsers, audit } = getVerifiedAdminDataset();
  const isFullPrivilege = req.user?.role === 'super_admin' || req.user?.role === 'admin';
  const subAdmins = isFullPrivilege
    ? enrichedUsers.filter((u) => u.role === 'sub_admin')
    : [];

  res.json({
    stats,
    settings: db.settings,
    subAdmins,
    recentUsers: enrichedUsers.slice(0, 8),
    auditSummary: isFullPrivilege
      ? {
          healthy: audit.healthy,
          totalIssues: audit.totalIssues,
          summary: audit.summary,
          generatedAt: audit.generatedAt,
        }
      : undefined,
  });
});

// GET /api/admin/audit - Non-destructive data integrity audit report (Super Admin only)
router.get('/admin/audit', requireSuperAdmin, (_req: AuthenticatedRequest, res: Response): void => {
  const { audit, stats } = getVerifiedAdminDataset();
  res.json({ audit, stats });
});

// POST /api/admin/sync-firestore-users - Non-destructively reconcile live Firestore users/admins into backend records
router.post('/admin/sync-firestore-users', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const { users: incomingUsers, admins: incomingAdmins } = req.body || {};
  if (!Array.isArray(incomingUsers)) {
    res.status(400).json({ error: 'A users array from Firestore is required.' });
    return;
  }

  const syncResult = reconcileFirestoreDirectoryToBackend({
    users: incomingUsers,
    admins: Array.isArray(incomingAdmins) ? incomingAdmins : [],
    callerRole: req.user!.role,
  });

  const { stats, audit } = getVerifiedAdminDataset();
  res.json({
    ...syncResult,
    stats,
    auditSummary:
      req.user?.role === 'super_admin' || req.user?.role === 'admin'
        ? {
            healthy: audit.healthy,
            totalIssues: audit.totalIssues,
            summary: audit.summary,
            generatedAt: audit.generatedAt,
          }
        : undefined,
  });
});

// GET /api/admin/users - Query and filter verified, deduplicated system users
router.get('/admin/users', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const { role, status, search } = req.query as { role?: string; status?: string; search?: string };
  const { enrichedUsers, stats } = getVerifiedAdminDataset();

  let filtered = [...enrichedUsers];

  // Enforce Sub-Admin permission scoping so sub-admins only inspect permitted categories
  if (req.user?.role === 'sub_admin') {
    const perms = new Set(req.user.permissions || []);
    const canSeeStudents = perms.has('manage_students') || perms.has('manage_subjects_classes');
    const canSeeTeachers = perms.has('manage_teachers') || perms.has('manage_subjects_classes');
    filtered = filtered.filter((u) => {
      if (u.role === 'student') return canSeeStudents;
      if (u.role === 'teacher') return canSeeTeachers;
      // Sub-admins may see their own record, never other admins' management details
      return u.id === req.user?.id;
    });
  }

  if (role && role !== 'all') {
    if (role === 'admin') {
      filtered = filtered.filter((u) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'sub_admin');
    } else {
      filtered = filtered.filter((u) => u.role === role);
    }
  }

  if (status && status !== 'all') {
    filtered = filtered.filter((u) => (u.status || 'active') === status);
  }

  if (search) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.institution && u.institution.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }

  res.json({ users: filtered, total: filtered.length, stats });
});

// POST /api/admin/users - Create new user (Student, Teacher, Admin, or Sub Admin)
router.post('/admin/users', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, email, password, role, institution, permissions } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'Full name, email, password, and role are required.' });
    return;
  }

  if (!['student', 'teacher', 'admin', 'sub_admin', 'super_admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role specified.' });
    return;
  }

  // Rule 1: There must be ONLY ONE Super Admin account
  if (role === 'super_admin') {
    res.status(400).json({
      error: 'Creation of another Super Admin is prohibited. There must be ONLY ONE Super Admin account in the application.',
    });
    return;
  }

  // Rule 2: Only authorized Admin or Super Admin can create additional Admin or Sub Admin accounts
  if (role === 'admin' || role === 'sub_admin') {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      res.status(403).json({
        error: 'Access denied: Only an authorized Admin or Super Admin can create Admin or Sub Admin accounts.',
      });
      return;
    }

    if (role === 'sub_admin') {
      const { stats } = getVerifiedAdminDataset();
      const maxSubAdmins = db.settings.maxSubAdmins || 4;
      if (stats.totalSubAdmins >= maxSubAdmins) {
        res.status(400).json({
          error: `Maximum ${maxSubAdmins} Sub Admins allowed. You cannot create more Sub Admins (Current: ${stats.totalSubAdmins}/${maxSubAdmins}).`,
        });
        return;
      }
    }
  }

  // Check sub admin caller permissions for student/teacher creation
  if (req.user?.role === 'sub_admin') {
    if (role === 'student' && !req.user.permissions?.includes('manage_students')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to manage students.' });
      return;
    }
    if (role === 'teacher' && !req.user.permissions?.includes('manage_teachers')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to manage teachers.' });
      return;
    }
  }

  const cleanEmail = email.toLowerCase().trim();
  if (isSuperAdminEmailAddress(cleanEmail)) {
    res.status(403).json({ error: 'This email address is reserved for the Super Admin account.' });
    return;
  }

  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    res.status(409).json({ error: 'A user with this email address already exists.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    return;
  }

  const prefix =
    role === 'admin'
      ? 'usr_admin'
      : role === 'sub_admin'
      ? 'usr_subadmin'
      : role === 'student'
      ? 'usr_student'
      : 'usr_teacher';
  const newUserId = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const idSuffix = newUserId.slice(-6).toUpperCase();

  const cleanPermissions = role === 'sub_admin' ? sanitizePermissions(permissions) || [] : undefined;

  const newUser: User = {
    id: newUserId,
    name: name.trim(),
    email: cleanEmail,
    password_hash: hashPassword(password),
    role,
    institution:
      institution
        ? institution.trim()
        : role === 'admin' || role === 'sub_admin'
        ? 'VisuaLearn Administration'
        : undefined,
    status: 'active',
    permissions: cleanPermissions,
    studentId: role === 'student' ? `STU-${idSuffix}` : undefined,
    teacherId: role === 'teacher' ? `FAC-${idSuffix}` : undefined,
    adminId: role === 'admin' || role === 'sub_admin' ? `ADM-${idSuffix}` : undefined,
    adminSetupCompleted: role === 'admin' || role === 'sub_admin' ? true : undefined,
    temporaryCredentials: false,
    created_at: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.persist();

  res.status(201).json({
    message: `${role.replace('_', ' ')} created in VisuaLearn.`,
    firebaseLimitationNotice:
      'Account was saved in VisuaLearn backend records. Creating a new Firebase Authentication login or setting Firebase Auth custom claims for another user requires Firebase Admin SDK (a standard upgraded project with IAM). Existing Firebase users can be promoted directly from the user list.',
    user: sanitizeUser(newUser),
  });
});

// PUT /api/admin/users/:id - Edit user details
router.put('/admin/users/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const targetUser = db.users.find((u) => u.id === req.params.id);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { name, email, role, institution, status, permissions, password } = req.body;

  // Protect Super Admin
  if (targetUser.role === 'super_admin' && req.user?.id !== targetUser.id) {
    res.status(403).json({ error: 'Only the Super Admin can modify their own account.' });
    return;
  }

  // Prevent Sub-Admins from modifying any Admin/Sub-Admin account (including escalating their own permissions/role)
  if (targetUser.role === 'admin' || targetUser.role === 'sub_admin') {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Only an authorized Admin or Super Admin can edit administrator accounts.' });
      return;
    }
  }

  // Check sub admin caller permissions
  if (req.user?.role === 'sub_admin') {
    if (targetUser.id === req.user.id) {
      res.status(403).json({ error: 'Sub Admins cannot modify their own account role or permissions.' });
      return;
    }
    if (targetUser.role === 'student' && !req.user.permissions?.includes('manage_students')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to edit students.' });
      return;
    }
    if (targetUser.role === 'teacher' && !req.user.permissions?.includes('manage_teachers')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to edit teachers.' });
      return;
    }
  }

  // Role updates: only Super Admin / Admin may promote or demote between student, teacher, sub_admin, admin.
  // Nobody can ever assign super_admin to another user or change the Super Admin's own role.
  if (role && role !== targetUser.role) {
    if (role === 'super_admin' || targetUser.role === 'super_admin') {
      res.status(403).json({
        error: `Super Admin role is exclusively bound to ${SUPER_ADMIN_EMAIL} and cannot be reassigned.`,
      });
      return;
    }
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Only an authorized Admin or Super Admin can change user roles.' });
      return;
    }
    if (role !== 'student' && role !== 'teacher' && role !== 'sub_admin' && role !== 'admin') {
      res.status(400).json({ error: 'Invalid target role.' });
      return;
    }
    if (role === 'sub_admin') {
      const { verifiedUsers } = getVerifiedAdminDataset();
      const currentSubAdmins = verifiedUsers.filter(
        (u) => u.role === 'sub_admin' && u.id !== targetUser.id
      ).length;
      const maxSubAdmins = db.settings.maxSubAdmins || 4;
      if (currentSubAdmins >= maxSubAdmins) {
        res.status(400).json({
          error: `Maximum ${maxSubAdmins} Sub Admins allowed (Current: ${currentSubAdmins}/${maxSubAdmins}).`,
        });
        return;
      }
    }
    targetUser.role = role;
    if (role === 'admin' || role === 'sub_admin') {
      targetUser.adminId = targetUser.adminId || `ADM-${targetUser.id.slice(0, 6).toUpperCase()}`;
      targetUser.adminSetupCompleted = true;
    } else {
      targetUser.permissions = undefined;
    }
  }

  if (email && email.toLowerCase().trim() !== targetUser.email.toLowerCase()) {
    const cleanEmail = email.toLowerCase().trim();
    if (isSuperAdminEmailAddress(cleanEmail) && targetUser.role !== 'super_admin') {
      res.status(403).json({ error: 'This email address is reserved for the Super Admin account.' });
      return;
    }
    if (db.users.some((u) => u.id !== targetUser.id && u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'This email address is already taken by another user.' });
      return;
    }
    targetUser.email = cleanEmail;
  }

  if (name) targetUser.name = name.trim();
  if (institution !== undefined) targetUser.institution = institution ? institution.trim() : undefined;

  // Status changes: prevent disabling the super admin
  if (status && status !== targetUser.status) {
    if (targetUser.role === 'super_admin') {
      res.status(400).json({ error: 'The Super Admin account cannot be disabled.' });
      return;
    }
    targetUser.status = status;
  }

  // Permissions changes (Admin / Super Admin only, for sub_admin role)
  if (
    targetUser.role === 'sub_admin' &&
    Array.isArray(permissions) &&
    (req.user?.role === 'super_admin' || req.user?.role === 'admin')
  ) {
    targetUser.permissions = sanitizePermissions(permissions) || [];
  }

  // Optional local password update
  if (password && password.trim().length >= 6) {
    targetUser.password_hash = hashPassword(password.trim());
  }

  db.persist();

  res.json({
    message: 'User updated successfully.',
    user: sanitizeUser(targetUser),
  });
});

// PATCH /api/admin/users/:id/status - Quick activate/deactivate
router.patch('/admin/users/:id/status', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const targetUser = db.users.find((u) => u.id === req.params.id);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { status } = req.body as { status: 'active' | 'disabled' };
  if (!status || (status !== 'active' && status !== 'disabled')) {
    res.status(400).json({ error: 'Valid status ("active" or "disabled") is required.' });
    return;
  }

  if (targetUser.role === 'super_admin') {
    res.status(400).json({ error: 'The Super Admin account cannot be disabled.' });
    return;
  }

  if (
    (targetUser.role === 'admin' || targetUser.role === 'sub_admin') &&
    req.user?.role !== 'super_admin' &&
    req.user?.role !== 'admin'
  ) {
    res.status(403).json({ error: 'Only an authorized Admin or Super Admin can change administrator account status.' });
    return;
  }

  if (req.user?.role === 'sub_admin') {
    if (targetUser.role === 'student' && !req.user.permissions?.includes('manage_students')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to manage students.' });
      return;
    }
    if (targetUser.role === 'teacher' && !req.user.permissions?.includes('manage_teachers')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to manage teachers.' });
      return;
    }
  }

  targetUser.status = status;
  db.persist();

  res.json({
    message: `User ${targetUser.name} has been ${status === 'active' ? 'activated' : 'deactivated'}.`,
    user: sanitizeUser(targetUser),
  });
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/admin/users/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userIndex = db.users.findIndex((u) => u.id === req.params.id);
  if (userIndex === -1) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const targetUser = db.users[userIndex];

  // Super Admin cannot be deleted
  if (targetUser.role === 'super_admin') {
    res.status(400).json({ error: 'The Super Admin account cannot be deleted.' });
    return;
  }

  // Admin / Sub Admin can only be deleted by Admin or Super Admin
  if (targetUser.role === 'admin' || targetUser.role === 'sub_admin') {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Only an authorized Admin or Super Admin can delete an administrator account.' });
      return;
    }
  }

  // Permission checks for sub admins deleting students or teachers
  if (req.user?.role === 'sub_admin') {
    if (targetUser.role === 'student' && !req.user.permissions?.includes('manage_students')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to delete students.' });
      return;
    }
    if (targetUser.role === 'teacher' && !req.user.permissions?.includes('manage_teachers')) {
      res.status(403).json({ error: 'Access denied: You do not have permission to delete teachers.' });
      return;
    }
  }

  // Clean up student enrollments if student
  if (targetUser.role === 'student') {
    const updatedEnrollments = db.enrollments.filter((e) => e.student_id !== targetUser.id);
    (db as any).data.enrollments = updatedEnrollments;
  }

  db.users.splice(userIndex, 1);
  db.persist();

  res.json({
    message: `User ${targetUser.name} has been deleted from VisuaLearn.`,
    firebaseLimitationNotice:
      'Deleting a user from Firebase Authentication requires Firebase Admin SDK (a standard upgraded project with IAM).',
  });
});

// POST /api/admin/users/:id/reset-password - Admin password reset
router.post('/admin/users/:id/reset-password', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const targetUser = db.users.find((u) => u.id === req.params.id);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    return;
  }

  if (targetUser.role === 'super_admin' && req.user?.id !== targetUser.id) {
    res.status(403).json({ error: 'Only the Super Admin can reset their own password.' });
    return;
  }

  if (targetUser.role === 'sub_admin' && req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Only the Super Admin can reset Sub Admin passwords.' });
    return;
  }

  targetUser.password_hash = hashPassword(newPassword.trim());
  db.persist();

  res.json({ message: `Password for ${targetUser.name} has been reset successfully.` });
});

// ==========================================
// ADMIN SUBJECT & CLASS MANAGEMENT
// ==========================================

// GET /api/admin/subjects - All subjects with validated metadata & deduplicated enrollment counts
router.get('/admin/subjects', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const { verifiedUsers, validEnrollmentsBySubject } = getVerifiedAdminDataset();
  const verifiedUserMap = new Map(verifiedUsers.map((u) => [u.id, u]));

  const subjects = db.subjects.map((s) => {
    const teacher = s.teacher_id ? verifiedUserMap.get(s.teacher_id) : undefined;
    const isVerifiedTeacher = teacher?.role === 'teacher';
    const validClassEnrs = validEnrollmentsBySubject.get(s.id) || [];
    const chaptersCount = db.chapters.filter((c) => c.subject_id === s.id).length;
    const notesCount = db.notes.filter((n) => n.subject_id === s.id).length;
    const activeLive = db.liveClasses.some((lc) => lc.class_id === s.id && lc.status === 'live_now');

    return {
      ...s,
      teacher_name: isVerifiedTeacher ? teacher.name : s.teacher_name || 'Unassigned',
      teacher_email: isVerifiedTeacher ? teacher.email : undefined,
      teacherProfileVerified: isVerifiedTeacher,
      enrolledStudents: validClassEnrs.length,
      chaptersCount,
      notesCount,
      isLiveNow: activeLive,
    };
  });

  res.json({ subjects });
});

// POST /api/admin/subjects - Create a new subject/class
router.post('/admin/subjects', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const { name, description, teacher_id, section, color, iconName } = req.body;

  if (!name || !description) {
    res.status(400).json({ error: 'Subject name and description are required.' });
    return;
  }

  const { verifiedUsers } = getVerifiedAdminDataset();
  let assignedTeacherId = '';
  let assignedTeacherName = 'Unassigned';

  if (teacher_id && typeof teacher_id === 'string' && teacher_id.trim()) {
    const teacher = verifiedUsers.find((u) => u.id === teacher_id.trim() && u.role === 'teacher');
    if (!teacher) {
      res.status(400).json({ error: 'Selected instructor must be a valid registered teacher account.' });
      return;
    }
    assignedTeacherId = teacher.id;
    assignedTeacherName = teacher.name;
  }

  const cleanSection = (section || 'A1').trim().toUpperCase();
  const classCode = generateClassCode(name, cleanSection);

  const newSubject: Subject = {
    id: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    description: description.trim(),
    teacher_id: assignedTeacherId,
    teacher_name: assignedTeacherName,
    section: cleanSection,
    class_code: classCode,
    status: 'active',
    iconName: iconName || 'BookOpen',
    color: color || '#0ea5e9',
    thumbnail: '',
    created_at: new Date().toISOString(),
  };

  db.subjects.push(newSubject);
  db.persist();

  res.status(201).json({ message: 'Subject/Class created successfully.', subject: newSubject });
});

// PUT /api/admin/subjects/:id - Update subject/class details
router.put('/admin/subjects/:id', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const { name, description, teacher_id, section, status, color, iconName, class_code } = req.body;

  if (name) subject.name = name.trim();
  if (description) subject.description = description.trim();
  if (section) subject.section = section.trim().toUpperCase();
  if (status) subject.status = status;
  if (color) subject.color = color;
  if (iconName) subject.iconName = iconName;
  if (class_code) subject.class_code = class_code.trim().toUpperCase();

  if (teacher_id) {
    const { verifiedUsers } = getVerifiedAdminDataset();
    const teacher = verifiedUsers.find((u) => u.id === teacher_id && u.role === 'teacher');
    if (!teacher) {
      res.status(400).json({ error: 'Assigned instructor must be a verified teacher account.' });
      return;
    }
    subject.teacher_id = teacher.id;
    subject.teacher_name = teacher.name;
  }

  db.persist();

  res.json({ message: 'Subject updated successfully.', subject });
});

// DELETE /api/admin/subjects/:id - Delete subject/class
router.delete('/admin/subjects/:id', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const index = db.subjects.findIndex((s) => s.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const subject = db.subjects[index];

  // Cascade remove enrollments and live sessions for this subject
  (db as any).data.enrollments = db.enrollments.filter((e) => e.subject_id !== subject.id);
  (db as any).data.liveClasses = db.liveClasses.filter((lc) => lc.class_id !== subject.id);

  db.subjects.splice(index, 1);
  db.persist();

  res.json({ message: `Subject "${subject.name}" deleted successfully.` });
});

// POST /api/admin/subjects/:id/regenerate-code - Regenerate class code
router.post('/admin/subjects/:id/regenerate-code', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  subject.class_code = generateClassCode(subject.name, subject.section);
  db.persist();

  res.json({ message: 'Class code regenerated successfully.', class_code: subject.class_code });
});

// GET /api/admin/subjects/:id/enrollments - List verified students enrolled in a class
router.get('/admin/subjects/:id/enrollments', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const { verifiedUsers, validEnrollmentsBySubject } = getVerifiedAdminDataset();
  const validClassEnrs = validEnrollmentsBySubject.get(subject.id) || [];
  const enrolledStudentIds = new Set(validClassEnrs.map((e) => e.student_id));

  const verifiedStudents = verifiedUsers.filter((u) => u.role === 'student');
  const students = verifiedStudents
    .filter((u) => enrolledStudentIds.has(u.id))
    .map(sanitizeUser);

  const availableStudents = verifiedStudents
    .filter((u) => !enrolledStudentIds.has(u.id) && u.status !== 'disabled')
    .map(sanitizeUser);

  res.json({ enrolled: students, available: availableStudents });
});

// POST /api/admin/subjects/:id/enrollments - Enroll verified student
router.post('/admin/subjects/:id/enrollments', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found.' });
    return;
  }

  const { student_id } = req.body;
  const { verifiedUsers } = getVerifiedAdminDataset();
  const student = verifiedUsers.find((u) => u.id === student_id && u.role === 'student');
  if (!student) {
    res.status(404).json({ error: 'Verified student account not found.' });
    return;
  }
  if (student.status === 'disabled') {
    res.status(400).json({ error: 'Cannot enroll a disabled/suspended student account.' });
    return;
  }

  const alreadyEnrolled = db.enrollments.some((e) => e.student_id === student_id && e.subject_id === subject.id);
  if (alreadyEnrolled) {
    res.status(400).json({ error: 'Student is already enrolled in this subject.' });
    return;
  }

  const newEnrollment: Enrollment = {
    id: `enr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    student_id,
    subject_id: subject.id,
    joined_at: new Date().toISOString(),
  };

  db.enrollments.push(newEnrollment);
  db.persist();

  res.status(201).json({ message: `${student.name} enrolled in ${subject.name} successfully.` });
});

// DELETE /api/admin/subjects/:id/enrollments/:studentId - Unenroll student
router.delete('/admin/subjects/:id/enrollments/:studentId', requirePermission('manage_subjects_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const { id: subjectId, studentId } = req.params;

  const enrIndex = db.enrollments.findIndex((e) => e.subject_id === subjectId && e.student_id === studentId);
  if (enrIndex === -1) {
    res.status(404).json({ error: 'Enrollment record not found.' });
    return;
  }

  db.enrollments.splice(enrIndex, 1);
  db.persist();

  res.json({ message: 'Student unenrolled successfully.' });
});

// ==========================================
// ADMIN LIVE CLASS MANAGEMENT
// ==========================================

// GET /api/admin/live-classes - All live classes and sessions
router.get('/admin/live-classes', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const liveClasses = db.liveClasses.map((lc) => {
    const subject = db.subjects.find((s) => s.id === lc.class_id);
    const teacher = db.users.find((u) => u.id === lc.teacher_id);
    return {
      ...lc,
      subject_name: subject?.name || lc.subject_name || 'General STEM',
      teacher_name: teacher?.name || lc.teacher_name,
    };
  });

  res.json({ liveClasses });
});

// POST /api/admin/live-classes/:id/end - Force end live session
router.post('/admin/live-classes/:id/end', requirePermission('manage_live_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const liveClass = db.liveClasses.find((lc) => lc.id === req.params.id);
  if (!liveClass) {
    res.status(404).json({ error: 'Live class not found.' });
    return;
  }

  liveClass.status = 'ended';
  liveClass.ended_at = new Date().toISOString();

  // Close socket room
  try {
    closeRoomByClassId(liveClass.class_id);
  } catch {
    // ignore
  }

  db.persist();

  res.json({ message: 'Live class terminated by administrator.', liveClass });
});

// DELETE /api/admin/live-classes/:id - Delete / cancel live class
router.delete('/admin/live-classes/:id', requirePermission('manage_live_classes'), (req: AuthenticatedRequest, res: Response): void => {
  const index = db.liveClasses.findIndex((lc) => lc.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Live class not found.' });
    return;
  }

  const target = db.liveClasses[index];
  try {
    closeRoomByClassId(target.class_id);
  } catch {
    // ignore
  }

  db.liveClasses.splice(index, 1);
  db.persist();

  res.json({ message: 'Live class cancelled and removed.' });
});

// ==========================================
// ADMIN CONTENT MANAGEMENT
// ==========================================

// GET /api/admin/content/notes - All notes
router.get('/admin/content/notes', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const notes = db.notes.map((n) => {
    const subject = db.subjects.find((s) => s.id === n.subject_id);
    const chapter = db.chapters.find((c) => c.id === n.chapter_id);
    return {
      ...n,
      subjectName: subject?.name || 'General',
      chapterTitle: chapter?.title || 'Overview',
    };
  });
  res.json({ notes });
});

// DELETE /api/admin/content/notes/:id - Delete note
router.delete('/admin/content/notes/:id', requirePermission('manage_content'), (req: AuthenticatedRequest, res: Response): void => {
  const index = db.notes.findIndex((n) => n.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  const note = db.notes[index];
  db.notes.splice(index, 1);
  db.persist();

  res.json({ message: `Note "${note.title}" deleted successfully.` });
});

// GET /api/admin/content/quizzes - All quizzes
router.get('/admin/content/quizzes', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const quizzes = db.quizzes.map((q) => {
    const subtopic = db.subtopics.find((st) => st.id === q.subtopic_id);
    const chapter = subtopic ? db.chapters.find((c) => c.id === subtopic.chapter_id) : null;
    const subject = chapter ? db.subjects.find((s) => s.id === chapter.subject_id) : null;
    return {
      ...q,
      questionsCount: q.questions.length,
      subtopicTitle: subtopic?.title,
      subjectName: subject?.name,
    };
  });
  res.json({ quizzes });
});

// DELETE /api/admin/content/quizzes/:id - Delete quiz
router.delete('/admin/content/quizzes/:id', requirePermission('manage_content'), (req: AuthenticatedRequest, res: Response): void => {
  const index = db.quizzes.findIndex((q) => q.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const quiz = db.quizzes[index];
  db.quizzes.splice(index, 1);
  db.persist();

  res.json({ message: `Quiz "${quiz.title}" deleted successfully.` });
});

// ==========================================
// ADMIN SYSTEM SETTINGS (SUPER ADMIN ONLY)
// ==========================================

// GET /api/admin/settings - Read system settings
router.get('/admin/settings', requireSuperAdmin, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ settings: db.settings });
});

// PUT /api/admin/settings - Update system settings
router.put('/admin/settings', requireSuperAdmin, (req: AuthenticatedRequest, res: Response): void => {
  const updates = req.body;
  // Always lock maxSubAdmins to 4 or validate integer <= 4
  if (updates.maxSubAdmins !== undefined) {
    updates.maxSubAdmins = Math.min(4, Math.max(1, Number(updates.maxSubAdmins) || 4));
  }
  const updated = db.updateSettings(updates);
  res.json({ message: 'System settings saved successfully.', settings: updated });
});

// ==========================================
// 8. INTERACTIVE SIMULATIONS (Requirement #1)
// ==========================================

// GET /api/simulations - List all simulations
router.get('/simulations', (req: Request, res: Response): void => {
  const { subject_id, category, search } = req.query as { subject_id?: string; category?: string; search?: string };
  let list = [...db.simulations];

  if (subject_id) {
    list = list.filter((s) => !s.subject_id || s.subject_id === subject_id);
  }
  if (category) {
    list = list.filter((s) => s.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }

  res.json({ simulations: list });
});

// GET /api/simulations/:id - Get simulation details
router.get('/simulations/:id', (req: Request, res: Response): void => {
  const sim = db.simulations.find((s) => s.id === req.params.id);
  if (!sim) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }
  res.json({ simulation: sim });
});

// POST /api/simulations - Teacher/Admin creates simulation
router.post('/simulations', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { title, description, type, category, subject_id, chapter_id, topic_id, subtopic_id, instructions, default_config } = req.body;
  if (!title || !type) {
    res.status(400).json({ error: 'Title and type are required.' });
    return;
  }

  const newSim: SimulationItem = {
    id: `sim_${crypto.randomUUID().slice(0, 8)}`,
    title: title.trim(),
    description: (description || '').trim(),
    type: type || 'physics_motion',
    category: category || 'Physics',
    subject_id: subject_id || undefined,
    chapter_id: chapter_id || undefined,
    topic_id: topic_id || undefined,
    subtopic_id: subtopic_id || undefined,
    created_by: req.user!.id,
    instructions: instructions || 'Adjust parameters and click Run to observe real-time calculations.',
    default_config: default_config || {},
    created_at: new Date().toISOString(),
  };

  db.simulations.push(newSim);
  db.persist();

  res.status(201).json({ message: 'Simulation created successfully.', simulation: newSim });
});

// PUT /api/simulations/:id - Teacher/Admin updates simulation
router.put('/simulations/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const sim = db.simulations.find((s) => s.id === req.params.id);
  if (!sim) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }

  const { title, description, instructions, default_config, subject_id, chapter_id, topic_id, subtopic_id } = req.body;
  if (title) sim.title = title.trim();
  if (description !== undefined) sim.description = description.trim();
  if (instructions !== undefined) sim.instructions = instructions.trim();
  if (default_config) sim.default_config = { ...sim.default_config, ...default_config };
  if (subject_id !== undefined) sim.subject_id = subject_id || undefined;
  if (chapter_id !== undefined) sim.chapter_id = chapter_id || undefined;
  if (topic_id !== undefined) sim.topic_id = topic_id || undefined;
  if (subtopic_id !== undefined) sim.subtopic_id = subtopic_id || undefined;

  db.persist();
  res.json({ message: 'Simulation updated successfully.', simulation: sim });
});

// DELETE /api/simulations/:id - Teacher/Admin deletes simulation
router.delete('/simulations/:id', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const idx = db.simulations.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }

  db.simulations.splice(idx, 1);
  db.persist();
  res.json({ message: 'Simulation deleted successfully.' });
});

// POST /api/simulations/:id/progress - Student records simulation activity
router.post('/simulations/:id/progress', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const sim = db.simulations.find((s) => s.id === req.params.id);
  if (!sim) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }

  const studentId = req.user!.id;
  const { time_spent_seconds, completed, parameters } = req.body;

  let prog = db.simulationProgress.find((p) => p.student_id === studentId && p.simulation_id === sim.id);
  if (!prog) {
    prog = {
      id: `sprog_${crypto.randomUUID().slice(0, 8)}`,
      student_id: studentId,
      simulation_id: sim.id,
      subject_id: sim.subject_id,
      time_spent_seconds: Number(time_spent_seconds) || 15,
      runs_count: 1,
      completed: !!completed,
      last_parameters: parameters,
      last_activity_at: new Date().toISOString(),
    };
    db.simulationProgress.push(prog);
  } else {
    prog.time_spent_seconds += Number(time_spent_seconds) || 10;
    prog.runs_count += 1;
    if (completed) prog.completed = true;
    if (parameters) prog.last_parameters = parameters;
    prog.last_activity_at = new Date().toISOString();
  }

  // If simulation is linked to a subtopic, mark interactive_explored = true in StudentProgress
  if (sim.subtopic_id) {
    const studentProg = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === sim.subtopic_id);
    if (studentProg) {
      studentProg.interactive_explored = true;
      studentProg.last_activity_at = new Date().toISOString();
    }
  }

  db.persist();
  res.json({ message: 'Simulation progress recorded.', progress: prog });
});

// GET /api/simulations/student/progress - Student gets their simulation history
router.get('/simulations/student/progress', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const list = db.simulationProgress.filter((p) => p.student_id === req.user!.id);
  res.json({ progress: list });
});

// ==========================================
// 9. FACULTY NOTES SECURITY (Requirement #2)
// ==========================================

// In-memory token cache for single-use temporary downloads
interface TempDownloadToken {
  token: string;
  material_id: string;
  user_id: string;
  expires_at: number;
}
const tempDownloadTokens = new Map<string, TempDownloadToken>();

// GET /api/materials/:id/secure-access - Authenticated document viewer access & verification
router.get('/materials/:id/secure-access', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const user = req.user!;

  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  const subject = db.subjects.find((s) => s.id === material.subject_id);

  // Authorization check:
  // If student: must be enrolled in the subject
  if (user.role === 'student') {
    if (material.subject_id && !isStudentEnrolled(user.id, material.subject_id)) {
      res.status(403).json({
        error: 'Access Denied: You must be enrolled in this class to access protected faculty notes.',
      });
      return;
    }
  }

  // Audit log of material access
  const accessLog: MaterialAccessLog = {
    id: `log_${crypto.randomUUID().slice(0, 8)}`,
    material_id: material.id,
    material_title: material.title,
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    action: 'view',
    ip: req.ip || '',
    timestamp: new Date().toISOString(),
  };
  db.materialAccessLogs.push(accessLog);

  // If student views notes, update StudentProgress.notes_viewed if tied to subtopic
  if (user.role === 'student' && material.subtopic_id) {
    const studentProg = db.progress.find((p) => p.student_id === user.id && p.subtopic_id === material.subtopic_id);
    if (studentProg) {
      studentProg.notes_viewed = true;
      studentProg.last_activity_at = new Date().toISOString();
    }
  }
  db.persist();

  res.json({
    message: 'Access authorized.',
    material,
    watermark: {
      studentName: user.name,
      studentId: user.studentId || user.id,
      subjectName: subject?.name || 'Class Material',
    },
    fileUrl: material.storage_path ? `/api/materials/${material.id}/stream` : (material.file_url || ''),
  });
});

// GET /api/materials/:id/stream - Authenticated file streaming
router.get('/materials/:id/stream', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const user = req.user!;

  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  if (user.role === 'student' && material.subject_id && !isStudentEnrolled(user.id, material.subject_id)) {
    res.status(403).json({ error: 'Access Denied: You must be enrolled in this class to access this document.' });
    return;
  }

  if (!material.storage_path) {
    res.status(404).json({ error: 'No document file stored for this material.' });
    return;
  }

  const filePath = path.resolve(uploadsDir, material.storage_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Document file missing on disk.' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(material.file_name || 'document.pdf')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

// POST /api/materials/:id/download-token - Request short-lived single-use download token
router.post('/materials/:id/download-token', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { id } = req.params;
  const user = req.user!;

  const material = db.materials.find((m) => m.id === id);
  if (!material) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  if (user.role === 'student' && material.subject_id && !isStudentEnrolled(user.id, material.subject_id)) {
    res.status(403).json({ error: 'Access Denied: You are not authorized to download this file.' });
    return;
  }

  // Generate 2-minute temporary cryptographic token
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 120 * 1000; // 2 minutes

  tempDownloadTokens.set(token, {
    token,
    material_id: material.id,
    user_id: user.id,
    expires_at: expiresAt,
  });

  // Cleanup old tokens
  for (const [k, v] of tempDownloadTokens.entries()) {
    if (v.expires_at < Date.now()) tempDownloadTokens.delete(k);
  }

  res.json({
    token,
    expires_in: 120,
    download_url: `/api/materials/${material.id}/secure-download?token=${token}`,
  });
});

// GET /api/materials/:id/secure-download - Authenticated download using temporary token
router.get('/materials/:id/secure-download', (req: Request, res: Response): void => {
  const { id } = req.params;
  const token = req.query.token as string;

  if (!token) {
    res.status(401).json({ error: 'Download token required.' });
    return;
  }

  const tokenEntry = tempDownloadTokens.get(token);
  if (!tokenEntry || tokenEntry.material_id !== id || tokenEntry.expires_at < Date.now()) {
    res.status(403).json({ error: 'Download token is invalid or has expired.' });
    return;
  }

  // Invalidate token immediately (single use)
  tempDownloadTokens.delete(token);

  const material = db.materials.find((m) => m.id === id);
  if (!material || !material.storage_path) {
    res.status(404).json({ error: 'Document file not found.' });
    return;
  }

  const filePath = path.resolve(uploadsDir, material.storage_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on server.' });
    return;
  }

  // Log download audit event
  const downloadingUser = db.users.find((u) => u.id === tokenEntry.user_id);
  const log: MaterialAccessLog = {
    id: `log_${crypto.randomUUID().slice(0, 8)}`,
    material_id: material.id,
    material_title: material.title,
    user_id: tokenEntry.user_id,
    user_name: downloadingUser?.name || 'User',
    user_role: downloadingUser?.role || 'student',
    action: 'download',
    ip: req.ip || '',
    timestamp: new Date().toISOString(),
  };
  db.materialAccessLogs.push(log);
  db.persist();

  const downloadName = encodeURIComponent(material.file_name || 'document.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.sendFile(filePath);
});

// GET /api/materials/access-logs - Teacher/Admin views audit log
router.get('/materials/access-logs', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const { material_id } = req.query as { material_id?: string };
  let logs = [...db.materialAccessLogs];

  if (material_id) {
    logs = logs.filter((l) => l.material_id === material_id);
  }

  res.json({ logs: logs.slice(-100).reverse() });
});

// ==========================================
// 10. SMART STUDY SYSTEM (Requirement #3)
// ==========================================

// GET /api/smart-study/plans - Student views their study plans
router.get('/smart-study/plans', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const studentId = req.user!.id;
  const { status, subject_id } = req.query as { status?: string; subject_id?: string };

  let plans = db.smartStudyPlans.filter((p) => p.student_id === studentId);

  if (status) {
    plans = plans.filter((p) => p.status === status);
  }
  if (subject_id) {
    plans = plans.filter((p) => p.subject_id === subject_id);
  }

  res.json({ plans: plans.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) });
});

// GET /api/smart-study/plans/:id - Get specific plan details
router.get('/smart-study/plans/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const plan = db.smartStudyPlans.find((p) => p.id === req.params.id && p.student_id === req.user!.id);
  if (!plan) {
    res.status(404).json({ error: 'Smart Study Plan not found.' });
    return;
  }
  res.json({ plan });
});

// POST /api/smart-study/plans/:id/steps/:stepId/complete - Mark step complete
router.post('/smart-study/plans/:id/steps/:stepId/complete', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const plan = db.smartStudyPlans.find((p) => p.id === req.params.id && p.student_id === req.user!.id);
  if (!plan) {
    res.status(404).json({ error: 'Smart Study Plan not found.' });
    return;
  }

  const step = plan.steps.find((s) => s.id === req.params.stepId);
  if (!step) {
    res.status(404).json({ error: 'Step not found.' });
    return;
  }

  step.completed = true;
  step.completed_at = new Date().toISOString();

  const completedStepsCount = plan.steps.filter((s) => s.completed).length;
  plan.progress_percentage = Math.round((completedStepsCount / plan.steps.length) * 100);
  plan.updated_at = new Date().toISOString();

  const allCompleted = completedStepsCount === plan.steps.length;
  if (allCompleted) {
    plan.status = 'completed';
    plan.completed_at = new Date().toISOString();
  } else if (plan.status === 'not_started') {
    plan.status = 'in_progress';
  }

  db.persist();
  res.json({ message: 'Step completed.', plan, allCompleted });
});

// GET /api/teacher/smart-study/overview - Teacher views study plans of students in their classes
router.get('/teacher/smart-study/overview', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const teacherId = req.user!.id;
  const teacherSubjects = db.subjects.filter((s) => s.teacher_id === teacherId).map((s) => s.id);

  const plans = db.smartStudyPlans.filter((p) => teacherSubjects.includes(p.subject_id));
  res.json({ plans });
});

// ==========================================
// 11. PROGRESS ANALYTICS (Requirement #4, #5, #6)
// ==========================================

// POST /api/analytics/video-progress - Track real video watch progress
router.post('/analytics/video-progress', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const studentId = req.user!.id;
  const { material_id, subtopic_id, last_position_seconds, duration_seconds, completion_percentage } = req.body;

  if (!material_id) {
    res.status(400).json({ error: 'Material ID is required.' });
    return;
  }

  const mat = db.materials.find((m) => m.id === material_id);
  const subtopicId = subtopic_id || mat?.subtopic_id;
  const subjectId = mat?.subject_id;

  const lastPos = Math.max(0, Math.round(Number(last_position_seconds) || 0));
  const dur = Math.max(1, Math.round(Number(duration_seconds) || 1));
  const calcPercent = Math.min(100, Math.max(0, Math.round((lastPos / dur) * 100)));
  const compPercent = Math.max(calcPercent, Math.round(Number(completion_percentage) || 0));
  const isCompleted = compPercent >= 90; // 90% threshold for video completion

  let vp = db.videoProgress.find((v) => v.student_id === studentId && v.material_id === material_id);
  if (!vp) {
    vp = {
      id: `vprog_${crypto.randomUUID().slice(0, 8)}`,
      student_id: studentId,
      material_id,
      subtopic_id: subtopicId,
      subject_id: subjectId,
      last_position_seconds: lastPos,
      duration_seconds: dur,
      completion_percentage: compPercent,
      completed: isCompleted,
      updated_at: new Date().toISOString(),
    };
    db.videoProgress.push(vp);
  } else {
    vp.last_position_seconds = lastPos;
    vp.duration_seconds = Math.max(vp.duration_seconds, dur);
    vp.completion_percentage = Math.max(vp.completion_percentage, compPercent);
    if (isCompleted) vp.completed = true;
    vp.updated_at = new Date().toISOString();
  }

  // Also sync with StudentProgress for subtopic if applicable
  if (subtopicId) {
    let sp = db.progress.find((p) => p.student_id === studentId && p.subtopic_id === subtopicId);
    if (sp) {
      sp.video_progress = Math.max(sp.video_progress, compPercent);
      sp.video_last_seconds = lastPos;
      if (isCompleted && sp.notes_viewed && sp.quiz_passed) {
        sp.completed = true;
      }
      sp.last_activity_at = new Date().toISOString();
    }
  }

  db.persist();
  res.json({ message: 'Video progress recorded.', videoProgress: vp, overallCompleted: isCompleted });
});

// GET /api/analytics/student - Complete student progress analytics based on REAL data
router.get('/analytics/student', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const studentId = req.user!.id;

  const enrollments = db.enrollments.filter((e) => e.student_id === studentId);
  const enrolledSubjectIds = enrollments.map((e) => e.subject_id);

  // Subject Progress
  const subjects_progress = enrolledSubjectIds
    .map((sId) => {
      const subj = db.subjects.find((s) => s.id === sId);
      if (!subj) return null;
      const chaps = db.chapters.filter((c) => c.subject_id === sId);
      const chapIds = chaps.map((c) => c.id);
      const subs = db.subtopics.filter((st) => chapIds.includes(st.chapter_id));
      const studentProgs = db.progress.filter((p) => p.student_id === studentId && p.subject_id === sId);
      const completedCount = studentProgs.filter((p) => p.completed).length;
      const progressPercent = subs.length > 0 ? Math.round((completedCount / subs.length) * 100) : 0;

      return {
        subject_id: sId,
        subject_name: subj.name,
        progress: progressPercent,
        completed_subtopics: completedCount,
        total_subtopics: subs.length,
        chapter_count: chaps.length,
      };
    })
    .filter(Boolean) as any[];

  // Overall progress
  const overall_progress =
    subjects_progress.length > 0
      ? Math.round(subjects_progress.reduce((acc, curr) => acc + curr.progress, 0) / subjects_progress.length)
      : 0;

  // Chapter Mastery
  const chapters_mastery = enrolledSubjectIds.flatMap((sId) => {
    const subj = db.subjects.find((s) => s.id === sId);
    const chaps = db.chapters.filter((c) => c.subject_id === sId);

    return chaps.map((chap) => {
      const subs = db.subtopics.filter((st) => st.chapter_id === chap.id);
      const studentProgs = db.progress.filter((p) => p.student_id === studentId && p.chapter_id === chap.id);
      const completedCount = studentProgs.filter((p) => p.completed).length;

      // Quiz performance in this chapter
      const chapQuizzes = db.quizzes.filter((q) => q.chapter_id === chap.id);
      const chapQuizIds = chapQuizzes.map((q) => q.id);
      const quizSubs = db.quizSubmissions.filter((qs) => qs.student_id === studentId && chapQuizIds.includes(qs.quiz_id));
      const avgQuizScore = quizSubs.length > 0 ? Math.round(quizSubs.reduce((acc, q) => acc + q.score, 0) / quizSubs.length) : 0;

      // Real weighted mastery: 50% subtopics completed + 50% quiz performance
      const subtopicRate = subs.length > 0 ? (completedCount / subs.length) * 100 : 0;
      let mastery_percentage = 0;
      if (subs.length > 0 && quizSubs.length > 0) {
        mastery_percentage = Math.round(subtopicRate * 0.5 + avgQuizScore * 0.5);
      } else if (subs.length > 0) {
        mastery_percentage = Math.round(subtopicRate);
      } else if (quizSubs.length > 0) {
        mastery_percentage = avgQuizScore;
      }

      let status: 'Needs Attention' | 'Developing' | 'Good Progress' | 'Mastered' = 'Needs Attention';
      if (mastery_percentage >= 80) status = 'Mastered';
      else if (mastery_percentage >= 60) status = 'Good Progress';
      else if (mastery_percentage >= 40) status = 'Developing';

      return {
        chapter_id: chap.id,
        chapter_title: chap.title,
        subject_id: sId,
        subject_name: subj?.name || 'Class',
        mastery_percentage,
        status,
        subtopics_completed: completedCount,
        total_subtopics: subs.length,
        avg_quiz_score: avgQuizScore,
      };
    });
  });

  // Video Analytics
  const studentVideos = db.videoProgress.filter((v) => v.student_id === studentId);
  const enrolledMats = db.materials.filter((m) => m.type === 'video' && enrolledSubjectIds.includes(m.subject_id));
  const videosCompletedCount = studentVideos.filter((v) => v.completed).length;
  const totalWatchSec = studentVideos.reduce((acc, v) => acc + v.last_position_seconds, 0);
  const overallVideoCompPercent =
    studentVideos.length > 0
      ? Math.round(studentVideos.reduce((acc, v) => acc + v.completion_percentage, 0) / studentVideos.length)
      : 0;

  const recent_videos = studentVideos.slice(-5).reverse().map((v) => {
    const mat = db.materials.find((m) => m.id === v.material_id);
    const subj = db.subjects.find((s) => s.id === v.subject_id || s.id === mat?.subject_id);
    return {
      material_id: v.material_id,
      title: mat?.title || 'Lecture Video',
      subject_name: subj?.name || 'Class',
      last_position_seconds: v.last_position_seconds,
      duration_seconds: v.duration_seconds,
      completion_percentage: v.completion_percentage,
      completed: v.completed,
    };
  });

  // Quiz Analytics
  const quizSubs = db.quizSubmissions.filter((qs) => qs.student_id === studentId);
  const scores = quizSubs.map((q) => q.score);
  const avgQuiz = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const maxQuiz = scores.length > 0 ? Math.max(...scores) : 0;
  const minQuiz = scores.length > 0 ? Math.min(...scores) : 0;

  const recent_quizzes = quizSubs.slice(-6).reverse().map((qs) => {
    const qz = db.quizzes.find((q) => q.id === qs.quiz_id);
    const subj = db.subjects.find((s) => s.id === qs.subject_id || s.id === qz?.subject_id);
    return {
      quiz_id: qs.quiz_id,
      quiz_title: qz?.title || 'Subject Quiz',
      subject_name: subj?.name || 'Class',
      score: qs.score,
      passed: qs.passed,
      submitted_at: qs.submitted_at,
    };
  });

  // Assignment Analytics
  const asgSubs = db.assignmentSubmissions.filter((a) => a.student_id === studentId);
  const gradedAsgs = asgSubs.filter((a) => a.status === 'graded');
  const avgMarks = gradedAsgs.length > 0 ? Math.round(gradedAsgs.reduce((acc, a) => acc + (a.marks || 0), 0) / gradedAsgs.length) : 0;

  // Learning Analytics
  const studentProgsAll = db.progress.filter((p) => p.student_id === studentId);
  const notesViewedCount = studentProgsAll.filter((p) => p.notes_viewed).length;
  const simProgs = db.simulationProgress.filter((p) => p.student_id === studentId);
  const simCompletedCount = simProgs.filter((p) => p.completed).length;
  const plans = db.smartStudyPlans.filter((p) => p.student_id === studentId);
  const plansCompleted = plans.filter((p) => p.status === 'completed').length;
  const activePlans = plans.filter((p) => p.status !== 'completed').length;

  const weakTopics = Array.from(new Set(plans.filter((p) => p.status !== 'completed').map((p) => p.topic_title || 'General Topic')));
  const masteredTopics = chapters_mastery.filter((c) => c.status === 'Mastered').map((c) => c.chapter_title);

  const analytics: StudentAnalyticsData = {
    overall_progress,
    subjects_progress,
    chapters_mastery,
    video_analytics: {
      videos_completed: videosCompletedCount,
      total_videos: Math.max(enrolledMats.length, studentVideos.length),
      overall_completion_percentage: overallVideoCompPercent,
      total_watch_time_seconds: totalWatchSec,
      recent_videos,
    },
    quiz_analytics: {
      average_score: avgQuiz,
      highest_score: maxQuiz,
      lowest_score: minQuiz,
      total_attempts: quizSubs.length,
      passed_attempts: quizSubs.filter((q) => q.passed).length,
      recent_quizzes,
    },
    assignment_analytics: {
      total_assignments: asgSubs.length,
      submitted: asgSubs.length,
      graded: gradedAsgs.length,
      average_marks: avgMarks,
    },
    learning_analytics: {
      notes_viewed: notesViewedCount,
      simulations_completed: simCompletedCount,
      study_plans_completed: plansCompleted,
      active_study_plans: activePlans,
      mastered_topics: masteredTopics,
      weak_topics: weakTopics,
    },
  };

  res.json({ analytics });
});

// GET /api/analytics/teacher/classes - Teacher views analytics across their assigned subjects & classes
router.get('/analytics/teacher/classes', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const teacherId = req.user!.id;
  const teacherSubjects = db.subjects.filter((s) => s.teacher_id === teacherId);

  const classes: TeacherClassAnalytics[] = teacherSubjects.map((subj) => {
    const enrollments = db.enrollments.filter((e) => e.subject_id === subj.id);
    const studentIds = enrollments.map((e) => e.student_id);

    // Subtopics in this subject
    const chaps = db.chapters.filter((c) => c.subject_id === subj.id);
    const chapIds = chaps.map((c) => c.id);
    const subtopics = db.subtopics.filter((st) => chapIds.includes(st.chapter_id));

    // Progress
    const subjProgs = db.progress.filter((p) => p.subject_id === subj.id && studentIds.includes(p.student_id));
    const totalPossible = subtopics.length * Math.max(1, studentIds.length);
    const completedCount = subjProgs.filter((p) => p.completed).length;
    const avgProg = totalPossible > 0 ? Math.round((completedCount / totalPossible) * 100) : 0;

    // Quiz scores
    const quizSubs = db.quizSubmissions.filter((qs) => (qs.subject_id === subj.id || qs.class_id === subj.id) && studentIds.includes(qs.student_id));
    const avgQuiz = quizSubs.length > 0 ? Math.round(quizSubs.reduce((a, b) => a + b.score, 0) / quizSubs.length) : 0;

    // Assignments
    const asgs = db.assignments.filter((a) => a.subject_id === subj.id);
    const asgIds = asgs.map((a) => a.id);
    const asgSubs = db.assignmentSubmissions.filter((as) => asgIds.includes(as.assignment_id));
    const expectedSubmissions = asgs.length * Math.max(1, studentIds.length);
    const asgRate = expectedSubmissions > 0 ? Math.round((asgSubs.length / expectedSubmissions) * 100) : 0;

    // Video completion
    const vProgs = db.videoProgress.filter((v) => (v.subject_id === subj.id) && studentIds.includes(v.student_id));
    const videoRate = vProgs.length > 0 ? Math.round(vProgs.reduce((a, b) => a + b.completion_percentage, 0) / vProgs.length) : 0;

    // Simulations
    const simProgs = db.simulationProgress.filter((sp) => sp.subject_id === subj.id && studentIds.includes(sp.student_id));

    // Chapter mastery
    const chapter_mastery = chaps.map((c) => {
      const cSubs = db.subtopics.filter((st) => st.chapter_id === c.id);
      const cProgs = subjProgs.filter((p) => p.chapter_id === c.id);
      const cComp = cProgs.filter((p) => p.completed).length;
      const cPossible = cSubs.length * Math.max(1, studentIds.length);
      const mastery = cPossible > 0 ? Math.round((cComp / cPossible) * 100) : 0;

      let status = 'Needs Attention';
      if (mastery >= 80) status = 'Mastered';
      else if (mastery >= 60) status = 'Good Progress';
      else if (mastery >= 40) status = 'Developing';

      return {
        chapter_id: c.id,
        chapter_title: c.title,
        mastery,
        status,
      };
    });

    // Weak topics computed strictly from real active remediation plans & real quiz scores
    const plans = db.smartStudyPlans.filter((p) => p.subject_id === subj.id && p.status !== 'completed');
    const topicMap = new Map<string, { count: number; scores: number[] }>();
    plans.forEach((p) => {
      const t = p.topic_title || 'Core Topic';
      const entry = topicMap.get(t) || { count: 0, scores: [] };
      entry.count += 1;
      if (typeof (p as any).quiz_score === 'number') {
        entry.scores.push((p as any).quiz_score);
      } else if (typeof (p as any).trigger_score === 'number') {
        entry.scores.push((p as any).trigger_score);
      }
      topicMap.set(t, entry);
    });
    const weak_topics = Array.from(topicMap.entries()).map(([topic_title, entry]) => ({
      topic_title,
      students_struggling_count: entry.count,
      avg_score:
        entry.scores.length > 0
          ? Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length)
          : avgQuiz,
    }));

    // Student breakdown
    const students = studentIds.map((sId) => {
      const stUser = db.users.find((u) => u.id === sId);
      const stProgs = subjProgs.filter((p) => p.student_id === sId);
      const stCompleted = stProgs.filter((p) => p.completed).length;
      const stProgress = subtopics.length > 0 ? Math.round((stCompleted / subtopics.length) * 100) : 0;
      const stQuizSubs = quizSubs.filter((qs) => qs.student_id === sId);
      const stAvgQuiz = stQuizSubs.length > 0 ? Math.round(stQuizSubs.reduce((a, b) => a + b.score, 0) / stQuizSubs.length) : 0;
      const stAsgCount = asgSubs.filter((a) => a.student_id === sId).length;
      const stVideos = vProgs.filter((v) => v.student_id === sId && v.completed).length;
      const stSims = simProgs.filter((s) => s.student_id === sId && s.completed).length;
      const hasActivePlan = plans.some((p) => p.student_id === sId);

      return {
        student_id: sId,
        student_name: stUser?.name || 'Student',
        student_email: stUser?.email || '',
        progress: stProgress,
        avg_quiz_score: stAvgQuiz,
        assignments_submitted: stAsgCount,
        videos_completed: stVideos,
        simulations_completed: stSims,
        has_active_smart_study: hasActivePlan,
      };
    });

    return {
      subject_id: subj.id,
      subject_name: subj.name,
      section: subj.section || 'A1',
      total_students: studentIds.length,
      average_progress: avgProg,
      average_quiz_score: avgQuiz,
      assignment_completion_rate: asgRate,
      video_completion_rate: videoRate,
      simulations_completed_count: simProgs.filter((s) => s.completed).length,
      chapter_mastery,
      weak_topics,
      students,
    };
  });

  res.json({ classes });
});

// GET /api/analytics/teacher/student/:studentId - Teacher inspects specific student in their class
router.get('/analytics/teacher/student/:studentId', requireTeacher, (req: AuthenticatedRequest, res: Response): void => {
  const teacherId = req.user!.id;
  const { studentId } = req.params;

  const student = db.users.find((u) => u.id === studentId);
  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  // Verify authorization: student must be in one of this teacher's classes
  const teacherSubjectIds = db.subjects.filter((s) => s.teacher_id === teacherId).map((s) => s.id);
  const enrolledInTeacherSubject = db.enrollments.some((e) => e.student_id === studentId && teacherSubjectIds.includes(e.subject_id));

  if (!enrolledInTeacherSubject && req.user!.role !== 'super_admin') {
    res.status(403).json({ error: 'Access Denied: This student is not enrolled in your classes.' });
    return;
  }

  // Return computed student analytics
  const enrollments = db.enrollments.filter((e) => e.student_id === studentId && teacherSubjectIds.includes(e.subject_id));
  const enrolledSubjectIds = enrollments.map((e) => e.subject_id);

  const subjects_progress = enrolledSubjectIds
    .map((sId) => {
      const subj = db.subjects.find((s) => s.id === sId);
      if (!subj) return null;
      const chaps = db.chapters.filter((c) => c.subject_id === sId);
      const chapIds = chaps.map((c) => c.id);
      const subs = db.subtopics.filter((st) => chapIds.includes(st.chapter_id));
      const studentProgs = db.progress.filter((p) => p.student_id === studentId && p.subject_id === sId);
      const completedCount = studentProgs.filter((p) => p.completed).length;
      const progressPercent = subs.length > 0 ? Math.round((completedCount / subs.length) * 100) : 0;

      return {
        subject_id: sId,
        subject_name: subj.name,
        progress: progressPercent,
        completed_subtopics: completedCount,
        total_subtopics: subs.length,
        chapter_count: chaps.length,
      };
    })
    .filter(Boolean) as any[];

  const overall_progress =
    subjects_progress.length > 0
      ? Math.round(subjects_progress.reduce((acc, curr) => acc + curr.progress, 0) / subjects_progress.length)
      : 0;

  const chapters_mastery = enrolledSubjectIds.flatMap((sId) => {
    const subj = db.subjects.find((s) => s.id === sId);
    const chaps = db.chapters.filter((c) => c.subject_id === sId);

    return chaps.map((chap) => {
      const subs = db.subtopics.filter((st) => st.chapter_id === chap.id);
      const studentProgs = db.progress.filter((p) => p.student_id === studentId && p.chapter_id === chap.id);
      const completedCount = studentProgs.filter((p) => p.completed).length;
      const chapQuizzes = db.quizzes.filter((q) => q.chapter_id === chap.id);
      const chapQuizIds = chapQuizzes.map((q) => q.id);
      const quizSubs = db.quizSubmissions.filter((qs) => qs.student_id === studentId && chapQuizIds.includes(qs.quiz_id));
      const avgQuizScore = quizSubs.length > 0 ? Math.round(quizSubs.reduce((acc, q) => acc + q.score, 0) / quizSubs.length) : 0;
      const subtopicRate = subs.length > 0 ? (completedCount / subs.length) * 100 : 0;

      let mastery_percentage = Math.round(subtopicRate * 0.5 + avgQuizScore * 0.5);
      let status: 'Needs Attention' | 'Developing' | 'Good Progress' | 'Mastered' = 'Needs Attention';
      if (mastery_percentage >= 80) status = 'Mastered';
      else if (mastery_percentage >= 60) status = 'Good Progress';
      else if (mastery_percentage >= 40) status = 'Developing';

      return {
        chapter_id: chap.id,
        chapter_title: chap.title,
        subject_id: sId,
        subject_name: subj?.name || 'Class',
        mastery_percentage,
        status,
        subtopics_completed: completedCount,
        total_subtopics: subs.length,
        avg_quiz_score: avgQuizScore,
      };
    });
  });

  const studentVideos = db.videoProgress.filter((v) => v.student_id === studentId);
  const quizSubs = db.quizSubmissions.filter((qs) => qs.student_id === studentId);
  const scores = quizSubs.map((q) => q.score);
  const avgQuiz = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const asgSubs = db.assignmentSubmissions.filter((a) => a.student_id === studentId);
  const plans = db.smartStudyPlans.filter((p) => p.student_id === studentId);

  const analytics: StudentAnalyticsData = {
    overall_progress,
    subjects_progress,
    chapters_mastery,
    video_analytics: {
      videos_completed: studentVideos.filter((v) => v.completed).length,
      total_videos: studentVideos.length,
      overall_completion_percentage: 0,
      total_watch_time_seconds: studentVideos.reduce((a, b) => a + b.last_position_seconds, 0),
      recent_videos: [],
    },
    quiz_analytics: {
      average_score: avgQuiz,
      highest_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
      total_attempts: quizSubs.length,
      passed_attempts: quizSubs.filter((q) => q.passed).length,
      recent_quizzes: [],
    },
    assignment_analytics: {
      total_assignments: asgSubs.length,
      submitted: asgSubs.length,
      graded: asgSubs.filter((a) => a.status === 'graded').length,
      average_marks: 0,
    },
    learning_analytics: {
      notes_viewed: db.progress.filter((p) => p.student_id === studentId && p.notes_viewed).length,
      simulations_completed: db.simulationProgress.filter((p) => p.student_id === studentId && p.completed).length,
      study_plans_completed: plans.filter((p) => p.status === 'completed').length,
      active_study_plans: plans.filter((p) => p.status !== 'completed').length,
      mastered_topics: chapters_mastery.filter((c) => c.status === 'Mastered').map((c) => c.chapter_title),
      weak_topics: plans.filter((p) => p.status !== 'completed').map((p) => p.topic_title || 'Topic'),
    },
  };

  res.json({ analytics, student });
});

// GET /api/analytics/admin - System aggregated analytics (verified single source of truth)
router.get('/analytics/admin', requirePermission('view_analytics'), (req: AuthenticatedRequest, res: Response): void => {
  const { verifiedUsers, stats } = getVerifiedAdminDataset();
  const students = verifiedUsers.filter((u) => u.role === 'student');
  const verifiedStudentIds = new Set(students.map((s) => s.id));

  const allProg = db.progress.filter((p) => verifiedStudentIds.has(p.student_id));
  const avgProg = allProg.length > 0 ? Math.round((allProg.filter((p) => p.completed).length / allProg.length) * 100) : 0;

  const quizSubs = db.quizSubmissions.filter((qs) => verifiedStudentIds.has(qs.student_id));
  const avgQuiz = quizSubs.length > 0 ? Math.round(quizSubs.reduce((a, b) => a + b.score, 0) / quizSubs.length) : 0;

  const vProg = db.videoProgress.filter((v) => verifiedStudentIds.has(v.student_id));
  const videoCompRate = vProg.length > 0 ? Math.round((vProg.filter((v) => v.completed).length / vProg.length) * 100) : 0;

  const asgSubs = db.assignmentSubmissions.filter((a) => verifiedStudentIds.has(a.student_id));
  const asgCompRate = asgSubs.length > 0 ? Math.round((asgSubs.filter((a) => a.status === 'graded').length / asgSubs.length) * 100) : 0;

  // Difficult chapters based on average quiz scores
  const chapterScoreMap = new Map<string, { scores: number[]; subjName: string; title: string }>();
  quizSubs.forEach((qs) => {
    const q = db.quizzes.find((qz) => qz.id === qs.quiz_id);
    if (q && q.chapter_id) {
      const chap = db.chapters.find((c) => c.id === q.chapter_id);
      const subj = db.subjects.find((s) => s.id === q.subject_id || s.id === chap?.subject_id);
      if (chap) {
        if (!chapterScoreMap.has(chap.id)) {
          chapterScoreMap.set(chap.id, { scores: [], subjName: subj?.name || 'Class', title: chap.title });
        }
        chapterScoreMap.get(chap.id)!.scores.push(qs.score);
      }
    }
  });

  const difficult_chapters = Array.from(chapterScoreMap.values())
    .map((c) => ({
      chapter_title: c.title,
      subject_name: c.subjName,
      avg_quiz_score: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
    }))
    .sort((a, b) => a.avg_quiz_score - b.avg_quiz_score)
    .slice(0, 5);

  // Difficult topics computed strictly from real quiz submissions (empty when no submissions exist)
  const topicScoreMap = new Map<string, { scores: number[]; subjName: string; title: string }>();
  quizSubs.forEach((qs) => {
    const q = db.quizzes.find((qz) => qz.id === qs.quiz_id);
    if (!q) return;
    const subtopic = q.subtopic_id ? db.subtopics.find((st) => st.id === q.subtopic_id) : undefined;
    const topicId = q.topic_id || subtopic?.topic_id;
    const topic = topicId ? db.topics.find((t) => t.id === topicId) : undefined;
    const topicKey = topic?.id || subtopic?.id;
    const topicTitle = topic?.title || subtopic?.title;
    if (!topicKey || !topicTitle) return;
    const subj = db.subjects.find(
      (s) => s.id === q.subject_id || s.id === topic?.subject_id || s.id === qs.subject_id
    );
    if (!topicScoreMap.has(topicKey)) {
      topicScoreMap.set(topicKey, { scores: [], subjName: subj?.name || 'Class', title: topicTitle });
    }
    topicScoreMap.get(topicKey)!.scores.push(qs.score);
  });

  const difficult_topics = Array.from(topicScoreMap.values())
    .map((t) => ({
      topic_title: t.title,
      subject_name: t.subjName,
      avg_quiz_score: Math.round(t.scores.reduce((a, b) => a + b, 0) / t.scores.length),
    }))
    .sort((a, b) => a.avg_quiz_score - b.avg_quiz_score)
    .slice(0, 5);

  const analytics: AdminAnalyticsData = {
    total_students: stats.totalStudents,
    active_students: students.filter((s) => s.status !== 'disabled').length,
    total_teachers: stats.totalTeachers,
    total_classes: stats.totalClasses,
    total_simulations: db.simulations.length,
    total_materials: db.materials.length,
    average_progress: avgProg,
    average_quiz_score: avgQuiz,
    video_completion_rate: videoCompRate,
    assignment_completion_rate: asgCompRate,
    difficult_chapters,
    difficult_topics,
  };

  res.json({ analytics });
});
