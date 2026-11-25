import React, { useState } from 'react';
import { KeyRound, X, CheckCircle2, AlertCircle, ArrowRight, BookOpen, User, Hash } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  checkStudentEnrollmentInFirestore,
  confirmAndSaveEnrollmentInFirestore,
  findFirestoreClassByCode,
} from '../services/enrollmentFirestoreService';
import { ResponsiveModal } from './ResponsiveModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (classId: string) => void;
}

export const JoinClassModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { user, firebaseUser } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedClass, setVerifiedClass] = useState<any | null>(null);
  const [verifiedFromFirestoreFallback, setVerifiedFromFirestoreFallback] = useState(false);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  if (!isOpen) return null;

  const studentUid = firebaseUser?.uid || user?.uid || user?.id || '';

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;

    setError(null);
    setLoading(true);
    setVerifiedClass(null);
    setVerifiedFromFirestoreFallback(false);
    setAlreadyEnrolled(false);

    try {
      const res = await api.verifyClassCode(normalizedCode);
      setVerifiedClass(res.class);
      let enrolledAlready = !!res.alreadyEnrolled;
      if (!enrolledAlready && firebaseUser?.uid && res.class?.id) {
        const fsExisting = await checkStudentEnrollmentInFirestore(firebaseUser.uid, res.class.id);
        if (fsExisting) {
          enrolledAlready = true;
          await api
            .syncEnrollmentsFromFirestore({ enrollments: [fsExisting] })
            .catch(() => undefined);
        }
      }
      setAlreadyEnrolled(enrolledAlready);
    } catch (err: any) {
      // Resilient fallback: check Firestore /classes registry if backend lost ephemeral state
      if (firebaseUser?.uid) {
        const fsClass = await findFirestoreClassByCode(normalizedCode);
        if (fsClass) {
          setVerifiedClass({
            id: fsClass.id,
            name: fsClass.name,
            code: fsClass.code,
            classCode: fsClass.classCode,
            teacherId: fsClass.teacherId,
            teacherName: fsClass.teacherName,
            section: fsClass.section,
            description: fsClass.description,
            iconName: fsClass.iconName,
            color: fsClass.color,
            thumbnail: fsClass.thumbnail,
          });
          setVerifiedFromFirestoreFallback(true);
          const fsExisting = await checkStudentEnrollmentInFirestore(firebaseUser.uid, fsClass.id);
          setAlreadyEnrolled(!!fsExisting);
          setLoading(false);
          return;
        }
      }
      setError(err.message || 'Invalid class code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!verifiedClass) return;
    const normalizedCode = (verifiedClass.classCode || code).trim().toUpperCase();
    if (!studentUid) {
      setError('Authentication required. Please sign in again before joining a class.');
      return;
    }

    setError(null);
    setIsJoining(true);

    try {
      let targetClassId = verifiedClass.id;
      let targetTeacherId = verifiedClass.teacherId || '';
      let targetClassName = verifiedClass.name || 'Class';
      let targetSection = verifiedClass.section || 'B21';
      let targetTeacherName = verifiedClass.teacherName || 'Faculty Instructor';
      let targetClassCode = normalizedCode;

      // Step 1: If class exists on backend, record enrollment there first (or handle already-enrolled non-destructively)
      if (!verifiedFromFirestoreFallback) {
        try {
          const res = await api.joinClass(normalizedCode);
          targetClassId = res.classId || targetClassId;
          targetTeacherId = res.subject?.teacherId || targetTeacherId;
          targetClassName = res.subject?.name || targetClassName;
          targetSection = res.subject?.section || targetSection;
          targetTeacherName = res.subject?.teacherName || targetTeacherName;
          targetClassCode = res.subject?.classCode || targetClassCode;
        } catch (joinErr: any) {
          const msg = String(joinErr?.message || '').toLowerCase();
          if (!msg.includes('already enrolled')) {
            throw joinErr;
          }
        }
      }

      // Step 2: Permanently persist and confirm enrollment in Cloud Firestore
      // so it survives page refreshes, navigation, logout/login, and container restarts.
      if (firebaseUser?.uid && targetTeacherId) {
        const fsResult = await confirmAndSaveEnrollmentInFirestore({
          studentId: firebaseUser.uid,
          classId: targetClassId,
          teacherId: targetTeacherId,
          classCode: targetClassCode,
          className: targetClassName,
          section: targetSection,
          teacherName: targetTeacherName,
          studentName: user?.name || firebaseUser.displayName || undefined,
          studentEmail: user?.email || firebaseUser.email || undefined,
          enrolledBy: firebaseUser.uid,
        });

        if (!fsResult.confirmed || !fsResult.enrollment) {
          throw new Error('Could not confirm permanent enrollment in Cloud Firestore. Please try again.');
        }

        // If verified via Firestore fallback, reconcile class + enrollment back into backend immediately
        if (verifiedFromFirestoreFallback) {
          await api.syncEnrollmentsFromFirestore({
            enrollments: [fsResult.enrollment],
            classes: [
              {
                id: targetClassId,
                name: targetClassName,
                code: verifiedClass.code,
                description: verifiedClass.description,
                teacherId: targetTeacherId,
                teacherName: targetTeacherName,
                section: targetSection,
                classCode: targetClassCode,
                status: 'active',
                iconName: verifiedClass.iconName,
                color: verifiedClass.color,
                thumbnail: verifiedClass.thumbnail,
              },
            ],
          });
        }
      }

      onSuccess(targetClassId);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to join class. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleOpenAlreadyEnrolled = async () => {
    if (!verifiedClass) return;
    // Silently backfill Firestore if a legacy enrollment existed only in backend
    if (firebaseUser?.uid && verifiedClass.teacherId) {
      await confirmAndSaveEnrollmentInFirestore({
        studentId: firebaseUser.uid,
        classId: verifiedClass.id,
        teacherId: verifiedClass.teacherId,
        classCode: (verifiedClass.classCode || code).trim().toUpperCase(),
        className: verifiedClass.name || 'Class',
        section: verifiedClass.section,
        teacherName: verifiedClass.teacherName,
        studentName: user?.name || firebaseUser.displayName || undefined,
        studentEmail: user?.email || firebaseUser.email || undefined,
        enrolledBy: firebaseUser.uid,
      }).catch(() => undefined);
    }
    onSuccess(verifiedClass.id);
    handleClose();
  };

  const handleClose = () => {
    setCode('');
    setError(null);
    setVerifiedClass(null);
    setVerifiedFromFirestoreFallback(false);
    setAlreadyEnrolled(false);
    onClose();
  };

  const headerContent = (
    <div className="px-4 py-4 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-2 bg-white">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="type-card-title text-slate-900">Join a Class</h3>
          <p className="text-xs text-slate-500">Enter the unique code provided by your instructor</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close modal"
        className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors active:scale-95"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabel="Join a Class"
      maxWidthClass="max-w-[460px]"
      header={headerContent}
      bodyClassName="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
    >
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {!verifiedClass ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Class Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CS-B21-X7K92"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-wider text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 uppercase"
                />
                <p className="text-[11px] text-slate-400">
                  Ask your teacher for the class code (format: SUB-SEC-XXXXX)
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full min-h-[46px] py-2.5 px-4 type-btn bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {loading ? 'Verifying Code...' : 'Verify Class Code'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Class Found Banner */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
                <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Class Found</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{verifiedClass.name}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 pt-1.5 border-t border-blue-100">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{verifiedClass.teacherName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                      <span>Sec: {verifiedClass.section}</span>
                    </div>
                  </div>

                  {verifiedClass.description && (
                    <p className="text-slate-500 text-[11px] line-clamp-2 pt-1">
                      {verifiedClass.description}
                    </p>
                  )}
                </div>
              </div>

              {alreadyEnrolled ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                    You are already enrolled in this class.
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAlreadyEnrolled}
                    className="w-full min-h-[46px] py-2.5 px-4 type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <span>Open Class</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setVerifiedClass(null)}
                    className="flex-1 min-h-[44px] py-2.5 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    Different Code
                  </button>
                  <button
                    type="button"
                    disabled={isJoining}
                    onClick={handleConfirmJoin}
                    className="flex-2 min-h-[44px] py-2.5 px-4 type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    {isJoining ? 'Enrolling...' : 'Join Class'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
    </ResponsiveModal>
  );
};
