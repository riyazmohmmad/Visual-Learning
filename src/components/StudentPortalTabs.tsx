import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Calendar,
  Clock,
  ArrowRight,
  FileText,
  Video,
  Award,
  ClipboardList,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  Send,
  X,
  Lock,
  Loader2,
  Upload,
  Download,
  Paperclip,
  User,
} from 'lucide-react';
import { Subject, MaterialItem, QuizAttempt } from '../types';
import { api } from '../services/api';
import { CurriculumVideo, listPublishedVideosForSubjects } from '../services/curriculumMediaService';
import { VideoPlayer } from './VideoPlayer';
import { QuizRunner } from './QuizRunner';
import {
  ScheduleCategory,
  DEFAULT_ALLOWED_FILE_TYPES,
  evaluateQuizSchedule,
  evaluateAssignmentSchedule,
  formatDateTime,
  isSafeAttachmentUrl,
  useServerNow,
} from '../utils/scheduleUtils';

interface CommonTabProps {
  enrolledSubjects: Subject[];
  onNavigate: (view: string, params?: any) => void;
}

/* ============================================================
   1. LIVE CLASSES TAB
============================================================ */
export const StudentLiveClassesTab: React.FC<CommonTabProps> = ({ enrolledSubjects, onNavigate }) => {
  const [liveClasses, setLiveClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getLiveClasses()
      .then((res) => {
        if (!active) return;
        setLiveClasses(res.liveClasses || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Unable to load live classes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Merge active sessions from enrolledSubjects + /classes/live/all
  const activeFromSubjects = enrolledSubjects
    .filter((s) => s.live_session?.is_active)
    .map((s) => ({
      id: s.live_session?.id || `live_${s.id}`,
      class_id: s.id,
      subject_id: s.id,
      subject_name: s.name,
      title: s.live_session?.session_title || `${s.name} Live Session`,
      teacher_name: s.teacher_name || 'Course Instructor',
      status: 'live',
    }));

  const liveNowMap = new Map<string, any>();
  activeFromSubjects.forEach((item) => liveNowMap.set(item.class_id, item));
  liveClasses
    .filter((lc) => lc.status === 'live')
    .forEach((lc) => {
      const key = lc.class_id || lc.subject_id || lc.id;
      if (!liveNowMap.has(key)) liveNowMap.set(key, lc);
    });

  const liveNow = Array.from(liveNowMap.values());
  const scheduled = liveClasses.filter((lc) => lc.status === 'scheduled');

  if (loading) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center text-xs text-slate-500">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
        Loading live class schedule...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="type-label text-blue-600 uppercase tracking-wider flex items-center gap-2">
          <Radio className="w-4 h-4" />
          <span>Live Classroom Hub</span>
        </div>
        <h2 className="type-section-title text-slate-900 mt-1">Active & Upcoming Live Sessions</h2>
        <p className="type-helper text-slate-500 mt-0.5">
          Join real-time interactive classes with camera, microphone, screen sharing, and class chat.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Now */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>Live Now ({liveNow.length})</span>
        </h3>

        {liveNow.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-xs text-slate-500">
            No live classes are broadcasting right now. Check your upcoming schedule below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveNow.map((session) => (
              <div
                key={session.id}
                className="bg-white border border-red-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="text-[11px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5" />
                    <span>Live Broadcast</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mt-1">{session.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {session.subject_name || 'Enrolled Class'} · {session.teacher_name || 'Instructor'}
                  </p>
                </div>

                <button
                  onClick={() =>
                    onNavigate('live_classroom', {
                      classId: session.class_id || session.subject_id,
                      sessionId: session.id,
                      sessionTitle: session.title,
                    })
                  }
                  className="w-full py-2.5 px-4 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <span>Join Live Class</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled Sessions */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span>Upcoming Schedule ({scheduled.length})</span>
        </h3>

        {scheduled.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-2">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-800">No upcoming sessions scheduled</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When your instructors schedule a live lecture for your enrolled classes, it will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduled.map((lc) => (
              <div
                key={lc.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-blue-600">{lc.subject_name || 'Course Session'}</div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-900">{lc.title}</h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 tabular-nums">
                    {lc.scheduled_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {lc.scheduled_date}
                      </span>
                    )}
                    {lc.start_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {lc.start_time}
                        {lc.end_time ? ` – ${lc.end_time}` : ''}
                      </span>
                    )}
                    {lc.teacher_name && <span>Instructor: {lc.teacher_name}</span>}
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('subject_detail', { id: lc.class_id || lc.subject_id })}
                  className="px-4 py-2 min-h-[40px] bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
                >
                  Open Class
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

/* ============================================================
   2. NOTES & PDFs LIBRARY TAB
============================================================ */
export const StudentNotesLibraryTab: React.FC<
  CommonTabProps & { onOpenSecurePdf: (materialId: string) => void }
> = ({ enrolledSubjects, onNavigate, onOpenSecurePdf }) => {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getMaterials()
      .then((res) => {
        if (!active) return;
        const docs = (res.materials || []).filter(
          (m) => (m.type === 'notes' || m.type === 'document') && m.status !== 'draft'
        );
        setMaterials(docs);
      })
      .catch(() => {
        if (active) setMaterials([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const subjectMap = new Map(enrolledSubjects.map((s) => [s.id, s.name]));

  const filtered = materials.filter((m) => {
    if (subjectFilter !== 'all' && m.subject_id !== subjectFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.file_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="type-label text-blue-600 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Study Materials</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Course Notes & PDF Library</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Access watermark-protected lecture notes and reference PDFs published by your instructors.
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-600 tabular-nums">
          {filtered.length} {filtered.length === 1 ? 'Document' : 'Documents'}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes by title or filename..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:border-blue-500"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:border-blue-500"
        >
          <option value="all">All Enrolled Subjects</option>
          {enrolledSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center text-xs text-slate-500">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          Loading course notes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
          <FileText className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-800">No notes available yet</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {materials.length === 0
              ? 'Your instructors have not published PDF notes for your enrolled classes yet.'
              : 'No notes matched your current search or subject filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-blue-600">
                  <span className="truncate">{subjectMap.get(item.subject_id) || 'Course Material'}</span>
                  <span className="flex items-center gap-1 text-slate-400 font-normal shrink-0">
                    <Lock className="w-3 h-3" />
                    Protected
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">{item.title}</h3>
                {item.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
                )}
                <div className="text-[11px] text-slate-400 pt-1">
                  {[item.file_name, item.file_size].filter(Boolean).join(' · ')}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => onOpenSecurePdf(item.id)}
                  className="flex-1 py-2 px-3 min-h-[40px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open Reader</span>
                </button>
                {item.subtopic_id && (
                  <button
                    onClick={() => onNavigate('subtopic_learn', { id: item.subtopic_id })}
                    className="py-2 px-3 min-h-[40px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Lesson
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   3. VIDEOS LIBRARY TAB (Cloud Firestore + Backend Materials)
============================================================ */
export const StudentVideosLibraryTab: React.FC<CommonTabProps> = ({ enrolledSubjects, onNavigate }) => {
  const [videos, setVideos] = useState<
    {
      id: string;
      title: string;
      description: string;
      subjectId: string;
      subjectName: string;
      videoUrl: string;
      videoType?: 'upload' | 'url' | 'youtube' | 'vimeo';
      thumbnailUrl?: string;
      duration?: string;
      subtopicId?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [playingVideo, setPlayingVideo] = useState<(typeof videos)[number] | null>(null);

  useEffect(() => {
    let active = true;
    const loadAllVideos = async () => {
      setLoading(true);
      try {
        const subjectMap = new Map(enrolledSubjects.map((s) => [s.id, s.name]));
        const subjectIds = enrolledSubjects.map((s) => s.id);
        const [materialRes, fsVideos] = await Promise.all([
          api.getMaterials({ type: 'video' }).catch(() => ({ materials: [] })),
          listPublishedVideosForSubjects(subjectIds).catch(() => [] as CurriculumVideo[]),
        ]);

        if (!active) return;

        const combined: typeof videos = [];
        const seenUrls = new Set<string>();

        fsVideos.forEach((v) => {
          if (!v.contentUrl) return;
          seenUrls.add(v.contentUrl);
          const mins = v.durationSeconds ? `${Math.floor(v.durationSeconds / 60)}:${String(v.durationSeconds % 60).padStart(2, '0')}` : undefined;
          combined.push({
            id: v.id,
            title: v.title,
            description: v.description || '',
            subjectId: v.subjectId,
            subjectName: subjectMap.get(v.subjectId) || 'Course Video',
            videoUrl: v.contentUrl,
            videoType: v.sourceType === 'youtube' ? 'youtube' : v.sourceType === 'upload' ? 'upload' : 'url',
            thumbnailUrl: v.thumbnailUrl,
            duration: mins,
            subtopicId: v.topicId,
          });
        });

        (materialRes.materials || [])
          .filter((m: MaterialItem) => m.status !== 'draft' && m.video_url && !seenUrls.has(m.video_url))
          .forEach((m: MaterialItem) => {
            combined.push({
              id: m.id,
              title: m.title,
              description: m.description || '',
              subjectId: m.subject_id,
              subjectName: subjectMap.get(m.subject_id) || 'Course Video',
              videoUrl: m.video_url || '',
              subtopicId: m.subtopic_id,
            });
          });

        setVideos(combined);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAllVideos();
    return () => {
      active = false;
    };
  }, [enrolledSubjects]);

  const filtered = videos.filter((v) => {
    if (subjectFilter !== 'all' && v.subjectId !== subjectFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="type-label text-blue-600 uppercase tracking-wider flex items-center gap-2">
            <Video className="w-4 h-4" />
            <span>Video Lectures</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Curriculum Video Library</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Watch published visual lectures and topic walkthroughs from your enrolled subjects.
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-600 tabular-nums">
          {filtered.length} {filtered.length === 1 ? 'Video' : 'Videos'}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lectures by title..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:border-blue-500"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:border-blue-500"
        >
          <option value="all">All Enrolled Subjects</option>
          {enrolledSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Inline Player Modal */}
      {playingVideo && (
        <div className="bg-white border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-md space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-blue-600">{playingVideo.subjectName}</div>
              <h3 className="text-base font-bold text-slate-900">{playingVideo.title}</h3>
            </div>
            <button
              onClick={() => setPlayingVideo(null)}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Close video player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <VideoPlayer
            subtopicId={playingVideo.subtopicId || playingVideo.id}
            poster={playingVideo.thumbnailUrl}
            video={{
              title: playingVideo.title,
              video_url: playingVideo.videoUrl,
              video_type: playingVideo.videoType === 'youtube' ? 'youtube' : playingVideo.videoType === 'upload' ? 'uploaded' : 'embedded',
              duration_seconds: 0,
              description: playingVideo.description,
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center text-xs text-slate-500">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          Loading course videos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
          <Video className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-800">No curriculum videos published yet</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Videos uploaded or linked by your teachers for your enrolled subjects will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((vid) => (
            <div
              key={vid.id}
              className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl overflow-hidden shadow-xs transition-all flex flex-col"
            >
              <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                {vid.thumbnailUrl ? (
                  <img src={vid.thumbnailUrl} alt={vid.title} className="w-full h-full object-cover opacity-85" />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center">
                    <Play className="w-6 h-6" />
                  </div>
                )}
                <button
                  onClick={() => setPlayingVideo(vid)}
                  className="absolute inset-0 flex items-center justify-center bg-slate-900/25 hover:bg-slate-900/40 transition-colors cursor-pointer group"
                  aria-label={`Play ${vid.title}`}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-600 group-hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </button>
                {vid.duration && (
                  <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-slate-900/80 text-white text-[11px] font-mono tabular-nums">
                    {vid.duration}
                  </span>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-blue-600">{vid.subjectName}</div>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5 line-clamp-2">{vid.title}</h3>
                  {vid.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{vid.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPlayingVideo(vid)}
                    className="flex-1 py-2 px-3 min-h-[40px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Watch Now</span>
                  </button>
                  {vid.subtopicId && (
                    <button
                      onClick={() => onNavigate('subtopic_learn', { id: vid.subtopicId })}
                      className="py-2 px-3 min-h-[40px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Open Topic
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   SHARED CATEGORY FILTER & TONE HELPERS
============================================================ */
const SCHEDULE_TABS: { key: 'all' | ScheduleCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'available', label: 'Available Now' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

const toneBadgeClasses = (tone: 'blue' | 'emerald' | 'amber' | 'red' | 'slate') => {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'amber':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'red':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

/* ============================================================
   4. QUIZZES TAB (Scheduled + Live Countdowns + Timed Runner)
============================================================ */
export const StudentQuizzesTab: React.FC<CommonTabProps> = ({ enrolledSubjects, onNavigate }) => {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ScheduleCategory>('all');
  const [runningQuiz, setRunningQuiz] = useState<{ quiz: any; attempt: QuizAttempt | null } | null>(null);
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const serverNow = useServerNow(serverTime);

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      const res = await api.getStudentQuizzes();
      setQuizzes(res.quizzes || []);
      if (res.serverTime) setServerTime(res.serverTime);
    } catch {
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuizzes();
  }, []);

  const subjectMap = new Map(enrolledSubjects.map((s) => [s.id, s.name]));

  const evaluatedQuizzes = quizzes
    .filter((q) => subjectFilter === 'all' || q.subject_id === subjectFilter)
    .map((q) => ({ quiz: q, evalState: evaluateQuizSchedule(q, serverNow) }));

  const categoryCounts: Record<'all' | ScheduleCategory, number> = {
    all: evaluatedQuizzes.length,
    upcoming: 0,
    available: 0,
    submitted: 0,
    overdue: 0,
    completed: 0,
  };
  evaluatedQuizzes.forEach(({ evalState }) => {
    categoryCounts[evalState.category] += 1;
  });

  const visibleQuizzes = evaluatedQuizzes.filter(
    ({ evalState }) => categoryFilter === 'all' || evalState.category === categoryFilter
  );

  const handleLaunchQuiz = async (quiz: any) => {
    setToast(null);
    setStartingQuizId(quiz.id);
    try {
      const res = await api.startQuizAttempt(quiz.id);
      if (res.serverTime) setServerTime(res.serverTime);
      setRunningQuiz({
        quiz: {
          ...quiz,
          attemptsCount: res.attemptsUsed ?? quiz.attemptsCount ?? 0,
          maxAttempts: res.maxAttempts ?? quiz.max_attempts ?? 1,
        },
        attempt: res.attempt,
      });
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || 'Unable to start quiz right now.' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setStartingQuizId(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            {toast.message}
          </span>
          <button onClick={() => setToast(null)} className="font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="type-label text-blue-600 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>Scheduled Assessments</span>
            </div>
            <h2 className="type-section-title text-slate-900 mt-1">Course Quizzes & Deadlines</h2>
            <p className="type-helper text-slate-500 mt-0.5">
              View upcoming schedules, live countdown timers, and complete timed assessments.
            </p>
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="all">All Enrolled Subjects</option>
            {enrolledSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 5-Category Organization Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100 pt-3">
          {SCHEDULE_TABS.map((tab) => {
            const active = categoryFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategoryFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {categoryCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center text-xs text-slate-500">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          Loading scheduled quizzes...
        </div>
      ) : visibleQuizzes.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
          <Award className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-800">
            {evaluatedQuizzes.length === 0
              ? 'No quizzes assigned yet'
              : `No quizzes in "${SCHEDULE_TABS.find((t) => t.key === categoryFilter)?.label}"`}
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {evaluatedQuizzes.length === 0
              ? 'Published quizzes from your enrolled subjects will appear here automatically.'
              : 'Select another category filter to view your other quizzes.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleQuizzes.map(({ quiz: q, evalState }) => {
            const totalMarks = Number(q.marks) || 100;
            const passingMarks =
              q.passingMarks ??
              q.passing_marks ??
              Math.round((totalMarks * (Number(q.passing_score) || 70)) / 100);
            const isStartingThis = startingQuizId === q.id;

            return (
              <div
                key={q.id}
                className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-blue-600 truncate block">
                        {q.subjectName || subjectMap.get(q.subject_id) || 'Course Assessment'}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{q.teacherName || 'Course Instructor'}</span>
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border shrink-0 ${toneBadgeClasses(
                        evalState.tone
                      )}`}
                    >
                      {evalState.statusLabel}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">{q.title}</h3>
                    {q.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.description}</p>}
                  </div>

                  {/* Start / Due Timestamps + Live Countdown */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1 text-[11px] tabular-nums">
                    <div className="flex items-center justify-between gap-2 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Starts:</span>
                      </span>
                      <span className="font-semibold text-slate-800">
                        {q.start_date ? formatDateTime(q.start_date) : 'Open now'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Due:</span>
                      </span>
                      <span className="font-semibold text-slate-800">
                        {q.due_date ? formatDateTime(q.due_date) : 'No deadline'}
                      </span>
                    </div>
                    <div
                      className={`pt-1.5 mt-1 border-t border-slate-200/80 font-semibold flex items-center justify-between ${
                        evalState.tone === 'red'
                          ? 'text-red-600'
                          : evalState.tone === 'amber'
                          ? 'text-amber-700'
                          : evalState.tone === 'blue'
                          ? 'text-blue-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      <span>{evalState.countdownText}</span>
                      {q.bestScore !== undefined && (
                        <span className="text-slate-700">
                          Best: {q.bestMarks !== undefined ? `${q.bestMarks}/${totalMarks}` : `${q.bestScore}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                    <span>{q.questions?.length || q.questionsCount || 0} Questions</span>
                    <span>Duration: {q.time_limit || 20} min</span>
                    <span>
                      Pass: {passingMarks}/{totalMarks}
                    </span>
                    <span>
                      Attempts: {evalState.attemptsUsed}/{evalState.maxAttempts}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {evalState.canStart ? (
                    <button
                      type="button"
                      disabled={isStartingThis}
                      onClick={() => void handleLaunchQuiz(q)}
                      className="flex-1 py-2.5 px-4 min-h-[42px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {isStartingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : evalState.hasActiveAttempt ? (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isStartingThis
                          ? 'Starting...'
                          : evalState.hasActiveAttempt
                          ? 'Resume Timed Attempt'
                          : evalState.attemptsUsed > 0
                          ? `Retake Quiz (${evalState.attemptsRemaining} left)`
                          : evalState.isLateWindow
                          ? 'Start Late Attempt'
                          : 'Start Quiz'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex-1 py-2.5 px-4 min-h-[42px] bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {evalState.isBeforeStart
                          ? 'Not Yet Open'
                          : evalState.category === 'completed'
                          ? 'Completed'
                          : 'Submission Closed'}
                      </span>
                    </button>
                  )}

                  {q.subtopic_id && (
                    <button
                      type="button"
                      onClick={() => onNavigate('subtopic_learn', { id: q.subtopic_id })}
                      className="px-3 py-2.5 min-h-[42px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Lesson
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TIMED QUIZ RUNNER MODAL */}
      {runningQuiz && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl shadow-2xl">
            <QuizRunner
              quiz={runningQuiz.quiz}
              initialAttempt={runningQuiz.attempt}
              serverTime={serverTime}
              onQuizComplete={() => {
                void loadQuizzes();
              }}
              onClose={() => {
                setRunningQuiz(null);
                void loadQuizzes();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   5. ASSIGNMENTS TAB (5 Categories + Live Countdowns + Real Upload)
============================================================ */
export const StudentAssignmentsTab: React.FC<CommonTabProps> = ({ enrolledSubjects }) => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ScheduleCategory>('all');

  // Active assignment detail & submission modal
  const [activeAssignment, setActiveAssignment] = useState<any | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachmentSize, setAttachmentSize] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const serverNow = useServerNow(serverTime);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.getStudentAssignments();
      setAssignments(res.assignments || []);
      if (res.serverTime) setServerTime(res.serverTime);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, []);

  const openAssignmentModal = (a: any) => {
    const sub = a.mySubmission || a.submission;
    setActiveAssignment(a);
    setSubmissionText(sub?.submission_text || '');
    setAttachmentUrl(sub?.attachment_url && sub.attachment_url !== '#' ? sub.attachment_url : '');
    setAttachmentName(sub?.attachment_name || '');
    setAttachmentSize(sub?.attachment_size || '');
    setModalError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeAssignment) return;
    setModalError(null);

    const allowedTypes: string[] =
      Array.isArray(activeAssignment.allowed_file_types) && activeAssignment.allowed_file_types.length > 0
        ? activeAssignment.allowed_file_types
        : DEFAULT_ALLOWED_FILE_TYPES;
    const maxMb = Number(activeAssignment.max_file_size_mb || 10);

    const dotIdx = file.name.lastIndexOf('.');
    const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : '';
    const normalizedAllowed = allowedTypes.map((t) => (t.startsWith('.') ? t.toLowerCase() : `.${t.toLowerCase()}`));
    const matchesExt =
      normalizedAllowed.includes(ext) ||
      (ext === '.jpeg' && normalizedAllowed.includes('.jpg')) ||
      (ext === '.jpg' && normalizedAllowed.includes('.jpeg'));

    if (!matchesExt) {
      setModalError(`File type "${ext || 'unknown'}" is not allowed. Accepted types: ${allowedTypes.join(', ')}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > maxMb * 1024 * 1024) {
      setModalError(`File size exceeds the ${maxMb} MB limit for this assignment.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setUploadingFile(true);
      const res = await api.uploadAssignmentSubmissionFile(activeAssignment.id, file);
      setAttachmentUrl(res.url);
      setAttachmentName(res.fileName);
      setAttachmentSize(res.formattedSize);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to upload file.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment) return;
    setModalError(null);

    if (!submissionText.trim() && !attachmentUrl.trim()) {
      setModalError('Please upload your completed assignment file or provide written answer notes.');
      return;
    }

    if (attachmentUrl.trim() && !isSafeAttachmentUrl(attachmentUrl.trim())) {
      setModalError('Attachment URL must be an uploaded file or start with https:// or http://.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitAssignment(activeAssignment.id, {
        submission_text: submissionText.trim(),
        attachment_url: attachmentUrl.trim() || undefined,
        attachment_name: attachmentName.trim() || (attachmentUrl.trim() ? 'Submitted File' : undefined),
        attachment_size: attachmentSize.trim() || undefined,
      });
      setToast({
        type: 'success',
        message: res.submission?.is_late
          ? `Submitted "${activeAssignment.title}" (marked Late).`
          : `Submitted "${activeAssignment.title}" on time!`,
      });
      setActiveAssignment(null);
      setSubmissionText('');
      setAttachmentUrl('');
      setAttachmentName('');
      setAttachmentSize('');
      await loadAssignments();
      setTimeout(() => setToast(null), 5000);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to submit assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const subjectMap = new Map(enrolledSubjects.map((s) => [s.id, s.name]));

  const evaluatedAssignments = assignments
    .filter((a) => subjectFilter === 'all' || a.subject_id === subjectFilter)
    .map((a) => ({ assignment: a, evalState: evaluateAssignmentSchedule(a, serverNow) }));

  const categoryCounts: Record<'all' | ScheduleCategory, number> = {
    all: evaluatedAssignments.length,
    upcoming: 0,
    available: 0,
    submitted: 0,
    overdue: 0,
    completed: 0,
  };
  evaluatedAssignments.forEach(({ evalState }) => {
    categoryCounts[evalState.category] += 1;
  });

  const visibleAssignments = evaluatedAssignments.filter(
    ({ evalState }) => categoryFilter === 'all' || evalState.category === categoryFilter
  );

  const activeEval = activeAssignment ? evaluateAssignmentSchedule(activeAssignment, serverNow) : null;
  const activeSub = activeAssignment ? activeAssignment.mySubmission || activeAssignment.submission : null;
  const activeAllowedTypes: string[] =
    activeAssignment && Array.isArray(activeAssignment.allowed_file_types) && activeAssignment.allowed_file_types.length > 0
      ? activeAssignment.allowed_file_types
      : DEFAULT_ALLOWED_FILE_TYPES;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            {toast.message}
          </span>
          <button onClick={() => setToast(null)} className="font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="type-label text-blue-600 uppercase tracking-wider flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span>Coursework & Deadlines</span>
            </div>
            <h2 className="type-section-title text-slate-900 mt-1">Assignments & Submissions</h2>
            <p className="type-helper text-slate-500 mt-0.5">
              Track submission windows with live countdowns, download handouts, upload completed work, and view grades.
            </p>
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
          >
            <option value="all">All Enrolled Subjects</option>
            {enrolledSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 5-Category Organization Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100 pt-3">
          {SCHEDULE_TABS.map((tab) => {
            const active = categoryFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategoryFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {categoryCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center text-xs text-slate-500">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          Loading assignments...
        </div>
      ) : visibleAssignments.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
          <ClipboardList className="w-9 h-9 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-800">
            {evaluatedAssignments.length === 0
              ? 'No assignments posted yet'
              : `No assignments in "${SCHEDULE_TABS.find((t) => t.key === categoryFilter)?.label}"`}
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {evaluatedAssignments.length === 0
              ? 'Assignments published by your instructors will appear here with due dates and submission forms.'
              : 'Switch categories above to view other assignments.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleAssignments.map(({ assignment: a, evalState }) => {
            const sub = a.mySubmission || a.submission;
            const isSubmitted = Boolean(sub);

            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-blue-600">
                        {a.subjectName || subjectMap.get(a.subject_id) || 'Class Assignment'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {a.teacherName || 'Course Instructor'}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${toneBadgeClasses(
                          evalState.tone
                        )}`}
                      >
                        {evalState.statusLabel}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{a.title}</h3>
                    {a.description && (
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{a.description}</p>
                    )}

                    {/* Schedule & Countdown Strip */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-slate-600 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        Opens: <strong>{a.start_date ? formatDateTime(a.start_date) : 'Immediately'}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Due: <strong>{a.due_date ? formatDateTime(a.due_date) : 'No deadline'}</strong>
                      </span>
                      <span
                        className={`font-semibold ${
                          evalState.tone === 'red'
                            ? 'text-red-600'
                            : evalState.tone === 'amber'
                            ? 'text-amber-700'
                            : evalState.tone === 'blue'
                            ? 'text-blue-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {evalState.countdownText}
                      </span>
                      <span>Max Marks: {a.max_marks || 100}</span>
                    </div>

                    {/* Teacher attachment link */}
                    {isSafeAttachmentUrl(a.attachment_url) && (
                      <div className="pt-1">
                        <a
                          href={a.attachment_url}
                          download={a.attachment_name || true}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{a.attachment_name || 'Download Assignment Attachment'}</span>
                          {a.attachment_size && (
                            <span className="text-slate-400 font-normal">({a.attachment_size})</span>
                          )}
                        </a>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openAssignmentModal(a)}
                    className={`px-4 py-2.5 min-h-[42px] rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer self-start shrink-0 ${
                      evalState.canSubmit
                        ? isSubmitted
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {evalState.category === 'completed'
                      ? 'View Marks & Feedback'
                      : evalState.canSubmit
                      ? isSubmitted
                        ? 'View / Update Submission'
                        : evalState.isLateWindow
                        ? 'Submit Late Work'
                        : 'Open & Submit'
                      : evalState.isBeforeStart
                      ? 'View Details (Locked)'
                      : 'View Details (Closed)'}
                  </button>
                </div>

                {/* Submission & Feedback Summary */}
                {sub && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>
                        Submitted on <strong>{formatDateTime(sub.submitted_at)}</strong>
                        {sub.is_late && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                            Late{sub.late_penalty_percent ? ` (-${sub.late_penalty_percent}% penalty)` : ''}
                          </span>
                        )}
                      </span>
                      {sub.status === 'graded' && (
                        <span className="font-bold text-emerald-700 tabular-nums">
                          Score: {sub.marks}/{a.max_marks || 100}
                        </span>
                      )}
                    </div>
                    {sub.attachment_name && (
                      <div className="text-[11px] text-blue-700 font-mono flex items-center gap-1.5">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span>{sub.attachment_name}</span>
                      </div>
                    )}
                    {sub.feedback && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 rounded-lg text-emerald-900">
                        <span className="font-bold">Teacher Feedback: </span>
                        {sub.feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ASSIGNMENT DETAILS & SUBMISSION MODAL */}
      {activeAssignment && activeEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-blue-600">
                    {activeAssignment.subjectName || subjectMap.get(activeAssignment.subject_id) || 'Assignment'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${toneBadgeClasses(
                      activeEval.tone
                    )}`}
                  >
                    {activeEval.statusLabel}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">{activeAssignment.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Instructor: {activeAssignment.teacherName || 'Course Instructor'} · Max Marks:{' '}
                  {activeAssignment.max_marks || 100}
                </p>
              </div>
              <button
                onClick={() => setActiveAssignment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Schedule & Instructions */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] tabular-nums">
                <div>
                  <span className="text-slate-500">Opens:</span>{' '}
                  <strong className="text-slate-800">
                    {activeAssignment.start_date ? formatDateTime(activeAssignment.start_date) : 'Immediately'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Deadline:</span>{' '}
                  <strong className="text-slate-800">
                    {activeAssignment.due_date ? formatDateTime(activeAssignment.due_date) : 'No deadline'}
                  </strong>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-blue-700">{activeEval.countdownText}</div>

              {activeAssignment.description && (
                <div className="pt-2 border-t border-slate-200/80 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {activeAssignment.description}
                </div>
              )}

              {isSafeAttachmentUrl(activeAssignment.attachment_url) && (
                <div className="pt-2 border-t border-slate-200/80">
                  <a
                    href={activeAssignment.attachment_url}
                    download={activeAssignment.attachment_name || true}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download: {activeAssignment.attachment_name || 'Assignment Attachment'}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Graded Summary (if evaluated) */}
            {activeSub?.status === 'graded' && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-emerald-900">
                  Evaluated Score: {activeSub.marks} / {activeAssignment.max_marks || 100}
                </div>
                {activeSub.feedback && (
                  <div className="text-emerald-800">
                    <span className="font-semibold">Teacher Feedback:</span> {activeSub.feedback}
                  </div>
                )}
              </div>
            )}

            {/* Locked / Closed Notice OR Submission Form */}
            {!activeEval.canSubmit ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-xs text-slate-700">
                <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">
                    {activeEval.category === 'completed'
                      ? 'Assignment Graded — Submissions Locked'
                      : activeEval.isBeforeStart
                      ? 'Submissions Not Open Yet'
                      : 'Submission Closed'}
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    {activeEval.category === 'completed'
                      ? 'Your instructor has graded this submission.'
                      : activeEval.isBeforeStart
                      ? `Submissions open on ${formatDateTime(activeAssignment.start_date)}.`
                      : 'The submission deadline has passed and late submissions are not allowed.'}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {activeEval.isLateWindow && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      The deadline has passed. Late submissions are permitted
                      {activeAssignment.late_penalty_percent
                        ? ` with a ${activeAssignment.late_penalty_percent}% late penalty.`
                        : ' and will be marked as Late.'}
                    </span>
                  </div>
                )}

                {modalError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* File Upload Dropzone */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Upload Completed Work</div>
                      <div className="text-[11px] text-slate-500">
                        Allowed: {activeAllowedTypes.join(', ')} · Max {activeAssignment.max_file_size_mb || 10} MB
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={activeAllowedTypes.join(',')}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingFile}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {uploadingFile ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingFile ? 'Uploading...' : 'Choose File'}</span>
                    </button>
                  </div>

                  {attachmentName && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200 text-xs">
                      <div className="flex items-center gap-2 text-blue-700 font-mono truncate">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{attachmentName}</span>
                        {attachmentSize && <span className="text-slate-400 shrink-0">({attachmentSize})</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentUrl('');
                          setAttachmentName('');
                          setAttachmentSize('');
                        }}
                        className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                        aria-label="Remove uploaded file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Written Solution / Submission Notes {attachmentUrl ? '(Optional)' : '*'}
                  </label>
                  <textarea
                    rows={4}
                    required={!attachmentUrl}
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    placeholder="Write your solution notes, explanation, or summary of attached work..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setActiveAssignment(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || uploadingFile || (!submissionText.trim() && !attachmentUrl.trim())}
                    className="px-4 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{activeEval.isLateWindow ? 'Submit Late Work' : 'Submit Assignment'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

