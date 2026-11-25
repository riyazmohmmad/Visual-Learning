import {
  collection,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { SUPER_ADMIN_EMAIL } from './firebaseAuthService';
import { FirestoreDirectoryAnomaly, UserRole } from '../types';

const VALID_ROLES = new Set<UserRole>([
  'super_admin',
  'admin',
  'sub_admin',
  'teacher',
  'student',
]);

export interface SyncableFirestoreUser {
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

export interface SyncableFirestoreAdmin {
  uid: string;
  email: string;
  role: string;
  status?: string;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminFirestoreDirectorySnapshot {
  users: SyncableFirestoreUser[];
  admins: SyncableFirestoreAdmin[];
  anomalies: FirestoreDirectoryAnomaly[];
}

function timestampToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLES.has(role as UserRole);
}

/**
 * Subscribes in real time to Firestore `/users` and `/admins` collections for verified administrators.
 * - Guarded strictly by `auth.currentUser != null`.
 * - Separates validated UID-keyed documents from malformed/misclassified Firestore anomalies
 *   (never defaults missing or invalid roles to 'student').
 * - Returns a single cleanup function that unsubscribes both snapshot listeners cleanly.
 */
export function subscribeToAdminFirestoreDirectory(params: {
  onSnapshotUpdate: (snapshot: AdminFirestoreDirectorySnapshot) => void;
  onError?: (message: string) => void;
}): Unsubscribe {
  const { onSnapshotUpdate, onError } = params;

  if (!auth.currentUser) {
    return () => {};
  }

  let active = true;
  let latestUsers: SyncableFirestoreUser[] = [];
  let latestAdmins: SyncableFirestoreAdmin[] = [];
  let userAnomalies: FirestoreDirectoryAnomaly[] = [];
  let adminAnomalies: FirestoreDirectoryAnomaly[] = [];
  let usersReady = false;
  let adminsReady = false;

  const emitIfReady = () => {
    if (!active) return;
    if (!usersReady && !adminsReady) return;
    onSnapshotUpdate({
      users: latestUsers,
      admins: latestAdmins,
      anomalies: [...userAnomalies, ...adminAnomalies],
    });
  };

  const unsubUsers = onSnapshot(
    collection(db, 'users'),
    (snap) => {
      if (!active) return;
      const nextUsers: SyncableFirestoreUser[] = [];
      const nextAnomalies: FirestoreDirectoryAnomaly[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const docId = docSnap.id;
        const fieldUid = typeof data.uid === 'string' ? data.uid.trim() : '';
        const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        const rawRole = typeof data.role === 'string' ? data.role.trim() : '';

        if (fieldUid && fieldUid !== docId) {
          nextAnomalies.push({
            collection: 'users',
            docId,
            email: email || '(missing)',
            rawRole: rawRole || '(missing)',
            reason: `Document ID (${docId}) does not match uid field (${fieldUid}).`,
          });
        }

        if (!email) {
          nextAnomalies.push({
            collection: 'users',
            docId,
            email: '(missing)',
            rawRole: rawRole || '(missing)',
            reason: 'Missing email address in Firestore users document.',
          });
          return;
        }

        if (!isValidRole(rawRole)) {
          nextAnomalies.push({
            collection: 'users',
            docId,
            email,
            rawRole: rawRole || '(missing)',
            reason: 'Missing or invalid role in Firestore users document (not defaulted to student).',
          });
          return;
        }

        if (rawRole === 'super_admin' && email !== SUPER_ADMIN_EMAIL) {
          nextAnomalies.push({
            collection: 'users',
            docId,
            email,
            rawRole,
            reason: 'Unauthorized super_admin role claim in Firestore users document.',
          });
          return;
        }

        nextUsers.push({
          uid: docId,
          fullName: typeof data.fullName === 'string' ? data.fullName.trim() : undefined,
          email,
          role: rawRole,
          accountStatus: data.accountStatus === 'disabled' ? 'disabled' : 'active',
          institution: typeof data.institution === 'string' ? data.institution : undefined,
          phone: typeof data.phone === 'string' ? data.phone : undefined,
          dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : undefined,
          gender: typeof data.gender === 'string' ? data.gender : undefined,
          bio: typeof data.bio === 'string' ? data.bio : undefined,
          avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
          qualification: typeof data.qualification === 'string' ? data.qualification : undefined,
          specialization: typeof data.specialization === 'string' ? data.specialization : undefined,
          studentId: typeof data.studentId === 'string' ? data.studentId : undefined,
          teacherId: typeof data.teacherId === 'string' ? data.teacherId : undefined,
          adminId: typeof data.adminId === 'string' ? data.adminId : undefined,
          permissions: Array.isArray(data.permissions)
            ? data.permissions.filter((p): p is string => typeof p === 'string')
            : undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
          lastLoginAt: timestampToIso(data.lastLoginAt),
        });
      });

      latestUsers = nextUsers;
      userAnomalies = nextAnomalies;
      usersReady = true;
      emitIfReady();
    },
    (error) => {
      if (!active) return;
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch {
        onError?.('Unable to listen to Firestore users directory (check administrator permissions).');
      }
    }
  );

  const unsubAdmins = onSnapshot(
    collection(db, 'admins'),
    (snap) => {
      if (!active) return;
      const nextAdmins: SyncableFirestoreAdmin[] = [];
      const nextAnomalies: FirestoreDirectoryAnomaly[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const docId = docSnap.id;
        const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        const rawRole = typeof data.role === 'string' ? data.role.trim() : '';

        if (!email || (rawRole !== 'super_admin' && rawRole !== 'admin' && rawRole !== 'sub_admin')) {
          nextAnomalies.push({
            collection: 'admins',
            docId,
            email: email || '(missing)',
            rawRole: rawRole || '(missing)',
            reason: 'Malformed admin authorization document in Firestore /admins.',
          });
          return;
        }

        if (rawRole === 'super_admin' && email !== SUPER_ADMIN_EMAIL) {
          nextAnomalies.push({
            collection: 'admins',
            docId,
            email,
            rawRole,
            reason: 'Unauthorized super_admin entry in Firestore /admins.',
          });
          return;
        }

        nextAdmins.push({
          uid: docId,
          email,
          role: rawRole,
          status: data.status === 'disabled' ? 'disabled' : 'active',
          permissions: Array.isArray(data.permissions)
            ? data.permissions.filter((p): p is string => typeof p === 'string')
            : undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        });
      });

      latestAdmins = nextAdmins;
      adminAnomalies = nextAnomalies;
      adminsReady = true;
      emitIfReady();
    },
    (error) => {
      if (!active) return;
      try {
        handleFirestoreError(error, OperationType.LIST, 'admins');
      } catch {
        onError?.('Unable to listen to Firestore admins registry.');
      }
    }
  );

  return () => {
    active = false;
    unsubUsers();
    unsubAdmins();
  };
}
