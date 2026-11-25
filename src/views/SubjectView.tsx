import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Lock,
  Plus,
  Radio,
  ArrowRight as ArrowRightIcon,
  Users,
  MoreVertical,
  FileText,
  Video,
  Award,
  Clock,
  Sparkles,
  Calendar,
  Layers,
  GraduationCap,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { checkStudentEnrollmentInFirestore } from '../services/enrollmentFirestoreService';
import { Subject, Chapter } from '../types';
import { JoinClassModal } from '../components/JoinClassModal';
import { useAuth } from '../context/AuthContext';

interface Props {
  subjectId: string;
  onNavigate: (view: string, params?: any) => void;
}

type TabType = 'overview' | 'chapters' | 'live' | 'students';

export const SubjectView: React.FC<Props> = ({ subjectId, onNavigate }) => {
  const { user, firebaseUser, loading: authLoading, isTeacher, isAdmin } = useAuth();
  const canManageClass = isTeacher || isAdmin;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [reloadTick, setReloadTick] = useState<number>(0);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    // Immediately reset class-specific state when switching classes to prevent stale data flashing
    setSubject(null);
    setChapters([]);
    setError(null);
    setActiveTab('overview');
    setLoading(true);

    const fetchSubjectWithRecovery = async () => {
      try {
        const res = await api.getSubject(subjectId);
        if (cancelled) return;
        setSubject(res.subject);
        setChapters(res.chapters || []);
      } catch (err: any) {
        if (cancelled) return;
        // If student gets 403/404 (e.g., after container restart), check Firestore permanent enrollment
        // and reconcile non-destructively before displaying the Enrollment Required screen.
        const isRecoverableStatus = err?.status === 403 || err?.status === 404;
        if (isRecoverableStatus && user?.role === 'student' && firebaseUser?.uid) {
          const fsEnrollment = await checkStudentEnrollmentInFirestore(firebaseUser.uid, subjectId);
          if (!cancelled && fsEnrollment) {
            try {
              await api.syncEnrollmentsFromFirestore({ enrollments: [fsEnrollment] });
              const retryRes = await api.getSubject(subjectId);
              if (!cancelled) {
                setSubject(retryRes.subject);
                setChapters(retryRes.chapters || []);
                return;
              }
            } catch {
              // Fall through to show original error
            }
          }
        }
        if (!cancelled) {
          setError(err.message || 'Failed to load subject details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSubjectWithRecovery();

    return () => {
      cancelled = true;
    };
  }, [subjectId, reloadTick, authLoading, user?.role, firebaseUser?.uid]);

  const loadSubject = () => {
    setReloadTick((t) => t + 1);
  };

  const handleCopyCode = () => {
    const codeToCopy = subject?.class_code || subject?.section;
    if (!codeToCopy) return;
    navigator.clipboard.writeText(codeToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-sm font-medium text-slate-600">Loading class details...</div>
      </div>
    );
  }

  // Enrollment Required / Access Error
  if (error || !subject) {
    const isEnrollmentError =
      error?.toLowerCase().includes('not enrolled') || error?.toLowerCase().includes('class code');

    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-xs">
          {isEnrollmentError ? <Lock className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isEnrollmentError ? 'Enrollment Required' : 'Subject Unavailable'}
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
            {isEnrollmentError
              ? 'This class is private and requires a verified class code from your instructor. Enter the code to access all chapters, notes, and lectures.'
              : error || 'Subject not found.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onNavigate('student_dashboard')}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            My Classes
          </button>

          {isEnrollmentError && (
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Enter Class Code</span>
            </button>
          )}
        </div>

        <JoinClassModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
          onSuccess={() => {
            loadSubject();
          }}
        />
      </div>
    );
  }

  // Use real per-class counts strictly returned by backend for this class
  const totalNotes = subject.totalNotes ?? 0;
  const totalVideos = subject.totalVideos ?? 0;
  const totalQuizzes = subject.totalQuizzes ?? 0;
  const enrolledStudents = subject.enrolledStudents ?? [];
  const totalStudents = subject.totalStudents ?? enrolledStudents.length;
  const recentActivity = subject.recentActivity ?? [];
  const progressPercent = subject.progress || 0;
  const backTarget = canManageClass ? 'teacher_dashboard' : 'student_dashboard';

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 pb-12 sm:pt-8 sm:pb-14 pb-safe-lg space-y-5 sm:space-y-6">
      {/* ==================================================
          1. HEADER (Back button, Class name, More options)
      ================================================== */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-4">
        <button
          onClick={() => onNavigate(backTarget)}
          className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-blue-600 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 group-hover:text-blue-600 group-hover:border-blue-200 transition-colors shadow-2xs">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span>Back to Classes</span>
        </button>

        <h1 className="text-[15px] font-semibold text-slate-900 hidden sm:block truncate max-w-md">
          {subject.name}
        </h1>

        <div className="flex items-center gap-2">
          {subject.live_session?.is_active && (
            <button
              onClick={() =>
                onNavigate('live_classroom', {
                  classId: subject.id,
                  sessionId: subject.live_session?.id,
                })
              }
              className="py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Join Live</span>
            </button>
          )}

          <button
            onClick={handleCopyCode}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Copy Class Code"
          >
            {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ==================================================
          2. HERO SECTION (Class name, Subject, Code, Teacher, Students, Status)
      ================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold shadow-2xs">
              <BookOpen className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="type-page-title text-slate-900 break-words">{subject.name}</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                  {progressPercent >= 100 ? 'Completed' : 'Ongoing'}
                </span>
              </div>

              <p className="type-helper sm:text-[13px] text-slate-600 max-w-xl leading-relaxed">
                {subject.description || 'Comprehensive curriculum with visual explanations, videos, and quizzes.'}
              </p>

              {/* Metadata row: Subject, Code, Teacher, Students */}
              <div className="pt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
                <div>
                  <span className="text-slate-400">Subject:</span>{' '}
                  <strong className="text-slate-700 font-medium">{subject.name}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Class Code:</span>{' '}
                  <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {subject.class_code || subject.section || '—'}
                  </code>
                </div>
                <div>
                  <span className="text-slate-400">Teacher:</span>{' '}
                  <strong className="text-slate-700 font-medium">{subject.teacher_name || 'Assigned Faculty'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Enrolled:</span>{' '}
                  <strong className="text-slate-700 font-medium">{subject.totalStudents ?? 0} Students</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            COURSE PROGRESS BAR
        ================================================== */}
        <div className="mt-6 pt-5 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-600">Course Progress</span>
            <span className="font-bold text-blue-600">{progressPercent}% Completed</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ==================================================
          3. FEATURE CARDS (Chapters, Notes, Videos, Quizzes)
      ================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Chapters */}
        <div
          onClick={() => setActiveTab('chapters')}
          className="p-4 bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl shadow-xs cursor-pointer transition-all hover:shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
            <Layers className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-slate-900">{chapters.length}</div>
          <div className="text-xs text-slate-500 font-medium">Chapters</div>
        </div>

        {/* Notes */}
        <div
          onClick={() => setActiveTab('overview')}
          className="p-4 bg-white border border-slate-200/90 hover:border-purple-300 rounded-2xl shadow-xs cursor-pointer transition-all hover:shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2">
            <FileText className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalNotes}</div>
          <div className="text-xs text-slate-500 font-medium">Notes & PDFs</div>
        </div>

        {/* Videos */}
        <div
          onClick={() => setActiveTab('overview')}
          className="p-4 bg-white border border-slate-200/90 hover:border-amber-300 rounded-2xl shadow-xs cursor-pointer transition-all hover:shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
            <Video className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalVideos}</div>
          <div className="text-xs text-slate-500 font-medium">Video Lessons</div>
        </div>

        {/* Quizzes */}
        <div
          onClick={() => setActiveTab('overview')}
          className="p-4 bg-white border border-slate-200/90 hover:border-emerald-300 rounded-2xl shadow-xs cursor-pointer transition-all hover:shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
            <Award className="w-5 h-5" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalQuizzes}</div>
          <div className="text-xs text-slate-500 font-medium">Practice Quizzes</div>
        </div>
      </div>

      {/* ==================================================
          4. TABS: Overview | Chapters | Live Classes | Students
      ================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 pt-3 sm:pt-4 border-b border-slate-200/80 bg-slate-50/50 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('chapters')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'chapters'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Chapters ({chapters.length})
          </button>
          <button
            onClick={() => setActiveTab('live')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'live'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Live Classes</span>
            {subject.live_session?.is_active && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'students'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Students ({totalStudents})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* About this class */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">About this Class</h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                  {subject.description ||
                    'This course is structured with visual explanations, interactive labs, faculty study guides, and adaptive quizzes.'}
                </p>
              </div>

              {/* Recent Activity (strictly scoped to this class's real records) */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
                {recentActivity.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">No class activity yet</div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {canManageClass
                        ? 'Create chapters, upload notes, or publish quizzes inside this class to see updates here.'
                        : 'Updates will appear here once your instructor adds chapters, notes, videos, or quizzes to this class.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {recentActivity.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                              act.type === 'note'
                                ? 'bg-purple-100 text-purple-600'
                                : act.type === 'video'
                                ? 'bg-amber-100 text-amber-600'
                                : act.type === 'quiz'
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {act.type === 'note' ? (
                              <FileText className="w-3.5 h-3.5" />
                            ) : act.type === 'video' ? (
                              <Video className="w-3.5 h-3.5" />
                            ) : act.type === 'quiz' ? (
                              <Award className="w-3.5 h-3.5" />
                            ) : (
                              <Layers className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">{act.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">{act.subtitle}</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {act.created_at ? new Date(act.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CHAPTERS */}
          {activeTab === 'chapters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Curriculum Syllabus</h3>
                <span className="text-xs text-slate-500">{chapters.length} Chapters total</span>
              </div>

              {chapters.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-800">No chapters created yet</div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {canManageClass
                        ? 'This class starts empty. Open the Curriculum Builder to create your first chapter for this class.'
                        : 'Your instructor has not added any chapters to this class yet.'}
                    </p>
                  </div>
                  {canManageClass && (
                    <button
                      onClick={() => onNavigate('teacher_dashboard')}
                      className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Chapter in Dashboard</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {chapters.map((chap, idx) => (
                    <div
                      key={chap.id}
                      className="p-5 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-blue-200 transition-all space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                            Chapter {chap.order || idx + 1}
                          </div>
                          <h4 className="text-base font-bold text-slate-900 mt-0.5">{chap.title}</h4>
                          <p className="text-xs text-slate-500 mt-1 max-w-xl">{chap.description}</p>
                        </div>

                        <button
                          onClick={() => onNavigate('chapter_detail', { id: chap.id })}
                          className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
                        >
                          <span>Open Chapter</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Subtopics row */}
                      {chap.subtopics && chap.subtopics.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {chap.subtopics.map((sub, sIdx) => (
                            <div
                              key={sub.id}
                              onClick={() => onNavigate('subtopic_learn', { id: sub.id })}
                              className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 cursor-pointer flex items-center justify-between text-xs group"
                            >
                              <span className="font-medium text-slate-700 group-hover:text-blue-600 truncate">
                                {sIdx + 1}. {sub.title}
                              </span>
                              {sub.completed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE CLASSES */}
          {activeTab === 'live' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Live Lectures & Meetings</h3>
              </div>

              {subject.live_session?.is_active ? (
                <div className="p-5 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                      <Radio className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span>LIVE NOW</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {subject.live_session?.session_title || 'Active Interactive Lecture'}
                      </h4>
                      <p className="text-xs text-slate-600">
                        Instructor: {subject.teacher_name || 'Faculty Member'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      onNavigate('live_classroom', {
                        classId: subject.id,
                        sessionId: subject.live_session?.id,
                      })
                    }
                    className="py-2 px-4 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Join Live Classroom</span>
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-semibold text-slate-700">No active live session</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Your instructor will notify you when a live classroom session begins.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STUDENTS (strictly real enrolled students for this class) */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Enrolled Students</h3>
                <span className="text-xs text-slate-500">{totalStudents} Students</span>
              </div>

              {enrolledStudents.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-semibold text-slate-700">No students enrolled yet</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {canManageClass && subject.class_code
                      ? `Share class code ${subject.class_code} with your students so they can join this class.`
                      : 'Students who join this class using its unique class code will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {enrolledStudents.map((stu) => {
                    const initials = (stu.name || 'S')
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div
                        key={stu.id}
                        className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-lg bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {stu.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {stu.email || 'Enrolled via class code'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
