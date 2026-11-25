import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Users,
  Paperclip,
  FolderTree,
  FileCheck,
  Upload,
  Download,
  Loader2,
  X,
} from 'lucide-react';
import { Subject } from '../../types';
import { api } from '../../services/api';
import {
  ALLOWED_ASSIGNMENT_FILE_TYPES,
  DEFAULT_ALLOWED_FILE_TYPES,
  combineDateAndTime,
  splitIsoToDateTime,
  formatDateTime,
  isSafeAttachmentUrl,
  useServerNow,
} from '../../utils/scheduleUtils';
import {
  syncAssignmentScheduleToFirestore,
  deleteAssignmentScheduleFromFirestore,
} from '../../services/scheduleFirestoreService';

interface Props {
  subjects: Subject[];
  onNavigate: (view: string, params?: any) => void;
}

export const TeacherAssignmentsTab: React.FC<Props> = ({ subjects }) => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const serverNow = useServerNow(serverTime);

  // Create / Edit Assignment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [formSubjectId, setFormSubjectId] = useState(subjects[0]?.id || '');
  const [formChapterId, setFormChapterId] = useState('');
  const [formTopicId, setFormTopicId] = useState('');
  const [formSubtopicId, setFormSubtopicId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('');
  const [formMaxMarks, setFormMaxMarks] = useState(100);
  const [formAttachmentName, setFormAttachmentName] = useState('');
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('');
  const [formAttachmentSize, setFormAttachmentSize] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [formAllowedTypes, setFormAllowedTypes] = useState<string[]>([...DEFAULT_ALLOWED_FILE_TYPES]);
  const [formMaxFileSizeMb, setFormMaxFileSizeMb] = useState(10);
  const [formAllowLate, setFormAllowLate] = useState(false);
  const [formLatePenalty, setFormLatePenalty] = useState(10);
  const [formStatus, setFormStatus] = useState<'published' | 'draft'>('published');
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Curriculum for modal
  const [curriculumForModal, setCurriculumForModal] = useState<any>(null);
  const pendingEditHierarchyRef = useRef<{ chapterId?: string; topicId?: string; subtopicId?: string } | null>(null);

  // Submissions Modal State
  const [viewingAssignment, setViewingAssignment] = useState<any | null>(null);
  const [submissionsList, setSubmissionsList] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Grading State inside modal
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [gradeMarks, setGradeMarks] = useState<number>(85);
  const [gradeFeedback, setGradeFeedback] = useState<string>('Well structured and verified solution.');
  const [savingGrade, setSavingGrade] = useState(false);

  // Delete State
  const [deletingAssignment, setDeletingAssignment] = useState<any | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  const assignmentsReqRef = useRef(0);

  const fetchAssignments = async (subjectFilter = selectedSubjectFilter) => {
    const reqId = ++assignmentsReqRef.current;
    try {
      setLoading(true);
      const res = await api.getAssignments(
        subjectFilter !== 'all' ? { subject_id: subjectFilter } : undefined
      );
      if (reqId !== assignmentsReqRef.current) return;
      setAssignments(res.assignments || []);
      if (res.serverTime) setServerTime(res.serverTime);
    } catch (err: any) {
      if (reqId !== assignmentsReqRef.current) return;
      setAssignments([]);
      showNotification('error', err.message || 'Failed to fetch assignments.');
    } finally {
      if (reqId === assignmentsReqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setAssignments([]);
    fetchAssignments(selectedSubjectFilter);
  }, [selectedSubjectFilter]);

  useEffect(() => {
    if (editingAssignment) return;
    if (selectedSubjectFilter !== 'all' && subjects.some((s) => s.id === selectedSubjectFilter)) {
      setFormSubjectId(selectedSubjectFilter);
    } else if ((!formSubjectId || !subjects.some((s) => s.id === formSubjectId)) && subjects.length > 0) {
      setFormSubjectId(subjects[0].id);
    }
  }, [selectedSubjectFilter, subjects, editingAssignment]);

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
        } else if (!editingAssignment) {
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
    setEditingAssignment(null);
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
    setFormStartDate('');
    setFormStartTime('');
    setFormDueDate('');
    setFormDueTime('');
    setFormMaxMarks(100);
    setFormAttachmentName('');
    setFormAttachmentUrl('');
    setFormAttachmentSize('');
    setFormAllowedTypes([...DEFAULT_ALLOWED_FILE_TYPES]);
    setFormMaxFileSizeMb(10);
    setFormAllowLate(false);
    setFormLatePenalty(10);
    setFormStatus('published');
    setIsModalOpen(true);
  };

  const openEditModal = (asg: any) => {
    setEditingAssignment(asg);
    pendingEditHierarchyRef.current = {
      chapterId: asg.chapter_id || '',
      topicId: asg.topic_id || '',
      subtopicId: asg.subtopic_id || '',
    };
    setFormSubjectId(asg.subject_id || subjects[0]?.id || '');
    setFormChapterId(asg.chapter_id || '');
    setFormTopicId(asg.topic_id || '');
    setFormSubtopicId(asg.subtopic_id || '');
    setFormTitle(asg.title || '');
    setFormDesc(asg.description || '');
    const startParts = splitIsoToDateTime(asg.start_date);
    const dueParts = splitIsoToDateTime(asg.due_date);
    setFormStartDate(startParts.date);
    setFormStartTime(startParts.time);
    setFormDueDate(dueParts.date);
    setFormDueTime(dueParts.time);
    setFormMaxMarks(Number(asg.max_marks) || 100);
    setFormAttachmentName(asg.attachment_name || '');
    setFormAttachmentUrl(asg.attachment_url && asg.attachment_url !== '#' ? asg.attachment_url : '');
    setFormAttachmentSize(asg.attachment_size || '');
    setFormAllowedTypes(
      Array.isArray(asg.allowed_file_types) && asg.allowed_file_types.length > 0
        ? asg.allowed_file_types
        : [...DEFAULT_ALLOWED_FILE_TYPES]
    );
    setFormMaxFileSizeMb(Math.max(1, Math.min(25, Number(asg.max_file_size_mb) || 10)));
    setFormAllowLate(Boolean(asg.allow_late_submission));
    setFormLatePenalty(Number(asg.late_penalty_percent) || 0);
    setFormStatus(asg.status === 'draft' ? 'draft' : 'published');
    setIsModalOpen(true);
  };

  const toggleAllowedType = (ext: string) => {
    setFormAllowedTypes((prev) =>
      prev.includes(ext) ? prev.filter((item) => item !== ext) : [...prev, ext]
    );
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showNotification('error', 'Attachment exceeds the 25 MB maximum limit.');
      return;
    }
    try {
      setUploadingFile(true);
      const res = await api.uploadAssignmentAttachment(file);
      setFormAttachmentName(res.fileName);
      setFormAttachmentUrl(res.url);
      setFormAttachmentSize(res.formattedSize);
      showNotification('success', `Attached "${res.fileName}" (${res.formattedSize}).`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to upload attachment.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubjectId || !formTitle.trim()) {
      showNotification('error', 'Subject and assignment title are required.');
      return;
    }

    const startIso = combineDateAndTime(formStartDate, formStartTime, 'start');
    const dueIso = combineDateAndTime(formDueDate, formDueTime, 'end');

    if (startIso && dueIso && new Date(dueIso).getTime() <= new Date(startIso).getTime()) {
      showNotification('error', 'Submission deadline must be later than the assignment start date and time.');
      return;
    }

    if (formAllowedTypes.length === 0) {
      showNotification('error', 'Select at least one allowed student file type.');
      return;
    }

    if (formAttachmentUrl.trim() && !isSafeAttachmentUrl(formAttachmentUrl.trim())) {
      showNotification('error', 'Attachment URL must start with https://, http://, or be an uploaded file.');
      return;
    }

    const payload = {
      subject_id: formSubjectId,
      chapter_id: formChapterId || undefined,
      topic_id: formTopicId || undefined,
      subtopic_id: formSubtopicId || undefined,
      class_id: formSubjectId,
      title: formTitle.trim(),
      description: formDesc.trim(),
      start_date: startIso || '',
      due_date: dueIso || '',
      max_marks: Math.max(1, Number(formMaxMarks) || 100),
      attachment_name: formAttachmentName.trim() || undefined,
      attachment_url: formAttachmentUrl.trim() || undefined,
      attachment_size: formAttachmentSize.trim() || undefined,
      allowed_file_types: formAllowedTypes,
      max_file_size_mb: Math.max(1, Math.min(25, Number(formMaxFileSizeMb) || 10)),
      allow_late_submission: formAllowLate,
      late_penalty_percent: formAllowLate ? Math.max(0, Math.min(100, Number(formLatePenalty) || 0)) : 0,
      status: formStatus,
    };

    try {
      setSubmitting(true);
      let savedAsg: any;
      if (editingAssignment) {
        const res = await api.updateAssignment(editingAssignment.id, payload);
        savedAsg = res.assignment;
        showNotification('success', `Assignment "${formTitle}" updated successfully.`);
      } else {
        const res = await api.createAssignment(payload);
        savedAsg = res.assignment;
        showNotification('success', `Assignment "${formTitle}" scheduled successfully!`);
      }

      if (savedAsg?.id) {
        void syncAssignmentScheduleToFirestore(
          {
            id: savedAsg.id,
            subjectId: formSubjectId,
            chapterId: formChapterId || undefined,
            title: payload.title,
            description: payload.description,
            startAt: startIso,
            dueAt: dueIso,
            maxMarks: payload.max_marks,
            allowedFileTypes: payload.allowed_file_types,
            maxFileSizeMb: payload.max_file_size_mb,
            allowLateSubmission: payload.allow_late_submission,
            latePenaltyPercent: payload.late_penalty_percent,
            status: formStatus,
          },
          !editingAssignment
        );
      }

      setIsModalOpen(false);
      setEditingAssignment(null);
      fetchAssignments();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePublish = async (asg: any) => {
    try {
      const res = await api.togglePublishAssignment(asg.id);
      const updated = res.assignment || asg;
      void syncAssignmentScheduleToFirestore(
        {
          id: updated.id,
          subjectId: updated.subject_id,
          chapterId: updated.chapter_id,
          title: updated.title,
          description: updated.description,
          startAt: updated.start_date,
          dueAt: updated.due_date,
          maxMarks: Number(updated.max_marks || 100),
          allowedFileTypes: updated.allowed_file_types || DEFAULT_ALLOWED_FILE_TYPES,
          maxFileSizeMb: Number(updated.max_file_size_mb || 10),
          allowLateSubmission: Boolean(updated.allow_late_submission),
          latePenaltyPercent: Number(updated.late_penalty_percent || 0),
          status: updated.status === 'draft' ? 'draft' : 'published',
        },
        false
      );
      showNotification('success', res.message);
      fetchAssignments();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to toggle status.');
    }
  };

  const handleViewSubmissions = async (asg: any) => {
    setViewingAssignment(asg);
    try {
      setLoadingSubmissions(true);
      const res = await api.getAssignmentSubmissions(asg.id);
      setSubmissionsList(res.submissions || []);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to load submissions.');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleSaveGrade = async (subId: string) => {
    if (!viewingAssignment) return;
    try {
      setSavingGrade(true);
      await api.gradeAssignmentSubmission(viewingAssignment.id, subId, {
        marks: gradeMarks,
        feedback: gradeFeedback,
      });
      showNotification('success', 'Submission graded successfully!');
      setGradingSubId(null);
      const res = await api.getAssignmentSubmissions(viewingAssignment.id);
      setSubmissionsList(res.submissions || []);
      fetchAssignments();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to grade submission.');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAssignment) return;
    try {
      await api.deleteAssignment(deletingAssignment.id);
      void deleteAssignmentScheduleFromFirestore(deletingAssignment.id);
      showNotification('success', 'Assignment deleted successfully.');
      setDeletingAssignment(null);
      fetchAssignments();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete assignment.');
    }
  };

  const getScheduleBadge = (asg: any) => {
    const startMs = asg.start_date ? new Date(asg.start_date).getTime() : null;
    const dueMs = asg.due_date ? new Date(asg.due_date).getTime() : null;
    if (startMs && !Number.isNaN(startMs) && serverNow < startMs) {
      return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    if (dueMs && !Number.isNaN(dueMs) && serverNow > dueMs) {
      return {
        label: asg.allow_late_submission ? 'Past Due (Late Open)' : 'Closed',
        cls: asg.allow_late_submission
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200',
      };
    }
    return { label: 'Accepting Work', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const formatLateDuration = (mins?: number) => {
    if (!mins || mins <= 0) return 'Late';
    if (mins < 60) return `${mins}m late`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return remMins ? `${hours}h ${remMins}m late` : `${hours}h late`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours ? `${days}d ${remHours}h late` : `${days}d late`;
  };

  const filteredAssignments = assignments.filter((a) => {
    const s = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(s) ||
      (a.description && a.description.toLowerCase().includes(s)) ||
      (a.subjectName && a.subjectName.toLowerCase().includes(s))
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
            <ClipboardList className="w-4 h-4" />
            <span>Coursework & Deadlines</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Assignments Management</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Schedule submission windows, attach worksheets, configure upload rules, and grade student work.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Assignment</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assignments by title or instructions..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
          />
        </div>

        <select
          value={selectedSubjectFilter}
          onChange={(e) => setSelectedSubjectFilter(e.target.value)}
          className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold"
        >
          <option value="all">All Subjects ({assignments.length})</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-500">Loading assignments...</div>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Assignments Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create scheduled coursework tasks with file upload policies for enrolled students.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Assignment</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((asg) => {
            const schedBadge = getScheduleBadge(asg);
            return (
              <div
                key={asg.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Status & Schedule badges */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          asg.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {asg.status || 'published'}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${schedBadge.cls}`}
                      >
                        {schedBadge.label}
                      </span>
                    </div>

                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 shrink-0 tabular-nums">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {asg.totalSubmissions || 0} ({asg.gradedCount || 0} graded)
                      </span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {asg.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {asg.description || 'Assignment task instructions.'}
                  </p>

                  {/* Hierarchy & schedule */}
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-800 truncate">Class: {asg.subjectName}</div>
                    {asg.chapterTitle && (
                      <div className="text-slate-500 truncate">Chapter: {asg.chapterTitle}</div>
                    )}
                    <div className="pt-1 border-t border-slate-200/70 space-y-0.5 tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate">
                          Opens: {asg.start_date ? formatDateTime(asg.start_date) : 'Immediately'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="truncate">
                          Due: {asg.due_date ? formatDateTime(asg.due_date) : 'No deadline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Policy summary */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                    <span className="font-semibold text-slate-700">Max: {asg.max_marks || 100} pts</span>
                    <span>Max {asg.max_file_size_mb || 10} MB</span>
                    <span className={asg.allow_late_submission ? 'text-amber-700 font-medium' : 'text-slate-500'}>
                      {asg.allow_late_submission
                        ? `Late allowed${asg.late_penalty_percent ? ` (-${asg.late_penalty_percent}%)` : ''}`
                        : 'No late work'}
                    </span>
                  </div>

                  {asg.attachment_name && (
                    <div className="mt-2 text-[11px] text-blue-600 flex items-center gap-1.5 font-mono truncate">
                      <Paperclip className="w-3 h-3 shrink-0" />
                      {isSafeAttachmentUrl(asg.attachment_url) ? (
                        <a
                          href={asg.attachment_url}
                          download={asg.attachment_name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:underline"
                        >
                          {asg.attachment_name}
                        </a>
                      ) : (
                        <span className="truncate">{asg.attachment_name}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                  <button
                    onClick={() => handleViewSubmissions(asg)}
                    className="py-1 px-2.5 font-semibold text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Submissions & Grade</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(asg)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                      title="Edit Assignment & Schedule"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTogglePublish(asg)}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                      title="Toggle Publish / Draft"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingAssignment(asg)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Delete Assignment"
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

      {/* CREATE / EDIT ASSIGNMENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  {editingAssignment ? 'Edit Assignment & Schedule' : 'Create Scheduled Assignment'}
                </h3>
                <p className="text-xs text-slate-500">
                  Set opening & deadline timestamps, attach handouts, and define upload & late rules.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingAssignment(null);
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
                      <option value="">General Class Assignment</option>
                      {curriculumForModal?.chapters?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assignment Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Lab Exercise: Packet Analysis with Wireshark"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description & Instructions
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Detailed guidelines, deliverables, and grading rubric..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Scheduling & Marks */}
              <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-3">
                <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Submission Window & Marks</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Assignment Start Date & Time
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Assignment Start Date"
                      />
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Assignment Start Time"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Submission Deadline Date & Time
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formDueDate}
                        onChange={(e) => setFormDueDate(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Submission Deadline Date"
                      />
                      <input
                        type="time"
                        value={formDueTime}
                        onChange={(e) => setFormDueTime(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                        aria-label="Submission Deadline Time"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Maximum Marks</label>
                    <input
                      type="number"
                      value={formMaxMarks}
                      onChange={(e) => setFormMaxMarks(Math.max(1, Number(e.target.value)))}
                      min={1}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Max Upload Size (MB)</label>
                    <input
                      type="number"
                      value={formMaxFileSizeMb}
                      onChange={(e) => setFormMaxFileSizeMb(Math.max(1, Math.min(25, Number(e.target.value))))}
                      min={1}
                      max={25}
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
              </div>

              {/* Teacher Assignment Attachment Upload */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                    Assignment PDF / Reference Attachment
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.png,.jpg,.jpeg"
                    onChange={handleAttachmentUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingFile ? 'Uploading...' : 'Upload File'}</span>
                  </button>
                </div>

                {formAttachmentName && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200 text-xs">
                    <div className="min-w-0 flex items-center gap-2 text-blue-700 font-mono truncate">
                      <Paperclip className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{formAttachmentName}</span>
                      {formAttachmentSize && <span className="text-slate-400 shrink-0">({formAttachmentSize})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormAttachmentName('');
                        setFormAttachmentUrl('');
                        setFormAttachmentSize('');
                      }}
                      className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                      aria-label="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    value={formAttachmentUrl}
                    onChange={(e) => {
                      setFormAttachmentUrl(e.target.value);
                      if (!formAttachmentName && e.target.value.trim()) {
                        setFormAttachmentName('Reference Attachment');
                      }
                    }}
                    placeholder="Or paste external reference link (https://...)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Allowed File Types & Late Submission Policy */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Allowed Student Upload File Types
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLOWED_ASSIGNMENT_FILE_TYPES.map((ft) => {
                      const active = formAllowedTypes.includes(ft.ext);
                      return (
                        <button
                          key={ft.ext}
                          type="button"
                          onClick={() => toggleAllowedType(ft.ext)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {ft.ext}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Late Submission Permission
                    </label>
                    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setFormAllowLate(false)}
                        className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                          !formAllowLate ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Not Allow
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormAllowLate(true)}
                        className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                          formAllowLate ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Allow Late
                      </button>
                    </div>
                  </div>

                  {formAllowLate && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Late Submission Penalty (% optional)
                      </label>
                      <input
                        type="number"
                        value={formLatePenalty}
                        onChange={(e) => setFormLatePenalty(Math.max(0, Math.min(100, Number(e.target.value))))}
                        min={0}
                        max={100}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAssignment(null);
                  }}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingFile}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : editingAssignment
                    ? 'Save Changes'
                    : formStatus === 'draft'
                    ? 'Save Draft'
                    : 'Schedule & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SUBMISSIONS & GRADING MODAL */}
      {viewingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Student Submissions & Evaluation</h3>
                <p className="text-xs text-slate-500">
                  {viewingAssignment.title}
                  {viewingAssignment.due_date ? ` · Due ${formatDateTime(viewingAssignment.due_date)}` : ''}
                </p>
              </div>
              <button
                onClick={() => setViewingAssignment(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {loadingSubmissions ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading submissions...</div>
            ) : submissionsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                No students have submitted this assignment yet.
              </div>
            ) : (
              <div className="space-y-4">
                {submissionsList.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-2">
                          <span>{sub.student_name}</span>
                          {sub.is_late ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Late · {formatLateDuration(sub.late_by_minutes)}
                              {sub.late_penalty_percent ? ` (-${sub.late_penalty_percent}%)` : ''}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                              On Time
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Submitted: {formatDateTime(sub.submitted_at)}
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          sub.status === 'graded'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sub.status === 'graded'
                          ? `Graded: ${sub.marks}/${viewingAssignment.max_marks || 100}`
                          : 'Pending Evaluation'}
                      </span>
                    </div>

                    {sub.submission_text && (
                      <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700">
                        <span className="font-semibold text-slate-800 block mb-1">Student Notes:</span>
                        <p className="leading-relaxed whitespace-pre-wrap">{sub.submission_text}</p>
                      </div>
                    )}

                    {(sub.attachment_name || sub.attachment_url) && (
                      <div className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-blue-100">
                        <div className="flex items-center gap-1.5 text-blue-700 font-mono text-[11px] truncate">
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{sub.attachment_name || 'Student Attachment'}</span>
                          {sub.attachment_size && (
                            <span className="text-slate-400 shrink-0">({sub.attachment_size})</span>
                          )}
                        </div>
                        {isSafeAttachmentUrl(sub.attachment_url) && (
                          <a
                            href={sub.attachment_url}
                            download={sub.attachment_name || true}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </a>
                        )}
                      </div>
                    )}

                    {sub.feedback && (
                      <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 text-[11px]">
                        <span className="font-bold block">Feedback given:</span>
                        <span>{sub.feedback}</span>
                      </div>
                    )}

                    {gradingSubId === sub.id ? (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2 mt-2">
                        <div className="font-semibold text-blue-900">Grade Student Submission</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                              Marks (out of {viewingAssignment.max_marks || 100})
                            </label>
                            <input
                              type="number"
                              value={gradeMarks}
                              onChange={(e) => setGradeMarks(Number(e.target.value))}
                              min={0}
                              max={viewingAssignment.max_marks || 100}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                              Feedback
                            </label>
                            <input
                              type="text"
                              value={gradeFeedback}
                              onChange={(e) => setGradeFeedback(e.target.value)}
                              placeholder="Instructor feedback..."
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => setGradingSubId(null)}
                            className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveGrade(sub.id)}
                            disabled={savingGrade}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer"
                          >
                            {savingGrade ? 'Saving...' : 'Submit Grade'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setGradingSubId(sub.id);
                          setGradeMarks(sub.marks ?? Math.round((viewingAssignment.max_marks || 100) * 0.85));
                          setGradeFeedback(sub.feedback || 'Well structured solution.');
                        }}
                        className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>{sub.status === 'graded' ? 'Update Grade' : 'Grade Submission'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setViewingAssignment(null)}
                className="py-2 px-4 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Assignment?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingAssignment.title}"</span>?
              All student submissions for this assignment will also be removed.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeletingAssignment(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Yes, Delete Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
