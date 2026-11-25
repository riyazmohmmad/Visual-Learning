import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  Paperclip,
  BookOpen,
  FolderTree,
  AlertCircle,
  X,
  FileText,
  User,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Subject, DoubtItem, DoubtReply } from '../types';
import { api } from '../services/api';
import { AiDoubtSolverPanel } from './AiDoubtSolverPanel';

interface Props {
  enrolledSubjects: Subject[];
  onRefresh?: () => void;
  initialMode?: 'ai' | 'instructor';
}

export const StudentDoubtsTab: React.FC<Props> = ({ enrolledSubjects, onRefresh, initialMode = 'ai' }) => {
  const [doubtMode, setDoubtMode] = useState<'ai' | 'instructor'>(initialMode);
  const [doubts, setDoubts] = useState<DoubtItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Answered' | 'Resolved'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ask Doubt Modal State
  const [isAskModalOpen, setIsAskModalOpen] = useState<boolean>(false);
  const [submittingDoubt, setSubmittingDoubt] = useState<boolean>(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(enrolledSubjects[0]?.id || '');
  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [subtopics, setSubtopics] = useState<any[]>([]);
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string>('');
  const [doubtTitle, setDoubtTitle] = useState<string>('');
  const [doubtDescription, setDoubtDescription] = useState<string>('');
  const [doubtAttachment, setDoubtAttachment] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<boolean>(false);

  // Conversation Detail Modal
  const [selectedDoubt, setSelectedDoubt] = useState<DoubtItem | null>(null);
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchDoubts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (subjectFilter !== 'all') params.subject_id = subjectFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.getDoubts(params);
      setDoubts(res.doubts || []);

      if (selectedDoubt) {
        const updated = res.doubts?.find((d) => d.id === selectedDoubt.id);
        if (updated) setSelectedDoubt(updated);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load your doubts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoubts();
  }, [subjectFilter, statusFilter]);

  // Load chapters when selected subject changes in Ask Doubt modal
  useEffect(() => {
    if (!selectedSubjectId) return;

    const loadSubjectCurriculum = async () => {
      try {
        const res = await api.getSubject(selectedSubjectId);
        const chaps = res.chapters || [];
        setChapters(chaps);
        if (chaps.length > 0) {
          setSelectedChapterId(chaps[0].id);
          const topList = chaps[0].topics || [];
          setTopics(topList);
          if (topList.length > 0) {
            setSelectedTopicId(topList[0].id);
            setSubtopics(topList[0].subtopics || []);
          } else {
            setSelectedTopicId('');
            setSubtopics((chaps[0] as any)?.unassignedSubtopics || []);
          }
        } else {
          setSelectedChapterId('');
          setTopics([]);
          setSelectedTopicId('');
          setSubtopics([]);
        }
      } catch (e) {
        console.warn('Failed loading curriculum for subject:', e);
      }
    };

    loadSubjectCurriculum();
  }, [selectedSubjectId]);

  // Handle chapter change
  const handleChapterChange = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    const chap = chapters.find((c) => c.id === chapterId);
    const topList = chap?.topics || [];
    setTopics(topList);
    if (topList.length > 0) {
      setSelectedTopicId(topList[0].id);
      setSubtopics(topList[0].subtopics || []);
    } else {
      setSelectedTopicId('');
      setSubtopics((chap as any)?.unassignedSubtopics || []);
    }
  };

  // Handle topic change
  const handleTopicChange = (topicId: string) => {
    setSelectedTopicId(topicId);
    const top = topics.find((t) => t.id === topicId);
    setSubtopics(top?.subtopics || []);
    setSelectedSubtopicId('');
  };

  const handleCreateDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !doubtTitle.trim() || !doubtDescription.trim()) {
      showNotification('error', 'Please fill in all required fields.');
      return;
    }

    try {
      setSubmittingDoubt(true);
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;

      if (doubtAttachment) {
        setUploadingAttachment(true);
        const uploadRes = await api.uploadDoubtAttachment(doubtAttachment);
        attachmentUrl = uploadRes.file_url;
        attachmentName = uploadRes.file_name;
        setUploadingAttachment(false);
      }

      await api.createDoubt({
        subject_id: selectedSubjectId,
        chapter_id: selectedChapterId || undefined,
        topic_id: selectedTopicId || undefined,
        subtopic_id: selectedSubtopicId || undefined,
        title: doubtTitle.trim(),
        description: doubtDescription.trim(),
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      });

      showNotification('success', 'Your doubt has been submitted to your course instructor.');
      setIsAskModalOpen(false);
      setDoubtTitle('');
      setDoubtDescription('');
      setDoubtAttachment(null);
      fetchDoubts();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to submit doubt.');
    } finally {
      setSubmittingDoubt(false);
      setUploadingAttachment(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedDoubt || !replyMessage.trim()) return;

    try {
      setSendingReply(true);
      const res = await api.replyDoubt(selectedDoubt.id, replyMessage.trim());
      showNotification('success', 'Your follow-up reply has been sent.');
      setReplyMessage('');
      setSelectedDoubt(res.doubt);
      setDoubts((prev) => prev.map((d) => (d.id === res.doubt.id ? res.doubt : d)));
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleMarkResolved = async (doubtId: string) => {
    try {
      const res = await api.updateDoubtStatus(doubtId, 'Resolved');
      showNotification('success', 'Doubt marked as resolved.');
      if (selectedDoubt?.id === doubtId) {
        setSelectedDoubt(res.doubt);
      }
      setDoubts((prev) => prev.map((d) => (d.id === doubtId ? res.doubt : d)));
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update doubt status.');
    }
  };

  const filteredDoubts = doubts.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.subject_name.toLowerCase().includes(q) ||
      (d.chapter_title && d.chapter_title.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ? true : d.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const pendingCount = doubts.filter((d) => d.status === 'Pending').length;
  const answeredCount = doubts.filter((d) => d.status === 'Answered').length;
  const resolvedCount = doubts.filter((d) => d.status === 'Resolved').length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
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

      {/* Header Banner & Mode Switcher */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
              <HelpCircle className="w-4 h-4" />
              <span>Doubt Resolution Center</span>
            </div>
            <h2 className="type-section-title text-slate-900 mt-1">AI Doubt Solver & Faculty Q&A</h2>
            <p className="type-helper text-slate-500 mt-0.5">
              Get instant step-by-step explanations with AI or ask your course instructor directly.
            </p>
          </div>

          <button
            onClick={() => {
              if (enrolledSubjects.length > 0 && !selectedSubjectId) {
                setSelectedSubjectId(enrolledSubjects[0].id);
              }
              setDoubtMode('instructor');
              setIsAskModalOpen(true);
            }}
            className="py-2.5 px-4 min-h-[44px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Ask Instructor</span>
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setDoubtMode('ai')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              doubtMode === 'ai'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Doubt Solver</span>
          </button>
          <button
            type="button"
            onClick={() => setDoubtMode('instructor')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              doubtMode === 'instructor'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Instructor Doubts</span>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums">({doubts.length})</span>
          </button>
        </div>
      </div>

      {doubtMode === 'ai' ? (
        <AiDoubtSolverPanel
          enrolledSubjects={enrolledSubjects}
          defaultSubjectId={selectedSubjectId}
          onEscalateToInstructor={({ subjectId, title, description }) => {
            if (subjectId) setSelectedSubjectId(subjectId);
            if (title) setDoubtTitle(title);
            if (description) setDoubtDescription(description);
            setDoubtMode('instructor');
            setIsAskModalOpen(true);
          }}
        />
      ) : (
        <>
      {/* Quick Summary Counts */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="p-3 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs min-w-0">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block uppercase truncate">Pending</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg sm:text-xl font-bold text-amber-600 tabular-nums">{pendingCount}</span>
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
        </div>
        <div className="p-3 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs min-w-0">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block uppercase truncate">Answered</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums">{answeredCount}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
        </div>
        <div className="p-3 sm:p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs min-w-0">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block uppercase truncate">Resolved</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg sm:text-xl font-bold text-blue-600 tabular-nums">{resolvedCount}</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your doubts..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Subject Filter */}
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
          >
            <option value="all">All Enrolled Classes</option>
            {enrolledSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({doubts.length})
            </button>
            <button
              onClick={() => setStatusFilter('Pending')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-white text-amber-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('Answered')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'Answered'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Answered ({answeredCount})
            </button>
            <button
              onClick={() => setStatusFilter('Resolved')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'Resolved'
                  ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Doubts List */}
      {loading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-500">Loading your questions & inquiries...</span>
        </div>
      ) : filteredDoubts.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {doubts.length === 0 ? 'No doubts yet.' : 'No Inquiries Found'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || subjectFilter !== 'all'
              ? 'No doubts match the selected filters.'
              : 'Have a conceptual question? Ask your instructor and get verified explanations.'}
          </p>
          <button
            onClick={() => setIsAskModalOpen(true)}
            className="mt-3 py-2 px-4 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ask a Doubt</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDoubts.map((doubt) => {
            const replyCount = doubt.replies?.length || 0;
            return (
              <div
                key={doubt.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:border-blue-300 transition-all space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {doubt.subject_name}
                      </span>
                      {doubt.chapter_title && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 font-medium">{doubt.chapter_title}</span>
                        </>
                      )}
                      {doubt.topic_title && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{doubt.topic_title}</span>
                        </>
                      )}
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-400">
                        {new Date(doubt.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 pt-0.5">{doubt.title}</h3>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      doubt.status === 'Answered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : doubt.status === 'Resolved'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {doubt.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {doubt.description}
                </p>

                {/* Attachment Link if present */}
                {doubt.attachment_url && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs w-fit">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                    <a
                      href={doubt.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium flex items-center gap-1"
                    >
                      <span>{doubt.attachment_name || 'Attached Reference Document'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Latest Teacher Response preview if available */}
                {doubt.teacher_response && (
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Instructor's Explanation:</span>
                    </div>
                    <p className="text-emerald-800 leading-relaxed pl-5 whitespace-pre-wrap">
                      {doubt.teacher_response}
                    </p>
                  </div>
                )}

                {/* Card Controls */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{replyCount} conversation message(s)</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {doubt.status === 'Answered' && (
                      <button
                        onClick={() => handleMarkResolved(doubt.id)}
                        className="py-1 px-2.5 text-purple-700 hover:bg-purple-50 rounded-lg font-semibold transition-colors cursor-pointer"
                      >
                        Mark as Resolved
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedDoubt(doubt)}
                      className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>View Conversation</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================
          ASK DOUBT MODAL (Requirement #1)
      ================================================== */}
      {isAskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ask Academic Doubt</h3>
                  <p className="text-xs text-slate-500">Connect with your course instructor</p>
                </div>
              </div>
              <button
                onClick={() => setIsAskModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDoubt} className="space-y-4 text-xs">
              {/* Select Enrolled Class / Subject */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Enrolled Class / Subject <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  {enrolledSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || s.section})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chapter & Topic Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chapter</label>
                  <select
                    value={selectedChapterId}
                    onChange={(e) => handleChapterChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="">General Course Question</option>
                    {chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Topic (Optional)</label>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => handleTopicChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="">None / Chapter Level</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subtopic Selector if available */}
              {subtopics.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Subtopic (Optional)</label>
                  <select
                    value={selectedSubtopicId}
                    onChange={(e) => setSelectedSubtopicId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="">General / None</option>
                    {subtopics.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Doubt Title */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Question Title / Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={doubtTitle}
                  onChange={(e) => setDoubtTitle(e.target.value)}
                  placeholder="e.g. Calculating electrostatic potential across dielectric boundaries"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Detailed Description */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Detailed Question Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={doubtDescription}
                  onChange={(e) => setDoubtDescription(e.target.value)}
                  placeholder="Explain clearly where you are stuck or what concept seems contradictory..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Optional Attachment */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Attach Supporting Document / Screenshot (Optional)
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 25 * 1024 * 1024) {
                        showNotification('error', 'File size exceeds 25 MB limit.');
                        return;
                      }
                      setDoubtAttachment(file);
                    }
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                {doubtAttachment && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                    Attached: {doubtAttachment.name} ({(doubtAttachment.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAskModalOpen(false)}
                  className="py-2 px-4 font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDoubt || uploadingAttachment}
                  className="py-2 px-5 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingDoubt ? (
                    <span>Submitting Question...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Question to Instructor</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          CONVERSATION THREAD DETAIL MODAL (Requirement #1)
      ================================================== */}
      {selectedDoubt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      selectedDoubt.status === 'Answered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedDoubt.status === 'Resolved'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedDoubt.status}
                  </span>
                  <span className="text-xs text-blue-700 font-semibold">{selectedDoubt.subject_name}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 truncate">{selectedDoubt.title}</h3>
              </div>
              <button
                onClick={() => setSelectedDoubt(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Conversation Messages Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Original Question Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-slate-800">Your Initial Question</span>
                  <span>{new Date(selectedDoubt.created_at).toLocaleString()}</span>
                </div>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedDoubt.description}</p>
                {selectedDoubt.attachment_url && (
                  <div className="pt-2 border-t border-slate-200/60">
                    <a
                      href={selectedDoubt.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{selectedDoubt.attachment_name || 'Attachment'}</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Replies Timeline */}
              {selectedDoubt.replies && selectedDoubt.replies.length > 0 ? (
                selectedDoubt.replies.map((reply) => {
                  const isTeacher = reply.sender_role === 'teacher';
                  return (
                    <div
                      key={reply.id}
                      className={`p-4 rounded-xl border space-y-1.5 ${
                        isTeacher
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-blue-50/70 border-blue-200 text-blue-950 ml-6'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          {isTeacher ? (
                            <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono">
                              TEACHER
                            </span>
                          ) : (
                            <span className="text-[10px] bg-blue-700 text-white px-1.5 py-0.5 rounded font-mono">
                              YOU
                            </span>
                          )}
                          <span>{reply.sender_name}</span>
                        </span>
                        <span className="text-[10px] font-normal opacity-70">
                          {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{reply.message}</p>
                    </div>
                  );
                })
              ) : selectedDoubt.teacher_response ? (
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5 text-emerald-950">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono">
                        TEACHER
                      </span>
                      <span>Course Instructor</span>
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">{selectedDoubt.teacher_response}</p>
                </div>
              ) : (
                <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Clock className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                  <span>Waiting for instructor reply. Your question has been delivered.</span>
                </div>
              )}
            </div>

            {/* Reply Input Bar & Status Controls */}
            <div className="pt-4 border-t border-slate-100 space-y-3 shrink-0">
              {selectedDoubt.status !== 'Resolved' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Is this question answered to your satisfaction?</span>
                  <button
                    onClick={() => handleMarkResolved(selectedDoubt.id)}
                    className="py-1 px-3 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Mark as Resolved
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type a follow-up response or question..."
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
                <button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyMessage.trim()}
                  className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
