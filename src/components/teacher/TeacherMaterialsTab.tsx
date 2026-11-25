import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Video,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Upload,
  Calendar,
  Layers,
  FolderTree,
  ExternalLink,
  BookOpen,
  Filter,
  RefreshCw,
  Paperclip,
  UploadCloud,
} from 'lucide-react';
import { Subject, MaterialItem } from '../../types';
import { api } from '../../services/api';
import { PdfViewerModal } from '../PdfViewerModal';

interface Props {
  subjects: Subject[];
  onNavigate: (view: string, params?: any) => void;
}

export const TeacherMaterialsTab: React.FC<Props> = ({ subjects, onNavigate }) => {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'notes' | 'video'>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Upload / Create Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'notes' | 'video'>('notes');
  const [formSubjectId, setFormSubjectId] = useState<string>(subjects[0]?.id || '');
  const [formChapterId, setFormChapterId] = useState<string>('');
  const [formTopicId, setFormTopicId] = useState<string>('');
  const [formSubtopicId, setFormSubtopicId] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formFileName, setFormFileName] = useState<string>('');
  const [formFileSize, setFormFileSize] = useState<string>('2.5 MB');
  const [formVideoUrl, setFormVideoUrl] = useState<string>('');
  const [formDuration, setFormDuration] = useState<number>(360);
  const [formStatus, setFormStatus] = useState<'published' | 'draft'>('published');
  const [formPagesText, setFormPagesText] = useState<string>('');
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Dynamic hierarchy data for the modal
  const [curriculumForModal, setCurriculumForModal] = useState<any>(null);

  // Edit Modal
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editFileName, setEditFileName] = useState<string>('');
  const [editVideoUrl, setEditVideoUrl] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'published' | 'draft'>('published');
  const [replaceUploadFile, setReplaceUploadFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Preview Modal
  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);

  // Delete State
  const [deletingMaterial, setDeletingMaterial] = useState<MaterialItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const materialsReqRef = useRef(0);

  const fetchMaterials = async (subjectFilter = selectedSubjectFilter) => {
    const reqId = ++materialsReqRef.current;
    try {
      setLoading(true);
      const res = await api.getMaterials(
        subjectFilter !== 'all' ? { subject_id: subjectFilter } : undefined
      );
      if (reqId !== materialsReqRef.current) return;
      setMaterials(res.materials || []);
    } catch (err: any) {
      if (reqId !== materialsReqRef.current) return;
      setMaterials([]);
      showNotification('error', err.message || 'Failed to fetch materials.');
    } finally {
      if (reqId === materialsReqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setMaterials([]);
    fetchMaterials(selectedSubjectFilter);
  }, [selectedSubjectFilter]);

  // Load chapters & topics when subject changes in upload modal (reset immediately to prevent cross-class links)
  useEffect(() => {
    let cancelled = false;
    setCurriculumForModal(null);
    setFormChapterId('');
    setFormTopicId('');
    setFormSubtopicId('');

    if (!formSubjectId) return;

    api
      .getCurriculum(formSubjectId)
      .then((data) => {
        if (cancelled) return;
        setCurriculumForModal(data);
        const firstChap = data.chapters?.[0];
        setFormChapterId(firstChap?.id || '');
        const firstTop = firstChap?.topics?.[0];
        setFormTopicId(firstTop?.id || '');
        const firstSub = firstTop?.subtopics?.[0] || firstChap?.unassignedSubtopics?.[0];
        setFormSubtopicId(firstSub?.id || '');
      })
      .catch(() => {
        if (!cancelled) {
          setCurriculumForModal(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [formSubjectId]);

  // When chapter changes in upload modal, update topics and subtopics
  const handleChapterChange = (chapterId: string) => {
    setFormChapterId(chapterId);
    const chap = curriculumForModal?.chapters?.find((c: any) => c.id === chapterId);
    const firstTop = chap?.topics?.[0];
    setFormTopicId(firstTop?.id || '');
    const firstSub = firstTop?.subtopics?.[0] || chap?.unassignedSubtopics?.[0];
    setFormSubtopicId(firstSub?.id || '');
  };

  // When topic changes in upload modal, update subtopics
  const handleTopicChange = (topicId: string) => {
    setFormTopicId(topicId);
    const chap = curriculumForModal?.chapters?.find((c: any) => c.id === formChapterId);
    const top = chap?.topics?.find((t: any) => t.id === topicId);
    const firstSub = top?.subtopics?.[0];
    setFormSubtopicId(firstSub?.id || '');
  };

  const handleOpenUpload = (type: 'notes' | 'video') => {
    setUploadType(type);
    setFormTitle('');
    setFormDesc('');
    setSelectedUploadFile(null);
    setFormFileName(type === 'notes' ? 'Curriculum_Lesson_Notes.pdf' : '');
    setFormVideoUrl('');
    setFormPagesText('');
    setFormStatus('published');
    if (selectedSubjectFilter !== 'all' && subjects.some((s) => s.id === selectedSubjectFilter)) {
      setFormSubjectId(selectedSubjectFilter);
    } else if ((!formSubjectId || !subjects.some((s) => s.id === formSubjectId)) && subjects.length > 0) {
      setFormSubjectId(subjects[0].id);
    }
    setIsUploadOpen(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubjectId || !formTitle.trim()) {
      showNotification('error', 'Subject and title are required.');
      return;
    }

    try {
      setSubmitting(true);

      if (uploadType === 'notes' && selectedUploadFile) {
        // REAL PDF FILE UPLOAD (Requirements #6, #7, #8, #9)
        const formData = new FormData();
        formData.append('file', selectedUploadFile);
        formData.append('subject_id', formSubjectId);
        if (formChapterId) formData.append('chapter_id', formChapterId);
        if (formTopicId) formData.append('topic_id', formTopicId);
        if (formSubtopicId) formData.append('subtopic_id', formSubtopicId);
        formData.append('title', formTitle.trim());
        if (formDesc) formData.append('description', formDesc.trim());
        formData.append('status', formStatus);

        await api.uploadMaterialFile(formData);
      } else {
        const pages = formPagesText
          ? formPagesText.split('\n\n').map((para, i) => ({
              pageNumber: i + 1,
              title: `Page ${i + 1}: ${formTitle}`,
              content: [para.trim()],
            }))
          : undefined;

        await api.createMaterial({
          subject_id: formSubjectId,
          chapter_id: formChapterId || undefined,
          topic_id: formTopicId || undefined,
          subtopic_id: formSubtopicId || undefined,
          type: uploadType,
          title: formTitle.trim(),
          description: formDesc.trim() || undefined,
          file_name: uploadType === 'notes' ? formFileName.trim() : undefined,
          file_size: uploadType === 'notes' ? formFileSize : undefined,
          pages_content: pages,
          video_url: uploadType === 'video' ? formVideoUrl.trim() : undefined,
          duration_seconds: uploadType === 'video' ? formDuration : undefined,
          status: formStatus,
        });
      }

      showNotification('success', `${uploadType === 'notes' ? 'Notes' : 'Video'} uploaded successfully!`);
      setIsUploadOpen(false);
      setSelectedUploadFile(null);
      fetchMaterials();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to upload material.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (material: MaterialItem) => {
    setEditingMaterial(material);
    setEditTitle(material.title);
    setEditDesc(material.description || '');
    setEditFileName(material.file_name || '');
    setEditVideoUrl(material.video_url || '');
    setEditStatus((material.status as any) || 'published');
    setReplaceUploadFile(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    try {
      setSavingEdit(true);
      if (editingMaterial.type === 'notes' && replaceUploadFile) {
        // REPLACE PDF FILE (Requirement #10)
        const formData = new FormData();
        formData.append('file', replaceUploadFile);
        formData.append('title', editTitle.trim());
        if (editDesc) formData.append('description', editDesc.trim());
        formData.append('status', editStatus);

        await api.replaceMaterialFile(editingMaterial.id, formData);
        showNotification('success', 'PDF material file replaced successfully!');
      } else {
        await api.updateMaterial(editingMaterial.id, {
          title: editTitle.trim(),
          description: editDesc.trim(),
          file_name: editingMaterial.type === 'notes' ? editFileName.trim() : undefined,
          video_url: editingMaterial.type === 'video' ? editVideoUrl.trim() : undefined,
          status: editStatus,
        });
        showNotification('success', 'Material updated successfully!');
      }
      setEditingMaterial(null);
      setReplaceUploadFile(null);
      fetchMaterials();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to update material.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingMaterial) return;

    try {
      setDeleting(true);
      await api.deleteMaterial(deletingMaterial.id);
      showNotification('success', 'Material deleted successfully.');
      setDeletingMaterial(null);
      fetchMaterials();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete material.');
    } finally {
      setDeleting(false);
    }
  };

  // Filter materials
  const filteredMaterials = materials.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q)) ||
      (m.file_name && m.file_name.toLowerCase().includes(q));

    const matchesType = typeFilter === 'all' ? true : m.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const selectedChapObj = curriculumForModal?.chapters?.find(
    (c: any) => c.id === formChapterId
  );

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

      {/* Header & Quick Actions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
            <FolderTree className="w-4 h-4" />
            <span>Curriculum Learning Resources</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Materials Management</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Organize verified study notes and video lectures linked to Subject → Chapter → Topic → Subtopic.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => handleOpenUpload('notes')}
            className="py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>+ Upload Notes</span>
          </button>

          <button
            onClick={() => handleOpenUpload('video')}
            className="py-2.5 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Video className="w-4 h-4" />
            <span>+ Add Video</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search materials by title, keyword, or document name..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Subject Dropdown Filter */}
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({materials.length})
            </button>
            <button
              onClick={() => setTypeFilter('notes')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                typeFilter === 'notes'
                  ? 'bg-white text-blue-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📄 Notes</span>
            </button>
            <button
              onClick={() => setTypeFilter('video')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                typeFilter === 'video'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>▶ Video</span>
            </button>
          </div>
        </div>
      </div>

      {/* Materials List */}
      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-500">Loading learning materials...</div>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No materials found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No resources match "${searchQuery}".`
              : 'Add study notes or video walkthroughs for your curriculum chapters and topics.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => handleOpenUpload('notes')}
              className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs cursor-pointer"
            >
              + Upload Notes
            </button>
            <button
              onClick={() => handleOpenUpload('video')}
              className="py-2 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer"
            >
              + Add Video
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((mat: any) => {
            const isNote = mat.type === 'notes';
            const uploadDate = mat.created_at ? new Date(mat.created_at).toLocaleDateString() : 'Recent';

            return (
              <div
                key={mat.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar: Type Tag & Status */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isNote
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {isNote ? <FileText className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                      <span>{isNote ? '📄 Notes' : '▶ Video'}</span>
                    </span>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        mat.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {mat.status || 'published'}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {mat.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {mat.description || 'Curriculum resource material compiled for enrolled students.'}
                  </p>

                  {/* Hierarchy Connection Breadcrumb */}
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                      <BookOpen className="w-3 h-3 text-blue-600 shrink-0" />
                      <span className="truncate">{mat.subjectName || 'Subject'}</span>
                    </div>
                    {mat.chapterTitle && (
                      <div className="flex items-center gap-1.5 pl-2 text-slate-500 truncate">
                        <span className="text-slate-400">↳</span>
                        <span className="truncate">{mat.chapterTitle}</span>
                      </div>
                    )}
                    {mat.topicTitle && (
                      <div className="flex items-center gap-1.5 pl-4 text-slate-500 truncate">
                        <span className="text-slate-400">↳</span>
                        <span className="truncate">{mat.topicTitle}</span>
                      </div>
                    )}
                    {mat.subtopicTitle && (
                      <div className="flex items-center gap-1.5 pl-6 text-emerald-700 font-medium truncate">
                        <span className="text-slate-400">↳</span>
                        <span className="truncate">{mat.subtopicTitle}</span>
                      </div>
                    )}
                  </div>

                  {/* Meta info: Date & Size / Duration */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{uploadDate}</span>
                    </span>
                    <span>
                      {isNote ? mat.file_size || '2.4 MB' : `${Math.round((mat.duration_seconds || 300) / 60)} mins`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setPreviewMaterial(mat)}
                    className="py-1.5 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View / Preview</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(mat)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Edit / Replace Material"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingMaterial(mat)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Material"
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

      {/* UPLOAD MATERIAL MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {uploadType === 'notes' ? 'Upload Notes (PDF / Documents)' : 'Add Video Lecture'}
                </h3>
                <p className="text-xs text-slate-500">
                  Link material to the curriculum hierarchy level.
                </p>
              </div>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setUploadType('notes')}
                  className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    uploadType === 'notes' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>📄 Notes (PDF / Doc)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadType('video')}
                  className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    uploadType === 'video' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>▶ Video Lecture</span>
                </button>
              </div>

              {/* HIERARCHY SELECTORS */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                  <span>Curriculum Connection</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formSubjectId}
                      onChange={(e) => setFormSubjectId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code || s.section})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Chapter</label>
                    <select
                      value={formChapterId}
                      onChange={(e) => handleChapterChange(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      <option value="">General (Subject Level)</option>
                      {curriculumForModal?.chapters?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formChapterId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Topic</label>
                      <select
                        value={formTopicId}
                        onChange={(e) => handleTopicChange(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                      >
                        <option value="">General (Chapter Level)</option>
                        {selectedChapObj?.topics?.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Subtopic</label>
                      <select
                        value={formSubtopicId}
                        onChange={(e) => setFormSubtopicId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                      >
                        <option value="">None / Not specific</option>
                        {/* If topic selected, show its subtopics */}
                        {formTopicId &&
                          selectedChapObj?.topics
                            ?.find((t: any) => t.id === formTopicId)
                            ?.subtopics?.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                        {/* Direct subtopics */}
                        {selectedChapObj?.unassignedSubtopics?.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.title} (Direct)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Material Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={
                    uploadType === 'notes'
                      ? 'e.g. Firewall Architecture & Implementation Notes'
                      : 'e.g. Introduction to Network Firewalls Walkthrough'
                  }
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Summary</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Summary of concepts explained in this resource..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* TYPE-SPECIFIC FIELDS */}
              {uploadType === 'notes' ? (
                <div className="space-y-3">
                  {/* REAL PDF UPLOAD ZONE (Requirement #5 & #6) */}
                  <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      id="teacher-notes-file-upload"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 25 * 1024 * 1024) {
                            showNotification('error', 'File size exceeds 25 MB limit.');
                            return;
                          }
                          setSelectedUploadFile(file);
                          setFormFileName(file.name);
                          if (!formTitle) {
                            setFormTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '));
                          }
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="teacher-notes-file-upload"
                      className="cursor-pointer flex flex-col items-center justify-center gap-2"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-blue-600 hover:text-blue-700">
                          Click to upload PDF Document
                        </span>
                        <span className="text-xs text-slate-500"> or drag and drop</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          PDF files only (Max file size: 25 MB)
                        </p>
                      </div>
                    </label>

                    {selectedUploadFile && (
                      <div className="mt-3 p-2.5 bg-white border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-slate-800 font-semibold truncate">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="truncate">{selectedUploadFile.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono font-normal">
                            ({(selectedUploadFile.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedUploadFile(null)}
                          className="text-red-500 hover:text-red-700 text-xs font-bold px-1.5 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Notes Text / Summary (Optional excerpt or highlights)
                    </label>
                    <textarea
                      rows={3}
                      value={formPagesText}
                      onChange={(e) => setFormPagesText(e.target.value)}
                      placeholder="Optional chapter highlights or key points to accompany the PDF..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Video URL (MP4 / YouTube / Embed Link)
                    </label>
                    <input
                      type="url"
                      value={formVideoUrl}
                      onChange={(e) => setFormVideoUrl(e.target.value)}
                      placeholder="https://..."
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Seconds)</label>
                      <input
                        type="number"
                        value={formDuration}
                        onChange={(e) => setFormDuration(Number(e.target.value))}
                        min={30}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      >
                        <option value="published">Published (Visible to Enrolled Students)</option>
                        <option value="draft">Draft (Private to Instructor)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Uploading...' : uploadType === 'notes' ? 'Upload Notes' : 'Save Video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / REPLACE MATERIAL MODAL */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Edit / Replace {editingMaterial.type === 'notes' ? 'Notes' : 'Video'}
              </h3>
              <button
                onClick={() => setEditingMaterial(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>

              {editingMaterial.type === 'notes' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Current Document File
                    </label>
                    <input
                      type="text"
                      value={editFileName}
                      onChange={(e) => setEditFileName(e.target.value)}
                      placeholder="Study_Notes.pdf"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Upload Replacement PDF File (Optional)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 25 * 1024 * 1024) {
                            showNotification('error', 'File size exceeds 25 MB limit.');
                            return;
                          }
                          setReplaceUploadFile(file);
                          setEditFileName(file.name);
                        }
                      }}
                      className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                    {replaceUploadFile && (
                      <p className="text-[11px] text-emerald-600 font-medium mt-1">
                        New file selected: {replaceUploadFile.name} ({(replaceUploadFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Replace Video URL
                  </label>
                  <input
                    type="url"
                    value={editVideoUrl}
                    onChange={(e) => setEditVideoUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Visibility Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                >
                  <option value="published">Published (Visible to Enrolled Students)</option>
                  <option value="draft">Draft (Private)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
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

      {/* VIEW / PREVIEW MODALS (Requirement #5 & #6) */}
      {previewMaterial && previewMaterial.type === 'notes' && (
        <PdfViewerModal
          isOpen={!!previewMaterial}
          onClose={() => setPreviewMaterial(null)}
          title={previewMaterial.title}
          fileUrl={previewMaterial.file_url}
          fileName={previewMaterial.file_name}
          teacherName={previewMaterial.teacher_name}
          fileSize={previewMaterial.file_size}
          pagesCount={previewMaterial.pages_count || 1}
          pagesContent={previewMaterial.pages_content}
          downloadUrl={previewMaterial.file_url}
        />
      )}

      {previewMaterial && previewMaterial.type === 'video' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full p-4 sm:p-6 pb-safe-lg shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                  ▶ Video Lecture
                </span>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {previewMaterial.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewMaterial(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {previewMaterial.description && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-semibold text-slate-700 block mb-1">Description:</span>
                  <p className="text-slate-600 leading-relaxed">
                    {previewMaterial.description}
                  </p>
                </div>
              )}

              <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                {previewMaterial.video_url && previewMaterial.video_url.trim() ? (
                  previewMaterial.video_url.includes('youtube.com') || previewMaterial.video_url.includes('youtu.be') ? (
                    <iframe
                      src={
                        previewMaterial.video_url.includes('/embed/')
                          ? previewMaterial.video_url
                          : previewMaterial.video_url.includes('youtu.be/')
                          ? `https://www.youtube.com/embed/${previewMaterial.video_url.split('youtu.be/')[1]?.split('?')[0]}`
                          : `https://www.youtube.com/embed/${new URL(previewMaterial.video_url).searchParams.get('v') || ''}`
                      }
                      title={previewMaterial.title}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      controls
                      preload="metadata"
                      playsInline
                      src={previewMaterial.video_url}
                      className="w-full h-full object-contain"
                    />
                  )
                ) : (
                  <div className="text-slate-400">Video source unavailable</div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setPreviewMaterial(null)}
                className="py-2 px-5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Material?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingMaterial.title}"</span>?
              Students will no longer be able to access this resource.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeletingMaterial(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
