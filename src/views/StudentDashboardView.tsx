import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowRight,
  BookOpen,
  Play,
  FileText,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Award,
  AlertCircle,
  Plus,
  Radio,
  User,
  HelpCircle,
  Home,
  GraduationCap,
  Video,
  Activity,
  ClipboardList,
  LayoutGrid,
  X,
  Clock,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  fetchStudentEnrollmentsFromFirestore,
  subscribeToStudentEnrollments,
} from '../services/enrollmentFirestoreService';
import { Subject } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { JoinClassModal } from '../components/JoinClassModal';
import { StudentDoubtsTab } from '../components/StudentDoubtsTab';
import { StudentSimulationsTab } from '../components/StudentSimulationsTab';
import { StudentSmartStudyTab } from '../components/StudentSmartStudyTab';
import { StudentProgressAnalyticsTab } from '../components/StudentProgressAnalyticsTab';
import { AuthenticatedPdfViewerModal } from '../components/AuthenticatedPdfViewerModal';
import {
  StudentLiveClassesTab,
  StudentNotesLibraryTab,
  StudentVideosLibraryTab,
  StudentQuizzesTab,
  StudentAssignmentsTab,
} from '../components/StudentPortalTabs';
import { formatDateTime, formatDurationMs, useServerNow } from '../utils/scheduleUtils';

export type StudentNavTab =
  | 'home'
  | 'classes'
  | 'live'
  | 'simulations'
  | 'notes'
  | 'videos'
  | 'quizzes'
  | 'assignments'
  | 'smart_study'
  | 'progress'
  | 'doubts';

interface Props {
  initialTab?: string;
  onNavigate: (view: string, params?: any) => void;
}

export const StudentDashboardView: React.FC<Props> = ({ initialTab, onNavigate }) => {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);
  const lastEnrollmentHashRef = useRef<string>('');
  const enrollmentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBodyScrollLock(mobileMoreOpen);

  const [activeNavTab, setActiveNavTab] = useState<StudentNavTab>(
    (initialTab as StudentNavTab) || 'home'
  );
  const [activeSecureDocId, setActiveSecureDocId] = useState<string | null>(null);
  const [activeSimulationId, setActiveSimulationId] = useState<string | undefined>(undefined);
  const [classFilter, setClassFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [liveDoubtsCount, setLiveDoubtsCount] = useState<number>(0);
  const serverNow = useServerNow(dashboardData?.serverTime);

  useEffect(() => {
    if (initialTab) {
      setActiveNavTab(initialTab as StudentNavTab);
    }
  }, [initialTab]);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      const [dashRes, doubtsRes] = await Promise.allSettled([
        api.getStudentDashboard(),
        api.getDoubts(),
      ]);

      if (dashRes.status === 'fulfilled') {
        setDashboardData(dashRes.value);
      } else {
        throw dashRes.reason;
      }

      if (doubtsRes.status === 'fulfilled') {
        setLiveDoubtsCount(doubtsRes.value.doubts?.length || 0);
      }
    } catch (err: any) {
      if (!options?.silent) {
        setError(err.message || 'Failed to load student dashboard.');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  // Wait for auth readiness, reconcile permanent Firestore enrollments first, then load dashboard.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    const init = async () => {
      try {
        if (firebaseUser?.uid) {
          const fsEnrollments = await fetchStudentEnrollmentsFromFirestore(firebaseUser.uid);
          if (!cancelled && fsEnrollments.length > 0) {
            const hash = fsEnrollments
              .map((e) => `${e.classId}:${e.status}`)
              .sort()
              .join('|');
            lastEnrollmentHashRef.current = hash;
            await api
              .syncEnrollmentsFromFirestore({ enrollments: fsEnrollments })
              .catch(() => undefined);
          }
        }
      } finally {
        if (!cancelled) {
          await loadDashboard();
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, firebaseUser?.uid, loadDashboard]);

  // Real-time Firestore listener for permanent student enrollments.
  // Never clears or deletes classes on transient errors or offline states.
  useEffect(() => {
    if (authLoading || !firebaseUser?.uid) return;

    const unsubscribe = subscribeToStudentEnrollments(
      firebaseUser.uid,
      (activeEnrollments) => {
        if (activeEnrollments.length === 0) return;

        const hash = activeEnrollments
          .map((e) => `${e.classId}:${e.status}`)
          .sort()
          .join('|');

        if (hash === lastEnrollmentHashRef.current) return;
        lastEnrollmentHashRef.current = hash;

        if (enrollmentSyncTimerRef.current) {
          clearTimeout(enrollmentSyncTimerRef.current);
        }
        enrollmentSyncTimerRef.current = setTimeout(async () => {
          try {
            await api.syncEnrollmentsFromFirestore({ enrollments: activeEnrollments });
            await loadDashboard({ silent: true });
          } catch (syncErr) {
            console.warn('Student enrollment reconciliation notice:', syncErr);
          }
        }, 200);
      },
      (errMsg) => {
        console.warn('Student enrollment live sync notice:', errMsg);
      }
    );

    return () => {
      unsubscribe();
      if (enrollmentSyncTimerRef.current) {
        clearTimeout(enrollmentSyncTimerRef.current);
        enrollmentSyncTimerRef.current = null;
      }
    };
  }, [authLoading, firebaseUser?.uid, loadDashboard]);

  const handleJoinSuccess = async () => {
    await loadDashboard();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse">
          <div className="hidden lg:block lg:col-span-3 h-[480px] bg-white border border-slate-200 rounded-2xl" />
          <div className="lg:col-span-9 space-y-6">
            <div className="h-32 bg-white border border-slate-200 rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-white border border-slate-200 rounded-2xl" />
              ))}
            </div>
            <div className="h-64 bg-white border border-slate-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xs">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Unable to Load Student Portal</h2>
          <p className="text-sm text-slate-600">{error || 'Please try refreshing the page.'}</p>
          <button
            onClick={() => void loadDashboard()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { continueItem, subjects = [], stats, upcomingDeadlines = [] } = dashboardData;
  const activeLiveClass = subjects.find((s: Subject) => s.live_session?.is_active);

  const filteredSubjects = subjects.filter((s: Subject) => {
    const progress = s.progress || 0;
    if (classFilter === 'ongoing') return progress < 100;
    if (classFilter === 'completed') return progress >= 100;
    return true;
  });

  const navItems: {
    key: StudentNavTab;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
    liveDot?: boolean;
  }[] = [
    { key: 'home', label: 'Dashboard', icon: <Home className="w-4 h-4" /> },
    { key: 'doubts', label: 'AI Doubt Solver', icon: <Sparkles className="w-4 h-4" />, badge: liveDoubtsCount || undefined },
    { key: 'classes', label: 'My Classes', icon: <GraduationCap className="w-4 h-4" />, badge: subjects.length },
    { key: 'live', label: 'Live Classes', icon: <Radio className="w-4 h-4" />, liveDot: Boolean(activeLiveClass) },
    { key: 'simulations', label: 'Simulations', icon: <Activity className="w-4 h-4" /> },
    { key: 'notes', label: 'Notes & PDFs', icon: <FileText className="w-4 h-4" /> },
    { key: 'videos', label: 'Videos', icon: <Video className="w-4 h-4" /> },
    { key: 'quizzes', label: 'Quizzes', icon: <Award className="w-4 h-4" /> },
    { key: 'assignments', label: 'Assignments', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'smart_study', label: 'Smart Study', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'progress', label: 'My Progress', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  const renderClassesSection = (isDedicatedView: boolean) => (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {isDedicatedView ? 'All Enrolled Classes' : 'My Enrolled Classes'}
          </h2>
          <p className="text-xs text-slate-500">
            Open any class to explore chapters, videos, simulations, notes, and quizzes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 text-xs overflow-x-auto scrollbar-none max-w-full">
            {(['all', 'ongoing', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setClassFilter(f)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  classFilter === f
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {isDedicatedView && (
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Join Class</span>
            </button>
          )}
        </div>
      </div>

      {filteredSubjects.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              {subjects.length === 0 ? 'You have not joined any classes yet' : 'No classes match this filter'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {subjects.length === 0
                ? 'Enter a class code provided by your teacher to unlock structured chapters, live sessions, notes, and quizzes.'
                : 'Switch back to All to view your enrolled courses.'}
            </p>
          </div>
          {subjects.length === 0 && (
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="py-2.5 px-5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Join Class with Code</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubjects.map((subj: Subject) => {
            const isLive = Boolean(subj.live_session?.is_active);
            const prog = subj.progress || 0;
            const studentCount = typeof subj.totalStudents === 'number' ? subj.totalStudents : null;
            const codeText = subj.class_code || subj.section;

            return (
              <div
                key={subj.id}
                onClick={() => onNavigate('subject_detail', { id: subj.id })}
                className="group bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-base truncate">
                          {subj.name}
                        </h3>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {subj.teacher_name || 'Course Instructor'}
                        </div>
                      </div>
                    </div>

                    {isLive && (
                      <span className="text-[11px] font-bold text-red-600 flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Live
                      </span>
                    )}
                  </div>

                  {subj.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {subj.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                    {codeText && (
                      <span className="font-mono font-semibold text-slate-700">Code: {codeText}</span>
                    )}
                    <span>{subj.totalChapters || 0} Chapters</span>
                    {studentCount !== null && studentCount > 0 && <span>{studentCount} Students</span>}
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5 tabular-nums">
                      <span className="text-slate-500">Course Progress</span>
                      <span className="text-blue-600">{prog}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${prog}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>Open Class</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>

                    {isLive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('live_classroom', {
                            classId: subj.id,
                            sessionId: subj.live_session?.id,
                            sessionTitle: subj.live_session?.session_title,
                          });
                        }}
                        className="py-1.5 px-3 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Radio className="w-3 h-3" />
                        <span>Join Live</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-mobile-dock lg:pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8">
        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden lg:block lg:col-span-3">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs sticky top-20">
            {/* Student Profile Mini-Card */}
            <div className="flex items-center gap-3 p-2 mb-4 border-b border-slate-100 pb-4">
              <div className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 font-bold flex items-center justify-center overflow-hidden shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{user?.name?.[0]?.toUpperCase() || 'S'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mt-0.5">
                  Student Portal
                </div>
              </div>
            </div>

            <nav className="space-y-1 text-sm font-medium text-slate-600" aria-label="Student portal navigation">
              {navItems.map((item) => {
                const isActive = activeNavTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveNavTab(item.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.liveDot && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                    {!item.liveDot && item.badge !== undefined && (
                      <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                onClick={() => onNavigate('edit_profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
              >
                <User className="w-4 h-4 text-slate-400" />
                <span>Profile & Settings</span>
              </button>
            </nav>

            <div className="pt-4 mt-4 border-t border-slate-100">
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Join New Class</span>
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="lg:col-span-9 space-y-6 min-w-0">
          {/* Tablet Quick Section Switcher (phones use native bottom dock + More sheet) */}
          <div className="hidden sm:flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {navItems.map((item) => {
              const isActive = activeNavTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveNavTab(item.key)}
                  className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 border transition-colors shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Mobile Contextual Module Bar (when viewing a sub-module on smartphones) */}
          {activeNavTab !== 'home' && (
            <div className="sm:hidden flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveNavTab('home')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 min-h-[40px] pr-2 cursor-pointer"
              >
                <Home className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Home</span>
              </button>
              <span className="text-[13px] font-semibold text-slate-900 truncate">
                {navItems.find((n) => n.key === activeNavTab)?.label || 'Student Portal'}
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200/70 rounded-xl px-2.5 min-h-[36px] shrink-0 cursor-pointer active:scale-95 transition-transform"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Modules</span>
              </button>
            </div>
          )}

          {activeNavTab === 'doubts' ? (
            <StudentDoubtsTab enrolledSubjects={subjects} onRefresh={loadDashboard} />
          ) : activeNavTab === 'simulations' ? (
            <StudentSimulationsTab
              initialSimulationId={activeSimulationId}
              enrolledSubjects={subjects}
              onNavigate={onNavigate}
            />
          ) : activeNavTab === 'smart_study' ? (
            <StudentSmartStudyTab
              onNavigate={onNavigate}
              onOpenSimulation={(simId) => {
                setActiveSimulationId(simId);
                setActiveNavTab('simulations');
              }}
            />
          ) : activeNavTab === 'progress' ? (
            <StudentProgressAnalyticsTab />
          ) : activeNavTab === 'classes' ? (
            renderClassesSection(true)
          ) : activeNavTab === 'live' ? (
            <StudentLiveClassesTab enrolledSubjects={subjects} onNavigate={onNavigate} />
          ) : activeNavTab === 'notes' ? (
            <StudentNotesLibraryTab
              enrolledSubjects={subjects}
              onNavigate={onNavigate}
              onOpenSecurePdf={(id) => setActiveSecureDocId(id)}
            />
          ) : activeNavTab === 'videos' ? (
            <StudentVideosLibraryTab enrolledSubjects={subjects} onNavigate={onNavigate} />
          ) : activeNavTab === 'quizzes' ? (
            <StudentQuizzesTab enrolledSubjects={subjects} onNavigate={onNavigate} />
          ) : activeNavTab === 'assignments' ? (
            <StudentAssignmentsTab enrolledSubjects={subjects} onNavigate={onNavigate} />
          ) : (
            /* HOME / OVERVIEW */
            <>
              {activeLiveClass && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">
                        Live Class In Progress
                      </div>
                      <h3 className="type-card-title text-slate-900 mt-0.5">
                        {activeLiveClass.name} — {activeLiveClass.live_session?.session_title || 'Live Lecture'}
                      </h3>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      onNavigate('live_classroom', {
                        classId: activeLiveClass.id,
                        sessionId: activeLiveClass.live_session?.id,
                        sessionTitle: activeLiveClass.live_session?.session_title,
                      })
                    }
                    className="w-full sm:w-auto py-2.5 px-5 min-h-[42px] bg-red-600 hover:bg-red-700 text-white rounded-xl type-btn flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Join Live Class</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Welcome Header */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    {getGreeting()}
                  </div>
                  <h1 className="type-page-title text-slate-900">
                    {user?.name || 'Student'}
                  </h1>
                  <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed">
                    Pick up where you left off, solve doubts with AI, or explore interactive lessons.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => setIsJoinModalOpen(true)}
                    className="py-2.5 px-3.5 sm:px-4 min-h-[44px] type-btn bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="truncate">Join Class</span>
                  </button>
                  <button
                    onClick={() => setActiveNavTab('doubts')}
                    className="py-2.5 px-3.5 sm:px-4 min-h-[44px] type-btn bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 border border-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate">AI Solver</span>
                  </button>
                </div>
              </div>

              {/* Real KPI Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <button
                  onClick={() => setActiveNavTab('classes')}
                  className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Enrolled Classes</span>
                    <GraduationCap className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="type-metric text-slate-900">{subjects.length}</div>
                </button>

                <button
                  onClick={() => setActiveNavTab('progress')}
                  className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Lessons Completed</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="type-metric text-slate-900">
                    {stats?.subtopicsCompleted || 0}
                  </div>
                </button>

                <button
                  onClick={() => setActiveNavTab('quizzes')}
                  className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">Avg Quiz Score</span>
                    <Award className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="type-metric text-slate-900">
                    {stats?.averageQuizScore || 0}%
                  </div>
                </button>

                <button
                  onClick={() => setActiveNavTab('doubts')}
                  className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">My Doubts</span>
                    <HelpCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="type-metric text-slate-900">{liveDoubtsCount}</div>
                </button>
              </div>

              {/* Continue Learning */}
              {continueItem && (
                <div className="bg-white border border-blue-200/90 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" />
                      <span>Continue Learning</span>
                    </div>
                    <h2 className="type-card-title text-slate-900 truncate">
                      {continueItem.subtopicTitle}
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                      {continueItem.subjectName} · {continueItem.chapterTitle}
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate('subtopic_learn', { id: continueItem.subtopicId })}
                    className="py-2.5 px-5 min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl type-btn flex items-center justify-center gap-2 shadow-xs shrink-0 cursor-pointer"
                  >
                    <span>Resume Lesson</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Upcoming Quizzes & Assignments Deadlines */}
              {upcomingDeadlines.length > 0 && (
                <section className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Upcoming & Active Deadlines</span>
                      </div>
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                        Scheduled Quizzes & Assignments
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveNavTab('quizzes')}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        All Quizzes
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setActiveNavTab('assignments')}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        All Assignments
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {upcomingDeadlines.map((item: any) => {
                      const startMs = item.start_date ? new Date(item.start_date).getTime() : null;
                      const dueMs = item.due_date ? new Date(item.due_date).getTime() : null;
                      const isBeforeStart = startMs !== null && !Number.isNaN(startMs) && serverNow < startMs;
                      const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && serverNow > dueMs;

                      let countdownLabel = 'Available now';
                      let badgeText = 'Available Now';
                      let badgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                      if (isBeforeStart && startMs !== null) {
                        countdownLabel = `Starts in ${formatDurationMs(startMs - serverNow)}`;
                        badgeText = 'Upcoming';
                        badgeCls = 'bg-blue-50 text-blue-700 border-blue-200';
                      } else if (isPastDue) {
                        countdownLabel = item.allow_late_submission ? 'Deadline passed (Late allowed)' : 'Deadline passed';
                        badgeText = 'Overdue';
                        badgeCls = item.allow_late_submission
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200';
                      } else if (dueMs !== null && !Number.isNaN(dueMs)) {
                        countdownLabel = `Due in ${formatDurationMs(dueMs - serverNow)}`;
                      }

                      return (
                        <button
                          key={`${item.kind}_${item.id}`}
                          type="button"
                          onClick={() => setActiveNavTab(item.kind === 'quiz' ? 'quizzes' : 'assignments')}
                          className="p-3.5 bg-slate-50/90 hover:bg-blue-50/40 border border-slate-200/80 hover:border-blue-300 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-blue-600 truncate">
                                {item.kind === 'quiz' ? 'Quiz' : 'Assignment'} · {item.subjectName}
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">
                                {item.title}
                              </div>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${badgeCls}`}>
                              {badgeText}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {item.due_date ? formatDateTime(item.due_date) : item.start_date ? formatDateTime(item.start_date) : 'Open'}
                            </span>
                            <span className="font-semibold text-slate-800">{countdownLabel}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Quick Study Shortcuts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { tab: 'notes' as const, label: 'Notes & PDFs', icon: FileText, desc: 'Protected study docs' },
                  { tab: 'videos' as const, label: 'Video Library', icon: Video, desc: 'Curriculum lectures' },
                  { tab: 'assignments' as const, label: 'Assignments', icon: ClipboardList, desc: 'Deadlines & work' },
                  { tab: 'simulations' as const, label: 'Simulations', icon: Activity, desc: 'Interactive labs' },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.tab}
                      onClick={() => setActiveNavTab(card.tab)}
                      className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 text-left transition-all shadow-xs cursor-pointer group"
                    >
                      <Icon className="w-5 h-5 text-blue-600 mb-2" />
                      <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {card.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{card.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Enrolled Classes */}
              {renderClassesSection(false)}
            </>
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 w-full max-w-full overflow-hidden mobile-bottom-dock border-t border-slate-200/90 px-1 px-safe pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] grid grid-cols-5 items-center text-[10px] tracking-tight font-medium text-slate-600"
        aria-label="Mobile student navigation"
      >
        {[
          { key: 'home' as const, label: 'Home', icon: Home },
          { key: 'classes' as const, label: 'Classes', icon: GraduationCap },
          { key: 'live' as const, label: 'Live', icon: Radio, hasLive: Boolean(activeLiveClass) },
          { key: 'doubts' as const, label: 'AI Solver', icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeNavTab === item.key && !mobileMoreOpen;
          return (
            <button
              key={item.key}
              onClick={() => {
                setActiveNavTab(item.key);
                setMobileMoreOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[50px] px-0.5 rounded-xl active:scale-95 transition-all cursor-pointer ${
                active ? 'text-blue-600 font-semibold bg-blue-50/70' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-600" />}
              <span className="relative">
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {item.hasLive && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </span>
              <span className="truncate max-w-full leading-none">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setMobileMoreOpen(true)}
          className={`relative min-w-0 flex flex-col items-center justify-center gap-0.5 min-h-[50px] px-0.5 rounded-xl active:scale-95 transition-all cursor-pointer ${
            mobileMoreOpen || !['home', 'classes', 'live', 'doubts'].includes(activeNavTab)
              ? 'text-blue-600 font-semibold bg-blue-50/70'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {(mobileMoreOpen || !['home', 'classes', 'live', 'doubts'].includes(activeNavTab)) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-600" />
          )}
          <LayoutGrid className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate max-w-full leading-none">More</span>
        </button>
      </nav>

      {/* MOBILE "MORE" MODULE BOTTOM SHEET */}
      {mobileMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-end"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full max-h-[min(85dvh,calc(100dvh-2rem))] overflow-hidden flex flex-col bg-white rounded-t-3xl shadow-2xl mobile-sheet-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100">
              <div className="mobile-drag-handle mb-2.5" aria-hidden="true" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="type-card-title text-slate-900 block">Learning Modules</span>
                  <span className="text-[11px] text-slate-500">Jump to any section of your student portal</span>
                </div>
                <button
                  onClick={() => setMobileMoreOpen(false)}
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                  aria-label="Close modules menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setActiveNavTab(item.key);
                    setMobileMoreOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`p-3.5 min-h-[68px] rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 text-xs font-semibold min-w-0 active:scale-[0.98] transition-all cursor-pointer ${
                    activeNavTab === item.key
                      ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span className="truncate w-full">{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  setMobileMoreOpen(false);
                  onNavigate('edit_profile');
                }}
                className="p-3.5 min-h-[68px] rounded-2xl border bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100 text-center flex flex-col items-center justify-center gap-1.5 text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </button>
            </div>
            </div>
            <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setIsJoinModalOpen(true);
                }}
                className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white type-btn rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Join New Class With Code</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Class Modal */}
      <JoinClassModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={handleJoinSuccess}
      />

      {/* Authenticated Faculty Notes Document Viewer */}
      {activeSecureDocId && (
        <AuthenticatedPdfViewerModal
          materialId={activeSecureDocId}
          onClose={() => setActiveSecureDocId(null)}
        />
      )}
    </div>
  );
};
