import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  Layers,
  Play,
  FileText,
  Award,
  Plus,
  CheckCircle2,
  AlertCircle,
  Upload,
  Users,
  Copy,
  Check,
  Radio,
  ChevronRight,
  User,
  Calendar,
  Video,
  Clock,
  ArrowRight,
  HelpCircle,
  MessageSquare,
  Send,
  Home,
  GraduationCap,
  Sparkles,
  PhoneOff,
  FolderTree,
  ClipboardList,
  TrendingUp,
  Settings,
  LogOut,
  RefreshCw,
  Eye,
  KeyRound,
  Activity,
  LayoutGrid,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  subscribeToTeacherEnrollmentsAndClasses,
  upsertFirestoreClass,
} from '../services/enrollmentFirestoreService';
import { Subject, Chapter, Subtopic } from '../types';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { ResponsiveModal } from '../components/ResponsiveModal';
import { TeacherSubjectsTab } from '../components/teacher/TeacherSubjectsTab';
import { TeacherCurriculumTab } from '../components/teacher/TeacherCurriculumTab';
import { TeacherMaterialsTab } from '../components/teacher/TeacherMaterialsTab';
import { TeacherQuizzesTab } from '../components/teacher/TeacherQuizzesTab';
import { TeacherAssignmentsTab } from '../components/teacher/TeacherAssignmentsTab';
import { TeacherProgressTab } from '../components/teacher/TeacherProgressTab';
import { TeacherSettingsTab } from '../components/teacher/TeacherSettingsTab';
import { TeacherDoubtsTab } from '../components/teacher/TeacherDoubtsTab';
import { TeacherSimulationsTab } from '../components/teacher/TeacherSimulationsTab';

interface Props {
  initialTab?: TeacherTab;
  onNavigate: (view: string, params?: any) => void;
}

export type TeacherTab =
  | 'overview'
  | 'subjects'
  | 'my_classes'
  | 'create_class'
  | 'live_classes'
  | 'curriculum'
  | 'simulations'
  | 'materials'
  | 'notes'
  | 'videos'
  | 'quizzes'
  | 'assignments'
  | 'doubts'
  | 'progress'
  | 'profile'
  | 'settings';

interface DoubtItem {
  id: string;
  studentName: string;
  subjectName: string;
  chapterTitle: string;
  title: string;
  description: string;
  status: 'New' | 'Answered' | 'Resolved';
  teacherResponse?: string;
  createdAt: string;
}

export const TeacherDashboardView: React.FC<Props> = ({ initialTab, onNavigate }) => {
  const { user, firebaseUser, loading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TeacherTab>(initialTab || 'overview');
  const [curriculumSubjectId, setCurriculumSubjectId] = useState<string>('');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const lastTeacherSyncHashRef = useRef<string>('');
  const teacherSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Form states
  // 0. Create Class / Subject
  const [className, setClassName] = useState<string>('');
  const [classSection, setClassSection] = useState<string>('B21');
  const [classDesc, setClassDesc] = useState<string>('');
  const [classColor, setClassColor] = useState<string>('#2563EB');
  const [classIcon, setClassIcon] = useState<string>('BookOpen');
  const [isCreatingClass, setIsCreatingClass] = useState<boolean>(false);
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null);

  // Live Class Scheduling & Instant Start states
  const [liveSessionsList, setLiveSessionsList] = useState<any[]>([]);
  const [instantSubjectId, setInstantSubjectId] = useState<string>('');
  const [instantSessionTitle, setInstantSessionTitle] = useState<string>('');
  const [scheduleSubjectId, setScheduleSubjectId] = useState<string>('');
  const [scheduleTitle, setScheduleTitle] = useState<string>('');
  const [scheduleDate, setScheduleDate] = useState<string>('2026-10-10');
  const [scheduleStartTime, setScheduleStartTime] = useState<string>('10:00 AM');
  const [scheduleEndTime, setScheduleEndTime] = useState<string>('11:00 AM');
  const [scheduleDescription, setScheduleDescription] = useState<string>('');
  const [isStartingLive, setIsStartingLive] = useState<boolean>(false);
  const [isSchedulingLive, setIsSchedulingLive] = useState<boolean>(false);

  // 1. Create Chapter
  const [chapSubjectId, setChapSubjectId] = useState<string>('');
  const [chapTitle, setChapTitle] = useState<string>('');
  const [chapDesc, setChapDesc] = useState<string>('');
  const [chapOrder, setChapOrder] = useState<number>(1);

  // 2. Create Subtopic
  const [subChapterId, setSubChapterId] = useState<string>('');
  const [subTitle, setSubTitle] = useState<string>('');
  const [subDesc, setSubDesc] = useState<string>('');
  const [subObjectives, setSubObjectives] = useState<string>('');
  const [subTime, setSubTime] = useState<number>(20);

  // 3. Upload Notes
  const [noteSubjectId, setNoteSubjectId] = useState<string>('');
  const [noteChapterId, setNoteChapterId] = useState<string>('');
  const [noteSubtopicId, setNoteSubtopicId] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteDesc, setNoteDesc] = useState<string>('');
  const [noteFileName, setNoteFileName] = useState<string>('');
  const [notePagesText, setNotePagesText] = useState<string>('');

  // 4. Upload Video
  const [vidSubtopicId, setVidSubtopicId] = useState<string>('');
  const [vidTitle, setVidTitle] = useState<string>('');
  const [vidUrl, setVidUrl] = useState<string>('');
  const [vidDesc, setVidDesc] = useState<string>('');
  const [vidDuration, setVidDuration] = useState<number>(300);

  // 5. Create Quiz
  const [quizSubtopicId, setQuizSubtopicId] = useState<string>('');
  const [quizTitle, setQuizTitle] = useState<string>('');
  const [quizScore, setQuizScore] = useState<number>(70);
  const [questions, setQuestions] = useState<any[]>([
    {
      id: 'q_new_1',
      question: '',
      question_type: 'multiple_choice',
      options: ['', '', '', ''],
      correct_answer: '',
      explanation: '',
    },
  ]);

  // Mobile "More" module sheet
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);

  // Class Details & Code Regeneration state (Requirements #2 & #3)
  const [selectedClassDetails, setSelectedClassDetails] = useState<Subject | null>(null);
  const [confirmRegenerateClass, setConfirmRegenerateClass] = useState<Subject | null>(null);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState<boolean>(false);
  const [pendingDoubtsLiveCount, setPendingDoubtsLiveCount] = useState<number>(0);
  const [recentDoubts, setRecentDoubts] = useState<any[]>([]);

  useBodyScrollLock(Boolean(selectedClassDetails || confirmRegenerateClass || mobileMoreOpen));

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      const [dashRes, liveRes, doubtsRes] = await Promise.allSettled([
        api.getTeacherDashboard(),
        api.getLiveClasses(),
        api.getDoubts({ status: 'Pending' }),
      ]);

      if (dashRes.status === 'rejected') {
        throw dashRes.reason;
      }

      const data = dashRes.value;
      setDashboardData(data);
      setSelectedClassDetails((prev) =>
        prev ? data.subjects.find((s: Subject) => s.id === prev.id) || null : null
      );

      // Ensure all teacher-owned classes are permanently mirrored in Firestore /classes
      if (firebaseUser?.uid && Array.isArray(data.subjects)) {
        for (const subj of data.subjects) {
          if (subj?.id && subj?.class_code && (subj.teacher_id === firebaseUser.uid || !subj.teacher_id)) {
            void upsertFirestoreClass({
              id: subj.id,
              name: subj.name,
              code: subj.code,
              description: subj.description,
              teacherId: subj.teacher_id || firebaseUser.uid,
              teacherName: subj.teacher_name || user?.name || 'Teacher',
              section: subj.section || 'B21',
              classCode: subj.class_code,
              status: (subj.status as any) || 'active',
              iconName: subj.iconName,
              color: subj.color,
              thumbnail: subj.thumbnail,
            });
          }
        }
      }

      if (data.subjects.length > 0) {
        const subjectIds = new Set(data.subjects.map((s: Subject) => s.id));
        const defaultSubjectId = data.subjects[0].id;
        setChapSubjectId((prev) => (prev && subjectIds.has(prev) ? prev : defaultSubjectId));
        setNoteSubjectId((prev) => (prev && subjectIds.has(prev) ? prev : defaultSubjectId));
        setInstantSubjectId((prev) => (prev && subjectIds.has(prev) ? prev : defaultSubjectId));
        setScheduleSubjectId((prev) => (prev && subjectIds.has(prev) ? prev : defaultSubjectId));

        setNoteChapterId((prev) => {
          const chaps = data.chapters.filter((c: Chapter) => c.subject_id === defaultSubjectId);
          return prev && data.chapters.some((c: Chapter) => c.id === prev)
            ? prev
            : chaps[0]?.id || '';
        });
      } else {
        setChapSubjectId('');
        setNoteSubjectId('');
        setNoteChapterId('');
        setNoteSubtopicId('');
      }
      if (data.chapters.length > 0) {
        const chapterIds = new Set(data.chapters.map((c: Chapter) => c.id));
        setSubChapterId((prev) => (prev && chapterIds.has(prev) ? prev : data.chapters[0].id));
      } else {
        setSubChapterId('');
      }
      if (data.subtopics.length > 0) {
        const subtopicIds = new Set(data.subtopics.map((s: Subtopic) => s.id));
        setNoteSubtopicId((prev) => (prev && subtopicIds.has(prev) ? prev : data.subtopics[0].id));
        setVidSubtopicId((prev) => (prev && subtopicIds.has(prev) ? prev : data.subtopics[0].id));
        setQuizSubtopicId((prev) => (prev && subtopicIds.has(prev) ? prev : data.subtopics[0].id));
      } else {
        setNoteSubtopicId('');
        setVidSubtopicId('');
        setQuizSubtopicId('');
      }

      if (liveRes.status === 'fulfilled') {
        setLiveSessionsList(liveRes.value.liveClasses || []);
      }

      if (doubtsRes.status === 'fulfilled') {
        const list = doubtsRes.value.doubts || [];
        setPendingDoubtsLiveCount(list.length);
        setRecentDoubts(list.slice(0, 3));
      }
    } catch (err: any) {
      if (!options?.silent) {
        setError(err.message || 'Failed to load teacher dashboard.');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [firebaseUser?.uid, user?.name]);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadData();
  }, [authLoading, user?.id, loadData]);

  // Real-time Firestore sync for teacher classes and enrolled students
  useEffect(() => {
    if (authLoading || !firebaseUser?.uid) return;

    const unsubscribe = subscribeToTeacherEnrollmentsAndClasses(
      firebaseUser.uid,
      ({ enrollments, classes }) => {
        if (enrollments.length === 0 && classes.length === 0) return;

        const hash = JSON.stringify({
          e: enrollments.map((e) => `${e.studentId}:${e.classId}:${e.status}`).sort(),
          c: classes.map((c) => `${c.id}:${c.classCode}:${c.status}`).sort(),
        });

        if (hash === lastTeacherSyncHashRef.current) return;
        lastTeacherSyncHashRef.current = hash;

        if (teacherSyncTimerRef.current) {
          clearTimeout(teacherSyncTimerRef.current);
        }
        teacherSyncTimerRef.current = setTimeout(async () => {
          try {
            await api.syncEnrollmentsFromFirestore({ enrollments, classes });
            await loadData({ silent: true });
          } catch (syncErr) {
            console.warn('Teacher Firestore enrollment sync notice:', syncErr);
          }
        }, 250);
      },
      (errMsg) => {
        console.warn('Teacher Firestore enrollment listener notice:', errMsg);
      }
    );

    return () => {
      unsubscribe();
      if (teacherSyncTimerRef.current) {
        clearTimeout(teacherSyncTimerRef.current);
        teacherSyncTimerRef.current = null;
      }
    };
  }, [authLoading, firebaseUser?.uid, loadData]);

  const handleCopyClassCode = (classId: string, code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedClassId(classId);
    setTimeout(() => {
      setCopiedClassId(null);
    }, 2500);
  };

  const handleRegenerateCode = async (subject: Subject) => {
    try {
      setIsRegeneratingCode(true);
      const res = await api.regenerateClassCode(subject.id);
      if (firebaseUser?.uid && res.subject) {
        await upsertFirestoreClass({
          id: res.subject.id,
          name: res.subject.name,
          code: res.subject.code,
          description: res.subject.description,
          teacherId: res.subject.teacher_id || firebaseUser.uid,
          teacherName: res.subject.teacher_name || user?.name || 'Teacher',
          section: res.subject.section || 'B21',
          classCode: res.class_code,
          status: (res.subject.status as any) || 'active',
          iconName: res.subject.iconName,
          color: res.subject.color,
          thumbnail: res.subject.thumbnail,
        });
      }
      setSuccessMessage(`Class code for "${subject.name}" has been regenerated: ${res.class_code}`);
      setConfirmRegenerateClass(null);
      if (selectedClassDetails?.id === subject.id) {
        setSelectedClassDetails(res.subject);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate class code.');
    } finally {
      setIsRegeneratingCode(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    setError(null);
    setSuccessMessage(null);
    setIsCreatingClass(true);

    try {
      const res = await api.createSubject({
        name: className.trim(),
        section: classSection.trim() || 'B21',
        description: classDesc.trim() || `Course curriculum for ${className.trim()}`,
        color: classColor,
        iconName: classIcon,
      });

      if (firebaseUser?.uid && res.subject) {
        await upsertFirestoreClass({
          id: res.subject.id,
          name: res.subject.name,
          code: res.subject.code,
          description: res.subject.description,
          teacherId: res.subject.teacher_id || firebaseUser.uid,
          teacherName: res.subject.teacher_name || user?.name || 'Teacher',
          section: res.subject.section || 'B21',
          classCode: res.classCode,
          status: 'active',
          iconName: res.subject.iconName,
          color: res.subject.color,
          thumbnail: res.subject.thumbnail,
        });
      }

      setNewlyGeneratedCode(res.classCode);
      setSuccessMessage(`Class "${res.subject.name}" created with code: ${res.classCode}`);
      setClassName('');
      setClassDesc('');
      setClassSection('B21');
      await loadData();
      setActiveTab('my_classes');
    } catch (err: any) {
      setError(err.message || 'Failed to create class.');
    } finally {
      setIsCreatingClass(false);
    }
  };

  const handleStartLive = async (subjectId: string, subjectName: string, customTitle?: string) => {
    setError(null);
    setIsStartingLive(true);
    try {
      const title = customTitle || `${subjectName} Live Lecture`;
      const subj = subjects.find((s: Subject) => s.id === subjectId);
      onNavigate('live_classroom', {
        classId: subjectId,
        sessionTitle: title,
        sessionId: subj?.live_session?.is_active ? subj.live_session.id : undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Unable to start the live class.');
    } finally {
      setIsStartingLive(false);
    }
  };

  const handleScheduleLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleSubjectId || !scheduleTitle.trim() || !scheduleDate || !scheduleStartTime) {
      setError('Please provide subject, title, date, and start time for the live class.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSchedulingLive(true);

    try {
      await api.scheduleLiveClass({
        class_id: scheduleSubjectId,
        title: scheduleTitle.trim(),
        scheduled_date: scheduleDate,
        start_time: scheduleStartTime,
        end_time: scheduleEndTime,
        description: scheduleDescription.trim(),
      });

      setSuccessMessage(
        `Live lecture "${scheduleTitle.trim()}" scheduled for ${scheduleDate} at ${scheduleStartTime}.`
      );
      setScheduleTitle('');
      setScheduleDescription('');
      await loadData();
      setActiveTab('live_classes');
    } catch (err: any) {
      setError(err.message || 'Failed to schedule live class.');
    } finally {
      setIsSchedulingLive(false);
    }
  };

  const handleEndLive = async (subjectId: string) => {
    try {
      await api.endLiveClass(subjectId);
      setSuccessMessage('Live lecture session ended.');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to end live class.');
    }
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    try {
      await api.createChapter({
        subject_id: chapSubjectId,
        title: chapTitle,
        description: chapDesc,
        order: chapOrder,
      });
      setSuccessMessage(`Chapter "${chapTitle}" created.`);
      setChapTitle('');
      setChapDesc('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create chapter.');
    }
  };

  const handleCreateSubtopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    try {
      const objectives = subObjectives
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await api.createSubtopic({
        chapter_id: subChapterId,
        title: subTitle,
        description: subDesc,
        learning_objectives: objectives.length > 0 ? objectives : [subDesc],
        estimated_minutes: subTime,
      });

      setSuccessMessage(`Subtopic "${subTitle}" published to chapter.`);
      setSubTitle('');
      setSubDesc('');
      setSubObjectives('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create subtopic.');
    }
  };

  const handleUploadNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    try {
      const paragraphs = notePagesText
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean);

      const pages_content = [
        {
          pageNumber: 1,
          title: `${noteTitle} - Overview & Key Principles`,
          content: paragraphs.length > 0 ? paragraphs : [noteDesc || 'Core lecture materials.'],
          diagramLabel: `${noteTitle} Schematic Reference`,
        },
      ];

      await api.uploadNotes({
        subject_id: noteSubjectId,
        chapter_id: noteChapterId,
        subtopic_id: noteSubtopicId,
        title: noteTitle,
        description: noteDesc,
        file_name: noteFileName || `${noteTitle.replace(/\s+/g, '_')}_Lecture_Notes.pdf`,
        pages_content,
      });

      setSuccessMessage(`Verified PDF study note "${noteTitle}" uploaded.`);
      setNoteTitle('');
      setNoteDesc('');
      setNoteFileName('');
      setNotePagesText('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to upload notes.');
    }
  };

  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!vidUrl.trim()) {
      setError('Please enter a valid video URL.');
      return;
    }
    try {
      await api.updateLearningContent({
        subtopic_id: vidSubtopicId,
        video: {
          title: vidTitle,
          video_url: vidUrl.trim(),
          video_type: 'embedded',
          duration_seconds: vidDuration,
          description: vidDesc,
        },
      });

      setSuccessMessage(`Video "${vidTitle}" linked.`);
      setVidTitle('');
      setVidUrl('');
      setVidDesc('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save video.');
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    try {
      await api.createQuiz({
        subtopic_id: quizSubtopicId,
        title: quizTitle,
        description: `Assessment quiz for ${quizTitle}`,
        passing_score: quizScore,
        questions,
      });

      setSuccessMessage(`Quiz "${quizTitle}" registered.`);
      setQuizTitle('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create quiz.');
    }
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

  const { subjects = [], chapters = [], subtopics = [] } = dashboardData || {};

  // Real enrolled students count across teacher's classes (never fake defaults)
  const totalStudents = subjects.reduce((acc: number, s: Subject) => acc + (s.totalStudents || 0), 0);
  const activeLiveSessions = subjects.filter((s: Subject) => s.live_session?.is_active);
  const pendingDoubtsCount = pendingDoubtsLiveCount;

  return (
    <div className="w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-mobile-dock lg:pb-10">
      {/* Success Notification */}
      {successMessage && (
        <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2 text-xs font-medium shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="break-words">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-bold shrink-0 p-1">
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between gap-2 text-xs font-medium shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900 font-bold shrink-0 p-1">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8">
        {/* ==================================================
            DESKTOP LEFT SIDEBAR (Section 9)
        ================================================== */}
        <aside className="hidden lg:block lg:col-span-3 space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            {/* Teacher Mini Profile */}
            <div className="flex items-center gap-3 p-2 mb-4 border-b border-slate-100 pb-4">
              <div className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 font-bold flex items-center justify-center overflow-hidden shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{user?.name?.[0]?.toUpperCase() || 'T'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                <span className="inline-block mt-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Instructor Portal
                </span>
              </div>
            </div>

            {/* Sidebar Navigation Links (Section 9) */}
            <nav className="space-y-1 text-sm font-medium text-slate-600">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'overview'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Home className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('subjects')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'subjects'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FolderTree className="w-4 h-4 text-slate-400" />
                  <span>Subjects</span>
                </div>
                <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium">
                  {subjects.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('my_classes')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'my_classes'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-4 h-4 text-slate-400" />
                  <span>My Classes</span>
                </div>
                <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium">
                  {subjects.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('live_classes')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'live_classes'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Radio className="w-4 h-4 text-slate-400" />
                  <span>Live Classes</span>
                </div>
                {activeLiveSessions.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('curriculum')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'curriculum'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4 text-slate-400" />
                <span>Curriculum</span>
              </button>

              <button
                onClick={() => setActiveTab('simulations')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'simulations'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Activity className="w-4 h-4 text-slate-400" />
                <span>Interactive Simulations</span>
              </button>

              <button
                onClick={() => setActiveTab('materials')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'materials' || activeTab === 'notes' || activeTab === 'videos'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4 text-slate-400" />
                <span>Materials</span>
              </button>

              <button
                onClick={() => setActiveTab('quizzes')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'quizzes'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Award className="w-4 h-4 text-slate-400" />
                <span>Quizzes</span>
              </button>

              <button
                onClick={() => setActiveTab('assignments')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'assignments'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-4 h-4 text-slate-400" />
                <span>Assignments</span>
              </button>

              <button
                onClick={() => setActiveTab('doubts')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'doubts'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  <span>Doubts</span>
                </div>
                {pendingDoubtsCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold">
                    {pendingDoubtsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('progress')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'progress'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <span>Progress</span>
              </button>

              <button
                onClick={() => onNavigate('edit_profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
              >
                <User className="w-4 h-4 text-slate-400" />
                <span>Profile</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  activeTab === 'settings'
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </button>

              <button
                onClick={() => {
                  logout();
                  onNavigate('landing');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span>Logout</span>
              </button>
            </nav>

            {/* Quick Action: Create New Class */}
            <div className="pt-4 mt-4 border-t border-slate-100">
              <button
                onClick={() => setActiveTab('create_class')}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Class</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ==================================================
            MAIN CONTENT AREA (Section 8: Welcome, Stats, Upcoming, Classes, Recent Activity)
        ================================================== */}
        <main className="lg:col-span-9 space-y-6 min-w-0">
          {/* Tablet Quick Section Switcher (phones use native bottom dock + More sheet) */}
          <div className="hidden sm:flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {(
              [
                { key: 'overview', label: 'Dashboard' },
                { key: 'subjects', label: 'Subjects' },
                { key: 'live_classes', label: 'Live Classes' },
                { key: 'curriculum', label: 'Curriculum' },
                { key: 'simulations', label: 'Simulations' },
                { key: 'materials', label: 'Materials' },
                { key: 'quizzes', label: 'Quizzes' },
                { key: 'assignments', label: 'Assignments' },
                { key: 'doubts', label: 'Doubts' },
                { key: 'progress', label: 'Progress' },
                { key: 'settings', label: 'Settings' },
              ] as { key: TeacherTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors shrink-0 ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile Contextual Tool Header (when inside a sub-section on smartphones) */}
          {activeTab !== 'overview' && (
            <div className="sm:hidden flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 min-h-[40px] pr-2 cursor-pointer"
              >
                <Home className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Home</span>
              </button>
              <span className="text-[13px] font-semibold text-slate-900 truncate capitalize">
                {activeTab.replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200/70 rounded-xl px-2.5 min-h-[36px] shrink-0 cursor-pointer active:scale-95 transition-transform"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Tools</span>
              </button>
            </div>
          )}

          {/* TAB: SUBJECT MANAGEMENT */}
          {activeTab === 'subjects' && (
            <TeacherSubjectsTab
              subjects={subjects}
              onRefresh={loadData}
              onNavigate={onNavigate}
              onOpenCurriculum={(id) => {
                setCurriculumSubjectId(id);
                setActiveTab('curriculum');
              }}
            />
          )}

          {/* TAB 1: OVERVIEW / DASHBOARD (Section 8) */}
          {(activeTab === 'overview' || activeTab === 'my_classes') && (
            <div className="space-y-6">
              {/* Section 8: Welcome section */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 min-w-0">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      {getGreeting()},
                    </div>
                    <h1 className="type-page-title text-slate-900 break-words">
                      {user?.name || 'Faculty Member'}
                    </h1>
                    <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed">
                      Empowering students with structured visual curriculum and real-time guidance.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto sm:shrink-0">
                  <button
                    onClick={() => setActiveTab('create_class')}
                    className="flex-1 sm:flex-none justify-center py-2.5 px-3.5 sm:px-4 min-h-[42px] type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Create Class</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('live_classes')}
                    className="flex-1 sm:flex-none justify-center py-2.5 px-3.5 min-h-[42px] type-btn bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-2xs flex items-center gap-1.5"
                  >
                    <Radio className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>Live Classes</span>
                  </button>
                </div>
              </div>

              {/* Section 8: Quick Statistics (My Classes, Students, Live Classes, Pending Doubts) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
                <button
                  onClick={() => setActiveTab('subjects')}
                  className="p-3 sm:p-4 bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl shadow-xs flex items-center gap-2.5 sm:gap-3.5 text-left transition-all cursor-pointer min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">My Classes</div>
                    <div className="type-metric text-slate-900">{subjects.length}</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('progress')}
                  className="p-3 sm:p-4 bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl shadow-xs flex items-center gap-2.5 sm:gap-3.5 text-left transition-all cursor-pointer min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Students</div>
                    <div className="type-metric text-slate-900">{totalStudents}</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('live_classes')}
                  className="p-3 sm:p-4 bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl shadow-xs flex items-center gap-2.5 sm:gap-3.5 text-left transition-all cursor-pointer min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Active Live</div>
                    <div className="type-metric text-slate-900">{activeLiveSessions.length}</div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('doubts')}
                  className="p-3 sm:p-4 bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl shadow-xs flex items-center gap-2.5 sm:gap-3.5 text-left transition-all cursor-pointer min-w-0"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Pending Doubts</div>
                    <div className="type-metric text-slate-900">{pendingDoubtsCount}</div>
                  </div>
                </button>
              </div>

              {/* Section 8: Upcoming Live Classes */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <h2 className="type-card-title text-slate-900">Upcoming Live Classes</h2>
                  </div>
                  <button
                    onClick={() => setActiveTab('live_classes')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Schedule Live
                  </button>
                </div>

                {liveSessionsList.length > 0 ? (
                  <div className="space-y-3">
                    {liveSessionsList.map((s) => (
                      <div
                        key={s.id}
                        className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-semibold shrink-0">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-slate-900 break-words">{s.title || s.subject_name || s.subjectName}</div>
                            <div className="text-slate-500 mt-0.5 break-words">
                              {s.subject_name || s.subjectName || 'Live Class'} · {s.scheduled_date || 'Today'} at {s.start_time || '10:00 AM'}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleStartLive(
                              s.class_id || s.subject_id || s.id,
                              s.subject_name || s.subjectName || 'Live Class',
                              s.title
                            )
                          }
                          className="w-full sm:w-auto justify-center py-2 px-3.5 min-h-[40px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Radio className="w-3.5 h-3.5 shrink-0" />
                          <span>Launch Session</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No scheduled upcoming sessions. Click &quot;Schedule Live&quot; to plan one.
                  </div>
                )}
              </div>

              {/* Section 8: My Classes List */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="min-w-0">
                    <h2 className="type-card-title text-slate-900">My Classes</h2>
                    <p className="text-xs text-slate-500">Managed curriculum and active sections</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('create_class')}
                    className="py-1.5 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Class</span>
                  </button>
                </div>

                {subjects.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                    <p>No classes created yet.</p>
                    <button
                      onClick={() => setActiveTab('create_class')}
                      className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg font-semibold"
                    >
                      Create First Class
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subjects.map((subj: Subject) => {
                      const isLive = subj.live_session?.is_active;
                      return (
                        <div
                          key={subj.id}
                          className="p-3.5 sm:p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-blue-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 min-w-0"
                        >
                          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white border border-slate-200 text-blue-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 break-words min-w-0">{subj.name}</h3>
                                {isLive && (
                                  <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                                    LIVE NOW
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1 flex-wrap">
                                  <span>Class Code:</span>
                                  <code className="font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 font-bold tracking-wider break-all">
                                    {subj.class_code || subj.code || subj.section || '—'}
                                  </code>
                                </span>
                                <span>{subj.totalStudents ?? 0} Students</span>
                                <span>{subj.totalChapters ?? 0} Chapters</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto sm:shrink-0">
                            <button
                              onClick={() => handleCopyClassCode(subj.id, subj.class_code || subj.code || subj.section || '')}
                              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium cursor-pointer shadow-2xs"
                              title="Copy Class Code"
                            >
                              {copiedClassId === subj.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => setConfirmRegenerateClass(subj)}
                              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-600 hover:text-blue-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium cursor-pointer shadow-2xs"
                              title="Regenerate Class Code"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setSelectedClassDetails(subj)}
                              className="py-1.5 px-2.5 sm:px-3 min-h-[36px] text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              title="View Class Details & Code"
                            >
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span>Details</span>
                            </button>

                            {isLive ? (
                              <button
                                onClick={() => handleEndLive(subj.id)}
                                className="py-1.5 px-2.5 sm:px-3 min-h-[36px] text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
                              >
                                <PhoneOff className="w-3.5 h-3.5 shrink-0" />
                                <span>End Class</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartLive(subj.id, subj.name)}
                                className="py-1.5 px-2.5 sm:px-3 min-h-[36px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                              >
                                <Radio className="w-3.5 h-3.5 shrink-0" />
                                <span>Go Live</span>
                              </button>
                            )}

                            <button
                              onClick={() => onNavigate('subject_detail', { id: subj.id })}
                              className="py-1.5 px-2.5 sm:px-3 min-h-[36px] text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <span>View Class</span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 8: Recent Activity */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-3 min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Recent Class Activity</h3>
                {recentDoubts.length === 0 && subjects.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No activity yet. Create a class or share your class code with students.
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {subjects.slice(0, 3).map((s: any) => (
                      <div key={s.id} className="p-3 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate">Class: {s.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">Class code: {s.class_code}</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium shrink-0">Active</span>
                      </div>
                    ))}
                    {recentDoubts.slice(0, 2).map((d) => (
                      <div key={d.id} className="p-3 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold shrink-0">
                            <HelpCircle className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate">Doubt: {d.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">{d.student_name || 'Student'} • {d.subject_name || 'Class'}</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-amber-700 font-semibold shrink-0">{d.status || 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CREATE CLASS (Form) */}
          {activeTab === 'create_class' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 shadow-xs space-y-5 sm:space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">Create New Class</h2>
                <p className="text-xs text-slate-500">
                  Add a new subject to generate a private class code for student enrollment.
                </p>
              </div>

              <form onSubmit={handleCreateClass} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class / Subject Name</label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Advanced Organic Chemistry"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class Section Code</label>
                  <input
                    type="text"
                    value={classSection}
                    onChange={(e) => setClassSection(e.target.value)}
                    placeholder="e.g. B21 or CHEM101"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={classDesc}
                    onChange={(e) => setClassDesc(e.target.value)}
                    placeholder="Brief description of the course goals and requirements..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <button
                    type="submit"
                    disabled={isCreatingClass}
                    className="py-2.5 px-5 min-h-[42px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingClass ? 'Creating Class...' : 'Create Class & Generate Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="py-2.5 px-4 min-h-[42px] text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: LIVE CLASSES MANAGEMENT */}
          {activeTab === 'live_classes' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 shadow-xs space-y-5 sm:space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">Live Classroom Management</h2>
                <p className="text-xs text-slate-500">
                  Launch an instant lecture room or schedule an upcoming meeting session.
                </p>
              </div>

              {subjects.length === 0 ? (
                <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">Create a class before going live</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Live lectures belong to one of your classes so only enrolled students can join. Create your first class to start teaching live.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create_class')}
                    className="py-2.5 px-4 min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Class</span>
                  </button>
                </div>
              ) : (
                <>
              {/* Instant Start Card */}
              <div className="p-4 sm:p-5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                  <Radio className="w-4 h-4 shrink-0" />
                  <span>Start Instant Live Lecture</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  <select
                    value={instantSubjectId}
                    onChange={(e) => setInstantSubjectId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    {subjects.map((s: Subject) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.section})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={instantSessionTitle}
                    onChange={(e) => setInstantSessionTitle(e.target.value)}
                    placeholder="Lecture Topic / Title"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const sel = subjects.find((s: Subject) => s.id === instantSubjectId) || subjects[0];
                      if (sel) handleStartLive(sel.id, sel.name, instantSessionTitle);
                    }}
                    className="w-full min-h-[42px] py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5 shrink-0" />
                    <span>Launch Now</span>
                  </button>
                </div>
              </div>

              {/* Schedule Lecture Form */}
              <form onSubmit={handleScheduleLiveClass} className="space-y-4 pt-2">
                <h3 className="text-sm font-bold text-slate-900">Schedule Upcoming Live Class</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target Class</label>
                    <select
                      value={scheduleSubjectId}
                      onChange={(e) => setScheduleSubjectId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      {subjects.map((s: Subject) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.section})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Lecture Title</label>
                    <input
                      type="text"
                      value={scheduleTitle}
                      onChange={(e) => setScheduleTitle(e.target.value)}
                      placeholder="e.g. Midterm Revision & Doubt Solving"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Scheduled Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                      <input
                        type="text"
                        value={scheduleStartTime}
                        onChange={(e) => setScheduleStartTime(e.target.value)}
                        placeholder="10:00 AM"
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                      <input
                        type="text"
                        value={scheduleEndTime}
                        onChange={(e) => setScheduleEndTime(e.target.value)}
                        placeholder="11:00 AM"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSchedulingLive}
                  className="py-2.5 px-6 min-h-[42px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSchedulingLive ? 'Scheduling...' : 'Save & Announce Schedule'}
                </button>
              </form>
                </>
              )}
            </div>
          )}

          {/* TAB: CURRICULUM HIERARCHY TREE (Requirement #4, #5, #6, #7 & #8) */}
          {activeTab === 'curriculum' && (
            <TeacherCurriculumTab
              subjects={subjects}
              initialSubjectId={curriculumSubjectId || subjects[0]?.id}
              onNavigate={onNavigate}
            />
          )}

          {/* TAB: INTERACTIVE SIMULATIONS */}
          {activeTab === 'simulations' && (
            <TeacherSimulationsTab subjects={subjects} />
          )}

          {/* TAB: MATERIALS MANAGEMENT (Requirement #9, #10 & #11) */}
          {(activeTab === 'materials' || activeTab === 'notes' || activeTab === 'videos') && (
            <TeacherMaterialsTab subjects={subjects} onNavigate={onNavigate} />
          )}

          {/* TAB: QUIZZES MANAGEMENT (Requirement #12 & #13) */}
          {activeTab === 'quizzes' && (
            <TeacherQuizzesTab subjects={subjects} onNavigate={onNavigate} />
          )}

          {/* TAB: ASSIGNMENTS MANAGEMENT (Requirement #14 & #15) */}
          {activeTab === 'assignments' && (
            <TeacherAssignmentsTab subjects={subjects} onNavigate={onNavigate} />
          )}

          {/* TAB: PROGRESS TRACKING (Requirement #17, #18 & #19) */}
          {activeTab === 'progress' && (
            <TeacherProgressTab subjects={subjects} />
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <TeacherSettingsTab />
          )}

          {/* TAB 8: DOUBTS MANAGEMENT (Requirement #1) */}
          {activeTab === 'doubts' && (
            <TeacherDoubtsTab subjects={subjects} onRefresh={loadData} />
          )}
        </main>
      </div>

      {/* VIEW CLASS DETAILS MODAL (Requirement #3) */}
      <ResponsiveModal
        isOpen={Boolean(selectedClassDetails)}
        onClose={() => setSelectedClassDetails(null)}
        ariaLabel={selectedClassDetails ? `${selectedClassDetails.name} Class Details` : 'Class Details'}
        maxWidthClass="max-w-[540px]"
        header={
          selectedClassDetails ? (
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shrink-0"
                    style={{ backgroundColor: selectedClassDetails.color || '#2563EB' }}
                  >
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 truncate">{selectedClassDetails.name}</h3>
                    <span className="text-xs text-slate-500 font-mono">
                      Subject Code: {selectedClassDetails.code || 'CSE101'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedClassDetails(null)}
                  className="text-slate-400 hover:text-slate-700 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : null
        }
        footer={
          selectedClassDetails ? (
            <div className="px-4 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = selectedClassDetails.id;
                  setSelectedClassDetails(null);
                  setCurriculumSubjectId(id);
                  setActiveTab('curriculum');
                }}
                className="flex-1 sm:flex-none justify-center min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <FolderTree className="w-3.5 h-3.5 shrink-0" />
                <span>Open Curriculum</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedClassDetails(null)}
                className="min-h-[44px] py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : null
        }
        bodyClassName="px-4 sm:px-6 py-4 space-y-4 text-xs"
      >
        {selectedClassDetails && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Class Name</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block break-words">{selectedClassDetails.name}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Subject</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block break-words">{selectedClassDetails.name}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Teacher</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block break-words">{user?.name || 'Course Instructor'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Section / Batch</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{selectedClassDetails.section || 'General'}</span>
              </div>
            </div>

            {/* Class Code Highlight Box (Requirement #3) */}
            <div className="p-3.5 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <span className="text-[10px] text-blue-700 uppercase font-bold tracking-wider block">Unique Class Code</span>
                  <span className="text-base font-mono font-bold text-blue-950 tracking-wider break-all">
                    {selectedClassDetails.class_code || selectedClassDetails.code || selectedClassDetails.section || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyClassCode(selectedClassDetails.id, selectedClassDetails.class_code || selectedClassDetails.code || selectedClassDetails.section || '')}
                    className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                  >
                    {copiedClassId === selectedClassDetails.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegenerateClass(selectedClassDetails)}
                    className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>Regenerate Code</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-blue-700/80 leading-normal">
                Students enter this code in their portal under &quot;Join Class&quot; to access all learning materials, notes, and curriculum.
              </p>
            </div>

            {selectedClassDetails.description && (
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Course Description:</span>
                <p className="text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed">
                  {selectedClassDetails.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600 tabular-nums">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{selectedClassDetails.totalStudents || 0} Students Enrolled</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{selectedClassDetails.totalChapters || 0} Chapters Created</span>
              </div>
            </div>
          </>
        )}
      </ResponsiveModal>

      {/* REGENERATE CODE CONFIRMATION MODAL (Requirement #3) */}
      <ResponsiveModal
        isOpen={Boolean(confirmRegenerateClass)}
        onClose={() => !isRegeneratingCode && setConfirmRegenerateClass(null)}
        disableClose={isRegeneratingCode}
        ariaLabel="Regenerate Class Code"
        maxWidthClass="max-w-[460px]"
        zIndexClass="z-[130]"
        footer={
          confirmRegenerateClass ? (
            <div className="px-5 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmRegenerateClass(null)}
                disabled={isRegeneratingCode}
                className="min-h-[44px] py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRegenerateCode(confirmRegenerateClass)}
                disabled={isRegeneratingCode}
                className="min-h-[44px] py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isRegeneratingCode ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Generate New Code</span>
                  </>
                )}
              </button>
            </div>
          ) : null
        }
        bodyClassName="p-5 sm:p-6"
      >
        {confirmRegenerateClass && (
          <>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 mb-1 break-words">
              Regenerate Class Code for &quot;{confirmRegenerateClass.name}&quot;?
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              When a new class code is generated:
            </p>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>The old code (<strong>{confirmRegenerateClass.class_code || confirmRegenerateClass.section}</strong>) will immediately become invalid for new student signups.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>A new unique code will be automatically assigned.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span><strong>Existing enrolled students remain enrolled</strong> — no class or student data will be lost.</span>
              </div>
            </div>
          </>
        )}
      </ResponsiveModal>

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 w-full max-w-full overflow-hidden mobile-bottom-dock border-t border-slate-200/90 px-1 px-safe pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] grid grid-cols-5 items-center text-[10px] tracking-tight font-medium text-slate-600"
        aria-label="Mobile teacher navigation"
      >
        {(
          [
            { key: 'overview', label: 'Home', icon: Home },
            { key: 'subjects', label: 'Subjects', icon: FolderTree },
            { key: 'curriculum', label: 'Curriculum', icon: BookOpen },
            { key: 'live_classes', label: 'Live', icon: Radio, hasLive: activeLiveSessions.length > 0 },
          ] as { key: TeacherTab; label: string; icon: any; hasLive?: boolean }[]
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key && !mobileMoreOpen;
          return (
            <button
              key={item.key}
              onClick={() => {
                setActiveTab(item.key);
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
            mobileMoreOpen || !['overview', 'subjects', 'curriculum', 'live_classes'].includes(activeTab)
              ? 'text-blue-600 font-semibold bg-blue-50/70'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {(mobileMoreOpen || !['overview', 'subjects', 'curriculum', 'live_classes'].includes(activeTab)) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-600" />
          )}
          <span className="relative">
            <LayoutGrid className="w-[18px] h-[18px] shrink-0" />
            {pendingDoubtsCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                {pendingDoubtsCount > 9 ? '9+' : pendingDoubtsCount}
              </span>
            )}
          </span>
          <span className="truncate max-w-full leading-none">Tools</span>
        </button>
      </nav>

      {/* MOBILE "MORE" INSTRUCTOR TOOLS SHEET */}
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
                  <span className="type-card-title text-slate-900 block">Instructor Tools</span>
                  <span className="text-[11px] text-slate-500">Manage coursework, assessments, and student doubts</span>
                </div>
                <button
                  onClick={() => setMobileMoreOpen(false)}
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                  aria-label="Close tools menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {(
                [
                  { key: 'my_classes', label: 'My Classes', icon: GraduationCap },
                  { key: 'simulations', label: 'Simulations', icon: Activity },
                  { key: 'materials', label: 'Materials', icon: FileText },
                  { key: 'quizzes', label: 'Quizzes', icon: Award },
                  { key: 'assignments', label: 'Assignments', icon: ClipboardList },
                  { key: 'doubts', label: pendingDoubtsCount > 0 ? `Doubts (${pendingDoubtsCount})` : 'Doubts', icon: HelpCircle },
                  { key: 'progress', label: 'Progress', icon: TrendingUp },
                  { key: 'settings', label: 'Settings', icon: Settings },
                ] as { key: TeacherTab; label: string; icon: any }[]
              ).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTab(item.key);
                      setMobileMoreOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`p-3.5 min-h-[68px] rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 text-xs font-semibold min-w-0 active:scale-[0.98] transition-all cursor-pointer ${
                      activeTab === item.key
                        ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-2xs'
                        : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="truncate w-full">{item.label}</span>
                  </button>
                );
              })}
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
                  setActiveTab('create_class');
                  setMobileMoreOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white type-btn rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Class</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
