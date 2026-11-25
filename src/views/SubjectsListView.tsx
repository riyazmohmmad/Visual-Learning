import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  ArrowRight,
  Atom,
  Dna,
  Calculator,
  Plus,
  KeyRound,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  fetchStudentEnrollmentsFromFirestore,
  subscribeToStudentEnrollments,
} from '../services/enrollmentFirestoreService';
import { Subject } from '../types';
import { JoinClassModal } from '../components/JoinClassModal';

interface Props {
  onNavigate: (view: string, params?: any) => void;
}

export const SubjectsListView: React.FC<Props> = ({ onNavigate }) => {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const lastSyncHashRef = useRef<string>('');

  const loadSubjects = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      const data = await api.getSubjects();
      setSubjects(data.subjects || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const init = async () => {
      try {
        if (user.role === 'student' && firebaseUser?.uid) {
          const fsEnrollments = await fetchStudentEnrollmentsFromFirestore(firebaseUser.uid);
          if (!cancelled && fsEnrollments.length > 0) {
            lastSyncHashRef.current = fsEnrollments
              .map((e) => `${e.classId}:${e.status}`)
              .sort()
              .join('|');
            await api
              .syncEnrollmentsFromFirestore({ enrollments: fsEnrollments })
              .catch(() => undefined);
          }
        }
      } finally {
        if (!cancelled) {
          await loadSubjects();
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.role, firebaseUser?.uid, loadSubjects]);

  useEffect(() => {
    if (authLoading || !firebaseUser?.uid || user?.role !== 'student') return;

    const unsubscribe = subscribeToStudentEnrollments(
      firebaseUser.uid,
      async (activeEnrollments) => {
        if (activeEnrollments.length === 0) return;
        const hash = activeEnrollments
          .map((e) => `${e.classId}:${e.status}`)
          .sort()
          .join('|');
        if (hash === lastSyncHashRef.current) return;
        lastSyncHashRef.current = hash;
        await api
          .syncEnrollmentsFromFirestore({ enrollments: activeEnrollments })
          .catch(() => undefined);
        await loadSubjects({ silent: true });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authLoading, firebaseUser?.uid, user?.role, loadSubjects]);

  const getSubjectIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Atom':
        return <Atom className="w-5 h-5 text-blue-600" />;
      case 'Dna':
        return <Dna className="w-5 h-5 text-emerald-600" />;
      case 'Calculator':
        return <Calculator className="w-5 h-5 text-purple-600" />;
      default:
        return <BookOpen className="w-5 h-5 text-blue-600" />;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-slate-500">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <span className="text-sm font-medium">Loading classes...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8 sm:pb-14 pb-safe-lg space-y-6 font-sans">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div>
          <h1 className="type-page-title text-slate-900">
            My Enrolled Classes
          </h1>
          <p className="type-helper text-slate-500 mt-1">
            Classes and course modules you have joined via verified instructor class codes.
          </p>
        </div>

        <button
          onClick={() => setIsJoinModalOpen(true)}
          className="py-2.5 px-4 type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Join Class With Code</span>
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className="p-10 bg-white border border-slate-200/90 rounded-2xl text-center space-y-4 max-w-lg mx-auto my-12 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="type-card-title text-slate-900">No Classes Joined Yet</h3>
            <p className="type-helper text-slate-500 leading-relaxed">
              Instructor classes require a verified class code to join. Enter your class code to view materials, video lectures, and assessments.
            </p>
          </div>
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="py-2.5 px-5 type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>Enter Class Code</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subjects.map((subj) => (
            <div
              key={subj.id}
              onClick={() => onNavigate('subject_detail', { id: subj.id })}
              className="group cursor-pointer bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-6 transition-all duration-200 shadow-xs hover:shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  {getSubjectIcon(subj.iconName)}
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <h2 className="type-card-title text-slate-900 group-hover:text-blue-600 transition-colors">
                    {subj.name}
                  </h2>
                  {subj.section && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {subj.section}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 mb-2">
                  Instructor: {subj.teacher_name || 'Faculty Member'}
                </p>

                <p className="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-2">
                  {subj.description}
                </p>

                <div className="mt-5 pt-3.5 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Course Progress</span>
                    <span className="font-semibold text-slate-900">{subj.progress || 0}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${subj.progress || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600">
                <span className="text-slate-400 font-normal">{subj.totalChapters ?? 0} Chapters</span>
                <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Open Class</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Join Class Modal */}
      <JoinClassModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={(classId) => {
          loadSubjects();
          onNavigate('subject_detail', { id: classId });
        }}
      />
    </div>
  );
};
