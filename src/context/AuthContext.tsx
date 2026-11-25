import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { User, UserRole, SubAdminPermission } from '../types';
import { api } from '../services/api';
import { auth } from '../firebase';
import {
  SUPER_ADMIN_EMAIL_UNVERIFIED_CODE,
  isSuperAdminEmailAddress,
  isVerifiedSuperAdminFirebaseUser,
  isUnverifiedSuperAdminFirebaseUser,
  getFirestoreUserProfile,
  getFirestoreAdminRecord,
  syncSuperAdminFirestoreProfile,
  createFirestoreUserProfileIfMissing,
  mapFirestoreProfileToUser,
  registerUserWithFirebase,
  loginUserWithFirebaseEmail,
  signInWithFirebaseGoogle,
  signOutFromFirebase,
  sendFirebasePasswordReset,
  sendFirebaseVerificationEmail,
  reloadCurrentFirebaseUser,
  updateFirestoreUserProfile,
  isPrivilegedRole,
  FirestoreUserProfile,
} from '../services/firebaseAuthService';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isStudent: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isSubAdmin: boolean;
  unverifiedSuperAdminEmail: string | null;
  hasPermission: (perm: SubAdminPermission) => boolean;
  login: (email: string, password: string, role?: UserRole) => Promise<User>;
  loginWithGoogle: (preferredRole?: 'student' | 'teacher') => Promise<User>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: UserRole;
    institution?: string;
  }) => Promise<User>;
  resendSuperAdminVerificationEmail: () => Promise<void>;
  checkSuperAdminEmailVerification: () => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register';
  authModalInitialRole: UserRole;
  openAuthModal: (mode?: 'login' | 'register', role?: UserRole) => void;
  closeAuthModal: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (updatedUser: User) => void;
  saveProfileToFirestore: (updates: {
    fullName?: string;
    institution?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    bio?: string;
    avatar?: string | null;
    qualification?: string;
    specialization?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function syncProfileWithBackend(
  fbUser: FirebaseUser,
  profile: FirestoreUserProfile
): Promise<User> {
  const firestoreMapped = mapFirestoreProfileToUser(profile);
  const verifiedSuperAdmin = isVerifiedSuperAdminFirebaseUser(fbUser);

  // Check Firestore /admins/{uid} registry for promoted Admin / Sub-Admin accounts (requires verified email)
  let firestoreAdminRole: 'admin' | 'sub_admin' | null = null;
  let firestoreAdminPermissions: SubAdminPermission[] | undefined;
  if (!verifiedSuperAdmin && fbUser.emailVerified) {
    const adminRec = await getFirestoreAdminRecord(fbUser.uid);
    if (adminRec && adminRec.status !== 'disabled') {
      if (adminRec.role === 'admin' || adminRec.role === 'sub_admin') {
        firestoreAdminRole = adminRec.role;
        firestoreAdminPermissions = adminRec.permissions;
      }
    }
  }

  try {
    // Prevent sending a stale token from a previously logged-in user if sync fails
    const existingToken = api.getToken();
    if (existingToken) {
      try {
        const payloadPart = existingToken.split('.')[1];
        if (payloadPart) {
          const decoded = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
          const tokenEmail = typeof decoded?.email === 'string' ? decoded.email.toLowerCase() : '';
          const fbEmail = (fbUser.email || '').toLowerCase();
          if (tokenEmail && fbEmail && tokenEmail !== fbEmail) {
            api.removeToken();
          }
        }
      } catch {
        api.removeToken();
      }
    }

    const idToken = await fbUser.getIdToken();
    const res = await api.syncFirebaseSession({
      idToken,
      fullName: profile.fullName,
      // Only send non-privileged roles from client; privileged roles come strictly from verified Firebase auth & backend
      role: isPrivilegedRole(profile.role) ? undefined : profile.role,
      institution: profile.institution,
      avatar: profile.avatar,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      bio: profile.bio,
      qualification: profile.qualification,
      specialization: profile.specialization,
      studentId: profile.studentId,
      teacherId: profile.teacherId,
      accountStatus: profile.accountStatus,
    });

    let authoritativeRole: UserRole = verifiedSuperAdmin
      ? 'super_admin'
      : isPrivilegedRole(res.user.role) && res.user.role !== 'super_admin'
      ? res.user.role
      : firestoreAdminRole || res.user.role || firestoreMapped.role;

    // Defense in depth: only verified Super Admin email may ever hold super_admin
    if (authoritativeRole === 'super_admin' && !verifiedSuperAdmin) {
      authoritativeRole = 'student';
    }

    return {
      ...res.user,
      ...firestoreMapped,
      id: res.user.id || firestoreMapped.id,
      uid: profile.uid,
      role: authoritativeRole,
      permissions: res.user.permissions || firestoreAdminPermissions || firestoreMapped.permissions,
    };
  } catch (err: any) {
    if (err?.code === 'EMAIL_VERIFICATION_REQUIRED') {
      throw err;
    }
    console.warn('Backend session sync warning (continuing with Firestore session):', err);
    api.removeToken();
    const fallbackRole: UserRole = verifiedSuperAdmin
      ? 'super_admin'
      : firestoreAdminRole ||
        (firestoreMapped.role === 'super_admin' ? 'student' : firestoreMapped.role);

    return {
      ...firestoreMapped,
      role: fallbackRole,
      permissions: firestoreAdminPermissions || firestoreMapped.permissions,
    };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [unverifiedSuperAdminEmail, setUnverifiedSuperAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [authModalInitialRole, setAuthModalInitialRole] = useState<UserRole>('student');

  // Guard so an in-flight explicit register/login isn't raced by onAuthStateChanged
  const explicitAuthInProgressRef = useRef<boolean>(false);

  const hydrateFromFirebaseUser = async (fbUser: FirebaseUser): Promise<User | null> => {
    // Strictly require email verification before granting Super Admin access
    if (isUnverifiedSuperAdminFirebaseUser(fbUser)) {
      api.removeToken();
      setUnverifiedSuperAdminEmail((fbUser.email || '').trim().toLowerCase());
      return null;
    }

    setUnverifiedSuperAdminEmail(null);

    if (isVerifiedSuperAdminFirebaseUser(fbUser)) {
      const profile = await syncSuperAdminFirestoreProfile(fbUser);
      return await syncProfileWithBackend(fbUser, profile);
    }

    let profile = await getFirestoreUserProfile(fbUser.uid);
    if (!profile) {
      // Honor /admins/{uid} before treating a profile as missing — never silently default to student
      const adminRec = await getFirestoreAdminRecord(fbUser.uid);
      if (adminRec && adminRec.role !== 'super_admin') {
        if (adminRec.status === 'disabled') {
          await signOutFromFirebase();
          api.removeToken();
          return null;
        }
        profile = {
          uid: fbUser.uid,
          fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Administrator',
          email: (fbUser.email || '').trim().toLowerCase(),
          role: adminRec.role,
          profileCompleted: true,
          accountStatus: 'active',
          permissions: adminRec.permissions,
          adminId: `ADM-${fbUser.uid.slice(0, 6).toUpperCase()}`,
        };
      } else {
        api.removeToken();
        return null;
      }
    }

    if (profile.accountStatus === 'disabled') {
      await signOutFromFirebase();
      api.removeToken();
      return null;
    }

    return await syncProfileWithBackend(fbUser, profile);
  };

  const refreshUser = async () => {
    try {
      const currentFb = auth.currentUser;
      if (currentFb) {
        const hydrated = await hydrateFromFirebaseUser(currentFb);
        setFirebaseUser(currentFb);
        setUser(hydrated);
      } else if (api.getToken()) {
        // Legacy local admin/sub-admin token fallback (never grants super_admin without verified Firebase Auth)
        const res = await api.getCurrentUser();
        if (
          res?.user &&
          isPrivilegedRole(res.user.role) &&
          res.user.role !== 'super_admin'
        ) {
          setUser(res.user);
        } else {
          api.removeToken();
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session refresh failed:', err);
      api.removeToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Automatic login and permanent session persistence via Firebase onAuthStateChanged
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;

      if (explicitAuthInProgressRef.current) {
        setFirebaseUser(fbUser);
        return;
      }

      if (fbUser) {
        setLoading(true);
        try {
          const hydrated = await hydrateFromFirebaseUser(fbUser);
          if (!active) return;
          setFirebaseUser(fbUser);
          setUser(hydrated);
        } catch (err) {
          console.error('Failed to restore Firebase session:', err);
          if (!active) return;
          setUser(null);
        } finally {
          if (active) setLoading(false);
        }
      } else {
        setFirebaseUser(null);
        setUnverifiedSuperAdminEmail(null);
        if (api.getToken()) {
          try {
            const res = await api.getCurrentUser();
            if (!active) return;
            if (
              res?.user &&
              isPrivilegedRole(res.user.role) &&
              res.user.role !== 'super_admin'
            ) {
              setUser(res.user);
            } else {
              api.removeToken();
              setUser(null);
            }
          } catch {
            if (!active) return;
            api.removeToken();
            setUser(null);
          } finally {
            if (active) setLoading(false);
          }
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Automatically re-sync backend session token if an API call receives 401 while Firebase Auth is active
  useEffect(() => {
    api.setFirebaseTokenProvider(async () => {
      const currentFb = auth.currentUser;
      if (!currentFb) return null;
      return currentFb.getIdToken();
    });

    api.setUnauthorizedHandler(async () => {
      const currentFb = auth.currentUser;
      if (!currentFb) return false;
      if (isUnverifiedSuperAdminFirebaseUser(currentFb)) return false;
      try {
        const profile = await getFirestoreUserProfile(currentFb.uid);
        if (!profile || profile.accountStatus === 'disabled') return false;
        const idToken = await currentFb.getIdToken(true);
        await api.syncFirebaseSession({
          idToken,
          fullName: profile.fullName,
          role: isPrivilegedRole(profile.role) ? undefined : profile.role,
          institution: profile.institution,
          accountStatus: profile.accountStatus,
        });
        return Boolean(api.getToken());
      } catch {
        return false;
      }
    });
    return () => {
      api.setUnauthorizedHandler(null);
      api.setFirebaseTokenProvider(null);
    };
  }, []);

  const login = async (email: string, password: string, role?: UserRole): Promise<User> => {
    explicitAuthInProgressRef.current = true;
    try {
      const { firebaseUser: fbUser, profile } = await loginUserWithFirebaseEmail(email, password);
      const syncedUser = await syncProfileWithBackend(fbUser, profile);
      setUnverifiedSuperAdminEmail(null);
      setFirebaseUser(fbUser);
      setUser(syncedUser);
      setAuthModalOpen(false);
      return syncedUser;
    } catch (err: any) {
      if (err?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        api.removeToken();
        setFirebaseUser(auth.currentUser);
        setUser(null);
        setUnverifiedSuperAdminEmail(email.trim().toLowerCase());
        throw err;
      }
      // Allow locally created Sub-Admin / Admin accounts (non-Super-Admin) to sign in via backend credentials
      if (
        role &&
        isPrivilegedRole(role) &&
        !isSuperAdminEmailAddress(email)
      ) {
        try {
          const backendRes = await api.login({ email: email.trim().toLowerCase(), password, role });
          if (backendRes?.user && backendRes.user.role !== 'super_admin' && isPrivilegedRole(backendRes.user.role)) {
            setUser(backendRes.user);
            setAuthModalOpen(false);
            return backendRes.user;
          }
        } catch {
          // Fall through to primary Firebase Auth error
        }
      }
      throw err;
    } finally {
      explicitAuthInProgressRef.current = false;
    }
  };

  const loginWithGoogle = async (preferredRole: 'student' | 'teacher' = 'student'): Promise<User> => {
    explicitAuthInProgressRef.current = true;
    try {
      const { firebaseUser: fbUser, profile } = await signInWithFirebaseGoogle(preferredRole);
      const syncedUser = await syncProfileWithBackend(fbUser, profile);
      setUnverifiedSuperAdminEmail(null);
      setFirebaseUser(fbUser);
      setUser(syncedUser);
      setAuthModalOpen(false);
      return syncedUser;
    } catch (err: any) {
      if (err?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        api.removeToken();
        setFirebaseUser(auth.currentUser);
        setUser(null);
        setUnverifiedSuperAdminEmail((auth.currentUser?.email || '').trim().toLowerCase() || null);
      }
      throw err;
    } finally {
      explicitAuthInProgressRef.current = false;
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: UserRole;
    institution?: string;
  }): Promise<User> => {
    if (data.password !== data.confirmPassword) {
      throw new Error('Passwords do not match. Please re-enter.');
    }
    if (data.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    if (data.role !== 'student' && data.role !== 'teacher') {
      throw new Error('Registration is only available for Student or Teacher accounts.');
    }

    explicitAuthInProgressRef.current = true;
    try {
      const { firebaseUser: fbUser, profile } = await registerUserWithFirebase({
        fullName: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        institution: data.institution,
      });

      const syncedUser = await syncProfileWithBackend(fbUser, profile);
      setFirebaseUser(fbUser);
      setUser(syncedUser);
      setAuthModalOpen(false);
      return syncedUser;
    } finally {
      explicitAuthInProgressRef.current = false;
    }
  };

  const resendSuperAdminVerificationEmail = async (): Promise<void> => {
    await sendFirebaseVerificationEmail();
  };

  const checkSuperAdminEmailVerification = async (): Promise<User | null> => {
    explicitAuthInProgressRef.current = true;
    try {
      const refreshed = await reloadCurrentFirebaseUser();
      if (!refreshed) {
        throw new Error('Session expired. Please sign in again.');
      }
      if (!refreshed.emailVerified) {
        throw new Error(
          'Your email is not verified yet. Please click the verification link in your inbox, then try again.'
        );
      }
      const hydrated = await hydrateFromFirebaseUser(refreshed);
      setFirebaseUser(refreshed);
      setUser(hydrated);
      return hydrated;
    } finally {
      explicitAuthInProgressRef.current = false;
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await sendFirebasePasswordReset(email);
  };

  const logout = async () => {
    try {
      await signOutFromFirebase();
    } catch (err) {
      console.error('Firebase signOut error:', err);
    } finally {
      api.removeToken();
      setFirebaseUser(null);
      setUnverifiedSuperAdminEmail(null);
      setUser(null);
    }
  };

  const saveProfileToFirestore = async (updates: {
    fullName?: string;
    institution?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    bio?: string;
    avatar?: string | null;
    qualification?: string;
    specialization?: string;
  }) => {
    if (!auth.currentUser) return;
    const updatedProfile = await updateFirestoreUserProfile(auth.currentUser.uid, updates);
    const mapped = mapFirestoreProfileToUser(updatedProfile);
    setUser((prev) => (prev ? { ...prev, ...mapped, role: prev.role } : mapped));
  };

  const verifiedSuperAdminSession =
    user?.role === 'super_admin' && isVerifiedSuperAdminFirebaseUser(firebaseUser);

  const hasPermission = (perm: SubAdminPermission): boolean => {
    if (!user) return false;
    if (verifiedSuperAdminSession || user.role === 'admin') return true;
    if (user.role === 'sub_admin' && user.permissions?.includes(perm)) return true;
    return false;
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login', role: UserRole = 'student') => {
    setAuthModalMode(mode);
    setAuthModalInitialRole(role);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        isAuthenticated: !!user,
        isStudent: user?.role === 'student',
        isTeacher: user?.role === 'teacher',
        isAdmin: verifiedSuperAdminSession || user?.role === 'admin' || user?.role === 'sub_admin',
        isSuperAdmin: verifiedSuperAdminSession,
        isSubAdmin: user?.role === 'sub_admin',
        unverifiedSuperAdminEmail,
        hasPermission,
        login,
        loginWithGoogle,
        register,
        resendSuperAdminVerificationEmail,
        checkSuperAdminEmailVerification,
        sendPasswordReset,
        logout,
        authModalOpen,
        authModalMode,
        authModalInitialRole,
        openAuthModal,
        closeAuthModal,
        refreshUser,
        updateUser: (updatedUser: User) => setUser(updatedUser),
        saveProfileToFirestore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
