import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Activity,
  Upload,
  Link2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Save,
  Send,
  Image as ImageIcon,
} from 'lucide-react';
import { Subject } from '../../types';
import { api } from '../../services/api';
import {
  CurriculumSimulation,
  CurriculumMediaStatus,
  SIMULATION_CATEGORIES,
  saveCurriculumSimulation,
  uploadTeacherMediaFile,
  validateCurriculumSimulationInput,
  isValidMediaUrl,
} from '../../services/curriculumMediaService';
import { SimulationFrame } from '../SimulationFrame';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  initialSubjectId?: string;
  initialChapterId?: string;
  initialTopicId?: string;
  editingSimulation?: CurriculumSimulation | null;
  onSaved: (simulation: CurriculumSimulation) => void;
}

interface TopicOption {
  id: string;
  label: string;
}

export const CurriculumSimulationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  subjects,
  initialSubjectId,
  initialChapterId,
  initialTopicId,
  editingSimulation,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Networking');
  const [instructions, setInstructions] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [topicId, setTopicId] = useState('');

  const [sourceMode, setSourceMode] = useState<'url' | 'upload'>('url');
  const [contentUrl, setContentUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const [chapters, setChapters] = useState<any[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbPct, setThumbPct] = useState(0);

  const [showPreview, setShowPreview] = useState(false);
  const [savingStatus, setSavingStatus] = useState<CurriculumMediaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowPreview(false);
    setUploadPct(0);
    setThumbPct(0);

    if (editingSimulation) {
      setTitle(editingSimulation.title);
      setDescription(editingSimulation.description);
      setCategory(editingSimulation.category || 'Networking');
      setInstructions(editingSimulation.instructions || '');
      setSubjectId(editingSimulation.subjectId);
      setChapterId(editingSimulation.chapterId);
      setTopicId(editingSimulation.topicId);
      setContentUrl(editingSimulation.contentUrl);
      setFileName(editingSimulation.fileName || '');
      setThumbnailUrl(editingSimulation.thumbnailUrl || '');
      setSourceMode(editingSimulation.sourceType === 'upload' ? 'upload' : 'url');
    } else {
      setTitle('');
      setDescription('');
      setCategory('Networking');
      setInstructions('');
      setSubjectId(initialSubjectId || subjects[0]?.id || '');
      setChapterId(initialChapterId || '');
      setTopicId(initialTopicId || '');
      setContentUrl('');
      setFileName('');
      setThumbnailUrl('');
      setSourceMode('url');
    }
  }, [isOpen, editingSimulation, initialSubjectId, initialChapterId, initialTopicId, subjects]);

  useEffect(() => {
    setChapters([]);
    if (!isOpen || !subjectId) {
      return;
    }

    let cancelled = false;
    setLoadingCurriculum(true);
    api
      .getCurriculum(subjectId)
      .then((res) => {
        if (cancelled) return;
        const chaps = res.chapters || [];
        setChapters(chaps);
        setChapterId((prev) => {
          if (prev && chaps.some((c: any) => c.id === prev)) return prev;
          return chaps[0]?.id || '';
        });
      })
      .catch(() => {
        if (!cancelled) {
          setChapters([]);
          setChapterId('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCurriculum(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, subjectId]);

  const topicOptions = useMemo<TopicOption[]>(() => {
    const chap = chapters.find((c: any) => c.id === chapterId);
    if (!chap) return [];

    const options: TopicOption[] = [];
    (chap.topics || []).forEach((t: any) => {
      if (t.subtopics && t.subtopics.length > 0) {
        t.subtopics.forEach((sub: any) => {
          options.push({
            id: sub.id,
            label: `${t.title} → ${sub.title}`,
          });
        });
      } else {
        options.push({
          id: t.id,
          label: `${t.title} (Topic)`,
        });
      }
    });

    (chap.unassignedSubtopics || []).forEach((sub: any) => {
      options.push({
        id: sub.id,
        label: sub.title,
      });
    });

    return options;
  }, [chapters, chapterId]);

  useEffect(() => {
    if (!isOpen) return;
    if (topicOptions.length === 0) {
      setTopicId('');
      return;
    }
    setTopicId((prev) => {
      if (prev && topicOptions.some((o) => o.id === prev)) return prev;
      return topicOptions[0].id;
    });
  }, [isOpen, topicOptions]);

  if (!isOpen) return null;

  const handleSimulationFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingFile(true);
    setUploadPct(10);
    try {
      const res = await uploadTeacherMediaFile('simulation', file, (pct) => setUploadPct(pct));
      setContentUrl(res.url);
      setFileName(res.fileName);
      if (!title.trim()) {
        const cleanTitle = res.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (cleanTitle) setTitle(cleanTitle);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload simulation file.');
      setUploadPct(0);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleThumbSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingThumb(true);
    setThumbPct(10);
    try {
      const res = await uploadTeacherMediaFile('thumbnail', file, (pct) => setThumbPct(pct));
      setThumbnailUrl(res.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload thumbnail image.');
      setThumbPct(0);
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleSave = async (targetStatus: CurriculumMediaStatus) => {
    setError(null);
    const trimmedUrl = contentUrl.trim();
    const detectedSourceType: 'url' | 'upload' =
      sourceMode === 'upload' || trimmedUrl.startsWith('/uploads/') ? 'upload' : 'url';

    const payload = {
      id: editingSimulation?.id,
      subjectId,
      chapterId,
      topicId,
      title: title.trim(),
      description: description.trim(),
      category,
      contentUrl: trimmedUrl,
      thumbnailUrl: thumbnailUrl.trim(),
      sourceType: detectedSourceType,
      fileName: fileName.trim() || undefined,
      instructions: instructions.trim(),
      status: targetStatus,
    };

    const validationErr = validateCurriculumSimulationInput(payload);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    try {
      setSavingStatus(targetStatus);
      const saved = await saveCurriculumSimulation(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      let friendly = err.message || 'Failed to save simulation.';
      try {
        const parsed = JSON.parse(friendly);
        if (parsed?.error) friendly = parsed.error;
      } catch {
        // raw message
      }
      setError(friendly);
    } finally {
      setSavingStatus(null);
    }
  };

  const canPreview = isValidMediaUrl(contentUrl);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 my-auto max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {editingSimulation ? 'Edit Interactive Simulation' : 'Add New Simulation'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Connect simulations strictly to a Subject, Chapter, and Topic so students only see relevant labs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Subject -> Chapter -> Topic Cascade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setChapterId('');
                  setTopicId('');
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
              >
                {subjects.length === 0 && <option value="">No subjects available</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Chapter <span className="text-red-500">*</span>
              </label>
              <select
                value={chapterId}
                onChange={(e) => {
                  setChapterId(e.target.value);
                  setTopicId('');
                }}
                disabled={loadingCurriculum || chapters.length === 0}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 disabled:opacity-60"
              >
                {chapters.length === 0 ? (
                  <option value="">
                    {loadingCurriculum ? 'Loading...' : 'Create a chapter first'}
                  </option>
                ) : (
                  chapters.map((c: any, idx: number) => (
                    <option key={c.id} value={c.id}>
                      Ch {idx + 1}: {c.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Topic / Subtopic <span className="text-red-500">*</span>
              </label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={topicOptions.length === 0}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 disabled:opacity-60"
              >
                {topicOptions.length === 0 ? (
                  <option value="">Create a topic/subtopic first</option>
                ) : (
                  topicOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="block font-semibold text-slate-700 mb-1">
                Simulation Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Packet Routing & Firewall Simulation"
                maxLength={200}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block font-semibold text-slate-700 mb-1">Domain / Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              >
                {SIMULATION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Short Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what concept this interactive simulation demonstrates (e.g. RSA encryption handshake, CPU scheduling, cloud VPC architecture)..."
              maxLength={2000}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Simulation Source Toggle */}
          <div className="space-y-3">
            <label className="block font-semibold text-slate-700">
              Simulation Content <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSourceMode('url')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sourceMode === 'url'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Simulation URL</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Interactive File</span>
              </button>
            </div>

            {sourceMode === 'url' ? (
              <div className="space-y-1.5">
                <input
                  type="url"
                  value={contentUrl}
                  onChange={(e) => setContentUrl(e.target.value)}
                  placeholder="https://... (e.g. PhET, Desmos, GeoGebra, interactive lab URL)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
                <p className="text-[11px] text-slate-500">
                  Enter an HTTPS link to an embeddable interactive simulation or visualization tool.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">
                      Upload Interactive HTML (.html/.htm), SVG, or PDF
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Upload self-contained HTML5/JS simulations (e.g. algorithms, networking, cryptography demos). Max 50 MB.
                    </div>
                  </div>
                  <label className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingFile ? 'Uploading...' : 'Choose File'}</span>
                    <input
                      type="file"
                      accept=".html,.htm,.svg,.pdf,text/html,image/svg+xml,application/pdf"
                      onChange={handleSimulationFileSelect}
                      disabled={uploadingFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadingFile && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-blue-700">
                      <span>Uploading simulation file...</span>
                      <span>{uploadPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {contentUrl && contentUrl.startsWith('/uploads/') && !uploadingFile && (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Uploaded: {fileName || contentUrl}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Instructions & Optional Thumbnail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Student Exploration Guide (Optional)
              </label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Step-by-step instructions or questions for students..."
                maxLength={2000}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Thumbnail URL (Optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://... or upload"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
                <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingThumb ? `${thumbPct}%` : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleThumbSelect}
                    disabled={uploadingThumb}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          {canPreview && (
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? 'Hide Live Preview' : 'Preview Simulation Before Publishing'}</span>
              </button>

              {showPreview && (
                <SimulationFrame
                  compact
                  simulation={{
                    id: editingSimulation?.id || 'preview',
                    teacherId: 'preview',
                    subjectId,
                    chapterId,
                    topicId,
                    title: title || 'Simulation Preview',
                    description: description || '',
                    category,
                    contentUrl: contentUrl.trim(),
                    thumbnailUrl: thumbnailUrl.trim() || undefined,
                    sourceType: sourceMode,
                    instructions,
                    status: 'draft',
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={savingStatus !== null}
            className="py-2 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={savingStatus !== null || uploadingFile || uploadingThumb}
              className="py-2 px-4 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingStatus === 'draft' ? 'Saving Draft...' : 'Save as Draft'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={savingStatus !== null || uploadingFile || uploadingThumb}
              className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{savingStatus === 'published' ? 'Publishing...' : 'Publish Simulation'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
