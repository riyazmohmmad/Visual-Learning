import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  MessageSquare,
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
  ExternalLink,
  RefreshCw,
  Check,
  ChevronRight,
  Download,
  CheckCircle,
} from 'lucide-react';
import { Subject, DoubtItem, DoubtReply } from '../../types';
import { api } from '../../services/api';

interface Props {
  subjects: Subject[];
  onRefresh?: () => void;
}

export const TeacherDoubtsTab: React.FC<Props> = ({ subjects, onRefresh }) => {
  const [doubts, setDoubts] = useState<DoubtItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Answered' | 'Resolved'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Thread detail modal
  const [selectedDoubt, setSelectedDoubt] = useState<DoubtItem | null>(null);
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [replyStatus, setReplyStatus] = useState<'Pending' | 'Answered' | 'Resolved'>('Answered');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<boolean>(false);

  // Feedback notification
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
      setError(err.message || 'Failed to load doubts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoubts();
  }, [subjectFilter, statusFilter]);

  const handleQuickStatusChange = async (doubtId: string, newStatus: 'Pending' | 'Answered' | 'Resolved') => {
    try {
      await api.updateDoubtStatus(doubtId, newStatus);
      showNotification('success', `Status updated to ${newStatus}.`);
      setDoubts((prev) =>
        prev.map((d) => (d.id === doubtId ? { ...d, status: newStatus, updated_at: new Date().toISOString() } : d))
      );
      if (selectedDoubt && selectedDoubt.id === doubtId) {
        setSelectedDoubt((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update status.');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoubt) return;
    if (!replyMessage.trim() && !replyAttachment) {
      showNotification('error', 'Please enter a reply message.');
      return;
    }

    try {
      setSendingReply(true);

      let attachmentInfo: { url?: string; name?: string } | undefined = undefined;
      if (replyAttachment) {
        setUploadingAttachment(true);
        const upRes = await api.uploadDoubtAttachment(replyAttachment);
        attachmentInfo = {
          url: upRes.file_url,
          name: upRes.file_name,
        };
        setUploadingAttachment(false);
      }

      const res = await api.replyDoubt(selectedDoubt.id, replyMessage.trim(), attachmentInfo);

      // If user also changed status from default
      if (replyStatus !== selectedDoubt.status) {
        await api.updateDoubtStatus(selectedDoubt.id, replyStatus);
        res.doubt.status = replyStatus;
      }

      showNotification('success', 'Reply posted successfully.');
      setReplyMessage('');
      setReplyAttachment(null);

      setSelectedDoubt(res.doubt);
      setDoubts((prev) => prev.map((d) => (d.id === res.doubt.id ? res.doubt : d)));

      if (onRefresh) onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to send reply.');
    } finally {
      setSendingReply(false);
      setUploadingAttachment(false);
    }
  };

  // Filtered doubts with search
  const filteredDoubts = doubts.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.student_name.toLowerCase().includes(q) ||
      (d.subject_name && d.subject_name.toLowerCase().includes(q)) ||
      (d.chapter_title && d.chapter_title.toLowerCase().includes(q)) ||
      (d.topic_title && d.topic_title.toLowerCase().includes(q))
    );
  });

  const totalDoubts = doubts.length;
  const pendingCount = doubts.filter((d) => d.status === 'Pending').length;
  const answeredCount = doubts.filter((d) => d.status === 'Answered').length;
  const resolvedCount = doubts.filter((d) => d.status === 'Resolved').length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Overview */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 type-label uppercase tracking-wider mb-1">
            <HelpCircle className="w-4 h-4" />
            <span>Academic Inquiries & Q&A</span>
          </div>
          <h1 className="type-section-title text-slate-900">Student Doubts</h1>
          <p className="type-helper text-slate-500 mt-1">
            Review questions submitted by students across your enrolled subjects, give clear explanations, and mark queries as resolved.
          </p>
        </div>

        <button
          onClick={() => {
            fetchDoubts();
            if (onRefresh) onRefresh();
          }}
          disabled={loading}
          className="py-2 px-3.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">All Doubts</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="type-metric text-slate-900 mt-2">{totalDoubts}</div>
        </div>

        <div className="p-4 bg-white border border-amber-200/80 bg-amber-50/20 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700">Needs Response</span>
            <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-semibold text-xs">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="type-metric text-amber-900 mt-2">{pendingCount}</div>
        </div>

        <div className="p-4 bg-white border border-emerald-200/80 bg-emerald-50/20 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">Answered</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-xs">
              <CheckCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="type-metric text-emerald-900 mt-2">{answeredCount}</div>
        </div>

        <div className="p-4 bg-white border border-purple-200/80 bg-purple-50/20 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-700">Resolved</span>
            <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-semibold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="type-metric text-purple-900 mt-2">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doubts by title, question, student or topic..."
              className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* Subject Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Subject:</span>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code || s.section})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Tab Filter */}
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All ({doubts.length})
          </button>
          <button
            onClick={() => setStatusFilter('Pending')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'Pending'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <span>Pending</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200/60 text-amber-900 font-bold">
              {pendingCount}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('Answered')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'Answered'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            <span>Answered</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-200/60 text-emerald-900 font-bold">
              {answeredCount}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter('Resolved')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'Resolved'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
            }`}
          >
            <span>Resolved</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-200/60 text-purple-900 font-bold">
              {resolvedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Doubts List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        {loading && doubts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600" />
            <p>Loading student doubts...</p>
          </div>
        ) : filteredDoubts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 space-y-2">
            <HelpCircle className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700 text-sm">No doubts found</p>
            <p>No student questions match your active filters or search terms.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredDoubts.map((doubt) => {
              const repliesCount = doubt.replies?.length || 0;
              const hasTeacherReply =
                doubt.teacher_response || doubt.replies?.some((r) => r.sender_role === 'teacher');

              return (
                <div
                  key={doubt.id}
                  className="p-5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-blue-200 transition-all space-y-3 shadow-2xs"
                >
                  {/* Top bar: Student Info & Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                        {doubt.student_name ? doubt.student_name.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{doubt.student_name}</span>
                          {doubt.student_email && (
                            <span className="text-xs text-slate-400 hidden md:inline">
                              ({doubt.student_email})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                            {doubt.subject_name}
                          </span>
                          {doubt.chapter_title && (
                            <span>• {doubt.chapter_title}</span>
                          )}
                          {doubt.topic_title && (
                            <span>› {doubt.topic_title}</span>
                          )}
                          <span>• {new Date(doubt.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          doubt.status === 'Answered'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : doubt.status === 'Resolved'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {doubt.status}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="pl-0 sm:pl-12 space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">{doubt.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                      {doubt.description}
                    </p>
                  </div>

                  {/* Attachment if present */}
                  {doubt.attachment_url && (
                    <div className="pl-0 sm:pl-12">
                      <a
                        href={doubt.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-2xs"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                        <span className="truncate max-w-xs">{doubt.attachment_name || 'Attached File'}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    </div>
                  )}

                  {/* Latest Reply preview if exists */}
                  {doubt.replies && doubt.replies.length > 0 && (
                    <div className="pl-0 sm:pl-12">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              Latest reply by{' '}
                              <strong className={doubt.replies[doubt.replies.length - 1].sender_role === 'teacher' ? 'text-blue-600' : 'text-slate-800'}>
                                {doubt.replies[doubt.replies.length - 1].sender_name}
                              </strong>{' '}
                              ({doubt.replies[doubt.replies.length - 1].sender_role})
                            </span>
                          </span>
                          <span>
                            {new Date(doubt.replies[doubt.replies.length - 1].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2 pl-5">
                          {doubt.replies[doubt.replies.length - 1].message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="pl-0 sm:pl-12 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span>{repliesCount} {repliesCount === 1 ? 'Response' : 'Responses'}</span>
                      {hasTeacherReply && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Teacher Answered
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status quick toggles */}
                      {doubt.status === 'Pending' ? (
                        <button
                          onClick={() => handleQuickStatusChange(doubt.id, 'Answered')}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Mark Answered
                        </button>
                      ) : doubt.status === 'Answered' ? (
                        <button
                          onClick={() => handleQuickStatusChange(doubt.id, 'Resolved')}
                          className="px-2.5 py-1 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                      ) : (
                        <button
                          onClick={() => handleQuickStatusChange(doubt.id, 'Pending')}
                          className="px-2.5 py-1 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg border border-amber-200 transition-colors cursor-pointer"
                        >
                          Reopen Doubt
                        </button>
                      )}

                      {/* Open full thread */}
                      <button
                        onClick={() => {
                          setSelectedDoubt(doubt);
                          setReplyStatus(doubt.status === 'Pending' ? 'Answered' : doubt.status);
                        }}
                        className="py-1.5 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Reply & Discussion</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FULL DISCUSSION / THREAD MODAL */}
      {selectedDoubt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedDoubt.subject_name}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      selectedDoubt.status === 'Answered'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : selectedDoubt.status === 'Resolved'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {selectedDoubt.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{selectedDoubt.title}</h3>
                <p className="text-xs text-slate-500">
                  Asked by <strong className="text-slate-800">{selectedDoubt.student_name}</strong> on{' '}
                  {new Date(selectedDoubt.created_at).toLocaleDateString()} at{' '}
                  {new Date(selectedDoubt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <button
                onClick={() => setSelectedDoubt(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Conversation Flow (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1.5 mb-4">
              {/* Original Question Post */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                    {selectedDoubt.student_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900">{selectedDoubt.student_name}</span>
                    <span className="text-[11px] text-slate-500 ml-2">(Original Inquiry)</span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed pl-10 whitespace-pre-line">
                  {selectedDoubt.description}
                </p>

                {selectedDoubt.attachment_url && (
                  <div className="pl-10 pt-1">
                    <a
                      href={selectedDoubt.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-blue-600 hover:underline shadow-2xs"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{selectedDoubt.attachment_name || 'Download Attachment'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Discussion Timeline */}
              {selectedDoubt.replies && selectedDoubt.replies.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                    <span>Thread History</span>
                  </div>

                  {selectedDoubt.replies.map((reply) => {
                    const isTeacher = reply.sender_role === 'teacher';

                    return (
                      <div
                        key={reply.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                          isTeacher
                            ? 'bg-blue-50/70 border-blue-200 ml-4'
                            : 'bg-white border-slate-200 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-full font-bold text-[11px] flex items-center justify-center ${
                                isTeacher
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {reply.sender_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">{reply.sender_name}</span>
                              <span
                                className={`text-[10px] font-bold uppercase ml-1.5 px-1.5 py-0.2 rounded ${
                                  isTeacher
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isTeacher ? 'Teacher' : 'Student'}
                              </span>
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-400">
                            {new Date(reply.created_at).toLocaleDateString()} {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <p className="text-slate-700 leading-relaxed whitespace-pre-line pl-9">
                          {reply.message}
                        </p>

                        {reply.attachment_url && (
                          <div className="pl-9 pt-1">
                            <a
                              href={reply.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-slate-200 text-[11px] font-medium text-blue-600 hover:underline shadow-2xs"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>{reply.attachment_name || 'Attached File'}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reply Composer Form (Pinned to bottom) */}
            <form onSubmit={handleSendReply} className="border-t border-slate-100 pt-3 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">Compose Response:</span>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Update Status:</span>
                  <select
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value as any)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    <option value="Answered">Answered</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Pending">Keep Pending</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={3}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type your explanation, hints or feedback here..."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
              />

              {/* Optional Attachment */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="teacher-reply-attachment"
                    onChange={(e) => setReplyAttachment(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="teacher-reply-attachment"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>{replyAttachment ? replyAttachment.name : 'Attach Reference File (Optional)'}</span>
                  </label>

                  {replyAttachment && (
                    <button
                      type="button"
                      onClick={() => setReplyAttachment(null)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDoubt(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={sendingReply || uploadingAttachment}
                    className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {sendingReply ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Response</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
