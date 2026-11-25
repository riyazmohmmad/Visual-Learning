import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Users,
  Layers,
  FolderTree,
  ExternalLink,
} from 'lucide-react';
import { Subject } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  deleteFirestoreClass,
  upsertFirestoreClass,
} from '../../services/enrollmentFirestoreService';

interface Props {
  subjects: Subject[];
  onRefresh: () => void;
  onNavigate: (view: string, params?: any) => void;
  onOpenCurriculum: (subjectId: string) => void;
}

export const TeacherSubjectsTab: React.FC<Props> = ({
  subjects,
  onRefresh,
  onNavigate,
  onOpenCurriculum,
}) => {
  const { user, firebaseUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSection, setCreateSection] = useState('B21');
  const [createStatus, setCreateStatus] = useState<'active' | 'draft' | 'archived'>('active');
  const [createColor, setCreateColor] = useState('#2563EB');
  const [createThumbnail, setCreateThumbnail] = useState('subject_custom_cover');
  const [creating, setCreating] = useState(false);

  // Edit Modal State
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'draft' | 'archived'>('active');
  const [editColor, setEditColor] = useState('#2563EB');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Details Modal
  const [detailsSubject, setDetailsSubject] = useState<Subject | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCopyCode = (subject: Subject) => {
    if (!subject.class_code) return;
    navigator.clipboard.writeText(subject.class_code);
    setCopiedCodeId(subject.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createDesc.trim()) {
      showNotification('error', 'Subject name and description are required.');
      return;
    }

    try {
      setCreating(true);
      const res = await api.createSubject({
        name: createName.trim(),
        code: createCode.trim().toUpperCase() || undefined,
        description: createDesc.trim(),
        section: createSection.trim().toUpperCase() || 'B21',
        status: createStatus,
        color: createColor,
        thumbnail: createThumbnail,
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
          status: (res.subject.status as any) || 'active',
          iconName: res.subject.iconName,
          color: res.subject.color,
          thumbnail: res.subject.thumbnail,
        });
      }
      showNotification('success', `Subject "${createName}" created successfully!`);
      setIsCreateOpen(false);
      setCreateName('');
      setCreateCode('');
      setCreateDesc('');
      setCreateSection('B21');
      onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to create subject.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setEditName(subject.name);
    setEditCode(subject.code || subject.class_code?.split('-')[0] || '');
    setEditDesc(subject.description);
    setEditSection(subject.section || '');
    setEditStatus((subject.status as any) || 'active');
    setEditColor(subject.color || '#2563EB');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;

    try {
      setSavingEdit(true);
      const res = await api.updateSubject(editingSubject.id, {
        name: editName.trim(),
        code: editCode.trim().toUpperCase() || undefined,
        description: editDesc.trim(),
        section: editSection.trim().toUpperCase(),
        status: editStatus,
        color: editColor,
      });
      if (firebaseUser?.uid && res.subject && res.subject.class_code) {
        await upsertFirestoreClass({
          id: res.subject.id,
          name: res.subject.name,
          code: res.subject.code,
          description: res.subject.description,
          teacherId: res.subject.teacher_id || firebaseUser.uid,
          teacherName: res.subject.teacher_name || user?.name || 'Teacher',
          section: res.subject.section || 'B21',
          classCode: res.subject.class_code,
          status: (res.subject.status as any) || 'active',
          iconName: res.subject.iconName,
          color: res.subject.color,
          thumbnail: res.subject.thumbnail,
        });
      }
      showNotification('success', 'Subject updated successfully!');
      setEditingSubject(null);
      onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update subject.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSubject) return;

    try {
      setDeleting(true);
      await api.deleteSubject(deletingSubject.id);
      if (firebaseUser?.uid) {
        await deleteFirestoreClass(deletingSubject.id);
      }
      showNotification('success', `Subject "${deletingSubject.name}" deleted successfully.`);
      setDeletingSubject(null);
      onRefresh();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete subject.');
    } finally {
      setDeleting(false);
    }
  };

  // Filter subjects
  const filteredSubjects = subjects.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.class_code && s.class_code.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ? true : (s.status || 'active') === statusFilter;

    return matchesSearch && matchesStatus;
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
          <button onClick={() => setNotification(null)} className="font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Header & Quick Action */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>Academic Curriculum</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Subject Management</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Create, organize, and administer all accredited subjects and courses in your teaching portfolio.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Subject</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subjects by name, course code (e.g. CSE101), or class code..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
              }`}
            >
              All ({subjects.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === 'active' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('draft')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === 'draft' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === 'archived' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
              }`}
            >
              Archived
            </button>
          </div>
        </div>
      </div>

      {/* Subjects Grid */}
      {filteredSubjects.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No subjects found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No subjects match "${searchQuery}". Try a different search keyword.`
              : 'You have not added any subjects yet. Click "+ Create Subject" to get started.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Subject</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSubjects.map((subj) => {
            const subjectCode = subj.code || subj.class_code?.split('-')[0] || 'CSE101';
            const status = subj.status || 'active';

            return (
              <div
                key={subj.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar: Icon, Code & Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0"
                        style={{ backgroundColor: subj.color || '#2563EB' }}
                      >
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="inline-block text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {subjectCode}
                        </span>
                        {subj.section && (
                          <span className="ml-1.5 text-[11px] text-slate-500 font-medium">
                            Sec: {subj.section}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : status === 'draft'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  {/* Subject Name & Description */}
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {subj.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {subj.description || 'Comprehensive curriculum subject for enrolled students.'}
                  </p>

                  {/* Class Code Pill */}
                  {subj.class_code && (
                    <div className="mt-3.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Class Enrollment Code</span>
                        <span className="text-xs font-mono font-bold text-slate-800 tracking-wider">
                          {subj.class_code}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopyCode(subj)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                        title="Copy Class Code"
                      >
                        {copiedCodeId === subj.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{subj.totalStudents ?? 0} Students</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>{subj.totalChapters ?? 0} Chapters</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenCurriculum(subj.id)}
                    className="py-1.5 px-3 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>Curriculum</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDetailsSubject(subj)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(subj)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Edit Subject"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingSubject(subj)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Subject"
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

      {/* CREATE SUBJECT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create New Subject</h3>
                <p className="text-xs text-slate-500">Add a course to your curriculum hierarchy.</p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Computer Science"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    placeholder="e.g. CSE101"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono uppercase focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Class / Section / Grade
                  </label>
                  <input
                    type="text"
                    value={createSection}
                    onChange={(e) => setCreateSection(e.target.value)}
                    placeholder="e.g. B21 or Grade 10"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="e.g. Introduction to Computer Science principles, algorithms, and computational thinking."
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    <option value="active">Active (Published)</option>
                    <option value="draft">Draft (Private)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Card Theme Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    {['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0284C7'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCreateColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          createColor === c ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-80'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SUBJECT MODAL */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Subject</h3>
                <p className="text-xs text-slate-500">Update subject settings and metadata.</p>
              </div>
              <button
                onClick={() => setEditingSubject(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Code</label>
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class / Section</label>
                  <input
                    type="text"
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    <option value="active">Active (Published)</option>
                    <option value="draft">Draft (Private)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Card Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    {['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0284C7'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          editColor === c ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-80'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingSubject(null)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Subject?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingSubject.name}"</span>?
              This will safely remove its chapters, topics, subtopics, notes, quizzes, and class enrollments. This action cannot be undone.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeletingSubject(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SUBJECT DETAILS MODAL */}
      {detailsSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold"
                  style={{ backgroundColor: detailsSubject.color || '#2563EB' }}
                >
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{detailsSubject.name}</h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Code: {detailsSubject.code || detailsSubject.class_code?.split('-')[0] || 'CSE101'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailsSubject(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="font-semibold text-slate-700 block mb-0.5">Description:</span>
                <p className="text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed">
                  {detailsSubject.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Class Section</span>
                  <span className="font-semibold text-slate-800 text-sm mt-0.5 block">{detailsSubject.section || 'General'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className="font-semibold text-emerald-600 text-sm mt-0.5 block capitalize">
                    {detailsSubject.status || 'Active'}
                  </span>
                </div>
              </div>

              {detailsSubject.class_code && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-blue-600 uppercase font-bold block">Enrollment Code</span>
                    <span className="text-sm font-mono font-bold text-blue-900">{detailsSubject.class_code}</span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(detailsSubject)}
                    className="py-1 px-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    {copiedCodeId === detailsSubject.id ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => {
                  const id = detailsSubject.id;
                  setDetailsSubject(null);
                  onOpenCurriculum(id);
                }}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Open Curriculum Hierarchy</span>
              </button>

              <button
                onClick={() => setDetailsSubject(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
