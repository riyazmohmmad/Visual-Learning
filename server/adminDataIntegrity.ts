import { db, User, UserRole, SubAdminPermission, Enrollment, Subject } from './db.js';
import { SUPER_ADMIN_EMAIL, isSuperAdminEmailAddress } from './firebaseAdmin.js';

export const VALID_USER_ROLES = new Set<UserRole>([
  'super_admin',
  'admin',
  'sub_admin',
  'teacher',
  'student',
]);

export const VALID_SUB_ADMIN_PERMISSIONS = new Set<SubAdminPermission>([
  'manage_students',
  'manage_teachers',
  'manage_subjects_classes',
  'manage_content',
  'manage_live_classes',
  'view_analytics',
]);

export function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_USER_ROLES.has(role as UserRole);
}

export function isFirebaseUid(id: unknown): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 8 &&
    id.length <= 128 &&
    !id.startsWith('usr_') &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

/**
 * Identifies automated/synthetic test records (e.g., @visualearn.test created by automated scripts)
 * so they can be excluded from live admin lists & KPIs and flagged in the Safe Data Audit report
 * without destructively deleting records.
 */
export function isSyntheticTestRecord(user: Partial<User>): boolean {
  const email = String(user.email || '').trim().toLowerCase();
  const id = String(user.id || '');
  if (!email) return false;
  if (isSuperAdminEmailAddress(email)) return false;
  if (email.endsWith('@visualearn.test') || email.endsWith('@example.test')) {
    return true;
  }
  if (!isFirebaseUid(id) && /^e2e_(teacher|student|admin)_\d+@/.test(email)) {
    return true;
  }
  return false;
}

export function sanitizePermissions(perms: unknown): SubAdminPermission[] | undefined {
  if (!Array.isArray(perms)) return undefined;
  const filtered = Array.from(
    new Set(
      perms.filter(
        (p): p is SubAdminPermission =>
          typeof p === 'string' && VALID_SUB_ADMIN_PERMISSIONS.has(p as SubAdminPermission)
      )
    )
  );
  return filtered;
}

/**
 * Safely migrates foreign-key references across backend collections when a legacy local
 * user record (`usr_*`) is bound to its authoritative Firebase Authentication UID.
 */
export function migrateUserIdReferences(oldId: string, newUid: string): boolean {
  if (!oldId || !newUid || oldId === newUid) return false;
  let changed = false;

  for (const s of db.subjects) {
    if (s.teacher_id === oldId) {
      s.teacher_id = newUid;
      changed = true;
    }
  }
  for (const e of db.enrollments) {
    if (e.student_id === oldId) {
      e.student_id = newUid;
      changed = true;
    }
  }
  for (const n of db.notes) {
    if (n.teacher_id === oldId) {
      n.teacher_id = newUid;
      changed = true;
    }
  }
  for (const m of db.materials) {
    if (m.teacher_id === oldId) {
      m.teacher_id = newUid;
      changed = true;
    }
  }
  for (const q of db.quizzes) {
    if (q.teacher_id === oldId) {
      q.teacher_id = newUid;
      changed = true;
    }
  }
  for (const qa of db.quizAttempts) {
    if (qa.student_id === oldId) {
      qa.student_id = newUid;
      changed = true;
    }
  }
  for (const qs of db.quizSubmissions) {
    if (qs.student_id === oldId) {
      qs.student_id = newUid;
      changed = true;
    }
  }
  for (const a of db.assignments) {
    if (a.teacher_id === oldId) {
      a.teacher_id = newUid;
      changed = true;
    }
  }
  for (const asub of db.assignmentSubmissions) {
    if (asub.student_id === oldId) {
      asub.student_id = newUid;
      changed = true;
    }
  }
  for (const p of db.progress) {
    if (p.student_id === oldId) {
      p.student_id = newUid;
      changed = true;
    }
  }
  for (const lc of db.liveClasses) {
    if (lc.teacher_id === oldId) {
      lc.teacher_id = newUid;
      changed = true;
    }
  }
  for (const lp of db.liveParticipants) {
    if (lp.user_id === oldId) {
      lp.user_id = newUid;
      changed = true;
    }
  }
  for (const d of db.doubts) {
    if (d.student_id === oldId) {
      d.student_id = newUid;
      changed = true;
    }
    if (d.teacher_id === oldId) {
      d.teacher_id = newUid;
      changed = true;
    }
  }
  for (const sp of db.simulationProgress) {
    if (sp.student_id === oldId) {
      sp.student_id = newUid;
      changed = true;
    }
  }
  for (const ssp of db.smartStudyPlans) {
    if (ssp.student_id === oldId) {
      ssp.student_id = newUid;
      changed = true;
    }
  }
  for (const vp of db.videoProgress) {
    if (vp.student_id === oldId) {
      vp.student_id = newUid;
      changed = true;
    }
  }
  for (const log of db.materialAccessLogs) {
    if (log.user_id === oldId) {
      log.user_id = newUid;
      changed = true;
    }
  }
  for (const cs of db.aiChatSessions) {
    if (cs.user_id === oldId) {
      cs.user_id = newUid;
      changed = true;
    }
  }

  return changed;
}

export interface IncomingFirestoreUserRecord {
  uid: string;
  fullName?: string;
  email: string;
  role?: string;
  accountStatus?: string;
  institution?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  bio?: string;
  avatar?: string;
  qualification?: string;
  specialization?: string;
  studentId?: string;
  teacherId?: string;
  adminId?: string;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export interface IncomingFirestoreAdminRecord {
  uid: string;
  email: string;
  role: string;
  status?: string;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Reconciles live Firestore /users and /admins snapshots into backend storage non-destructively.
 * - Upserts verified Firebase users keyed by Firebase Auth UID.
 * - Migrates email-matched legacy local records (`usr_*`) to the canonical Firebase UID.
 * - Strictly enforces role boundaries: sub_admin callers cannot sync/escalate admin roles;
 *   super_admin is exclusively bound to SUPER_ADMIN_EMAIL.
 * - Never deletes existing database records.
 */
export function reconcileFirestoreDirectoryToBackend(params: {
  users: IncomingFirestoreUserRecord[];
  admins?: IncomingFirestoreAdminRecord[];
  callerRole: UserRole;
}): {
  syncedCount: number;
  createdCount: number;
  reboundIdsCount: number;
  flaggedCount: number;
} {
  const { users: incomingUsers, admins: incomingAdmins = [], callerRole } = params;
  const callerCanSyncPrivileged = callerRole === 'super_admin' || callerRole === 'admin';

  const adminMap = new Map<string, IncomingFirestoreAdminRecord>();
  for (const a of incomingAdmins) {
    if (!a || !isFirebaseUid(a.uid) || !a.email) continue;
    adminMap.set(a.uid, a);
  }

  let syncedCount = 0;
  let createdCount = 0;
  let reboundIdsCount = 0;
  let flaggedCount = 0;
  let dirty = false;

  const maxSubAdmins = db.settings.maxSubAdmins || 4;

  for (const raw of incomingUsers) {
    if (!raw || !isFirebaseUid(raw.uid)) {
      flaggedCount++;
      continue;
    }

    const uid = raw.uid.trim();
    const cleanEmail = String(raw.email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      flaggedCount++;
      continue;
    }

    const adminRec = adminMap.get(uid);
    const isAuthoritativeSuperAdmin = isSuperAdminEmailAddress(cleanEmail);

    let resolvedRole: UserRole | null = null;
    if (isAuthoritativeSuperAdmin) {
      resolvedRole = 'super_admin';
    } else if (
      callerCanSyncPrivileged &&
      adminRec &&
      (adminRec.role === 'sub_admin' || adminRec.role === 'admin') &&
      adminRec.status !== 'disabled'
    ) {
      resolvedRole = adminRec.role;
    } else if (isValidUserRole(raw.role)) {
      if (raw.role === 'super_admin') {
        // Non-Super-Admin email claiming super_admin: never grant super_admin, flag instead of guessing
        flaggedCount++;
        continue;
      }
      if ((raw.role === 'admin' || raw.role === 'sub_admin') && !callerCanSyncPrivileged) {
        // Sub-admin sync must never create or modify privileged admin records
        continue;
      }
      resolvedRole = raw.role;
    } else {
      // Missing or invalid role: NEVER silently default to 'student'
      flaggedCount++;
      continue;
    }

    const normalizedStatus: 'active' | 'disabled' =
      isAuthoritativeSuperAdmin
        ? 'active'
        : raw.accountStatus === 'disabled' || adminRec?.status === 'disabled'
        ? 'disabled'
        : 'active';

    const resolvedPermissions =
      resolvedRole === 'sub_admin'
        ? sanitizePermissions(adminRec?.permissions ?? raw.permissions) || []
        : undefined;

    // Match by canonical Firebase UID first, then by email (re-binding legacy usr_* ID if found)
    let existing = db.users.find((u) => u.id === uid);
    if (!existing) {
      const emailMatch = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (emailMatch) {
        if (emailMatch.id !== uid && !isFirebaseUid(emailMatch.id)) {
          migrateUserIdReferences(emailMatch.id, uid);
          emailMatch.id = uid;
          reboundIdsCount++;
          dirty = true;
        }
        existing = emailMatch;
      }
    }

    const idSuffix = uid.slice(0, 6).toUpperCase();
    const resolvedName =
      (typeof raw.fullName === 'string' && raw.fullName.trim()) ||
      existing?.name ||
      cleanEmail.split('@')[0];

    if (existing) {
      // Enforce max Sub Admin cap before promoting a non-sub_admin to sub_admin
      if (resolvedRole === 'sub_admin' && existing.role !== 'sub_admin') {
        const currentSubAdmins = db.users.filter(
          (u) => u.role === 'sub_admin' && u.id !== existing!.id && !isSyntheticTestRecord(u)
        ).length;
        if (currentSubAdmins >= maxSubAdmins) {
          flaggedCount++;
          continue;
        }
      }

      const prevRole = existing.role;
      const prevStatus = existing.status;
      const prevName = existing.name;
      const prevEmail = existing.email;

      existing.name = resolvedName;
      existing.email = cleanEmail;
      if (callerCanSyncPrivileged || (existing.role !== 'super_admin' && existing.role !== 'admin' && existing.role !== 'sub_admin')) {
        existing.role = resolvedRole;
      }
      existing.status = normalizedStatus;
      if (resolvedRole === 'sub_admin' && callerCanSyncPrivileged) {
        existing.permissions = resolvedPermissions;
      } else if (resolvedRole !== 'sub_admin') {
        existing.permissions = undefined;
      }

      if (typeof raw.institution === 'string') existing.institution = raw.institution.trim();
      if (typeof raw.phone === 'string') existing.phone = raw.phone.trim();
      if (typeof raw.dateOfBirth === 'string') existing.dateOfBirth = raw.dateOfBirth.trim();
      if (typeof raw.gender === 'string') existing.gender = raw.gender.trim();
      if (typeof raw.bio === 'string') existing.bio = raw.bio.trim();
      if (typeof raw.avatar === 'string' && raw.avatar) existing.avatar = raw.avatar;
      if (typeof raw.qualification === 'string') existing.qualification = raw.qualification.trim();
      if (typeof raw.specialization === 'string') existing.specialization = raw.specialization.trim();
      if (raw.studentId) existing.studentId = raw.studentId;
      if (raw.teacherId) existing.teacherId = raw.teacherId;
      if (raw.adminId) existing.adminId = raw.adminId;
      if (raw.createdAt && !existing.created_at) existing.created_at = raw.createdAt;
      if (raw.lastLoginAt) existing.last_login_at = raw.lastLoginAt;
      if (isAuthoritativeSuperAdmin) {
        existing.adminId = existing.adminId || `ADM-${idSuffix}`;
        existing.adminSetupCompleted = true;
        existing.temporaryCredentials = false;
      }

      if (
        prevRole !== existing.role ||
        prevStatus !== existing.status ||
        prevName !== existing.name ||
        prevEmail !== existing.email
      ) {
        dirty = true;
      }
      syncedCount++;
    } else {
      // Enforce max Sub Admin cap before adding a new sub_admin
      if (resolvedRole === 'sub_admin') {
        const currentSubAdmins = db.users.filter(
          (u) => u.role === 'sub_admin' && !isSyntheticTestRecord(u)
        ).length;
        if (currentSubAdmins >= maxSubAdmins) {
          flaggedCount++;
          continue;
        }
      }

      const newUser: User = {
        id: uid,
        name: resolvedName,
        email: cleanEmail,
        password_hash: 'FIREBASE_AUTH_MANAGED',
        role: resolvedRole,
        institution:
          typeof raw.institution === 'string' && raw.institution.trim()
            ? raw.institution.trim()
            : isAuthoritativeSuperAdmin
            ? 'VisuaLearn Administration'
            : '',
        status: normalizedStatus,
        permissions: resolvedPermissions,
        phone: typeof raw.phone === 'string' ? raw.phone.trim() : '',
        dateOfBirth: typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth.trim() : '',
        gender: typeof raw.gender === 'string' ? raw.gender.trim() : '',
        bio: typeof raw.bio === 'string' ? raw.bio.trim() : '',
        avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
        qualification: typeof raw.qualification === 'string' ? raw.qualification.trim() : '',
        specialization: typeof raw.specialization === 'string' ? raw.specialization.trim() : '',
        studentId: resolvedRole === 'student' ? raw.studentId || `STU-${idSuffix}` : undefined,
        teacherId: resolvedRole === 'teacher' ? raw.teacherId || `FAC-${idSuffix}` : undefined,
        adminId:
          resolvedRole === 'super_admin' || resolvedRole === 'admin' || resolvedRole === 'sub_admin'
            ? raw.adminId || `ADM-${idSuffix}`
            : undefined,
        adminSetupCompleted:
          resolvedRole === 'super_admin' || resolvedRole === 'admin' || resolvedRole === 'sub_admin'
            ? true
            : undefined,
        temporaryCredentials: false,
        created_at: raw.createdAt || new Date().toISOString(),
        last_login_at: raw.lastLoginAt || raw.updatedAt,
      };

      db.users.push(newUser);
      createdCount++;
      syncedCount++;
      dirty = true;
    }
  }

  if (dirty) {
    db.persist();
  }

  return { syncedCount, createdCount, reboundIdsCount, flaggedCount };
}

export interface StudentClassMembership {
  id: string;
  name: string;
  section?: string;
  class_code: string;
  teacher_name?: string;
  joined_at: string;
}

export interface TeacherClassSummary {
  id: string;
  name: string;
  section?: string;
  class_code: string;
  enrolledStudents: number;
}

export interface EnrichedAdminUser {
  id: string;
  uid: string;
  name: string;
  fullName: string;
  email: string;
  role: UserRole;
  institution?: string;
  status: 'active' | 'disabled';
  accountStatus: 'active' | 'disabled';
  permissions?: SubAdminPermission[];
  created_at: string;
  createdAt: string;
  updatedAt?: string;
  last_login_at?: string;
  studentId?: string;
  teacherId?: string;
  adminId?: string;
  avatar?: string;
  identitySource: 'firebase' | 'backend';
  // Student fields
  enrollmentsCount?: number;
  enrolledClasses?: StudentClassMembership[];
  enrollmentStatus?: 'Enrolled' | 'Not Enrolled';
  // Teacher fields
  teachingClassesCount?: number;
  teachingClasses?: TeacherClassSummary[];
  enrolledStudentsCount?: number;
}

export interface AdminAuditReport {
  generatedAt: string;
  healthy: boolean;
  totalIssues: number;
  summary: {
    syntheticOrTestCount: number;
    duplicateEmailCount: number;
    invalidOrMissingRoleCount: number;
    orphanedEnrollmentsCount: number;
    unlinkedClassTeachersCount: number;
    backendOnlyUsersCount: number;
  };
  syntheticOrTestRecords: {
    id: string;
    name: string;
    email: string;
    role: string;
    reason: string;
  }[];
  duplicateEmailRecords: {
    email: string;
    keptId: string;
    duplicateId: string;
    duplicateRole: string;
    reason: string;
  }[];
  invalidOrMissingRoleRecords: {
    id: string;
    name: string;
    email: string;
    rawRole: string;
    reason: string;
  }[];
  orphanedEnrollments: {
    enrollmentId: string;
    studentId: string;
    subjectId: string;
    reason: string;
  }[];
  unlinkedClassTeachers: {
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName?: string;
    reason: string;
  }[];
  backendOnlyRecords: {
    id: string;
    name: string;
    email: string;
    role: string;
    reason: string;
  }[];
}

export interface VerifiedAdminStats {
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  totalSuperAdmins: number;
  totalAdmins: number;
  totalSubAdmins: number;
  maxSubAdmins: number;
  subAdminsAvailable: number;
  activeUsers: number;
  activeAccounts: number;
  disabledUsers: number;
  suspendedAccounts: number;
  totalSubjects: number;
  totalClasses: number;
  totalEnrolledStudents: number;
  unassignedStudents: number;
  totalEnrollments: number;
  totalNotes: number;
  totalQuizzes: number;
  activeLiveSessions: number;
  scheduledLiveClasses: number;
}

export interface VerifiedAdminDataset {
  verifiedUsers: User[];
  enrichedUsers: EnrichedAdminUser[];
  validEnrollments: Enrollment[];
  validEnrollmentsBySubject: Map<string, Enrollment[]>;
  validEnrollmentsByStudent: Map<string, Enrollment[]>;
  stats: VerifiedAdminStats;
  audit: AdminAuditReport;
}

/**
 * Computes the single authoritative, deduplicated, strictly validated administration dataset
 * from backend records — separating verified users from anomalous/synthetic records without
 * deleting any underlying data.
 */
export function getVerifiedAdminDataset(): VerifiedAdminDataset {
  const syntheticOrTestRecords: AdminAuditReport['syntheticOrTestRecords'] = [];
  const duplicateEmailRecords: AdminAuditReport['duplicateEmailRecords'] = [];
  const invalidOrMissingRoleRecords: AdminAuditReport['invalidOrMissingRoleRecords'] = [];
  const orphanedEnrollments: AdminAuditReport['orphanedEnrollments'] = [];
  const unlinkedClassTeachers: AdminAuditReport['unlinkedClassTeachers'] = [];
  const backendOnlyRecords: AdminAuditReport['backendOnlyRecords'] = [];

  // Pass 1: Validate every user record strictly (never guess roles)
  const validCandidates: User[] = [];
  const seenIds = new Set<string>();

  for (const u of db.users) {
    if (!u || typeof u !== 'object') continue;
    const id = String(u.id || '').trim();
    const email = String(u.email || '').trim().toLowerCase();

    if (!id || !email) {
      invalidOrMissingRoleRecords.push({
        id: id || '(missing)',
        name: u.name || '(unnamed)',
        email: email || '(missing)',
        rawRole: String((u as any).role || '(missing)'),
        reason: 'Missing primary user ID or email address.',
      });
      continue;
    }

    if (seenIds.has(id)) {
      duplicateEmailRecords.push({
        email,
        keptId: id,
        duplicateId: id,
        duplicateRole: String(u.role || 'unknown'),
        reason: 'Duplicate record with identical user ID.',
      });
      continue;
    }
    seenIds.add(id);

    if (isSyntheticTestRecord(u)) {
      syntheticOrTestRecords.push({
        id,
        name: u.name || email,
        email,
        role: String(u.role || 'unknown'),
        reason: 'Automated/test domain record excluded from live administration tables and KPIs.',
      });
      continue;
    }

    if (!isValidUserRole(u.role)) {
      invalidOrMissingRoleRecords.push({
        id,
        name: u.name || email,
        email,
        rawRole: String((u as any).role || '(missing)'),
        reason: 'User has missing or unrecognized role and was not defaulted to student.',
      });
      continue;
    }

    if (u.role === 'super_admin' && !isSuperAdminEmailAddress(email)) {
      invalidOrMissingRoleRecords.push({
        id,
        name: u.name || email,
        email,
        rawRole: u.role,
        reason: `Account holds super_admin role but does not match authoritative Super Admin (${SUPER_ADMIN_EMAIL}).`,
      });
      continue;
    }

    validCandidates.push(u);
  }

  // Pass 2: Deduplicate by normalized email, preferring canonical Firebase UID over legacy usr_* ID
  const byEmail = new Map<string, User>();
  for (const candidate of validCandidates) {
    const email = candidate.email.trim().toLowerCase();
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, candidate);
      continue;
    }

    const existingIsFirebase = isFirebaseUid(existing.id);
    const candidateIsFirebase = isFirebaseUid(candidate.id);

    if (!existingIsFirebase && candidateIsFirebase) {
      duplicateEmailRecords.push({
        email,
        keptId: candidate.id,
        duplicateId: existing.id,
        duplicateRole: existing.role,
        reason: 'Legacy local account shadowed by canonical Firebase UID for the same email.',
      });
      byEmail.set(email, candidate);
    } else {
      duplicateEmailRecords.push({
        email,
        keptId: existing.id,
        duplicateId: candidate.id,
        duplicateRole: candidate.role,
        reason: 'Duplicate user record sharing the same email address.',
      });
    }
  }

  const verifiedUsers = Array.from(byEmail.values());
  const verifiedUserById = new Map<string, User>();
  for (const u of verifiedUsers) {
    verifiedUserById.set(u.id, u);
    if (!isFirebaseUid(u.id)) {
      backendOnlyRecords.push({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        reason: 'Backend-only account without a linked Firebase Authentication UID.',
      });
    }
  }

  // Pass 3: Validate classes & teacher ownership
  const subjectById = new Map<string, Subject>();
  for (const s of db.subjects) {
    if (!s || !s.id) continue;
    subjectById.set(s.id, s);
    const owner = s.teacher_id ? verifiedUserById.get(s.teacher_id) : undefined;
    if (!s.teacher_id) {
      unlinkedClassTeachers.push({
        subjectId: s.id,
        subjectName: s.name,
        teacherId: '(unassigned)',
        teacherName: s.teacher_name,
        reason: 'Class has no assigned teacher UID.',
      });
    } else if (!owner) {
      unlinkedClassTeachers.push({
        subjectId: s.id,
        subjectName: s.name,
        teacherId: s.teacher_id,
        teacherName: s.teacher_name,
        reason: 'Assigned teacher UID has no matching synced profile in backend records yet (open Admin Dashboard as Super Admin to sync Firestore users).',
      });
    } else if (owner.role !== 'teacher') {
      unlinkedClassTeachers.push({
        subjectId: s.id,
        subjectName: s.name,
        teacherId: s.teacher_id,
        teacherName: owner.name,
        reason: `Assigned class owner has role "${owner.role}" instead of "teacher".`,
      });
    }
  }

  // Pass 4: Validate & deduplicate enrollments (valid verified student + valid existing class)
  const validEnrollments: Enrollment[] = [];
  const validEnrollmentsBySubject = new Map<string, Enrollment[]>();
  const validEnrollmentsByStudent = new Map<string, Enrollment[]>();
  const seenEnrollmentKeys = new Set<string>();

  for (const enr of db.enrollments) {
    if (!enr || !enr.student_id || !enr.subject_id) {
      orphanedEnrollments.push({
        enrollmentId: enr?.id || '(unknown)',
        studentId: enr?.student_id || '(missing)',
        subjectId: enr?.subject_id || '(missing)',
        reason: 'Enrollment record is missing student_id or subject_id.',
      });
      continue;
    }

    const subj = subjectById.get(enr.subject_id);
    if (!subj) {
      orphanedEnrollments.push({
        enrollmentId: enr.id,
        studentId: enr.student_id,
        subjectId: enr.subject_id,
        reason: 'Enrollment references a class that no longer exists.',
      });
      continue;
    }

    const student = verifiedUserById.get(enr.student_id);
    if (!student) {
      orphanedEnrollments.push({
        enrollmentId: enr.id,
        studentId: enr.student_id,
        subjectId: enr.subject_id,
        reason: 'Enrollment references a user account that does not exist or is flagged.',
      });
      continue;
    }

    if (student.role !== 'student') {
      orphanedEnrollments.push({
        enrollmentId: enr.id,
        studentId: enr.student_id,
        subjectId: enr.subject_id,
        reason: `Enrollment references a non-student user (role: ${student.role}).`,
      });
      continue;
    }

    const pairKey = `${enr.student_id}::${enr.subject_id}`;
    if (seenEnrollmentKeys.has(pairKey)) {
      orphanedEnrollments.push({
        enrollmentId: enr.id,
        studentId: enr.student_id,
        subjectId: enr.subject_id,
        reason: 'Duplicate enrollment record for the same student and class.',
      });
      continue;
    }
    seenEnrollmentKeys.add(pairKey);

    validEnrollments.push(enr);
    if (!validEnrollmentsBySubject.has(enr.subject_id)) {
      validEnrollmentsBySubject.set(enr.subject_id, []);
    }
    validEnrollmentsBySubject.get(enr.subject_id)!.push(enr);

    if (!validEnrollmentsByStudent.has(enr.student_id)) {
      validEnrollmentsByStudent.set(enr.student_id, []);
    }
    validEnrollmentsByStudent.get(enr.student_id)!.push(enr);
  }

  // Pass 5: Build enriched user records with exact relational counts
  const enrichedUsers: EnrichedAdminUser[] = verifiedUsers
    .map((u) => {
      const normalizedStatus: 'active' | 'disabled' = u.status === 'disabled' ? 'disabled' : 'active';
      const base: EnrichedAdminUser = {
        id: u.id,
        uid: u.id,
        name: u.name,
        fullName: u.name,
        email: u.email,
        role: u.role,
        institution: u.institution,
        status: normalizedStatus,
        accountStatus: normalizedStatus,
        permissions: u.role === 'sub_admin' ? u.permissions || [] : undefined,
        created_at: u.created_at,
        createdAt: u.created_at,
        updatedAt: u.last_login_at || u.created_at,
        last_login_at: u.last_login_at,
        studentId: u.studentId,
        teacherId: u.teacherId,
        adminId: u.adminId,
        avatar: u.avatar,
        identitySource: isFirebaseUid(u.id) ? 'firebase' : 'backend',
      };

      if (u.role === 'student') {
        const studentEnrs = validEnrollmentsByStudent.get(u.id) || [];
        const enrolledClasses: StudentClassMembership[] = studentEnrs
          .map((e): StudentClassMembership | null => {
            const subj = subjectById.get(e.subject_id);
            if (!subj) return null;
            const teacher = subj.teacher_id ? verifiedUserById.get(subj.teacher_id) : undefined;
            return {
              id: subj.id,
              name: subj.name,
              section: subj.section,
              class_code: subj.class_code,
              teacher_name: teacher?.role === 'teacher' ? teacher.name : subj.teacher_name,
              joined_at: e.joined_at,
            };
          })
          .filter((c): c is StudentClassMembership => c !== null);

        base.enrollmentsCount = enrolledClasses.length;
        base.enrolledClasses = enrolledClasses;
        base.enrollmentStatus = enrolledClasses.length > 0 ? 'Enrolled' : 'Not Enrolled';
      } else if (u.role === 'teacher') {
        const ownedSubjects = db.subjects.filter((s) => s.teacher_id === u.id);
        const uniqueStudents = new Set<string>();
        const teachingClasses: TeacherClassSummary[] = ownedSubjects.map((s) => {
          const classEnrs = validEnrollmentsBySubject.get(s.id) || [];
          classEnrs.forEach((e) => uniqueStudents.add(e.student_id));
          return {
            id: s.id,
            name: s.name,
            section: s.section,
            class_code: s.class_code,
            enrolledStudents: classEnrs.length,
          };
        });
        base.teachingClassesCount = teachingClasses.length;
        base.teachingClasses = teachingClasses;
        base.enrolledStudentsCount = uniqueStudents.size;
      }

      return base;
    })
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

  // Pass 6: Compute single-source-of-truth KPI statistics matching tables 100%
  const totalUsers = verifiedUsers.length;
  const totalStudents = verifiedUsers.filter((u) => u.role === 'student').length;
  const totalTeachers = verifiedUsers.filter((u) => u.role === 'teacher').length;
  const totalSuperAdmins = verifiedUsers.filter((u) => u.role === 'super_admin').length;
  const totalAdmins = verifiedUsers.filter((u) => u.role === 'admin').length;
  const totalSubAdmins = verifiedUsers.filter((u) => u.role === 'sub_admin').length;
  const activeAccounts = verifiedUsers.filter((u) => u.status !== 'disabled').length;
  const suspendedAccounts = verifiedUsers.filter((u) => u.status === 'disabled').length;
  const maxSubAdmins = db.settings.maxSubAdmins || 4;
  const totalEnrolledStudents = validEnrollmentsByStudent.size;

  const stats: VerifiedAdminStats = {
    totalUsers,
    totalStudents,
    totalTeachers,
    totalSuperAdmins,
    totalAdmins,
    totalSubAdmins,
    maxSubAdmins,
    subAdminsAvailable: Math.max(0, maxSubAdmins - totalSubAdmins),
    activeUsers: activeAccounts,
    activeAccounts,
    disabledUsers: suspendedAccounts,
    suspendedAccounts,
    totalSubjects: db.subjects.length,
    totalClasses: db.subjects.length,
    totalEnrolledStudents,
    unassignedStudents: Math.max(0, totalStudents - totalEnrolledStudents),
    totalEnrollments: validEnrollments.length,
    totalNotes: db.notes.length,
    totalQuizzes: db.quizzes.length,
    activeLiveSessions: db.liveClasses.filter((c) => c.status === 'live_now').length,
    scheduledLiveClasses: db.liveClasses.filter(
      (c) => c.status === 'scheduled' || c.status === 'starting_soon'
    ).length,
  };

  const totalIssues =
    syntheticOrTestRecords.length +
    duplicateEmailRecords.length +
    invalidOrMissingRoleRecords.length +
    orphanedEnrollments.length +
    unlinkedClassTeachers.length;

  const audit: AdminAuditReport = {
    generatedAt: new Date().toISOString(),
    healthy: totalIssues === 0,
    totalIssues,
    summary: {
      syntheticOrTestCount: syntheticOrTestRecords.length,
      duplicateEmailCount: duplicateEmailRecords.length,
      invalidOrMissingRoleCount: invalidOrMissingRoleRecords.length,
      orphanedEnrollmentsCount: orphanedEnrollments.length,
      unlinkedClassTeachersCount: unlinkedClassTeachers.length,
      backendOnlyUsersCount: backendOnlyRecords.length,
    },
    syntheticOrTestRecords,
    duplicateEmailRecords,
    invalidOrMissingRoleRecords,
    orphanedEnrollments,
    unlinkedClassTeachers,
    backendOnlyRecords,
  };

  return {
    verifiedUsers,
    enrichedUsers,
    validEnrollments,
    validEnrollmentsBySubject,
    validEnrollmentsByStudent,
    stats,
    audit,
  };
}

/**
 * Returns strictly validated, deduplicated student enrollments for a given subject ID
 * (excluding deleted users, non-students, and duplicates).
 */
export function getValidSubjectEnrollments(subjectId: string): {
  enrollment: Enrollment;
  student: User;
}[] {
  const { validEnrollmentsBySubject, verifiedUsers } = getVerifiedAdminDataset();
  const userMap = new Map(verifiedUsers.map((u) => [u.id, u]));
  const list = validEnrollmentsBySubject.get(subjectId) || [];
  return list
    .map((enrollment) => {
      const student = userMap.get(enrollment.student_id);
      if (!student || student.role !== 'student') return null;
      return { enrollment, student };
    })
    .filter((item): item is { enrollment: Enrollment; student: User } => item !== null);
}
