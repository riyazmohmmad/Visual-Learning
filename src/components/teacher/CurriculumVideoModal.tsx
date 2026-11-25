import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Video,
  Upload,
  Link2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Save,
  Send,
  Sparkles,
} from 'lucide-react';
import { Subject } from '../../types';
import { api } from '../../services/api';
import {
  CurriculumVideo,
  CurriculumMediaStatus,
  saveCurriculumVideo,
  uploadTeacherMediaFile,
  validateCurriculumVideoInput,
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  isValidMediaUrl,
} from '../../services/curriculumMediaService';
import { VideoPlayer } from '../VideoPlayer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  initialSubjectId?: string;
  initialChapterId?: string;
  initialTopicId?: string;
  editingVideo?: CurriculumVideo | null;
  onSaved: (video: CurriculumVideo) => void;
}

interface TopicOption {
  id: string;
  label: string;
  group?: string;
}

export const CurriculumVideoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  subjects,
  initialSubjectId,
  initialChapterId,
  initialTopicId,
  editingVideo,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [topicId, setTopicId] = useState('');

  const [sourceMode, setSourceMode] = useState<'url' | 'upload'>('url');
  const [contentUrl, setContentUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(0);

  const [chapters, setChapters] = useState<any[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadPct, setVideoUploadPct] = useState(0);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbUploadPct, setThumbUploadPct] = useState(0);

  const [showPreview, setShowPreview] = useState(false);
  const [savingStatus, setSavingStatus] = useState<CurriculumMediaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowPreview(false);
    setVideoUploadPct(0);
    setThumbUploadPct(0);

    if (editingVideo) {
      setTitle(editingVideo.title);
      setDescription(editingVideo.description);
      setSubjectId(editingVideo.subjectId);
      setChapterId(editingVideo.chapterId);
      setTopicId(editingVideo.topicId);
      setContentUrl(editingVideo.contentUrl);
      setFileName(editingVideo.fileName || '');
      setThumbnailUrl(editingVideo.thumbnailUrl || '');
      setDurationSeconds(editingVideo.durationSeconds || 0);
      setSourceMode(editingVideo.sourceType === 'upload' ? 'upload' : 'url');
    } else {
      setTitle('');
      setDescription('');
      setSubjectId(initialSubjectId || subjects[0]?.id || '');
      setChapterId(initialChapterId || '');
      setTopicId(initialTopicId || '');
      setContentUrl('');
      setFileName('');
      setThumbnailUrl('');
      setDurationSeconds(0);
      setSourceMode('url');
    }
  }, [isOpen, editingVideo, initialSubjectId, initialChapterId, initialTopicId, subjects]);

  // Load chapters/topics whenever subjectId changes
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

        // Preserve pre-selected chapter if it belongs to this subject, otherwise default to first chapter
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
            group: t.title,
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

  // Keep topicId synced with available topicOptions
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

  // Auto-populate YouTube thumbnail when teacher pastes a YouTube URL and no thumbnail is set
  useEffect(() => {
    if (sourceMode === 'url' && contentUrl && !thumbnailUrl) {
      const ytThumb = getYouTubeThumbnailUrl(contentUrl);
      if (ytThumb) setThumbnailUrl(ytThumb);
    }
  }, [contentUrl, sourceMode]);

  if (!isOpen) return null;

  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingVideo(true);
    setVideoUploadPct(5);
    try {
      const res = await uploadTeacherMediaFile('video', file, (pct) => setVideoUploadPct(pct));
      setContentUrl(res.url);
      setFileName(res.fileName);
      if (!title.trim()) {
        const cleanTitle = res.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (cleanTitle) setTitle(cleanTitle);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload video file.');
      setVideoUploadPct(0);
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleThumbFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingThumb(true);
    setThumbUploadPct(10);
    try {
      const res = await uploadTeacherMediaFile('thumbnail', file, (pct) => setThumbUploadPct(pct));
      setThumbnailUrl(res.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload thumbnail image.');
      setThumbUploadPct(0);
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleSave = async (targetStatus: CurriculumMediaStatus) => {
    setError(null);
    const trimmedUrl = contentUrl.trim();
    const detectedSourceType: 'url' | 'youtube' | 'upload' =
      sourceMode === 'upload' || trimmedUrl.startsWith('/uploads/')
        ? 'upload'
        : extractYouTubeId(trimmedUrl)
          ? 'youtube'
          : 'url';

    const payload = {
      id: editingVideo?.id,
      subjectId,
      chapterId,
      topicId,
      title: title.trim(),
      description: description.trim(),
      contentUrl: trimmedUrl,
      thumbnailUrl: thumbnailUrl.trim(),
      sourceType: detectedSourceType,
      fileName: fileName.trim() || undefined,
      durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
      status: targetStatus,
    };

    const validationErr = validateCurriculumVideoInput(payload);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    try {
      setSavingStatus(targetStatus);
      const saved = await saveCurriculumVideo(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      let friendly = err.message || 'Failed to save video.';
      try {
        const parsed = JSON.parse(friendly);
        if (parsed?.error) friendly = parsed.error;
      } catch {
        // use raw message
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
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {editingVideo ? 'Edit Curriculum Video' : 'Add Video to Curriculum'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Published videos appear automatically under "2. Watch Video" for the selected topic.
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

          {/* Title & Description */}
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Video Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. TCP Three-Way Handshake Explained"
                maxLength={200}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary of what students will learn in this video..."
                maxLength={2000}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Source Mode Switcher */}
          <div className="space-y-3">
            <label className="block font-semibold text-slate-700">
              Video Source <span className="text-red-500">*</span>
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
                <span>Video URL / YouTube</span>
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
                <span>Upload Video File</span>
              </button>
            </div>

            {sourceMode === 'url' ? (
              <div className="space-y-1.5">
                <input
                  type="url"
                  value={contentUrl}
                  onChange={(e) => setContentUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://.../lecture.mp4"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
                <p className="text-[11px] text-slate-500">
                  Supports YouTube links (watch, youtu.be, embed) and direct HTTPS MP4 / WebM video links.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">Upload MP4, WebM, OGG, or MOV</div>
                    <div className="text-[11px] text-slate-500">
                      Files are stored in media storage; only metadata & URL are saved to Firestore (max 200 MB).
                    </div>
                  </div>
                  <label className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingVideo ? 'Uploading...' : 'Choose Video'}</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.mov,.m4v"
                      onChange={handleVideoFileSelect}
                      disabled={uploadingVideo}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadingVideo && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-blue-700">
                      <span>Uploading video...</span>
                      <span>{videoUploadPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${videoUploadPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {contentUrl && contentUrl.startsWith('/uploads/') && !uploadingVideo && (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Uploaded: {fileName || contentUrl}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Thumbnail */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            <div className="sm:col-span-8 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Thumbnail Image (Optional)</span>
                </label>
                {extractYouTubeId(contentUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      const yt = getYouTubeThumbnailUrl(contentUrl);
                      if (yt) setThumbnailUrl(yt);
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    Use YouTube Thumbnail
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://... or upload an image"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
                <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingThumb ? `${thumbUploadPct}%` : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleThumbFileSelect}
                    disabled={uploadingThumb}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="sm:col-span-4">
              {thumbnailUrl && isValidMediaUrl(thumbnailUrl) ? (
                <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400">
                  No thumbnail
                </div>
              )}
            </div>
          </div>

          {/* Preview Toggle & Player */}
          {canPreview && (
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? 'Hide Video Preview' : 'Preview Video Before Publishing'}</span>
              </button>

              {showPreview && (
                <VideoPlayer
                  subtopicId={topicId || 'preview'}
                  video={{
                    title: title || 'Video Preview',
                    video_url: contentUrl,
                    video_type: extractYouTubeId(contentUrl) ? 'youtube' : 'embedded',
                    duration_seconds: durationSeconds || 0,
                    description: description || '',
                  }}
                  poster={thumbnailUrl || undefined}
                  previewMode
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
              disabled={savingStatus !== null || uploadingVideo || uploadingThumb}
              className="py-2 px-4 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingStatus === 'draft' ? 'Saving Draft...' : 'Save as Draft'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={savingStatus !== null || uploadingVideo || uploadingThumb}
              className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{savingStatus === 'published' ? 'Publishing...' : 'Publish Video'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
