import React, { useState, useEffect, useRef } from 'react';
import {
  Award,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  FolderTree,
  Calendar,
  Share2,
  Repeat,
} from 'lucide-react';
import { Subject } from '../../types';
import { api } from '../../services/api';
import {
  QUIZ_DURATION_PRESETS,
  combineDateAndTime,
  splitIsoToDateTime,
  formatDateTime,
  useServerNow,
} from '../../utils/scheduleUtils';
import {
  syncQuizScheduleToFirestore,
  deleteQuizScheduleFromFirestore,
} from '../../services/scheduleFirestoreService';

interface Props {
  subjects: Subject[];
  onNavigate: (view: string, params?: any) => void;
}

const createEmptyQuestion = (idx = 1) => ({
  id: `q_${Date.now()}_${idx}`,
  question: '',
  question_type: 'multiple_choice' as const,
  options: ['', '', '', ''],
  correct_answer: '',
  explanation: '',
});

export const TeacherQuizzesTab: React.FC<Props> = ({ subjects }) => {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const serverNow = useServerNow(serverTime);

  // Create / Edit Quiz Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<any | null>(null);
  const [formSubjectId, setFormSubjectId] = useState(subjects[0]?.id || '');
  const [formChapterId, setFormChapterId] = useState('');
  const [formTopicId, setFormTopicId] = useState('');
  const [formSubtopicId, setFormSubtopicId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMarks, setFormMarks] = useState(100);
  const [formPassingMarks, setFormPassingMarks] = useState(60);
  const [formTimeLimit, setFormTimeLimit] = useState(30);
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('');
  const [formMaxAttempts, setFormMaxAttempts] = useState(1);
  const [formAllowLate, setFormAllowLate] = useState(false);
  const [formStatus, setFormStatus] = useState<'published' | 'draft'>('published');
  const [questions, setQuestions] = useState<any[]>([createEmptyQuestion(1)]);
  const [submitting, setSubmitting] = useState(false);

  // Curriculum for modal
  const [curriculumForModal, setCurriculumForModal] = useState<any>(null);
  const pendingEditHierarchyRef = useRef<{ chapterId?: string; topicId?: string; subtopicId?: string } | null>(null);

  // Submissions Modal
  const [viewingSubmissionsQuiz, setViewingSubmissionsQuiz] = useState<any | null>(null);
  const [submissionsList, setSubmissionsList] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Assign to Class Modal
  const [assigningQuiz, setAssigningQuiz] = useState<any | null>(null);
  const [targetClassId, setTargetClassId] = useState(subjects[0]?.id || '');

  // Delete State
  const [deletingQuiz, setDeletingQuiz] = useState<any | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  const quizzesReqRef = useRef(0);

  const fetchQuizzes = async (subjectFilter = selectedSubjectFilter) => {
    const reqId = ++quizzesReqRef.current;
    try {
      setLoading(true);
      const res = await api.getQuizzes(
        subjectFilter !== 'all' ? { subject_id: subjectFilter } : undefined
      );
      if (reqId !== quizzesReqRef.current) return;
      setQuizzes(res.quizzes || []);
      if (res.serverTime) setServerTime(res.serverTime);
    } catch (err: any) {
      if (reqId !== quizzesReqRef.current) return;
      setQuizzes([]);
      showNotification('error', err.message || 'Failed to fetch quizzes.');
    } finally {
      if (reqId === quizzesReqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setQuizzes([]);
    fetchQuizzes(selectedSubjectFilter);
  }, [selectedSubjectFilter]);

  useEffect(() => {
    if (editingQuiz) return;
    if (selectedSubjectFilter !== 'all' && subjects.some((s) => s.id === selectedSubjectFilter)) {
      setFormSubjectId(selectedSubjectFilter);
    } else if ((!formSubjectId || !subjects.some((s) => s.id === formSubjectId)) && subjects.length > 0) {
      setFormSubjectId(subjects[0].id);
    }
  }, [selectedSubjectFilter, subjects, editingQuiz]);

  // Load curriculum for selected subject in modal
  useEffect(() => {
    let cancelled = false;
    setCurriculumForModal(null);

    if (!formSubjectId) {
      setFormChapterId('');
      setFormTopicId('');
      setFormSubtopicId('');
      return;
    }

    api
      .getCurriculum(formSubjectId)
      .then((data) => {
        if (cancelled) return;
        setCurriculumForModal(data);
        if (pendingEditHierarchyRef.current) {
          const pending = pendingEditHierarchyRef.current;
          pendingEditHierarchyRef.current = null;
          setFormChapterId(pending.chapterId || '');
          setFormTopicId(pending.topicId || '');
          setFormSubtopicId(pending.subtopicId || '');
        } else if (!editingQuiz) {
          setFormChapterId('');
          setFormTopicId('');
          setFormSubtopicId('');
        }
      })
      .catch(() => {
        if (!cancelled) setCurriculumForModal(null);
      });

    return () => {
      cancelled = true;
    };
  }, [formSubjectId]);

  const openCreateModal = () => {
    setEditingQuiz(null);
    pendingEditHierarchyRef.current = null;
    const defaultSubject =
      selectedSubjectFilter !== 'all' && subjects.some((s) => s.id === selectedSubjectFilter)
        ? selectedSubjectFilter
        : subjects[0]?.id || '';
    setFormSubjectId(defaultSubject);
    setFormChapterId('');
    setFormTopicId('');
    setFormSubtopicId('');
    setFormTitle('');
    setFormDesc('');
    setFormMarks(100);
    setFormPassingMarks(60);
    setFormTimeLimit(30);
    setFormStartDate('');
    setFormStartTime('');
    setFormDueDate('');
    setFormDueTime('');
    setFormMaxAttempts(1);
    setFormAllowLate(false);
    setFormStatus('published');
    setQuestions([createEmptyQuestion(1)]);
    setIsModalOpen(true);
  };

  const openEditModal = (quiz: any) => {
    setEditingQuiz(quiz);
    pendingEditHierarchyRef.current = {
      chapterId: quiz.chapter_id || '',
      topicId: quiz.topic_id || '',
      subtopicId: quiz.subtopic_id || '',
    };
    setFormSubjectId(quiz.subject_id || subjects[0]?.id || '');
    setFormChapterId(quiz.chapter_id || '');
    setFormTopicId(quiz.topic_id || '');
    setFormSubtopicId(quiz.subtopic_id || '');
    setFormTitle(quiz.title || '');
    setFormDesc(quiz.description || '');
    const marksVal = Number(quiz.marks) || 100;
    const passingMarksVal =
      quiz.passing_marks !== undefined && quiz.passing_marks !== null
        ? Number(quiz.passing_marks)
        : Math.round((marksVal * (Number(quiz.passing_score) || 70)) / 100);
    setFormMarks(marksVal);
    setFormPassingMarks(passingMarksVal);
    setFormTimeLimit(Number(quiz.time_limit) || 30);

    const startParts = splitIsoToDateTime(quiz.start_date);
    const dueParts = splitIsoToDateTime(quiz.due_date);
    setFormStartDate(startParts.date);
    setFormStartTime(startParts.time);
    setFormDueDate(dueParts.date);
    setFormDueTime(dueParts.time);

    setFormMaxAttempts(Math.max(1, Number(quiz.max_attempts) || 1));
    setFormAllowLate(Boolean(quiz.allow_late_submission));
    setFormStatus(quiz.status === 'draft' ? 'draft' : 'published');
    setQuestions(
      Array.isArray(quiz.questions) && quiz.questions.length > 0
        ? quiz.questions.map((q: any, idx: number) => ({
            id: q.id || `q_${idx + 1}`,
            question: q.question || '',
            question_type: q.question_type || 'multiple_choice',
            options: Array.isArray(q.options) && q.options.length > 0 ? [...q.options] : ['', '', '', ''],
            correct_answer: q.correct_answer || '',
            explanation: q.explanation || '',
          }))
        : [createEmptyQuestion(1)]
    );
    setIsModalOpen(true);
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, createEmptyQuestion(questions.length + 1)]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleQuestionChange = (idx: number, field: string, value: any) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    setQuestions(updated);
  };

  const handleOptionChange = (qIdx: number, optIdx: number, value: string) => {
    const updated = [...questions];
    const nextOptions = [...updated[qIdx].options];
    nextOptions[optIdx] = value;
    updated[qIdx] = { ...updated[qIdx], options: nextOptions };
    setQuestions(updated);
  };

  const computedPassingPercent =
    formMarks > 0 ? Math.min(100, Math.max(0, Math.round((formPassingMarks / formMarks) * 100))) : 0;

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubjectId) {
      showNotification('error', 'Please select a subject / class.');
      return;
    }
    if (!formTitle.trim() || questions.length === 0) {
      showNotification('error', 'Quiz title and at least one question are required.');
      return;
    }

    if (formMarks <= 0) {
      showNotification('error', 'Maximum marks must be greater than 0.');
      return;
    }
    if (formPassingMarks < 0 || formPassingMarks > formMarks) {
      showNotification('error', 'Passing marks must be between 0 and maximum marks.');
      return;
    }
    if (formTimeLimit < 1 || formTimeLimit > 600) {
      showNotification('error', 'Quiz duration must be between 1 and 600 minutes.');
      return;
    }

    const startIso = combineDateAndTime(formStartDate, formStartTime, 'start');
    const dueIso = combineDateAndTime(formDueDate, formDueTime, 'end');

    if (startIso && dueIso && new Date(dueIso).getTime() <= new Date(startIso).getTime()) {
      showNotification('error', 'Due date and time must be later than the start date and time.');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        showNotification('error', `Question #${i + 1} prompt cannot be empty.`);
        return;
      }
      if (!q.correct_answer.trim()) {
        showNotification('error', `Question #${i + 1} must have a designated correct answer.`);
        return;
      }
    }

    const payload = {
      subject_id: formSubjectId,
      chapter_id: formChapterId || undefined,
      topic_id: formTopicId || undefined,
      subtopic_id: formSubtopicId || undefined,
      class_id: formSubjectId,
      title: formTitle.trim(),
      description: formDesc.trim() || 'Curriculum assessment quiz',
      marks: formMarks,
      passing_marks: formPassingMarks,
      passing_score: computedPassingPercent,
      time_limit: formTimeLimit,
      start_date: startIso || '',
      due_date: dueIso || '',
      max_attempts: Math.max(1, Number(formMaxAttempts) || 1),
      allow_late_submission: formAllowLate,
      status: formStatus,
      questions,
    };

    try {
      setSubmitting(true);
      let savedQuiz: any;
      if (editingQuiz) {
        const res = await api.updateQuiz(editingQuiz.id, payload);
        savedQuiz = res.quiz;
        showNotification('success', `Quiz "${formTitle}" updated successfully.`);
      } else {
        const res = await api.createQuiz(payload);
        savedQuiz = res.quiz;
        showNotification('success', `Quiz "${formTitle}" scheduled and saved successfully!`);
      }

      if (savedQuiz?.id) {
        void syncQuizScheduleToFirestore(
          {
            id: savedQuiz.id,
            subjectId: formSubjectId,
            chapterId: formChapterId || undefined,
            title: payload.title,
            description: payload.description,
            startAt: startIso,
            dueAt: dueIso,
            durationMinutes: formTimeLimit,
            maxMarks: formMarks,
            passingMarks: formPassingMarks,
            maxAttempts: payload.max_attempts,
            allowLateSubmission: formAllowLate,
            status: formStatus,
          },
          !editingQuiz
        );
      }

      setIsModalOpen(false);
      setEditingQuiz(null);
      fetchQuizzes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePublish = async (quiz: any) => {
    try {
      const res = await api.togglePublishQuiz(quiz.id);
      const updated = res.quiz || quiz;
      void syncQuizScheduleToFirestore(
        {
          id: updated.id,
          subjectId: updated.subject_id,
          chapterId: updated.chapter_id,
          title: updated.title,
          description: updated.description,
          startAt: updated.start_date,
          dueAt: updated.due_date,
          durationMinutes: Number(updated.time_limit || 20),
          maxMarks: Number(updated.marks || 100),
          passingMarks: Number(updated.passing_marks ?? Math.round(((updated.marks || 100) * (updated.passing_score || 70)) / 100)),
          maxAttempts: Number(updated.max_attempts || 1),
          allowLateSubmission: Boolean(updated.allow_late_submission),
          status: updated.status === 'draft' ? 'draft' : 'published',
        },
        false
      );
      showNotification('success', res.message);
      fetchQuizzes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to toggle quiz status.');
    }
  };

  const handleOpenAssign = (quiz: any) => {
    setAssigningQuiz(quiz);
    setTargetClassId(quiz.subject_id || subjects[0]?.id || '');
  };

  const handleExecuteAssign = async () => {
    if (!assigningQuiz || !targetClassId) return;
    try {
      await api.assignQuiz(assigningQuiz.id, targetClassId);
      showNotification('success', 'Quiz assigned to class successfully!');
      setAssigningQuiz(null);
      fetchQuizzes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to assign quiz.');
    }
  };

  const handleViewSubmissions = async (quiz: any) => {
    setViewingSubmissionsQuiz(quiz);
    try {
      setLoadingSubmissions(true);
      const res = await api.getQuizSubmissions(quiz.id);
      setSubmissionsList(res.submissions || []);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to load submissions.');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingQuiz) return;
    try {
      await api.deleteQuiz(deletingQuiz.id);
      void deleteQuizScheduleFromFirestore(deletingQuiz.id);
      showNotification('success', 'Quiz deleted successfully.');
      setDeletingQuiz(null);
      fetchQuizzes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete quiz.');
    }
  };

  const getScheduleBadge = (quiz: any) => {
    const startMs = quiz.start_date ? new Date(quiz.start_date).getTime() : null;
    const dueMs = quiz.due_date ? new Date(quiz.due_date).getTime() : null;
    if (startMs && !Number.isNaN(startMs) && serverNow < startMs) {
      return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    if (dueMs && !Number.isNaN(dueMs) && serverNow > dueMs) {
      return {
        label: quiz.allow_late_submission ? 'Closed (Late Open)' : 'Closed',
        cls: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    }
    if (startMs || dueMs) {
      return { label: 'Active Window', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    return { label: 'Always Open', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  };

  const filteredQuizzes = quizzes.filter((q) => {
    const s = searchQuery.toLowerCase();
    return (
      q.title.toLowerCase().includes(s) ||
      (q.description && q.description.toLowerCase().includes(s)) ||
      (q.subjectName && q.subjectName.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="font-bold opacity-70 hover:opacity-100 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Header & Quick Action */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
            <Award className="w-4 h-4" />
            <span>Curriculum Assessments</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Quiz Management & Scheduling</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Schedule timed assessments with start/due windows, attempt limits, and automated grading.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Quiz</span>
        </button>
      </div>

      {/* Search & Subject Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search quizzes by title or keyword..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
          />
        </div>

        <select
          value={selectedSubjectFilter}
          onChange={(e) => setSelectedSubjectFilter(e.target.value)}
          className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold"
        >
          <option value="all">All Subjects ({quizzes.length})</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Quizzes List */}
      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-500">Loading quizzes...</div>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Quizzes Created Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create scheduled, timed practice tests connected to your curriculum hierarchy.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Quiz</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuizzes.map((quiz) => {
            const schedBadge = getScheduleBadge(quiz);
            const passingMarks =
              quiz.passing_marks !== undefined && quiz.passing_marks !== null
                ? quiz.passing_marks
                : Math.round(((quiz.marks || 100) * (quiz.passing_score || 70)) / 100);
            return (
              <div
                key={quiz.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Status & Schedule badges */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          quiz.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {quiz.status || 'published'}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${schedBadge.cls}`}
                      >
                        {schedBadge.label}
                      </span>
                    </div>

                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 shrink-0">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{quiz.totalSubmissions || 0}</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {quiz.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {quiz.description || 'Curriculum assessment test.'}
                  </p>

                  {/* Hierarchy context */}
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-800 truncate">
                      Class: {quiz.subjectName}
                    </div>
                    {quiz.chapterTitle && (
                      <div className="text-slate-500 truncate">Chapter: {quiz.chapterTitle}</div>
                    )}
                    <div className="pt-1 border-t border-slate-200/70 space-y-0.5 tabular-nums">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate">
                          Start: {quiz.start_date ? formatDateTime(quiz.start_date) : 'Immediate'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="truncate">
                          Due: {quiz.due_date ? formatDateTime(quiz.due_date) : 'No deadline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-slate-100 text-center text-[11px] tabular-nums">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Qs</span>
                      <span className="font-bold text-slate-800">{quiz.totalQuestions || quiz.questions?.length || 1}</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Marks</span>
                      <span className="font-bold text-slate-800">
                        {passingMarks}/{quiz.marks || 100}
                      </span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Time</span>
                      <span className="font-bold text-slate-800">{quiz.time_limit || 20}m</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Tries</span>
                      <span className="font-bold text-slate-800">{quiz.max_attempts || 1}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                  <button
                    onClick={() => handleViewSubmissions(quiz)}
                    className="py-1 px-2.5 font-semibold text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Submissions</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(quiz)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                      title="Edit Quiz & Schedule"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenAssign(quiz)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                      title="Assign to Class"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTogglePublish(quiz)}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                      title="Toggle Publish / Draft"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingQuiz(quiz)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Delete Quiz"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT QUIZ MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  {editingQuiz ? 'Edit Quiz & Schedule' : 'Create Scheduled Quiz'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure start/due date & time, attempt duration, passing marks, and questions.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingQuiz(null);
                }}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="space-y-4">
              {/* Hierarchy Connections */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                  <span>Class & Curriculum</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subject / Class <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formSubjectId}
                      onChange={(e) => setFormSubjectId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.section ? `(${s.section})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Chapter (Optional)</label>
                    <select
                      value={formChapterId}
                      onChange={(e) => setFormChapterId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      <option value="">General Class Quiz</option>
                      {curriculumForModal?.chapters?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quiz Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Java Programming Test"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Instructions</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Instructions and guidelines for students before they start..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Scheduling & Timing Window */}
              <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-3">
                <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Schedule, Duration & Attempts</span>
                </div>

                {/* Start Date & Time + Due Date & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Start Date & Time</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Start Date"
                      />
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Start Time"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Due Date & Time</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formDueDate}
                        onChange={(e) => setFormDueDate(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Due Date"
                      />
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Due Time"
                      />
                    </div>
                  </div>
                </div>

                {/* Duration presets + custom minutes */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Quiz Duration (Minutes) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUIZ_DURATION_PRESETS.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setFormTimeLimit(mins)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          formTimeLimit === mins
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {mins} min
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <input
                        type="number"
                        value={formTimeLimit}
                        onChange={(e) => setFormTimeLimit(Math.max(1, Number(e.target.value)))}
                        min={1}
                        max={600}
                        className="w-20 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold"
                        aria-label="Custom duration in minutes"
                      />
                      <span className="text-[11px] text-slate-500">min</span>
                    </div>
                  </div>
                </div>

                {/* Marks, Passing Marks, Attempts, Status */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Maximum Marks</label>
                    <input
                      type="number"
                      value={formMarks}
                      onChange={(e) => {
                        const nextMarks = Math.max(1, Number(e.target.value));
                        setFormMarks(nextMarks);
                        if (formPassingMarks > nextMarks) setFormPassingMarks(nextMarks);
                      }}
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Passing Marks ({computedPassingPercent}%)
                    </label>
                    <input
                      type="number"
                      value={formPassingMarks}
                      onChange={(e) => setFormPassingMarks(Math.max(0, Number(e.target.value)))}
                      min={0}
                      max={formMarks}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Attempts Allowed</label>
                    <input
                      type="number"
                      value={formMaxAttempts}
                      onChange={(e) => setFormMaxAttempts(Math.max(1, Math.min(20, Number(e.target.value))))}
                      min={1}
                      max={20}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as 'published' | 'draft')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formAllowLate}
                    onChange={(e) => setFormAllowLate(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Allow late attempts after due date & time (flagged as Late)</span>
                </label>
              </div>

              {/* QUESTIONS BUILDER */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Questions ({questions.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Question</span>
                  </button>
                </div>

                {questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Question #{qIdx + 1}</span>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="text-red-500 hover:text-red-700 font-bold cursor-pointer"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={q.question}
                      onChange={(e) => handleQuestionChange(qIdx, 'question', e.target.value)}
                      placeholder="Enter question prompt..."
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt: string, oIdx: number) => (
                        <div key={oIdx} className="flex items-center gap-1.5">
                          <span className="w-5 font-bold text-slate-400">
                            {String.fromCharCode(65 + oIdx)}.
                          </span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleOptionChange(qIdx, oIdx, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                            required
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Correct Answer (Select or enter exact match)
                        </label>
                        {q.options.some((opt: string) => opt.trim()) ? (
                          <select
                            value={q.correct_answer}
                            onChange={(e) => handleQuestionChange(qIdx, 'correct_answer', e.target.value)}
                            required
                            className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-800"
                          >
                            <option value="">Select correct option...</option>
                            {q.options
                              .filter((opt: string) => opt.trim().length > 0)
                              .map((opt: string, oIdx: number) => (
                                <option key={oIdx} value={opt}>
                                  {String.fromCharCode(65 + oIdx)}. {opt}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={q.correct_answer}
                            onChange={(e) => handleQuestionChange(qIdx, 'correct_answer', e.target.value)}
                            placeholder="Exact text of correct option"
                            required
                            className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-800"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Explanation (Optional)
                        </label>
                        <input
                          type="text"
                          value={q.explanation}
                          onChange={(e) => handleQuestionChange(qIdx, 'explanation', e.target.value)}
                          placeholder="Why this answer is correct..."
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingQuiz(null);
                  }}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : editingQuiz
                    ? 'Save Changes'
                    : formStatus === 'draft'
                    ? 'Save Draft Quiz'
                    : 'Schedule & Publish Quiz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN TO CLASS MODAL */}
      {assigningQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900">Assign Quiz to Class</h3>
            <p className="text-xs text-slate-500 mt-1">
              Select which class / subject will receive "{assigningQuiz.title}".
            </p>

            <div className="my-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Class</label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.section})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setAssigningQuiz(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAssign}
                className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Assign Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMISSIONS MODAL */}
      {viewingSubmissionsQuiz && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[88dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Quiz Submissions</h3>
                <p className="text-xs text-slate-500">{viewingSubmissionsQuiz.title}</p>
              </div>
              <button
                onClick={() => setViewingSubmissionsQuiz(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {loadingSubmissions ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading submissions...</div>
            ) : submissionsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                No students have submitted this quiz yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {submissionsList.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{sub.student_name}</span>
                        {sub.attempt_number && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 inline-flex items-center gap-0.5">
                            <Repeat className="w-2.5 h-2.5" />#{sub.attempt_number}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDateTime(sub.submitted_at)}
                        {sub.auto_submitted && (
                          <span className="ml-2 text-amber-700 font-semibold">· Auto-submitted</span>
                        )}
                        {sub.is_late && (
                          <span className="ml-2 text-red-600 font-semibold">· Late</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right tabular-nums">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          sub.passed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sub.marks_obtained !== undefined
                          ? `${sub.marks_obtained}/${viewingSubmissionsQuiz.marks || 100} (${sub.score}%)`
                          : `${sub.score}%`}{' '}
                        {sub.passed ? '· Passed' : '· Failed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setViewingSubmissionsQuiz(null)}
                className="py-2 px-4 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Quiz?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingQuiz.title}"</span>?
              All student attempts and submissions for this quiz will also be removed.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeletingQuiz(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Yes, Delete Quiz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
