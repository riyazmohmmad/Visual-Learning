import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole, SubAdminPermission, SystemSettings } from '../types';

export const FIREBASE_AUTH_PROVIDERS_URL =
  'https://console.firebase.google.com/project/youthful-quest-9vk22/authentication/providers';

/**
 * Authoritative Super Admin email address enforced identically by Firestore Security Rules
 * and backend Firebase ID token verification. Requires email_verified === true.
 */
export const SUPER_ADMIN_EMAIL = 'riyazmohmmad80@gmail.com';

export const SUPER_ADMIN_EMAIL_UNVERIFIED_CODE = 'SUPER_ADMIN_EMAIL_UNVERIFIED';

export function isSuperAdminEmailAddress(email?: string | null): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isVerifiedSuperAdminFirebaseUser(fbUser: FirebaseUser | null | undefined): boolean {
  return Boolean(fbUser && fbUser.emailVerified === true && isSuperAdminEmailAddress(fbUser.email));
}

export function isUnverifiedSuperAdminFirebaseUser(fbUser: FirebaseUser | null | undefined): boolean {
  return Boolean(fbUser && fbUser.emailVerified !== true && isSuperAdminEmailAddress(fbUser.email));
}

export interface FirestoreUserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
  lastLoginAt?: Timestamp | string;
  profileCompleted: boolean;
  accountStatus: 'active' | 'disabled';
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
  permissions?: SubAdminPermission[];
}

function timestampToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate().toISOString();
  }
  return undefined;
}

export function mapFirestoreProfileToUser(profile: FirestoreUserProfile): User {
  // Defense in depth: never allow any non-Super-Admin email to map as super_admin
  const safeRole: UserRole =
    profile.role === 'super_admin' && !isSuperAdminEmailAddress(profile.email)
      ? 'student'
      : profile.role;

  return {
    id: profile.uid,
    uid: profile.uid,
    name: profile.fullName,
    fullName: profile.fullName,
    email: profile.email,
    role: safeRole,
    institution: profile.institution || '',
    status: profile.accountStatus || 'active',
    accountStatus: profile.accountStatus || 'active',
    profileCompleted: profile.profileCompleted ?? true,
    permissions: profile.permissions,
    phone: profile.phone || '',
    dateOfBirth: profile.dateOfBirth || '',
    gender: profile.gender || '',
    bio: profile.bio || '',
    avatar: profile.avatar || '',
    qualification: profile.qualification || '',
    specialization: profile.specialization || '',
    studentId:
      profile.studentId ||
      (safeRole === 'student' ? `STU-${profile.uid.slice(0, 6).toUpperCase()}` : ''),
    teacherId:
      profile.teacherId ||
      (safeRole === 'teacher' ? `FAC-${profile.uid.slice(0, 6).toUpperCase()}` : ''),
    adminId:
      profile.adminId ||
      (safeRole === 'admin' || safeRole === 'super_admin' || safeRole === 'sub_admin'
        ? `ADM-${profile.uid.slice(0, 6).toUpperCase()}`
        : ''),
    created_at: timestampToIso(profile.createdAt),
    last_login_at: timestampToIso(profile.lastLoginAt),
    adminSetupCompleted: true,
    temporaryCredentials: false,
  };
}

export function formatFirebaseAuthError(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in with your existing account instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact an administrator.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in the Firebase Console. Please enable Email/Password under Authentication → Sign-in method, or use "Continue with Google".';
    case 'auth/network-request-failed':
      return 'Network error while connecting to authentication service. Please check your internet connection.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign in again before changing your password.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

export function isPrivilegedRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'sub_admin';
}

function isFirebaseUid(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 8 &&
    id.length <= 128 &&
    !id.startsWith('usr_') &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

export async function getFirestoreUserProfile(uid: string): Promise<FirestoreUserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as FirestoreUserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getFirestoreAdminRecord(
  uid: string
): Promise<{ role: 'super_admin' | 'admin' | 'sub_admin'; status?: 'active' | 'disabled'; permissions?: SubAdminPermission[] } | null> {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const role = data?.role;
    if (role !== 'super_admin' && role !== 'admin' && role !== 'sub_admin') return null;
    return {
      role,
      status: data?.status === 'disabled' ? 'disabled' : 'active',
      permissions: Array.isArray(data?.permissions)
        ? (data.permissions as SubAdminPermission[])
        : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Ensures the verified Super Admin Firebase account (riyazmohmmad80@gmail.com with email_verified === true)
 * has synchronized users/{uid} and admins/{uid} documents in Firestore, enforced by firestore.rules.
 */
export async function syncSuperAdminFirestoreProfile(
  fbUser: FirebaseUser
): Promise<FirestoreUserProfile> {
  if (!isVerifiedSuperAdminFirebaseUser(fbUser)) {
    throw Object.assign(
      new Error('Email verification is required before Super Admin access can be granted.'),
      { code: SUPER_ADMIN_EMAIL_UNVERIFIED_CODE }
    );
  }

  const uid = fbUser.uid;
  const email = SUPER_ADMIN_EMAIL;
  const idSuffix = uid.slice(0, 6).toUpperCase();
  const adminId = `ADM-${idSuffix}`;

  const existing = await getFirestoreUserProfile(uid);

  if (existing) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        role: 'super_admin',
        accountStatus: 'active',
        adminId: existing.adminId || adminId,
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  } else {
    const resolvedName = (fbUser.displayName || 'Super Admin').trim().slice(0, 120);
    const profileDoc: Record<string, unknown> = {
      uid,
      fullName: resolvedName,
      email,
      role: 'super_admin',
      institution: 'VisuaLearn Administration',
      adminId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      profileCompleted: true,
      accountStatus: 'active',
    };
    if (fbUser.photoURL) {
      profileDoc.avatar = fbUser.photoURL;
    }
    try {
      await setDoc(doc(db, 'users', uid), profileDoc);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
    }
  }

  // Keep /admins/{uid} synchronized as well (authorized by firestore.rules isSuperAdmin())
  try {
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      await updateDoc(adminRef, {
        role: 'super_admin',
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(adminRef, {
        uid,
        email,
        role: 'super_admin',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Could not sync Super Admin /admins record:', err);
  }

  const fresh = await getFirestoreUserProfile(uid);
  if (!fresh) {
    throw new Error('Super Admin profile could not be loaded from Firestore.');
  }
  return fresh;
}

/**
 * Syncs role/status/permission edits for an existing Firebase user into Firestore
 * (enforced by firestore.rules isSuperAdmin() / isFullAdmin()).
 * Gracefully skips legacy local backend IDs (usr_*) that do not exist in Firestore.
 */
export async function syncManagedUserInFirestore(params: {
  uid: string;
  email: string;
  name?: string;
  role: UserRole;
  status: 'active' | 'disabled';
  institution?: string;
  permissions?: SubAdminPermission[];
}): Promise<boolean> {
  if (!isFirebaseUid(params.uid) || params.role === 'super_admin') {
    return false;
  }

  try {
    const userRef = doc(db, 'users', params.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const updates: Record<string, unknown> = {
        role: params.role,
        accountStatus: params.status,
        updatedAt: serverTimestamp(),
      };
      if (params.name?.trim()) {
        updates.fullName = params.name.trim().slice(0, 120);
      }
      if (typeof params.institution === 'string') {
        updates.institution = params.institution.trim().slice(0, 160);
      }
      if (params.role === 'sub_admin' && Array.isArray(params.permissions)) {
        updates.permissions = params.permissions;
      } else {
        updates.permissions = deleteField();
      }
      if (params.role === 'admin' || params.role === 'sub_admin') {
        updates.adminId = userSnap.data()?.adminId || `ADM-${params.uid.slice(0, 6).toUpperCase()}`;
      }
      await updateDoc(userRef, updates);
    }

    const adminRef = doc(db, 'admins', params.uid);
    if (params.role === 'admin' || params.role === 'sub_admin') {
      const adminSnap = await getDoc(adminRef);
      const cleanEmail = params.email.trim().toLowerCase();
      if (adminSnap.exists()) {
        await updateDoc(adminRef, {
          email: cleanEmail,
          role: params.role,
          status: params.status,
          ...(params.role === 'sub_admin' && Array.isArray(params.permissions)
            ? { permissions: params.permissions }
            : { permissions: deleteField() }),
          updatedAt: serverTimestamp(),
        });
      } else {
        const record: Record<string, unknown> = {
          uid: params.uid,
          email: cleanEmail,
          role: params.role,
          status: params.status,
          createdBy: auth.currentUser?.uid || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (params.role === 'sub_admin' && Array.isArray(params.permissions)) {
          record.permissions = params.permissions;
        }
        await setDoc(adminRef, record);
      }
    } else {
      // Demoted to student/teacher: remove any /admins/{uid} entry so Firestore rules immediately revoke admin access
      const adminSnap = await getDoc(adminRef);
      if (adminSnap.exists()) {
        await deleteDoc(adminRef);
      }
    }
    return true;
  } catch (err) {
    console.warn('Firestore user role sync skipped or denied:', err);
    return false;
  }
}

export async function deleteManagedUserInFirestore(uid: string): Promise<boolean> {
  if (!isFirebaseUid(uid)) return false;
  try {
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      await deleteDoc(adminRef);
    }
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      await deleteDoc(userRef);
    }
    return true;
  } catch (err) {
    console.warn('Firestore user delete skipped or denied:', err);
    return false;
  }
}

export async function syncSystemSettingsToFirestore(settings: Partial<SystemSettings>): Promise<void> {
  if (!isVerifiedSuperAdminFirebaseUser(auth.currentUser)) return;
  try {
    const payload: Record<string, unknown> = {
      superAdminEmail: SUPER_ADMIN_EMAIL,
      adminSetupCompleted: true,
      updatedBy: auth.currentUser?.uid || '',
      updatedAt: serverTimestamp(),
    };
    if (typeof settings.allowStudentRegistration === 'boolean') {
      payload.allowStudentRegistration = settings.allowStudentRegistration;
    }
    if (typeof settings.allowTeacherRegistration === 'boolean') {
      payload.allowTeacherRegistration = settings.allowTeacherRegistration;
    }
    if (typeof settings.requireEmailVerification === 'boolean') {
      payload.requireEmailVerification = settings.requireEmailVerification;
    }
    if (typeof settings.maintenanceMode === 'boolean') {
      payload.maintenanceMode = settings.maintenanceMode;
    }
    if (typeof settings.maxSubAdmins === 'number') {
      payload.maxSubAdmins = settings.maxSubAdmins;
    }
    if (typeof settings.siteTitle === 'string') {
      payload.siteTitle = settings.siteTitle.slice(0, 120);
    }
    if (typeof settings.securityNotice === 'string') {
      payload.securityNotice = settings.securityNotice.slice(0, 400);
    }
    await setDoc(doc(db, 'systemConfig', 'platformSettings'), payload, { merge: true });
  } catch (err) {
    console.warn('Could not sync platformSettings to Firestore:', err);
  }
}

export async function createFirestoreUserProfileIfMissing(
  fbUser: FirebaseUser,
  options: {
    fullName?: string;
    role: 'student' | 'teacher';
    institution?: string;
  }
): Promise<FirestoreUserProfile> {
  // If this is the verified Super Admin account, sync via the dedicated Super Admin Firestore flow
  if (isVerifiedSuperAdminFirebaseUser(fbUser)) {
    return syncSuperAdminFirestoreProfile(fbUser);
  }

  const uid = fbUser.uid;
  const path = `users/${uid}`;

  // Always check first — NEVER overwrite an existing registered account
  const existing = await getFirestoreUserProfile(uid);
  if (existing) {
    return existing;
  }

  const email = (fbUser.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('A verified email address is required to create an account.');
  }

  // Enforce: ordinary client self-registration may ONLY create 'student' or 'teacher'
  const safeRole: 'student' | 'teacher' = options.role === 'teacher' ? 'teacher' : 'student';

  const resolvedName = (
    options.fullName ||
    fbUser.displayName ||
    email.split('@')[0] ||
    'VisuaLearn User'
  )
    .trim()
    .slice(0, 120);

  const idSuffix = uid.slice(0, 6).toUpperCase();
  const profileDoc: Record<string, unknown> = {
    uid,
    fullName: resolvedName,
    email,
    role: safeRole,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    profileCompleted: true,
    accountStatus: 'active',
  };

  if (options.institution?.trim()) {
    profileDoc.institution = options.institution.trim().slice(0, 160);
  }
  if (fbUser.photoURL) {
    profileDoc.avatar = fbUser.photoURL;
  }
  if (safeRole === 'student') {
    profileDoc.studentId = `STU-${idSuffix}`;
  } else {
    profileDoc.teacherId = `FAC-${idSuffix}`;
  }

  try {
    await setDoc(doc(db, 'users', uid), profileDoc);
    const created = await getFirestoreUserProfile(uid);
    if (!created) {
      throw new Error('Account was created but profile could not be loaded.');
    }
    return created;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordUserLastLogin(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Could not update lastLoginAt for', path, error);
  }
}

export async function updateFirestoreUserProfile(
  uid: string,
  updates: {
    fullName?: string;
    institution?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    bio?: string;
    avatar?: string | null;
    qualification?: string;
    specialization?: string;
  }
): Promise<FirestoreUserProfile> {
  const path = `users/${uid}`;
  const cleanPayload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.fullName === 'string' && updates.fullName.trim()) {
    cleanPayload.fullName = updates.fullName.trim().slice(0, 120);
  }
  if (typeof updates.institution === 'string') {
    cleanPayload.institution = updates.institution.trim().slice(0, 160);
  }
  if (typeof updates.phone === 'string') {
    cleanPayload.phone = updates.phone.trim().slice(0, 40);
  }
  if (typeof updates.dateOfBirth === 'string') {
    cleanPayload.dateOfBirth = updates.dateOfBirth.trim().slice(0, 32);
  }
  if (typeof updates.gender === 'string') {
    cleanPayload.gender = updates.gender.trim().slice(0, 32);
  }
  if (typeof updates.bio === 'string') {
    cleanPayload.bio = updates.bio.trim().slice(0, 1000);
  }
  if (typeof updates.avatar === 'string') {
    cleanPayload.avatar = updates.avatar;
  } else if (updates.avatar === null) {
    cleanPayload.avatar = '';
  }
  if (typeof updates.qualification === 'string') {
    cleanPayload.qualification = updates.qualification.trim().slice(0, 160);
  }
  if (typeof updates.specialization === 'string') {
    cleanPayload.specialization = updates.specialization.trim().slice(0, 160);
  }

  try {
    await updateDoc(doc(db, 'users', uid), cleanPayload);
    if (auth.currentUser && typeof cleanPayload.fullName === 'string') {
      await updateProfile(auth.currentUser, { displayName: cleanPayload.fullName }).catch(() => {});
    }
    const fresh = await getFirestoreUserProfile(uid);
    if (!fresh) {
      throw new Error('Updated profile could not be loaded.');
    }
    return fresh;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function registerUserWithFirebase(params: {
  fullName: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
  institution?: string;
}): Promise<{ firebaseUser: FirebaseUser; profile: FirestoreUserProfile }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.fullName.trim();

  if (!cleanName) {
    throw new Error('Please enter your full name.');
  }
  if (!cleanEmail) {
    throw new Error('Please enter a valid email address.');
  }
  if (params.role !== 'student' && params.role !== 'teacher') {
    throw new Error('Self-registration is only available for Student or Teacher accounts.');
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
    const fbUser = credential.user;

    await updateProfile(fbUser, { displayName: cleanName }).catch(() => {});

    const profile = await createFirestoreUserProfileIfMissing(fbUser, {
      fullName: cleanName,
      role: params.role,
      institution: params.institution,
    });

    return { firebaseUser: fbUser, profile };
  } catch (error: any) {
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function loginUserWithFirebaseEmail(
  email: string,
  password: string
): Promise<{ firebaseUser: FirebaseUser; profile: FirestoreUserProfile }> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = credential.user;

    // Require verified email before granting Super Admin access
    if (isUnverifiedSuperAdminFirebaseUser(fbUser)) {
      throw Object.assign(
        new Error(
          `Your email (${SUPER_ADMIN_EMAIL}) must be verified before Super Admin access can be granted. Please verify your email and try again.`
        ),
        { code: SUPER_ADMIN_EMAIL_UNVERIFIED_CODE }
      );
    }

    if (isVerifiedSuperAdminFirebaseUser(fbUser)) {
      const profile = await syncSuperAdminFirestoreProfile(fbUser);
      return { firebaseUser: fbUser, profile };
    }

    let profile = await getFirestoreUserProfile(fbUser.uid);
    if (!profile) {
      // Check if this Firebase account is an authorized Admin / Sub Admin in /admins/{uid}
      const adminRec = await getFirestoreAdminRecord(fbUser.uid);
      if (adminRec && adminRec.role !== 'super_admin') {
        if (adminRec.status === 'disabled') {
          await signOut(auth);
          throw new Error('Your administrator account has been deactivated. Please contact the Super Admin.');
        }
        profile = {
          uid: fbUser.uid,
          fullName: fbUser.displayName || cleanEmail.split('@')[0] || 'Administrator',
          email: cleanEmail,
          role: adminRec.role,
          profileCompleted: true,
          accountStatus: 'active',
          permissions: adminRec.permissions,
          adminId: `ADM-${fbUser.uid.slice(0, 6).toUpperCase()}`,
        };
      } else {
        // Never silently classify an account with a missing Firestore profile as a student.
        await signOut(auth);
        throw new Error(
          'Your VisuaLearn user profile is missing or incomplete. Please complete registration or contact an administrator to verify your account role.'
        );
      }
    } else if (profile.accountStatus === 'disabled') {
      await signOut(auth);
      throw new Error('Your account has been deactivated. Please contact an administrator.');
    } else {
      void recordUserLastLogin(fbUser.uid);
    }

    return { firebaseUser: fbUser, profile };
  } catch (error: any) {
    if (error?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
      throw error;
    }
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function signInWithFirebaseGoogle(
  preferredRole: 'student' | 'teacher' = 'student'
): Promise<{ firebaseUser: FirebaseUser; profile: FirestoreUserProfile; isNewUser: boolean }> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const fbUser = credential.user;

    if (isUnverifiedSuperAdminFirebaseUser(fbUser)) {
      throw Object.assign(
        new Error(
          `Your email (${SUPER_ADMIN_EMAIL}) must be verified before Super Admin access can be granted.`
        ),
        { code: SUPER_ADMIN_EMAIL_UNVERIFIED_CODE }
      );
    }

    if (isVerifiedSuperAdminFirebaseUser(fbUser)) {
      const profile = await syncSuperAdminFirestoreProfile(fbUser);
      return { firebaseUser: fbUser, profile, isNewUser: false };
    }

    const existing = await getFirestoreUserProfile(fbUser.uid);
    if (existing) {
      if (existing.accountStatus === 'disabled') {
        await signOut(auth);
        throw new Error('Your account has been deactivated. Please contact an administrator.');
      }
      void recordUserLastLogin(fbUser.uid);
      return { firebaseUser: fbUser, profile: existing, isNewUser: false };
    }

    const created = await createFirestoreUserProfileIfMissing(fbUser, {
      fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'VisuaLearn User',
      role: preferredRole,
    });
    return { firebaseUser: fbUser, profile: created, isNewUser: true };
  } catch (error: any) {
    if (error?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
      throw error;
    }
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function sendFirebaseVerificationEmail(): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Please sign in first before requesting a verification email.');
  }
  try {
    await sendEmailVerification(fbUser);
  } catch (error: any) {
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function reloadCurrentFirebaseUser(): Promise<FirebaseUser | null> {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;
  await fbUser.reload();
  await fbUser.getIdToken(true);
  return auth.currentUser;
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (error: any) {
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function changeFirebaseUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.email) {
    throw new Error('No active Firebase email session found.');
  }

  const hasPasswordProvider = fbUser.providerData.some((p) => p.providerId === 'password');
  if (!hasPasswordProvider) {
    throw new Error('Password changes are managed through your Google account provider.');
  }

  try {
    const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
    await reauthenticateWithCredential(fbUser, credential);
    await updatePassword(fbUser, newPassword);
  } catch (error: any) {
    if (error?.code && String(error.code).startsWith('auth/')) {
      throw new Error(formatFirebaseAuthError(error));
    }
    throw error;
  }
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}
