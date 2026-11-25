import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  Radio,
  FileText,
  Settings,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Trash2,
  Edit2,
  RefreshCw,
  Power,
  Lock,
  ChevronRight,
  UserX,
  ExternalLink,
  Layers,
  Sparkles,
  Sliders,
  Check,
  Eye,
  EyeOff,
  Mail,
  LogOut,
  HelpCircle,
  MessageSquare,
  TrendingUp,
  User as UserIcon,
  LayoutGrid,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ResponsiveModal } from '../components/ResponsiveModal';
import {
  syncManagedUserInFirestore,
  deleteManagedUserInFirestore,
  syncSystemSettingsToFirestore,
} from '../services/firebaseAuthService';
import { subscribeToAdminFirestoreDirectory } from '../services/adminFirestoreService';
import {
  confirmAndSaveEnrollmentInFirestore,
  deleteEnrollmentInFirestore,
  deleteFirestoreClass,
  subscribeToAdminEnrollmentsAndClasses,
  upsertFirestoreClass,
} from '../services/enrollmentFirestoreService';
import {
  User,
  Subject,
  NoteDocument,
  Quiz,
  SubAdminPermission,
  SystemSettings,
  AdminAnalyticsData,
  AdminAuditReport,
  FirestoreDirectoryAnomaly,
} from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface Props {
  initialTab?: 'overview' | 'users' | 'students' | 'teachers' | 'subjects' | 'content' | 'live' | 'admins' | 'settings' | 'security' | 'doubts' | 'analytics';
  onNavigate: (view: string, params?: any) => void;
}

export const AdminDashboardView: React.FC<Props> = ({ initialTab, onNavigate }) => {
  const { user, firebaseUser, isAdmin, isSuperAdmin, isSubAdmin, hasPermission, logout, updateUser } = useAuth();
  const canManageAdmins = isSuperAdmin || user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'students' | 'teachers' | 'subjects' | 'content' | 'live' | 'admins' | 'settings' | 'security' | 'doubts' | 'analytics'
  >(initialTab || 'overview');
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  const [doubts, setDoubts] = useState<any[]>([]);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(false);

  const [overview, setOverview] = useState<any>(null);
  const [auditReport, setAuditReport] = useState<AdminAuditReport | null>(null);
  const [firestoreAnomalies, setFirestoreAnomalies] = useState<FirestoreDirectoryAnomaly[]>([]);
  const [showAuditDetails, setShowAuditDetails] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [liveClasses, setLiveClasses] = useState<any[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lastFirestoreSyncHashRef = useRef<string>('');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState<string>('');

  // Modals state
  const [userModalOpen, setUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [subAdminModalOpen, setSubAdminModalOpen] = useState<boolean>(false);
  const [subjectModalOpen, setSubjectModalOpen] = useState<boolean>(false);
  const [enrollmentModalOpen, setEnrollmentModalOpen] = useState<boolean>(false);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [subjectEnrollments, setSubjectEnrollments] = useState<{ enrolled: User[]; available: User[] }>({ enrolled: [], available: [] });

  useBodyScrollLock(Boolean(mobileNavOpen || userModalOpen || subAdminModalOpen || subjectModalOpen || enrollmentModalOpen));

  // Form states
  const [userForm, setUserForm] = useState<{
    name: string;
    email: string;
    password?: string;
    role: any;
    institution: string;
    status: 'active' | 'disabled';
    permissions: SubAdminPermission[];
  }>({
    name: '',
    email: '',
    password: '',
    role: 'student',
    institution: '',
    status: 'active',
    permissions: ['manage_students', 'manage_teachers', 'manage_subjects_classes'],
  });

  const [subjectForm, setSubjectForm] = useState<{
    name: string;
    description: string;
    teacher_id: string;
    section: string;
    color: string;
  }>({
    name: '',
    description: '',
    teacher_id: '',
    section: 'B21',
    color: '#0ea5e9',
  });

  // Account & Security state
  const [emailChangeStep, setEmailChangeStep] = useState<'idle' | 'request' | 'verify'>('idle');
  const [emailChangeCurrentPassword, setEmailChangeCurrentPassword] = useState<string>('');
  const [emailChangeNewEmail, setEmailChangeNewEmail] = useState<string>('');
  const [emailChangeCode, setEmailChangeCode] = useState<string>('');
  const [emailPendingAddress, setEmailPendingAddress] = useState<string>('');
  const [emailChangeLoading, setEmailChangeLoading] = useState<boolean>(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailChangeSuccess, setEmailChangeSuccess] = useState<string | null>(null);
  const [emailShowCurrentPassword, setEmailShowCurrentPassword] = useState<boolean>(false);

  const [passwordChangeOpen, setPasswordChangeOpen] = useState<boolean>(false);
  const [passwordCurrent, setPasswordCurrent] = useState<string>('');
  const [passwordNew, setPasswordNew] = useState<string>('');
  const [passwordConfirm, setPasswordConfirm] = useState<string>('');
  const [passwordShowCurrent, setPasswordShowCurrent] = useState<boolean>(false);
  const [passwordShowNew, setPasswordShowNew] = useState<boolean>(false);
  const [passwordShowConfirm, setPasswordShowConfirm] = useState<boolean>(false);
  const [passwordLoading, setPasswordLoading] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [userFormShowPassword, setUserFormShowPassword] = useState<boolean>(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [
        overviewRes,
        usersRes,
        subjectsRes,
        liveRes,
        notesRes,
        quizzesRes,
        analyticsRes,
        doubtsRes,
        accountRes,
        auditRes,
      ] = await Promise.allSettled([
        api.getAdminOverview(),
        api.getAdminUsers(),
        api.getAdminSubjects(),
        api.getAdminLiveClasses(),
        api.getAdminNotes(),
        api.getAdminQuizzes(),
        isSuperAdmin || hasPermission('view_analytics')
          ? api.getAdminAnalytics()
          : Promise.resolve({ analytics: null as any }),
        api.getDoubts(),
        api.getAdminAccount(),
        isSuperAdmin ? api.getAdminAudit() : Promise.resolve({ audit: null as any }),
      ]);

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value);
        setSettings(overviewRes.value.settings);
      } else {
        throw overviewRes.reason;
      }

      if (usersRes.status === 'fulfilled') {
        setUsers(Array.isArray(usersRes.value?.users) ? usersRes.value.users : []);
      }
      if (subjectsRes.status === 'fulfilled') {
        setSubjects(Array.isArray(subjectsRes.value?.subjects) ? subjectsRes.value.subjects : []);
      }
      if (liveRes.status === 'fulfilled') {
        setLiveClasses(Array.isArray(liveRes.value?.liveClasses) ? liveRes.value.liveClasses : []);
      }
      if (notesRes.status === 'fulfilled') {
        setNotes(Array.isArray(notesRes.value?.notes) ? notesRes.value.notes : []);
      }
      if (quizzesRes.status === 'fulfilled') {
        setQuizzes(Array.isArray(quizzesRes.value?.quizzes) ? quizzesRes.value.quizzes : []);
      }
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value?.analytics) {
        setAdminAnalytics(analyticsRes.value.analytics);
      }
      if (doubtsRes.status === 'fulfilled') {
        setDoubts(Array.isArray(doubtsRes.value?.doubts) ? doubtsRes.value.doubts : []);
      }
      if (
        accountRes.status === 'fulfilled' &&
        accountRes.value.pendingNewEmail &&
        accountRes.value.hasPendingEmailVerification
      ) {
        setEmailPendingAddress(accountRes.value.pendingNewEmail);
        setEmailChangeStep('verify');
      }
      if (auditRes.status === 'fulfilled' && auditRes.value?.audit) {
        setAuditReport(auditRes.value.audit);
      }
    } catch (err: any) {
      if (!options?.silent) {
        setError(err.message || 'Failed to load administration data.');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [isSuperAdmin, hasPermission]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time Firestore synchronization for /users and /admins collections.
  // Keeps the Admin Portal reconciled with live Firebase user registrations, role updates,
  // and status changes automatically with proper listener cleanup on unmount.
  useEffect(() => {
    if (!isAdmin || !firebaseUser) return;

    const unsubscribe = subscribeToAdminFirestoreDirectory({
      onSnapshotUpdate: ({ users: fsUsers, admins: fsAdmins, anomalies }) => {
        setFirestoreAnomalies(anomalies);

        const fingerprint = JSON.stringify({
          u: fsUsers
            .map((u) => [u.uid, u.email, u.fullName || '', u.role || '', u.accountStatus || '', u.institution || '', (u.permissions || []).join(',')])
            .sort((a, b) => a[0].localeCompare(b[0])),
          a: fsAdmins
            .map((a) => [a.uid, a.email, a.role, a.status || '', (a.permissions || []).join(',')])
            .sort((a, b) => a[0].localeCompare(b[0])),
        });

        if (fingerprint === lastFirestoreSyncHashRef.current) return;
        lastFirestoreSyncHashRef.current = fingerprint;

        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
        }
        syncTimerRef.current = setTimeout(async () => {
          try {
            await api.syncFirestoreUsers({ users: fsUsers, admins: fsAdmins });
            await loadData({ silent: true });
          } catch (syncErr) {
            console.warn('Firestore directory reconciliation warning:', syncErr);
          }
        }, 250);
      },
      onError: (msg) => {
        console.warn('Firestore real-time directory listener notice:', msg);
      },
    });

    return () => {
      unsubscribe();
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [isAdmin, firebaseUser, loadData]);

  // Real-time Firestore synchronization for /enrollments and /classes collections.
  // Keeps Super Admin & Admin enrollment management synchronized across sessions and restarts.
  useEffect(() => {
    if (!isAdmin || !firebaseUser) return;

    let lastEnrollHash = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeToAdminEnrollmentsAndClasses(
      ({ enrollments, classes }) => {
        if (enrollments.length === 0 && classes.length === 0) return;

        const hash = JSON.stringify({
          e: enrollments.map((e) => `${e.studentId}:${e.classId}:${e.status}`).sort(),
          c: classes.map((c) => `${c.id}:${c.classCode}:${c.status}`).sort(),
        });

        if (hash === lastEnrollHash) return;
        lastEnrollHash = hash;

        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            await api.syncEnrollmentsFromFirestore({ enrollments, classes });
            await loadData({ silent: true });
          } catch (syncErr) {
            console.warn('Admin Firestore enrollment sync warning:', syncErr);
          }
        }, 300);
      },
      (msg) => {
        console.warn('Admin Firestore enrollment listener notice:', msg);
      }
    );

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [isAdmin, firebaseUser, loadData]);

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailChangeError(null);
    setEmailChangeSuccess(null);

    if (!emailChangeCurrentPassword) {
      setEmailChangeError('Current administrator password is required.');
      return;
    }
    if (!emailChangeNewEmail.trim()) {
      setEmailChangeError('Please enter a valid new email address.');
      return;
    }

    setEmailChangeLoading(true);
    try {
      const res = await api.requestAdminEmailChange({
        currentPassword: emailChangeCurrentPassword,
        newEmail: emailChangeNewEmail.trim().toLowerCase(),
      });
      setEmailPendingAddress(res.pendingEmail || emailChangeNewEmail.trim().toLowerCase());
      setEmailChangeStep('verify');
      setEmailChangeSuccess(res.message || 'Verification code dispatched to your new email.');
      setEmailChangeCode('');
    } catch (err: any) {
      setEmailChangeError(err.message || 'Failed to dispatch verification email.');
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleVerifyEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailChangeError(null);
    setEmailChangeSuccess(null);

    if (!emailChangeCode.trim() || emailChangeCode.trim().length !== 6) {
      setEmailChangeError('Please enter the 6-digit verification code.');
      return;
    }

    setEmailChangeLoading(true);
    try {
      const res = await api.verifyAdminEmailChange(emailChangeCode.trim());
      if (res.user) {
        updateUser(res.user);
      }
      setEmailChangeStep('idle');
      setEmailChangeCurrentPassword('');
      setEmailChangeNewEmail('');
      setEmailChangeCode('');
      setEmailPendingAddress('');
      showSuccess(res.message || 'Administrator email updated successfully.');
    } catch (err: any) {
      setEmailChangeError(err.message || 'Email verification failed.');
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleResendEmailCode = async () => {
    setEmailChangeError(null);
    setEmailChangeLoading(true);
    try {
      const res = await api.resendAdminEmailChangeCode();
      setEmailChangeSuccess(res.message || 'Fresh verification code dispatched.');
    } catch (err: any) {
      setEmailChangeError(err.message || 'Failed to resend verification code.');
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleCancelEmailChange = async () => {
    setEmailChangeLoading(true);
    try {
      await api.cancelAdminEmailChange();
    } catch {
      // ignore
    } finally {
      setEmailChangeStep('idle');
      setEmailChangeCurrentPassword('');
      setEmailChangeNewEmail('');
      setEmailChangeCode('');
      setEmailPendingAddress('');
      setEmailChangeLoading(false);
      setEmailChangeError(null);
      setEmailChangeSuccess(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!passwordCurrent) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!passwordNew || passwordNew.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (passwordNew === passwordCurrent) {
      setPasswordError('New password must be different from current password.');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError('New password and confirmation password do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.changeAdminPassword({
        currentPassword: passwordCurrent,
        newPassword: passwordNew,
        confirmNewPassword: passwordConfirm,
      });
      setPasswordSuccess(res.message || 'Password changed successfully.');
      setTimeout(() => {
        logout();
        onNavigate('admin_signin', {
          mode: 'login',
          message: 'Password updated successfully. Please log in with your new password.',
        });
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
      setPasswordLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  // Toggle user status
  const handleToggleStatus = async (targetUser: User) => {
    if (targetUser.role === 'super_admin') {
      setError('The Super Admin account cannot be disabled.');
      return;
    }
    const nextStatus = targetUser.status === 'disabled' ? 'active' : 'disabled';
    try {
      await api.toggleUserStatus(targetUser.id, nextStatus);
      await syncManagedUserInFirestore({
        uid: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        status: nextStatus,
        institution: targetUser.institution,
        permissions: targetUser.permissions,
      });
      showSuccess(`Status of ${targetUser.name} updated to ${nextStatus}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Status update failed.');
    }
  };

  // Delete user
  const handleDeleteUser = (targetUser: User) => {
    if (targetUser.role === 'super_admin') {
      setError('The Super Admin account cannot be deleted.');
      return;
    }
    setConfirmDialog({
      title: 'Delete User',
      message: `Are you sure you want to permanently delete user "${targetUser.name}"?`,
      confirmLabel: 'Delete User',
      onConfirm: async () => {
        try {
          const res = await api.deleteAdminUser(targetUser.id);
          await deleteManagedUserInFirestore(targetUser.id);
          showSuccess(
            res.firebaseLimitationNotice
              ? `User ${targetUser.name} removed from VisuaLearn & Firestore. Note: ${res.firebaseLimitationNotice}`
              : `User ${targetUser.name} deleted successfully.`
          );
          loadData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete user.');
        }
      },
    });
  };

  // Submit User (Create / Edit)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingUser) {
        const res = await api.updateAdminUser(editingUser.id, {
          name: userForm.name,
          email: userForm.email,
          role: canManageAdmins && editingUser.role !== 'super_admin' ? userForm.role : undefined,
          institution: userForm.institution,
          status: userForm.status,
          permissions: userForm.role === 'sub_admin' ? userForm.permissions : undefined,
          password: userForm.password || undefined,
        });
        await syncManagedUserInFirestore({
          uid: editingUser.id,
          email: res.user.email,
          name: res.user.name,
          role: res.user.role,
          status: res.user.status || 'active',
          institution: res.user.institution,
          permissions: res.user.permissions,
        });
        showSuccess(`User ${userForm.name} updated successfully.`);
      } else {
        if (!userForm.password || userForm.password.length < 6) {
          setError('Password is required and must be at least 6 characters long.');
          return;
        }
        const res = await api.createAdminUser({
          name: userForm.name,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          institution: userForm.institution,
          permissions: userForm.role === 'sub_admin' ? userForm.permissions : undefined,
        });
        showSuccess(
          res.firebaseLimitationNotice
            ? `New ${userForm.role.replace('_', ' ')} saved. ${res.firebaseLimitationNotice}`
            : `New ${userForm.role.replace('_', ' ')} created successfully.`
        );
      }
      setUserModalOpen(false);
      setSubAdminModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save user.');
    }
  };

  // Create Subject
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createAdminSubject({
        name: subjectForm.name,
        description: subjectForm.description,
        teacher_id: subjectForm.teacher_id || undefined,
        section: subjectForm.section,
        color: subjectForm.color,
      });
      if (firebaseUser?.uid && res?.subject?.id && res?.subject?.class_code) {
        await upsertFirestoreClass({
          id: res.subject.id,
          name: res.subject.name,
          code: res.subject.code,
          description: res.subject.description,
          teacherId: res.subject.teacher_id || firebaseUser.uid,
          teacherName: res.subject.teacher_name || 'Faculty Instructor',
          section: res.subject.section || 'B21',
          classCode: res.subject.class_code,
          status: 'active',
          iconName: res.subject.iconName,
          color: res.subject.color,
          thumbnail: res.subject.thumbnail,
        });
      }
      showSuccess(`Subject ${subjectForm.name} created successfully.`);
      setSubjectModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create subject.');
    }
  };

  // Delete Subject
  const handleDeleteSubject = (subjectId: string, name: string) => {
    setConfirmDialog({
      title: 'Delete Class',
      message: `Delete class "${name}"? This removes all enrollments and associated live sessions.`,
      confirmLabel: 'Delete Class',
      onConfirm: async () => {
        try {
          await api.deleteAdminSubject(subjectId);
          if (firebaseUser?.uid) {
            await deleteFirestoreClass(subjectId);
          }
          showSuccess(`Class "${name}" deleted.`);
          loadData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete class.');
        }
      },
    });
  };

  // Regenerate class code
  const handleRegenerateCode = async (subjectId: string) => {
    try {
      const res = await api.regenerateAdminClassCode(subjectId);
      const targetSubj = subjects.find((s) => s.id === subjectId);
      if (firebaseUser?.uid && targetSubj && res?.class_code) {
        await upsertFirestoreClass({
          id: targetSubj.id,
          name: targetSubj.name,
          code: targetSubj.code,
          description: targetSubj.description,
          teacherId: targetSubj.teacher_id || firebaseUser.uid,
          teacherName: targetSubj.teacher_name || 'Faculty Instructor',
          section: targetSubj.section || 'B21',
          classCode: res.class_code,
          status: (targetSubj.status as any) || 'active',
          iconName: targetSubj.iconName,
          color: targetSubj.color,
          thumbnail: targetSubj.thumbnail,
        });
      }
      showSuccess(`New class code generated: ${res.class_code}`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate class code.');
    }
  };

  // Manage enrollments
  const openEnrollmentModal = async (subject: any) => {
    setSelectedSubject(subject);
    try {
      const res = await api.getSubjectEnrollments(subject.id);
      setSubjectEnrollments({
        enrolled: Array.isArray(res?.enrolled) ? res.enrolled : [],
        available: Array.isArray(res?.available) ? res.available : [],
      });
      setEnrollmentModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load enrollment roster.');
    }
  };

  const handleEnrollStudent = async (studentId: string) => {
    if (!selectedSubject) return;
    try {
      await api.enrollStudent(selectedSubject.id, studentId);
      if (firebaseUser?.uid) {
        const studentObj =
          subjectEnrollments.available.find((s: any) => s.id === studentId) ||
          users.find((u) => u.id === studentId);
        await confirmAndSaveEnrollmentInFirestore({
          studentId,
          classId: selectedSubject.id,
          teacherId: selectedSubject.teacher_id || firebaseUser.uid,
          classCode: selectedSubject.class_code || 'CLASS',
          className: selectedSubject.name || 'Class',
          section: selectedSubject.section,
          teacherName: selectedSubject.teacher_name,
          studentName: studentObj?.name,
          studentEmail: studentObj?.email,
          enrolledBy: firebaseUser.uid,
        }).catch(() => undefined);
      }
      showSuccess('Student enrolled.');
      const res = await api.getSubjectEnrollments(selectedSubject.id);
      setSubjectEnrollments({
        enrolled: Array.isArray(res?.enrolled) ? res.enrolled : [],
        available: Array.isArray(res?.available) ? res.available : [],
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to enroll student.');
    }
  };

  const handleUnenrollStudent = async (studentId: string) => {
    if (!selectedSubject) return;
    try {
      await api.unenrollStudent(selectedSubject.id, studentId);
      if (firebaseUser?.uid) {
        await deleteEnrollmentInFirestore(studentId, selectedSubject.id);
      }
      showSuccess('Student unenrolled.');
      const res = await api.getSubjectEnrollments(selectedSubject.id);
      setSubjectEnrollments({
        enrolled: Array.isArray(res?.enrolled) ? res.enrolled : [],
        available: Array.isArray(res?.available) ? res.available : [],
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to unenroll student.');
    }
  };

  // Force End live session
  const handleEndLiveSession = async (liveClassId: string) => {
    try {
      await api.endLiveClassAdmin(liveClassId);
      showSuccess('Live classroom session terminated.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to terminate session.');
    }
  };

  // Save Settings
  const handleSaveSettings = async (updates: Partial<SystemSettings>) => {
    try {
      await api.updateAdminSettings(updates);
      await syncSystemSettingsToFirestore({ ...(settings || {}), ...updates });
      showSuccess('System settings saved.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update settings.');
    }
  };

  // Sub Admin Capacity Check
  const subAdminCount = overview?.stats?.totalSubAdmins || 0;
  const isSubAdminLimitReached = subAdminCount >= 4;

  const ALL_PERMISSIONS: { key: SubAdminPermission; label: string; desc: string }[] = [
    { key: 'manage_students', label: 'Manage Students', desc: 'View, edit, activate/deactivate, enroll students' },
    { key: 'manage_teachers', label: 'Manage Teachers', desc: 'View, edit, activate/deactivate teachers, class assignments' },
    { key: 'manage_subjects_classes', label: 'Manage Subjects & Classes', desc: 'Create/edit classes, class codes & enrollments' },
    { key: 'manage_content', label: 'Manage Content', desc: 'Audit, manage and purge notes and assessments' },
    { key: 'manage_live_classes', label: 'Manage Live Classes', desc: 'Monitor sessions and terminate active rooms' },
    { key: 'view_analytics', label: 'View Analytics', desc: 'Inspect platform usage, statistics and logs' },
  ];

  const safeUsers = Array.isArray(users) ? users : [];
  const formatShortDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const recentUsersList: User[] =
    Array.isArray(overview?.recentUsers) && overview.recentUsers.length > 0
      ? overview.recentUsers.slice(0, 5)
      : [...safeUsers]
          .sort(
            (a, b) =>
              new Date(b.created_at || b.createdAt || 0).getTime() -
              new Date(a.created_at || a.createdAt || 0).getTime()
          )
          .slice(0, 5);

  const filteredUsers = safeUsers.filter((u) => {
    if (userRoleFilter === 'student' && u.role !== 'student') return false;
    if (userRoleFilter === 'teacher' && u.role !== 'teacher') return false;
    if (userRoleFilter === 'admin' && u.role !== 'super_admin' && u.role !== 'admin' && u.role !== 'sub_admin') return false;
    if (userRoleFilter === 'sub_admin' && u.role !== 'sub_admin') return false;
    if (userRoleFilter === 'super_admin' && u.role !== 'super_admin') return false;
    if (userStatusFilter !== 'all' && (u.status || 'active') !== userStatusFilter) return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.uid || u.id || '').toLowerCase().includes(q) ||
        Boolean(u.institution && u.institution.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalAuditIssues = (auditReport?.totalIssues || 0) + firestoreAnomalies.length;

  return (
    <div className="min-h-dvh w-full max-w-full bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      {/* Top Banner Header */}
      <div className="border-b border-slate-200/90 bg-white px-3 sm:px-8 py-4 sm:py-5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="type-page-title text-slate-900">Enterprise Administration</h1>
                {isSuperAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    Super Admin
                  </span>
                ) : user?.role === 'admin' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-blue-600" />
                    Admin
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-600" />
                    Sub Admin
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5 leading-relaxed">
                {canManageAdmins
                  ? 'Complete authority over users, teachers, students, curricula, live sessions, and admin governance.'
                  : 'Role-based administration. Operational permissions assigned by Administrator.'}
              </p>
            </div>
          </div>

          {/* Quick Metrics & Sub Admin Cap */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center gap-3">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Sub Admin Capacity</span>
                <span className="font-bold text-slate-800">
                  {subAdminCount} / 4 Assigned
                </span>
              </div>
              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${isSubAdminLimitReached ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${(subAdminCount / 4) * 100}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => void loadData()}
              className="p-2.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 active:scale-95 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => {
                logout();
                onNavigate('admin_signin', { mode: 'login', message: 'You have been logged out of the Admin Portal.' });
              }}
              className="px-3 py-2 min-h-[44px] sm:min-h-0 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 active:scale-95 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Logout from Admin Portal"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop & Tablet Navigation Tabs Bar (smartphones use native fixed bottom dock + Sections sheet) */}
      <div className="hidden sm:block border-b border-slate-200 bg-white px-3 sm:px-8 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center gap-2 py-2.5">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'overview' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

          {(isSuperAdmin || hasPermission('manage_students') || hasPermission('manage_teachers')) && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'users' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>All Users ({users.length})</span>
            </button>
          )}

          {(isSuperAdmin || hasPermission('manage_students')) && (
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'students' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Students ({users.filter((u) => u.role === 'student').length})</span>
            </button>
          )}

          {(isSuperAdmin || hasPermission('manage_teachers')) && (
            <button
              onClick={() => setActiveTab('teachers')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'teachers' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Teachers ({users.filter((u) => u.role === 'teacher').length})</span>
            </button>
          )}

          {(isSuperAdmin || hasPermission('manage_subjects_classes')) && (
            <button
              onClick={() => setActiveTab('subjects')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'subjects' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Classes & Subjects ({subjects.length})</span>
            </button>
          )}

          {(isSuperAdmin || hasPermission('manage_content')) && (
            <button
              onClick={() => setActiveTab('content')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'content' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Content</span>
            </button>
          )}

          {(isSuperAdmin || hasPermission('manage_live_classes')) && (
            <button
              onClick={() => setActiveTab('live')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'live' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Live Classes ({liveClasses.length})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('doubts')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'doubts' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Doubts ({doubts.length})</span>
          </button>

          {(isSuperAdmin || hasPermission('view_analytics')) && (
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'analytics' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Platform Analytics</span>
            </button>
          )}

          {canManageAdmins && (
            <button
              onClick={() => setActiveTab('admins')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'admins' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Shield className="w-4 h-4 text-purple-600" />
              <span>Admin Management ({users.filter((u) => u.role === 'admin' || u.role === 'sub_admin').length})</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'settings' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>System Settings</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'security' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Account & Security</span>
          </button>

            <button
              onClick={() => onNavigate('edit_profile')}
              className="px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap text-slate-700 hover:text-slate-900 hover:bg-slate-100 ml-auto cursor-pointer border border-slate-200 shrink-0"
              title="Edit Profile"
            >
              <UserIcon className="w-4 h-4 text-blue-600" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Admin Sections Bottom Sheet */}
      {mobileNavOpen && (
        <div
          className="sm:hidden fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-end"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="w-full max-h-[min(85dvh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain bg-white rounded-t-3xl px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl mobile-sheet-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-drag-handle" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="type-card-title text-slate-900 block">Admin Sections</span>
                <span className="text-[11px] text-slate-500">
                  {isSuperAdmin ? 'Super Admin Console' : user?.role === 'admin' ? 'Administrator Console' : 'Sub Admin Console'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                aria-label="Close admin sections menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs font-semibold">
              {[
                { key: 'overview' as const, label: 'Dashboard', icon: Sliders, show: true },
                { key: 'users' as const, label: `All Users (${users.length})`, icon: Users, show: isSuperAdmin || hasPermission('manage_students') || hasPermission('manage_teachers') },
                { key: 'students' as const, label: `Students (${users.filter((u) => u.role === 'student').length})`, icon: GraduationCap, show: isSuperAdmin || hasPermission('manage_students') },
                { key: 'teachers' as const, label: `Teachers (${users.filter((u) => u.role === 'teacher').length})`, icon: UserCheck, show: isSuperAdmin || hasPermission('manage_teachers') },
                { key: 'subjects' as const, label: `Classes (${subjects.length})`, icon: BookOpen, show: isSuperAdmin || hasPermission('manage_subjects_classes') },
                { key: 'content' as const, label: 'Content', icon: FileText, show: isSuperAdmin || hasPermission('manage_content') },
                { key: 'live' as const, label: `Live (${liveClasses.length})`, icon: Radio, show: isSuperAdmin || hasPermission('manage_live_classes') },
                { key: 'doubts' as const, label: `Doubts (${doubts.length})`, icon: HelpCircle, show: true },
                { key: 'analytics' as const, label: 'Analytics', icon: TrendingUp, show: isSuperAdmin || hasPermission('view_analytics') },
                { key: 'admins' as const, label: 'Admin Mgmt', icon: Shield, show: canManageAdmins },
                { key: 'settings' as const, label: 'Settings', icon: Settings, show: isSuperAdmin },
                { key: 'security' as const, label: 'Security', icon: ShieldCheck, show: true },
              ]
                .filter((item) => item.show)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.key);
                        setMobileNavOpen(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`p-3 min-h-[56px] rounded-2xl border text-left flex items-center gap-2.5 min-w-0 active:scale-[0.98] transition-all cursor-pointer ${
                        activeTab === item.key
                          ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold shadow-2xs'
                          : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onNavigate('edit_profile');
                }}
                className="p-3 min-h-[56px] rounded-2xl border bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100 text-left flex items-center gap-2.5 min-w-0 active:scale-[0.98] transition-all cursor-pointer"
              >
                <UserIcon className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">Edit Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Alerts */}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-8 mt-4 space-y-2">
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between font-medium shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold p-1">✕</button>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between font-medium shadow-2xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-bold p-1">✕</button>
          </div>
        )}
      </div>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto w-full min-w-0 px-3 sm:px-8 py-4 sm:py-6 pb-mobile-dock sm:pb-8 flex-1">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Total Users</span>
                <span className="type-metric text-slate-900">{overview?.stats?.totalUsers ?? safeUsers.length}</span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  {overview?.stats?.activeAccounts ?? overview?.stats?.activeUsers ?? 0} active ·{' '}
                  {overview?.stats?.suspendedAccounts ?? overview?.stats?.disabledUsers ?? 0} disabled
                </span>
              </div>

              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Students</span>
                <span className="type-metric text-blue-600">{overview?.stats?.totalStudents ?? 0}</span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  {overview?.stats?.totalEnrolledStudents ?? 0} enrolled in classes
                </span>
              </div>

              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Teachers</span>
                <span className="type-metric text-slate-900">{overview?.stats?.totalTeachers ?? 0}</span>
                <span className="text-[11px] text-slate-500 block mt-1">Verified Instructors</span>
              </div>

              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Sub Admins</span>
                <div className="flex items-baseline gap-1">
                  <span className="type-metric text-purple-600">{overview?.stats?.totalSubAdmins ?? 0}</span>
                  <span className="text-xs text-slate-400">/ 4 max</span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-1">Governance Staff</span>
              </div>

              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Active Classes</span>
                <span className="type-metric text-emerald-600">{overview?.stats?.totalSubjects ?? subjects.length}</span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  {overview?.stats?.totalEnrollments ?? 0} enrollments
                </span>
              </div>

              <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Live Rooms</span>
                <span className="type-metric text-amber-600">{overview?.stats?.activeLiveSessions ?? 0}</span>
                <span className="text-[11px] text-slate-500 block mt-1">Currently Streaming</span>
              </div>
            </div>

            {/* Sub Admin Policy Notice */}
            <div className="p-5 bg-white border border-slate-200/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Admin Role Architecture</h3>
                </div>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  The system enforces strict constraints: Exactly <strong>1 Super Admin</strong> with complete control, and a maximum of <strong>4 Sub Admins</strong> with customizable permissions. Creation of a 5th Sub Admin is prevented on both backend and UI.
                </p>
              </div>

              {isSuperAdmin && (
                <button
                  disabled={isSubAdminLimitReached}
                  onClick={() => {
                    setUserForm({
                      name: '',
                      email: '',
                      password: '',
                      role: 'sub_admin',
                      institution: '',
                      status: 'active',
                      permissions: ['manage_students', 'manage_teachers', 'manage_subjects_classes'],
                    });
                    setEditingUser(null);
                    setSubAdminModalOpen(true);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isSubAdminLimitReached
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubAdminLimitReached ? 'Sub Admin Limit Reached (4/4)' : 'Create Sub Admin'}</span>
                </button>
              )}
            </div>

            {/* Quick Actions & Recent Users */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Navigation Cards */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  Administrative Command Hub
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <button
                    onClick={() => setActiveTab('users')}
                    className="p-3 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 rounded-xl text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">User Directory</div>
                      <div className="text-[10px] text-slate-500">Audit {users.length} accounts</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() => setActiveTab('subjects')}
                    className="p-3 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 rounded-xl text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">Classrooms</div>
                      <div className="text-[10px] text-slate-500">{subjects.length} active classes</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() => setActiveTab('live')}
                    className="p-3 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 rounded-xl text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">Live Monitoring</div>
                      <div className="text-[10px] text-slate-500">{liveClasses.length} sessions tracked</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  {isSuperAdmin && (
                    <button
                      onClick={() => setActiveTab('admins')}
                      className="p-3 bg-slate-50 hover:bg-purple-50/50 border border-slate-200 rounded-xl text-left transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="font-semibold text-purple-700">Admin Governance</div>
                        <div className="text-[10px] text-slate-500">Sub Admin access & limits</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Users List */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Recently Registered Users
                  </h3>
                  <button
                    onClick={() => setActiveTab('users')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-2">
                  {recentUsersList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No registered users yet.
                    </div>
                  ) : (
                    recentUsersList.map((u) => (
                      <div
                        key={u.id}
                        className="p-2.5 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              u.role === 'super_admin'
                                ? 'bg-purple-100 text-purple-700 font-bold'
                                : u.role === 'sub_admin'
                                ? 'bg-emerald-50 text-emerald-700'
                                : u.role === 'teacher'
                                ? 'bg-cyan-50 text-cyan-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {u.role.includes('admin') ? <Shield className="w-3.5 h-3.5" /> : u.role === 'teacher' ? <UserCheck className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0 truncate">
                            <div className="font-semibold text-slate-900 truncate">{u.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {u.email} · {formatShortDate(u.created_at || u.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-medium capitalize">
                            {u.role.replace('_', ' ')}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              u.status === 'disabled' ? 'bg-red-500' : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Safe Data Integrity Audit (Super Admin Review — Non-Destructive) */}
            {isSuperAdmin && auditReport && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className={`w-4 h-4 ${totalAuditIssues === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <h3 className="text-sm font-bold text-slate-900">Data Integrity Audit</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          totalAuditIssues === 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {totalAuditIssues === 0
                          ? 'All Verified Records Healthy'
                          : `${totalAuditIssues} Flagged Item${totalAuditIssues === 1 ? '' : 's'} (Excluded from Live Stats)`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Non-destructive directory verification across Firebase Auth UIDs, user roles, class teachers, and enrollments. Flagged records are preserved for review without automatic deletion.
                    </p>
                  </div>

                  {totalAuditIssues > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAuditDetails((prev) => !prev)}
                      className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                    >
                      {showAuditDetails ? 'Hide Audit Details' : 'Inspect Flagged Records'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Test / Synthetic</div>
                    <div className="font-bold text-slate-900 mt-0.5">{auditReport.summary.syntheticOrTestCount}</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Duplicate Emails</div>
                    <div className="font-bold text-slate-900 mt-0.5">{auditReport.summary.duplicateEmailCount}</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Invalid Roles</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {auditReport.summary.invalidOrMissingRoleCount + firestoreAnomalies.length}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Orphan Enrollments</div>
                    <div className="font-bold text-slate-900 mt-0.5">{auditReport.summary.orphanedEnrollmentsCount}</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Unlinked Teachers</div>
                    <div className="font-bold text-slate-900 mt-0.5">{auditReport.summary.unlinkedClassTeachersCount}</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Local-Only Users</div>
                    <div className="font-bold text-slate-900 mt-0.5">{auditReport.summary.backendOnlyUsersCount}</div>
                  </div>
                </div>

                {showAuditDetails && totalAuditIssues > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
                    {auditReport.syntheticOrTestRecords.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-slate-700">Excluded Test / Synthetic Accounts ({auditReport.syntheticOrTestRecords.length})</div>
                        <div className="space-y-1">
                          {auditReport.syntheticOrTestRecords.map((rec) => (
                            <div key={rec.id} className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-semibold text-slate-900">{rec.name}</span>{' '}
                                <span className="text-slate-500">({rec.email})</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">{rec.id} · {rec.role}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {auditReport.duplicateEmailRecords.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-amber-800">Duplicate Email Records ({auditReport.duplicateEmailRecords.length})</div>
                        <div className="space-y-1">
                          {auditReport.duplicateEmailRecords.map((rec, i) => (
                            <div key={`${rec.duplicateId}_${i}`} className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                              <span className="font-semibold text-slate-900">{rec.email}</span> — kept <span className="font-mono">{rec.keptId}</span>, flagged duplicate <span className="font-mono">{rec.duplicateId}</span> ({rec.duplicateRole})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(auditReport.invalidOrMissingRoleRecords.length > 0 || firestoreAnomalies.length > 0) && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-red-700">Invalid or Missing Role Records</div>
                        <div className="space-y-1">
                          {auditReport.invalidOrMissingRoleRecords.map((rec) => (
                            <div key={rec.id} className="p-2 bg-red-50/60 border border-red-200/80 rounded-lg">
                              <span className="font-semibold text-slate-900">{rec.email}</span> (<span className="font-mono">{rec.id}</span>) — {rec.reason}
                            </div>
                          ))}
                          {firestoreAnomalies.map((anom, i) => (
                            <div key={`${anom.collection}_${anom.docId}_${i}`} className="p-2 bg-red-50/60 border border-red-200/80 rounded-lg">
                              <span className="font-semibold text-slate-900">Firestore /{anom.collection}/{anom.docId}</span> ({anom.email}) — {anom.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {auditReport.orphanedEnrollments.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-amber-800">Orphaned / Invalid Enrollments ({auditReport.orphanedEnrollments.length})</div>
                        <div className="space-y-1">
                          {auditReport.orphanedEnrollments.map((rec) => (
                            <div key={rec.enrollmentId} className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                              Enrollment <span className="font-mono">{rec.enrollmentId}</span> (student <span className="font-mono">{rec.studentId}</span> → class <span className="font-mono">{rec.subjectId}</span>): {rec.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {auditReport.unlinkedClassTeachers.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-amber-800">Classes with Unlinked Teachers ({auditReport.unlinkedClassTeachers.length})</div>
                        <div className="space-y-1">
                          {auditReport.unlinkedClassTeachers.map((rec) => (
                            <div key={rec.subjectId} className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                              Class <span className="font-semibold text-slate-900">{rec.subjectName}</span> (teacherId <span className="font-mono">{rec.teacherId}</span>): {rec.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {auditReport.backendOnlyRecords.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-slate-700">Local Backend Accounts Pending Firebase UID Link ({auditReport.backendOnlyRecords.length})</div>
                        <div className="space-y-1">
                          {auditReport.backendOnlyRecords.map((rec) => (
                            <div key={rec.id} className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-semibold text-slate-900">{rec.name}</span>{' '}
                                <span className="text-slate-500">({rec.email})</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">{rec.id} · {rec.role}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USERS DIRECTORY */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Filter and Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name, email, UID, institution..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="admin">All Admins</option>
                  <option value="sub_admin">Sub Admins</option>
                  <option value="super_admin">Super Admin</option>
                </select>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              {(isSuperAdmin || hasPermission('manage_students') || hasPermission('manage_teachers')) && (
                <button
                  onClick={() => {
                    setUserForm({
                      name: '',
                      email: '',
                      password: '',
                      role: 'student',
                      institution: '',
                      status: 'active',
                      permissions: [],
                    });
                    setEditingUser(null);
                    setUserModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create User</span>
                </button>
              )}
            </div>

            {/* Users Table */}
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[660px] text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">User</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Institution</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Context</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-slate-500">
                          No matching users found.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-900">{u.name}</div>
                            <div className="text-[11px] text-slate-500">{u.email}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              UID: {(u.uid || u.id).slice(0, 14)}{(u.uid || u.id).length > 14 ? '…' : ''} · {u.identitySource === 'firebase' ? 'Firebase' : 'Local'} · {formatShortDate(u.created_at || u.createdAt)}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                u.role === 'super_admin'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : u.role === 'admin'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : u.role === 'sub_admin'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : u.role === 'teacher'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600">{u.institution || '—'}</td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                u.status === 'disabled'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'disabled' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                              {u.status === 'disabled' ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-500 text-[11px]">
                            {u.role === 'student' && `${u.enrollmentsCount || 0} classes (${u.enrollmentStatus || ((u.enrollmentsCount || 0) > 0 ? 'Enrolled' : 'Not Enrolled')})`}
                            {u.role === 'teacher' && `${u.teachingClassesCount || 0} classes · ${u.enrolledStudentsCount || 0} students`}
                            {u.role === 'sub_admin' && `${u.permissions?.length || 0} permissions`}
                            {u.role === 'admin' && 'Full Admin'}
                            {u.role === 'super_admin' && 'Full Root'}
                          </td>
                          <td className="p-3.5 text-right space-x-1.5">
                            {/* Status toggle */}
                            {u.role !== 'super_admin' && (canManageAdmins || (u.role === 'student' && hasPermission('manage_students')) || (u.role === 'teacher' && hasPermission('manage_teachers'))) && (
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  u.status === 'disabled'
                                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/50'
                                    : 'border-amber-200 text-amber-700 hover:bg-amber-50 bg-amber-50/50'
                                }`}
                                title={u.status === 'disabled' ? 'Activate user' : 'Deactivate user'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Edit user */}
                            {(canManageAdmins || (u.role === 'student' && hasPermission('manage_students')) || (u.role === 'teacher' && hasPermission('manage_teachers'))) && (
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserForm({
                                    name: u.name,
                                    email: u.email,
                                    password: '',
                                    role: u.role,
                                    institution: u.institution || '',
                                    status: u.status || 'active',
                                    permissions: u.permissions || [],
                                  });
                                  if (u.role === 'sub_admin' || u.role === 'admin') {
                                    setSubAdminModalOpen(true);
                                  } else {
                                    setUserModalOpen(true);
                                  }
                                }}
                                className="p-1.5 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                title="Edit user details"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete user */}
                            {u.role !== 'super_admin' && (canManageAdmins || (u.role === 'student' && hasPermission('manage_students')) || (u.role === 'teacher' && hasPermission('manage_teachers'))) && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STUDENTS MANAGEMENT */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900">Student Enrollment & Accounts</h3>
                <p className="text-xs text-slate-500">View registered student roster, monitor enrollment status, and control student access.</p>
              </div>
              <button
                onClick={() => {
                  setUserForm({
                    name: '',
                    email: '',
                    password: '',
                    role: 'student',
                    institution: '',
                    status: 'active',
                    permissions: [],
                  });
                  setEditingUser(null);
                  setUserModalOpen(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Student</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Student</th>
                      <th className="p-3.5">Institution</th>
                      <th className="p-3.5">Enrolled Classes</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.filter((u) => u.role === 'student').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                          No students registered yet.
                        </td>
                      </tr>
                    ) : (
                      users.filter((u) => u.role === 'student').map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-900">{s.name}</div>
                            <div className="text-[11px] text-slate-500">{s.email}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Registered {formatShortDate(s.created_at || s.createdAt)}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-600">{s.institution || '—'}</td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  (s.enrollmentsCount || 0) > 0
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {(s.enrollmentsCount || 0) > 0
                                  ? `Enrolled · ${s.enrollmentsCount} class${s.enrollmentsCount === 1 ? '' : 'es'}`
                                  : 'Not Enrolled'}
                              </span>
                              {Array.isArray(s.enrolledClasses) && s.enrolledClasses.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {s.enrolledClasses.slice(0, 3).map((cls) => (
                                    <span
                                      key={cls.id}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-medium"
                                    >
                                      {cls.name}
                                    </span>
                                  ))}
                                  {s.enrolledClasses.length > 3 && (
                                    <span className="text-[10px] text-slate-500">
                                      +{s.enrolledClasses.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                s.status === 'disabled'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'disabled' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                              {s.status === 'disabled' ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right space-x-1.5">
                            <button
                              onClick={() => handleToggleStatus(s)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                                s.status === 'disabled'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {s.status === 'disabled' ? 'Activate' : 'Deactivate'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingUser(s);
                                setUserForm({
                                  name: s.name,
                                  email: s.email,
                                  password: '',
                                  role: s.role,
                                  institution: s.institution || '',
                                  status: s.status || 'active',
                                  permissions: s.permissions || [],
                                });
                                setUserModalOpen(true);
                              }}
                              className="p-1.5 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title="Edit student"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(s)}
                              className="p-1.5 text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title="Delete student"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TEACHERS MANAGEMENT */}
        {activeTab === 'teachers' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900">Faculty & Instructors</h3>
                <p className="text-xs text-slate-500">Manage teaching credentials, assigned departments, and course workloads.</p>
              </div>
              <button
                onClick={() => {
                  setUserForm({
                    name: '',
                    email: '',
                    password: '',
                    role: 'teacher',
                    institution: '',
                    status: 'active',
                    permissions: [],
                  });
                  setEditingUser(null);
                  setUserModalOpen(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Teacher</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Instructor</th>
                      <th className="p-3.5">Department</th>
                      <th className="p-3.5">Assigned Courses</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.filter((u) => u.role === 'teacher').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-slate-500">
                          No teachers registered yet.
                        </td>
                      </tr>
                    ) : (
                      users.filter((u) => u.role === 'teacher').map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-900">{t.name}</div>
                            <div className="text-[11px] text-slate-500">{t.email}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Joined {formatShortDate(t.created_at || t.createdAt)}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-600">{t.institution || '—'}</td>
                          <td className="p-3.5">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  {t.teachingClassesCount || 0} class{(t.teachingClassesCount || 0) === 1 ? '' : 'es'}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {t.enrolledStudentsCount || 0} student{(t.enrolledStudentsCount || 0) === 1 ? '' : 's'}
                                </span>
                              </div>
                              {Array.isArray(t.teachingClasses) && t.teachingClasses.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {t.teachingClasses.slice(0, 3).map((cls) => (
                                    <span
                                      key={cls.id}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-medium"
                                    >
                                      {cls.name} ({cls.enrolledStudents})
                                    </span>
                                  ))}
                                  {t.teachingClasses.length > 3 && (
                                    <span className="text-[10px] text-slate-500">
                                      +{t.teachingClasses.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                t.status === 'disabled'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'disabled' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                              {t.status === 'disabled' ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right space-x-1.5">
                            <button
                              onClick={() => handleToggleStatus(t)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                                t.status === 'disabled'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {t.status === 'disabled' ? 'Activate' : 'Deactivate'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingUser(t);
                                setUserForm({
                                  name: t.name,
                                  email: t.email,
                                  password: '',
                                  role: t.role,
                                  institution: t.institution || '',
                                  status: t.status || 'active',
                                  permissions: t.permissions || [],
                                });
                                setUserModalOpen(true);
                              }}
                              className="p-1.5 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title="Edit teacher"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(t)}
                              className="p-1.5 text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title="Delete teacher"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CLASSES & SUBJECTS MANAGEMENT */}
        {activeTab === 'subjects' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900">Classes & Curricula</h3>
                <p className="text-xs text-slate-500">Manage class codes, instructor assignments, and student rosters.</p>
              </div>
              <button
                onClick={() => {
                  setSubjectForm({
                    name: '',
                    description: '',
                    teacher_id: users.find((u) => u.role === 'teacher')?.id || '',
                    section: 'B21',
                    color: '#0ea5e9',
                  });
                  setSubjectModalOpen(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Class</span>
              </button>
            </div>

            {subjects.length === 0 ? (
              <div className="p-10 bg-white border border-slate-200/90 rounded-2xl text-center space-y-2 shadow-xs">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-sm font-bold text-slate-900">No classes yet</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No classes or subjects have been created yet. Teachers or administrators can create classes to generate class codes for student enrollment.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((sub) => (
                <div key={sub.id} className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-3.5 shadow-xs flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{sub.name}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{sub.description}</p>
                      </div>
                      {sub.isLiveNow && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 animate-pulse shrink-0">
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Class code badge */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Class Code</span>
                        <span className="font-mono font-bold text-blue-600 text-sm tracking-wide">{sub.class_code}</span>
                      </div>
                      <button
                        onClick={() => handleRegenerateCode(sub.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Regenerate class code"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1.5 pt-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Instructor:</span>
                        <span className="text-slate-900 font-semibold">{sub.teacher_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Section:</span>
                        <span className="text-slate-800">{sub.section || 'General'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Enrolled Students:</span>
                        <span className="text-blue-600 font-bold">{sub.enrolledStudents || 0} students</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => openEnrollmentModal(sub)}
                      className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200/80 transition-colors cursor-pointer"
                    >
                      Manage Roster ({sub.enrolledStudents})
                    </button>
                    <button
                      onClick={() => handleDeleteSubject(sub.id, sub.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      title="Delete class"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* TAB 6: CONTENT MANAGEMENT */}
        {activeTab === 'content' && (
          <div className="space-y-6">
            {/* Notes Section */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Lecture Notes & Documents ({notes.length})
              </h3>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No lecture notes uploaded yet.</p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-slate-100/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 break-words">{n.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 break-words">
                          {n.subjectName} • {n.file_name} • {n.file_size}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setConfirmDialog({
                            title: 'Delete Note',
                            message: `Delete note "${n.title}"?`,
                            confirmLabel: 'Delete Note',
                            onConfirm: async () => {
                              await api.deleteAdminNote(n.id);
                              showSuccess('Note deleted.');
                              loadData();
                            },
                          })
                        }
                        className="p-2 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quizzes Section */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Assessments & Quizzes ({quizzes.length})
              </h3>
              <div className="space-y-2">
                {quizzes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No assessments created yet.</p>
                ) : (
                  quizzes.map((q) => (
                    <div key={q.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-slate-100/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 break-words">{q.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {q.questionsCount} Questions • Passing score: {q.passing_score}%
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setConfirmDialog({
                            title: 'Delete Quiz',
                            message: `Delete quiz "${q.title}"?`,
                            confirmLabel: 'Delete Quiz',
                            onConfirm: async () => {
                              await api.deleteAdminQuiz(q.id);
                              showSuccess('Quiz deleted.');
                              loadData();
                            },
                          })
                        }
                        className="p-2 text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete quiz"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: LIVE CLASSES MANAGEMENT */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <h3 className="text-base font-bold text-slate-900">Live Classroom Sessions</h3>
              <p className="text-xs text-slate-500">Monitor live streaming sessions and manage active or scheduled classrooms.</p>
            </div>

            <div className="space-y-3">
              {liveClasses.length === 0 ? (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-xs text-slate-500 shadow-xs">
                  No live sessions scheduled at the moment.
                </div>
              ) : (
                liveClasses.map((lc) => (
                  <div key={lc.id} className="p-4 bg-white border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm break-words">{lc.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            lc.status === 'live_now'
                              ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                              : lc.status === 'ended'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {lc.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5 break-words">
                        Teacher: {lc.teacher_name} • Class: {lc.subject_name} • Date: {lc.scheduled_date} {lc.start_time}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {lc.status === 'live_now' && (
                        <button
                          onClick={() => handleEndLiveSession(lc.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>Force End</span>
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setConfirmDialog({
                            title: 'Delete Live Class Record',
                            message: `Delete the live class record "${lc.title}"?`,
                            confirmLabel: 'Delete Record',
                            onConfirm: async () => {
                              await api.deleteLiveClassAdmin(lc.id);
                              showSuccess('Live class record deleted.');
                              loadData();
                            },
                          })
                        }
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: DOUBTS & INQUIRIES MANAGEMENT */}
        {activeTab === 'doubts' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
              <h3 className="text-base font-bold text-slate-900">Student Doubts & Academic Inquiries</h3>
              <p className="text-xs text-slate-500">Supervise questions raised across all STEM subjects and monitor instructor response times.</p>
            </div>

            <div className="space-y-3">
              {doubts.length === 0 ? (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-xs text-slate-500 shadow-xs">
                  No academic doubts currently pending resolution.
                </div>
              ) : (
                doubts.map((d) => {
                  const normalizedStatus = String(d.status || 'Pending').toLowerCase();
                  return (
                    <div key={d.id} className="p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl space-y-3 shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{d.title}</h4>
                            <span
                              className={`text-[11px] font-semibold ${
                                normalizedStatus === 'resolved'
                                  ? 'text-emerald-700'
                                  : normalizedStatus === 'answered'
                                  ? 'text-blue-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              · {String(d.status || 'Pending')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Student: <span className="text-slate-800 font-medium">{d.student_name || d.studentName || 'Student'}</span> • Subject: <span className="text-slate-800 font-medium">{d.subject_name || d.subjectName || 'Course'}</span> • {d.created_at ? new Date(d.created_at).toLocaleDateString() : d.createdAt || 'Recent'}
                          </p>
                        </div>

                        <button
                          onClick={async () => {
                            try {
                              await api.deleteDoubt(d.id);
                              setDoubts((prev) => prev.filter((item) => item.id !== d.id));
                              showSuccess('Doubt item removed.');
                            } catch (err: any) {
                              setError(err?.message || 'Failed to remove doubt.');
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Delete doubt"
                          aria-label="Delete doubt"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {d.description && (
                        <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                          {d.description}
                        </p>
                      )}

                      {d.replies && d.replies.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Thread Responses</span>
                          {d.replies.map((r: any, idx: number) => (
                            <div key={r.id || idx} className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-slate-800">
                              <span className="font-semibold text-blue-900 block text-[11px]">{r.sender_name || r.author || 'Faculty'}:</span>
                              <span className="text-slate-700">{r.message || r.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 8: ADMIN & SUB ADMIN MANAGEMENT (ADMIN / SUPER ADMIN ONLY) */}
        {activeTab === 'admins' && canManageAdmins && (
          <div className="space-y-6">
            {/* Header info card */}
            <div className="p-5 bg-purple-50/60 border border-purple-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-600" />
                  Administrator &amp; Sub Admin Governance
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Only authorized Administrators and Super Admins can create additional Admin or Sub Admin accounts. Accounts are provisioned with Firebase Auth custom claims.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setUserForm({
                      name: '',
                      email: '',
                      password: '',
                      role: 'admin',
                      institution: 'VisuaLearn Administration',
                      status: 'active',
                      permissions: [],
                    });
                    setEditingUser(null);
                    setSubAdminModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Admin</span>
                </button>

                <button
                  disabled={isSubAdminLimitReached}
                  onClick={() => {
                    setUserForm({
                      name: '',
                      email: '',
                      password: '',
                      role: 'sub_admin',
                      institution: 'Curriculum Management Division',
                      status: 'active',
                      permissions: ['manage_students', 'manage_teachers', 'manage_subjects_classes'],
                    });
                    setEditingUser(null);
                    setSubAdminModalOpen(true);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    isSubAdminLimitReached
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Sub Admin ({subAdminCount}/4)</span>
                </button>
              </div>
            </div>

            {/* List of Admins & Sub Admins */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {users.filter((u) => u.role === 'admin' || u.role === 'sub_admin').length === 0 ? (
                <div className="md:col-span-2 p-8 bg-white border border-slate-200/90 rounded-2xl text-center text-xs text-slate-500">
                  No additional Admin or Sub Admin accounts have been created yet. Use the buttons above to provision authorized administrators.
                </div>
              ) : (
                users
                  .filter((u) => u.role === 'admin' || u.role === 'sub_admin')
                  .map((sa) => (
                    <div key={sa.id} className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 shadow-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{sa.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                sa.role === 'admin'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {sa.role === 'admin' ? 'Admin' : 'Sub Admin'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">{sa.email}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{sa.institution}</div>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            sa.status === 'disabled'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {sa.status === 'disabled' ? 'Disabled' : 'Active'}
                        </span>
                      </div>

                      {/* Active Permissions Badges */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          {sa.role === 'admin' ? 'Access Scope' : 'Assigned Permissions'}
                        </span>
                        {sa.role === 'admin' ? (
                          <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-700">
                            Full Administrative Access
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {sa.permissions && sa.permissions.length > 0 ? (
                              sa.permissions.map((p) => (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-700"
                                >
                                  {p.replace(/_/g, ' ')}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400 italic">No permissions assigned</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100 text-xs">
                        <button
                          onClick={() => handleToggleStatus(sa)}
                          className="flex-1 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer"
                        >
                          {sa.status === 'disabled' ? 'Enable Account' : 'Disable Account'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingUser(sa);
                            setUserForm({
                              name: sa.name,
                              email: sa.email,
                              password: '',
                              role: sa.role,
                              institution: sa.institution || '',
                              status: sa.status || 'active',
                              permissions: sa.permissions || [],
                            });
                            setSubAdminModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200 transition-colors cursor-pointer"
                        >
                          {sa.role === 'admin' ? 'Edit Admin' : 'Edit Permissions'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(sa)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                          title={`Delete ${sa.role === 'admin' ? 'Admin' : 'Sub Admin'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* TAB 9: SYSTEM & SECURITY SETTINGS (SUPER ADMIN ONLY) */}
        {activeTab === 'settings' && isSuperAdmin && settings && (
          <div className="max-w-2xl bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                Enterprise Platform Settings
              </h3>
              <p className="text-xs text-slate-500">Configure global registration policies and system toggles.</p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="font-semibold text-slate-900">Student Self-Registration</div>
                  <div className="text-slate-500">Allow students to create accounts from public sign up</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowStudentRegistration}
                  onChange={(e) => handleSaveSettings({ allowStudentRegistration: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="font-semibold text-slate-900">Teacher Self-Registration</div>
                  <div className="text-slate-500">Allow teachers to self-register faculty accounts</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowTeacherRegistration}
                  onChange={(e) => handleSaveSettings({ allowTeacherRegistration: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <div className="font-semibold text-slate-900">Maintenance Mode</div>
                  <div className="text-slate-500">Temporarily restrict public access for infrastructure updates</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => handleSaveSettings({ maintenanceMode: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900">Sub Admin Limit (Hard-Coded Enforced)</div>
                <div className="text-slate-600">Fixed system governance rule: Exactly 4 Sub Admins maximum allowed.</div>
                <div className="font-mono text-blue-700 font-bold">Max Sub Admins: 4</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 9b: PLATFORM ANALYTICS (Requirement #6: Aggregated System Analytics) */}
        {activeTab === 'analytics' && (isSuperAdmin || hasPermission('view_analytics')) && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Executive Reporting</span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">Platform Performance Analytics</h2>
                <p className="text-xs text-slate-500">
                  Aggregated institutional metrics without exposing private student identities. Super & Sub Admin RBAC compliant.
                </p>
              </div>
              <button
                onClick={() => void loadData()}
                disabled={loadingAnalytics}
                className="py-2 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                <span>Refresh Metrics</span>
              </button>
            </div>

            {adminAnalytics ? (
              <>
                {/* Aggregated KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Total Students</span>
                    <span className="type-metric text-slate-900">{adminAnalytics.total_students}</span>
                    <span className="text-[11px] text-emerald-600 block mt-1">{adminAnalytics.active_students} Active</span>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Total Teachers</span>
                    <span className="type-metric text-slate-900">{adminAnalytics.total_teachers}</span>
                    <span className="text-[11px] text-slate-400 block mt-1">{adminAnalytics.total_classes} Classes</span>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Avg Progress</span>
                    <span className="type-metric text-blue-600 font-mono">{adminAnalytics.average_progress}%</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Platform Average</span>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Avg Quiz Score</span>
                    <span className="type-metric text-emerald-600 font-mono">{adminAnalytics.average_quiz_score}%</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Cohort Performance</span>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Video Watch Rate</span>
                    <span className="type-metric text-purple-600 font-mono">{adminAnalytics.video_completion_rate}%</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Completed (≥90%)</span>
                  </div>

                  <div className="p-3.5 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                    <span className="text-[11px] uppercase font-medium text-slate-500 block mb-1">Assignments Done</span>
                    <span className="type-metric text-amber-600 font-mono">{adminAnalytics.assignment_completion_rate}%</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Submission Rate</span>
                  </div>
                </div>

                {/* Most Difficult Chapters and Topics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Difficult Chapters */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-bold text-slate-900">Chapters Requiring Review</h3>
                      </div>
                      <span className="text-xs text-slate-400">Lowest Quiz Averages</span>
                    </div>

                    {adminAnalytics.difficult_chapters && adminAnalytics.difficult_chapters.length > 0 ? (
                      <div className="space-y-3">
                        {adminAnalytics.difficult_chapters.map((ch, idx) => (
                          <div key={idx} className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{ch.chapter_title}</div>
                              <div className="text-[11px] text-slate-500">{ch.subject_name}</div>
                            </div>
                            <span className="text-red-700 font-mono font-bold bg-white px-2 py-0.5 rounded border border-amber-200">
                              {ch.avg_quiz_score}% avg
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-4 text-center">No low-performing chapters detected.</p>
                    )}
                  </div>

                  {/* Difficult Topics */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <h3 className="text-sm font-bold text-slate-900">Topics with High Remediation Triggers</h3>
                      </div>
                      <span className="text-xs text-slate-400">Target for Faculty Seminars</span>
                    </div>

                    {adminAnalytics.difficult_topics && adminAnalytics.difficult_topics.length > 0 ? (
                      <div className="space-y-3">
                        {adminAnalytics.difficult_topics.map((tp, idx) => (
                          <div key={idx} className="p-3 bg-purple-50/60 border border-purple-200/70 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{tp.topic_title}</div>
                              <div className="text-[11px] text-slate-500">{tp.subject_name}</div>
                            </div>
                            <span className="text-purple-700 font-mono font-bold bg-white px-2 py-0.5 rounded border border-purple-200">
                              {tp.avg_quiz_score}% avg
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-4 text-center">No topic weaknesses detected across classes.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                Loading system analytics...
              </div>
            )}
          </div>
        )}

        {/* TAB 10: ACCOUNT & SECURITY */}
        {activeTab === 'security' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="type-section-title text-slate-900 flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <span>Account &amp; Security</span>
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-500 mt-1">
                Manage your administrator account credentials, verified email address, and security access.
              </p>
            </div>

            {/* In-tab Alerts */}
            {emailChangeError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="break-words">{emailChangeError}</span>
                </div>
                <button onClick={() => setEmailChangeError(null)} className="text-red-500 hover:text-red-800 p-1 shrink-0">✕</button>
              </div>
            )}

            {emailChangeSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="break-words">{emailChangeSuccess}</span>
                </div>
                <button onClick={() => setEmailChangeSuccess(null)} className="text-emerald-600 hover:text-emerald-900 p-1 shrink-0">✕</button>
              </div>
            )}

            {passwordError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="break-words">{passwordError}</span>
                </div>
                <button onClick={() => setPasswordError(null)} className="text-red-500 hover:text-red-800 p-1 shrink-0">✕</button>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="break-words">{passwordSuccess}</span>
                </div>
                <button onClick={() => setPasswordSuccess(null)} className="text-emerald-600 hover:text-emerald-900 p-1 shrink-0">✕</button>
              </div>
            )}

            {/* SECTION 1: ADMIN ACCOUNT */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 space-y-6 shadow-xs">
              <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span>ADMIN ACCOUNT</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Primary administrator email and account identity.</p>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                  {isSuperAdmin ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Sub Admin'}
                </span>
              </div>

              {/* Current Email Block */}
              <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Current Email</span>
                  <div className="text-sm sm:text-base font-mono font-bold text-slate-900 flex flex-wrap items-center gap-2">
                    <span className="break-all">{user?.email || 'Not set'}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans font-semibold shrink-0">
                      Verified
                    </span>
                  </div>
                </div>

                {emailChangeStep === 'idle' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailChangeStep('request');
                      setEmailChangeError(null);
                      setEmailChangeSuccess(null);
                      setEmailChangeCurrentPassword('');
                      setEmailChangeNewEmail('');
                    }}
                    className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-all shadow-xs cursor-pointer self-start sm:self-auto flex items-center gap-2"
                  >
                    <span>Change Email</span>
                  </button>
                )}
              </div>

              {/* Step 1: Request Email Change Form */}
              {emailChangeStep === 'request' && (
                <form onSubmit={handleRequestEmailChange} className="p-5 bg-slate-50 border border-blue-200 rounded-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                      Request New Email Address
                    </h4>
                    <button
                      type="button"
                      onClick={() => setEmailChangeStep('idle')}
                      className="text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    To update your administrator email, confirm your current password and specify the new email address. A 6-digit verification code will be sent to the new address.
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Current Administrator Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={emailShowCurrentPassword ? 'text' : 'password'}
                          required
                          value={emailChangeCurrentPassword}
                          onChange={(e) => setEmailChangeCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setEmailShowCurrentPassword(!emailShowCurrentPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {emailShowCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">New Email Address</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={emailChangeNewEmail}
                          onChange={(e) => setEmailChangeNewEmail(e.target.value)}
                          placeholder="newadmin@example.com"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={emailChangeLoading}
                      className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{emailChangeLoading ? 'Dispatching...' : 'Send Verification Email'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={emailChangeLoading}
                      onClick={() => setEmailChangeStep('idle')}
                      className="py-2.5 px-3.5 bg-white hover:bg-slate-100 text-slate-700 text-xs rounded-xl border border-slate-200 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Verification Code Form */}
              {emailChangeStep === 'verify' && (
                <form onSubmit={handleVerifyEmailChange} className="p-5 bg-slate-50 border border-blue-200 rounded-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                      Verify New Email Address
                    </h4>
                    <button
                      type="button"
                      onClick={handleCancelEmailChange}
                      className="text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                    >
                      Cancel Change
                    </button>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2.5">
                    <Mail className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
                    <div>
                      A 6-digit verification code was sent to <span className="font-mono font-bold text-slate-900">{emailPendingAddress || emailChangeNewEmail}</span>. Enter the code below to complete the email change.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">6-Digit Verification Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={emailChangeCode}
                      onChange={(e) => setEmailChangeCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full sm:w-64 p-3 bg-white border border-slate-200 rounded-xl text-center text-lg font-mono tracking-widest text-slate-900 focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={emailChangeLoading || emailChangeCode.trim().length !== 6}
                      className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{emailChangeLoading ? 'Verifying...' : 'Verify & Update Email'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={emailChangeLoading}
                      onClick={handleResendEmailCode}
                      className="py-2.5 px-3.5 bg-white hover:bg-slate-100 text-slate-700 text-xs rounded-xl border border-slate-200 cursor-pointer transition-colors"
                    >
                      Resend Code
                    </button>

                    <button
                      type="button"
                      disabled={emailChangeLoading}
                      onClick={handleCancelEmailChange}
                      className="py-2.5 px-3.5 text-red-600 hover:text-red-700 text-xs cursor-pointer transition-colors"
                    >
                      Cancel Change
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* SECTION 2: SECURITY */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xs">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>SECURITY</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Password management and authentication security.</p>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Password Authentication</span>
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span>Protected by PBKDF2/SHA-256 salted hashing</span>
                  </div>
                </div>

                {!passwordChangeOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordChangeOpen(true);
                      setPasswordError(null);
                      setPasswordSuccess(null);
                      setPasswordCurrent('');
                      setPasswordNew('');
                      setPasswordConfirm('');
                    }}
                    className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer self-start sm:self-auto flex items-center gap-2 shadow-2xs"
                  >
                    <span>Change Password</span>
                  </button>
                )}
              </div>

              {/* Change Password Form */}
              {passwordChangeOpen && (
                <form onSubmit={handleChangePassword} className="p-5 bg-slate-50 border border-blue-200 rounded-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                      Update Administrator Password
                    </h4>
                    <button
                      type="button"
                      onClick={() => setPasswordChangeOpen(false)}
                      className="text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter your current password followed by your new password. After updating, you will be required to log in again using your new credentials.
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Current Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={passwordShowCurrent ? 'text' : 'password'}
                          required
                          value={passwordCurrent}
                          onChange={(e) => setPasswordCurrent(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordShowCurrent(!passwordShowCurrent)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {passwordShowCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">New Password (min 8 characters)</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={passwordShowNew ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={passwordNew}
                          onChange={(e) => setPasswordNew(e.target.value)}
                          placeholder="Min 8 characters"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordShowNew(!passwordShowNew)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {passwordShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Confirm New Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={passwordShowConfirm ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                          placeholder="Repeat new password"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setPasswordShowConfirm(!passwordShowConfirm)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {passwordShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={passwordLoading || !passwordCurrent || !passwordNew || !passwordConfirm}
                      className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{passwordLoading ? 'Updating...' : 'Change Password'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={passwordLoading}
                      onClick={() => setPasswordChangeOpen(false)}
                      className="py-2.5 px-3.5 bg-white hover:bg-slate-100 text-slate-700 text-xs rounded-xl border border-slate-200 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: CREATE / EDIT USER */}
      <ResponsiveModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        ariaLabel={editingUser ? `Edit ${editingUser.name}` : 'Create New User'}
        maxWidthClass="max-w-[480px]"
        header={
          <div className="px-4 py-4 sm:px-6 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-900 truncate">
              {editingUser ? `Edit ${editingUser.name}` : 'Create New User'}
            </h3>
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              aria-label="Close modal"
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
        footer={
          <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-create-edit-user-form"
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save User
            </button>
          </div>
        }
        bodyClassName="p-4 sm:p-6"
      >
        <form id="admin-create-edit-user-form" onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">Full Name</label>
            <input
              type="text"
              required
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              placeholder="e.g. John Doe"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">Email Address</label>
            <input
              type="email"
              required
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="name@institution.edu"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">
              Password {editingUser && '(Leave blank to retain current)'}
            </label>
            <div className="relative">
              <input
                type={userFormShowPassword ? 'text' : 'password'}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder={editingUser ? '••••••••' : 'Min 6 characters'}
                className="w-full p-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setUserFormShowPassword(!userFormShowPassword)}
                aria-label={userFormShowPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden p-1 rounded-lg transition-colors cursor-pointer"
              >
                {userFormShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(!editingUser || (canManageAdmins && editingUser.role !== 'super_admin')) && (
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Role</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                {canManageAdmins && (
                  <>
                    <option value="sub_admin" disabled={!editingUser && isSubAdminLimitReached}>
                      Sub Admin
                    </option>
                    <option value="admin">Admin</option>
                  </>
                )}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">Institution / Department</label>
            <input
              type="text"
              value={userForm.institution}
              onChange={(e) => setUserForm({ ...userForm, institution: e.target.value })}
              placeholder="e.g. Science Academy"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>
        </form>
      </ResponsiveModal>

      {/* MODAL 2: ADMIN / SUB ADMIN CREATION & PERMISSIONS MODAL */}
      <ResponsiveModal
        isOpen={subAdminModalOpen && canManageAdmins}
        onClose={() => setSubAdminModalOpen(false)}
        ariaLabel={
          editingUser
            ? `Configure ${editingUser.role === 'admin' ? 'Admin' : 'Sub Admin'}: ${editingUser.name}`
            : userForm.role === 'admin'
            ? 'Create Admin Account'
            : 'Create Sub Admin Account'
        }
        maxWidthClass="max-w-[540px]"
        header={
          <div className="px-4 py-4 sm:px-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="break-words">
                      {editingUser
                        ? `Configure ${editingUser.role === 'admin' ? 'Admin' : 'Sub Admin'}: ${editingUser.name}`
                        : userForm.role === 'admin'
                        ? 'Create Admin Account'
                        : 'Create Sub Admin Account'}
                    </span>
                  </h3>
                  {userForm.role === 'sub_admin' && (
                    <span className="text-xs text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full">
                      Capacity: {subAdminCount} / 4
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {userForm.role === 'admin'
                    ? 'Assigns full administrative access in VisuaLearn and syncs Firestore /admins records for existing Firebase users.'
                    : 'Assign granular Sub Admin permissions enforced by the backend and Firestore Security Rules.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubAdminModalOpen(false)}
                aria-label="Close modal"
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        }
        footer={
          <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubAdminModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-subadmin-form"
              className="min-h-[44px] px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {userForm.role === 'admin' ? 'Save Admin' : 'Save Sub Admin'}
            </button>
          </div>
        }
        bodyClassName="p-4 sm:p-6"
      >
        <form id="admin-subadmin-form" onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
          {!editingUser && (
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Administrator Role</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500"
              >
                <option value="admin">Admin (Full Administrative Access)</option>
                <option value="sub_admin" disabled={isSubAdminLimitReached}>
                  Sub Admin (Restricted Role-Based Access){isSubAdminLimitReached ? ' — Limit Reached' : ''}
                </option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Name</label>
              <input
                type="text"
                required
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Email</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">
              Password {editingUser && '(Leave blank to preserve current)'}
            </label>
            <div className="relative">
              <input
                type={userFormShowPassword ? 'text' : 'password'}
                required={!editingUser}
                minLength={!editingUser ? 6 : undefined}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder={editingUser ? '••••••••' : 'Min 6 characters'}
                className="w-full p-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setUserFormShowPassword(!userFormShowPassword)}
                aria-label={userFormShowPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden p-1 rounded-lg transition-colors cursor-pointer"
              >
                {userFormShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Permissions Checkboxes (Sub Admin only) */}
          {userForm.role === 'sub_admin' ? (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-900 block">Sub Admin Permissions</label>
              <div className="space-y-2">
                {ALL_PERMISSIONS.map((perm) => {
                  const isChecked = userForm.permissions.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/60 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUserForm({
                              ...userForm,
                              permissions: [...userForm.permissions, perm.key],
                            });
                          } else {
                            setUserForm({
                              ...userForm,
                              permissions: userForm.permissions.filter((p) => p !== perm.key),
                            });
                          }
                        }}
                        className="mt-0.5 w-4 h-4 accent-purple-600 rounded"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">{perm.label}</div>
                        <div className="text-[11px] text-slate-500">{perm.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-[11px] text-indigo-800 leading-relaxed">
              Full Administrators can manage students, teachers, classes, content, live sessions, analytics, and additional Admin or Sub Admin accounts.
            </div>
          )}
        </form>
      </ResponsiveModal>

      {/* MODAL 3: CREATE CLASS / SUBJECT */}
      <ResponsiveModal
        isOpen={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        ariaLabel="Create New STEM Classroom"
        maxWidthClass="max-w-[480px]"
        header={
          <div className="px-4 py-4 sm:px-6 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-900">Create New STEM Classroom</h3>
            <button
              type="button"
              onClick={() => setSubjectModalOpen(false)}
              aria-label="Close modal"
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
        footer={
          <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubjectModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-create-subject-form"
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Create Class
            </button>
          </div>
        }
        bodyClassName="p-4 sm:p-6"
      >
        <form id="admin-create-subject-form" onSubmit={handleSaveSubject} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">Subject / Course Name</label>
            <input
              type="text"
              required
              value={subjectForm.name}
              onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
              placeholder="e.g. Organic Chemistry"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-700 font-semibold">Description</label>
            <textarea
              required
              rows={3}
              value={subjectForm.description}
              onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
              placeholder="Course objectives, curriculum overview..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Section</label>
              <input
                type="text"
                value={subjectForm.section}
                onChange={(e) => setSubjectForm({ ...subjectForm, section: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 uppercase focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Assigned Teacher</label>
              <select
                value={subjectForm.teacher_id}
                onChange={(e) => setSubjectForm({ ...subjectForm, teacher_id: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500"
              >
                <option value="">Select teacher...</option>
                {users.filter((u) => u.role === 'teacher').map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </ResponsiveModal>

      {/* MODAL 4: MANAGE ENROLLMENTS */}
      <ResponsiveModal
        isOpen={Boolean(enrollmentModalOpen && selectedSubject)}
        onClose={() => setEnrollmentModalOpen(false)}
        ariaLabel={selectedSubject ? `Enrollment Roster: ${selectedSubject.name}` : 'Enrollment Roster'}
        maxWidthClass="max-w-[540px]"
        header={
          selectedSubject ? (
            <div className="px-4 py-4 sm:px-6 border-b border-slate-100 flex items-start justify-between gap-2 bg-slate-50/50">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">Enrollment Roster: {selectedSubject.name}</h3>
                <p className="text-xs text-slate-500">
                  Class code: <span className="font-mono text-blue-600 font-bold">{selectedSubject.class_code}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnrollmentModalOpen(false)}
                aria-label="Close enrollment roster"
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : null
        }
        footer={
          <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex justify-end">
            <button
              type="button"
              onClick={() => setEnrollmentModalOpen(false)}
              className="min-h-[44px] px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        }
        bodyClassName="p-4 sm:p-6 space-y-4"
      >
        {/* Currently Enrolled Students */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-900 block">Currently Enrolled ({subjectEnrollments.enrolled.length})</span>
          <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
            {subjectEnrollments.enrolled.length === 0 ? (
              <div className="text-xs text-slate-400 p-2 italic">No students enrolled yet.</div>
            ) : (
              subjectEnrollments.enrolled.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200/80 rounded-lg text-xs shadow-2xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{st.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{st.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnenrollStudent(st.id)}
                    className="text-red-600 hover:text-red-700 px-2.5 py-1 rounded-md hover:bg-red-50 text-[11px] font-semibold border border-red-200 transition-colors cursor-pointer shrink-0"
                  >
                    Unenroll
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available to Enroll */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-900 block">Add Student to Roster</span>
          <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
            {subjectEnrollments.available.length === 0 ? (
              <div className="text-xs text-slate-400 p-2 italic">All available students are already enrolled.</div>
            ) : (
              subjectEnrollments.available.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200/80 rounded-lg text-xs shadow-2xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{st.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{st.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrollStudent(st.id)}
                    className="text-blue-700 hover:text-blue-800 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-md text-[11px] font-semibold hover:bg-blue-100 transition-colors cursor-pointer shrink-0"
                  >
                    Enroll
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </ResponsiveModal>

      {/* In-app Delete Confirmation Modal */}
      <ResponsiveModal
        isOpen={Boolean(confirmDialog)}
        onClose={() => !confirmBusy && setConfirmDialog(null)}
        disableClose={confirmBusy}
        ariaLabel={confirmDialog?.title || 'Confirm Action'}
        maxWidthClass="max-w-[400px]"
        zIndexClass="z-[130]"
        header={
          confirmDialog ? (
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
              <h3 className="type-card-title text-slate-900">{confirmDialog.title}</h3>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                aria-label="Close confirmation"
                className="p-2 -mr-1 -mt-1 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null
        }
        footer={
          confirmDialog ? (
            <div className="border-t border-slate-100 bg-white px-5 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  } catch (err: any) {
                    setError(err?.message || 'Action failed.');
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                {confirmBusy ? 'Deleting...' : confirmDialog.confirmLabel}
              </button>
            </div>
          ) : null
        }
        bodyClassName="px-5 pb-4"
      >
        {confirmDialog && (
          <p className="text-xs text-slate-600 leading-relaxed break-words">{confirmDialog.message}</p>
        )}
      </ResponsiveModal>

      {/* MOBILE BOTTOM NAVIGATION DOCK (Admin, Super Admin & Sub Admin) */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 w-full max-w-full overflow-hidden mobile-bottom-dock border-t border-slate-200/90 px-1 px-safe pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] grid grid-cols-5 items-center text-[10px] tracking-tight font-medium text-slate-600"
        aria-label="Mobile admin navigation"
      >
        {[
          { key: 'overview' as const, label: 'Overview', icon: Sliders, enabled: true },
          {
            key: 'users' as const,
            label: 'Users',
            icon: Users,
            enabled: isSuperAdmin || hasPermission('manage_students') || hasPermission('manage_teachers'),
          },
          {
            key: 'subjects' as const,
            label: 'Classes',
            icon: BookOpen,
            enabled: isSuperAdmin || hasPermission('manage_subjects_classes'),
          },
          {
            key: (isSuperAdmin || hasPermission('view_analytics') ? 'analytics' : 'doubts') as
              | 'analytics'
              | 'doubts',
            label: isSuperAdmin || hasPermission('view_analytics') ? 'Analytics' : 'Doubts',
            icon: isSuperAdmin || hasPermission('view_analytics') ? TrendingUp : HelpCircle,
            enabled: true,
          },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key && !mobileNavOpen;
          return (
            <button
              key={item.key}
              type="button"
              disabled={!item.enabled}
              onClick={() => {
                if (!item.enabled) return;
                setActiveTab(item.key);
                setMobileNavOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[50px] px-0.5 rounded-xl active:scale-95 transition-all cursor-pointer disabled:opacity-35 ${
                active ? 'text-blue-600 font-semibold bg-blue-50/70' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-600" />}
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate max-w-full leading-none">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className={`relative min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[50px] px-0.5 rounded-xl active:scale-95 transition-all cursor-pointer ${
            mobileNavOpen || !['overview', 'users', 'subjects', 'analytics', 'doubts'].includes(activeTab)
              ? 'text-blue-600 font-semibold bg-blue-50/70'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {(mobileNavOpen || !['overview', 'users', 'subjects', 'analytics', 'doubts'].includes(activeTab)) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-600" />
          )}
          <LayoutGrid className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate max-w-full leading-none">More</span>
        </button>
      </nav>
    </div>
  );
};
