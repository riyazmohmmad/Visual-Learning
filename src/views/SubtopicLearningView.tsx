import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowRight,
  BookOpen,
  Play,
  Activity,
  FileText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Award,
  Sparkles,
  Check,
  AlertCircle,
  KeyRound,
  Lock,
  Plus,
  Video as VideoIcon,
  EyeOff,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Subtopic,
  Chapter,
  Subject,
  LearningContent,
  NoteDocument,
  Quiz,
  StudentProgress,
} from '../types';
import { VideoPlayer } from '../components/VideoPlayer';
import { PdfNotesViewer } from '../components/PdfNotesViewer';
import { QuizRunner } from '../components/QuizRunner';
import { JoinClassModal } from '../components/JoinClassModal';
import { SimulationFrame } from '../components/SimulationFrame';
import { CurriculumVideoModal } from '../components/teacher/CurriculumVideoModal';
import { CurriculumSimulationModal } from '../components/teacher/CurriculumSimulationModal';
import { AiDoubtSolverPanel } from '../components/AiDoubtSolverPanel';
import {
  CurriculumVideo,
  CurriculumSimulation,
  listPublishedVideosForTopic,
  listPublishedSimulationsForTopic,
  getStudentVideoProgress,
  saveStudentVideoProgress,
  isLegacyDemoVideoUrl,
} from '../services/curriculumMediaService';

interface Props {
  subtopicId: string;
  onNavigate: (view: string, params?: any) => void;
}

type LearningStep = 'understand' | 'watch' | 'explore' | 'notes' | 'quiz';

export const SubtopicLearningView: React.FC<Props> = ({ subtopicId, onNavigate }) => {
  const { user, firebaseUser, isTeacher, isAdmin } = useAuth();
  const currentUid = firebaseUser?.uid || user?.uid || '';
  const canAuthorContent = isTeacher || isAdmin;

  const [data, setData] = useState<{
    subtopic: Subtopic;
    chapter: Chapter;
    subject: Subject;
    content?: LearningContent;
    notes: NoteDocument[];
    quiz?: Quiz;
    progress?: StudentProgress | null;
    navigation: {
      prev: { id: string; title: string; order: number } | null;
      next: { id: string; title: string; order: number } | null;
      total: number;
      current: number;
    };
    serverTime?: string;
  } | null>(null);

  const [activeStep, setActiveStep] = useState<LearningStep>('understand');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);

  // Strictly topic-matched Firestore media
  const [topicVideos, setTopicVideos] = useState<CurriculumVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoResumeMap, setVideoResumeMap] = useState<
    Record<string, { seconds: number; percent: number }>
  >({});

  const [topicSimulations, setTopicSimulations] = useState<CurriculumSimulation[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState<boolean>(false);

  // Teacher quick-add modals directly from topic view
  const [isAddVideoOpen, setIsAddVideoOpen] = useState<boolean>(false);
  const [isAddSimOpen, setIsAddSimOpen] = useState<boolean>(false);

  // Contextual AI Doubt Solver drawer for current topic
  const [isAiTutorOpen, setIsAiTutorOpen] = useState<boolean>(false);

  const subtopicReqRef = useRef(0);
  const mediaReqRef = useRef(0);

  const loadTopicMedia = useCallback(
    async (subject: Subject, chapter: Chapter, subtopic: Subtopic, legacyContent?: LearningContent) => {
      const reqId = ++mediaReqRef.current;
      setMediaLoading(true);
      try {
        const matchTopicIds = [subtopic.id, ...(subtopic.topic_id ? [subtopic.topic_id] : [])];
        const teacherScopeUid = canAuthorContent ? currentUid : undefined;

        const [videosRes, simsRes] = await Promise.all([
          listPublishedVideosForTopic(subject.id, chapter.id, matchTopicIds, teacherScopeUid),
          listPublishedSimulationsForTopic(subject.id, chapter.id, matchTopicIds, teacherScopeUid),
        ]);

        if (reqId !== mediaReqRef.current) return;

        // Also respect a teacher-authored non-demo video saved directly in legacy learningContent if present
        const combinedVideos: CurriculumVideo[] = [...videosRes];
        if (
          combinedVideos.length === 0 &&
          legacyContent?.video?.video_url &&
          !isLegacyDemoVideoUrl(legacyContent.video.video_url)
        ) {
          combinedVideos.push({
            id: `legacy_${subtopic.id}`,
            teacherId: subject.teacher_id || '',
            subjectId: subject.id,
            chapterId: chapter.id,
            topicId: subtopic.id,
            title: legacyContent.video.title || subtopic.title,
            description: legacyContent.video.description || '',
            contentUrl: legacyContent.video.video_url,
            durationSeconds: legacyContent.video.duration_seconds,
            status: 'published',
          });
        }

        setTopicVideos(combinedVideos);
        setSelectedVideoId((prev) =>
          prev && combinedVideos.some((v) => v.id === prev) ? prev : combinedVideos[0]?.id || null
        );

        setTopicSimulations(simsRes);
        setSelectedSimulationId((prev) =>
          prev && simsRes.some((s) => s.id === prev) ? prev : simsRes[0]?.id || null
        );
      } catch (err) {
        if (reqId !== mediaReqRef.current) return;
        console.error('Failed to load topic videos/simulations:', err);
        setTopicVideos([]);
        setTopicSimulations([]);
      } finally {
        if (reqId === mediaReqRef.current) {
          setMediaLoading(false);
        }
      }
    },
    [canAuthorContent, currentUid]
  );

  const loadSubtopic = useCallback(async () => {
    const reqId = ++subtopicReqRef.current;
    // Clear previous lesson & media immediately so stale content never flashes when switching lessons/classes
    setData(null);
    setTopicVideos([]);
    setTopicSimulations([]);
    setSelectedVideoId(null);
    setSelectedSimulationId(null);
    mediaReqRef.current += 1;

    try {
      setLoading(true);
      setError(null);
      const res = await api.getSubtopic(subtopicId);
      if (reqId !== subtopicReqRef.current) return;
      setData(res);
      setActiveStep('understand');
      if (res?.subject && res?.chapter && res?.subtopic) {
        void loadTopicMedia(res.subject, res.chapter, res.subtopic, res.content);
      }
    } catch (err: any) {
      if (reqId !== subtopicReqRef.current) return;
      setError(err.message || 'Failed to load subtopic.');
    } finally {
      if (reqId === subtopicReqRef.current) {
        setLoading(false);
      }
    }
  }, [subtopicId, loadTopicMedia]);

  useEffect(() => {
    loadSubtopic();
  }, [loadSubtopic]);

  // Load saved resume-watching progress from Firestore when active video changes
  useEffect(() => {
    if (!currentUid || !selectedVideoId || selectedVideoId.startsWith('legacy_')) return;
    let cancelled = false;
    getStudentVideoProgress(currentUid, selectedVideoId).then((rec) => {
      if (cancelled || !rec) return;
      setVideoResumeMap((prev) => ({
        ...prev,
        [selectedVideoId]: {
          seconds: rec.watchedSeconds || 0,
          percent: rec.completionPercent || 0,
        },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [currentUid, selectedVideoId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-slate-400 text-xs">
        Loading smart study module...
      </div>
    );
  }

  // Student must not access subtopic before joining class
  if (error || !data) {
    const isEnrollmentError =
      error?.toLowerCase().includes('not enrolled') || error?.toLowerCase().includes('class code');

    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
          {isEnrollmentError ? <Lock className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <h2 className="type-section-title text-slate-900">
            {isEnrollmentError ? 'Enrollment Required' : 'Module Unavailable'}
          </h2>
          <p className="type-helper sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            {isEnrollmentError
              ? 'This lesson belongs to a private class. You must join the class with a verified class code before accessing videos, simulations, notes, or quizzes.'
              : error || 'Subtopic not found.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onNavigate('student_dashboard')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            My Classes
          </button>

          {isEnrollmentError && (
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Enter Class Code</span>
            </button>
          )}
        </div>

        <JoinClassModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
          onSuccess={() => {
            loadSubtopic();
          }}
        />
      </div>
    );
  }

  const { subtopic, chapter, subject, content, notes, quiz, progress, navigation } = data;

  const activeVideo = topicVideos.find((v) => v.id === selectedVideoId) || topicVideos[0] || null;
  const activeSimulation =
    topicSimulations.find((s) => s.id === selectedSimulationId) || topicSimulations[0] || null;

  const activeVideoResume = activeVideo
    ? videoResumeMap[activeVideo.id] || {
        seconds: progress?.video_last_seconds || 0,
        percent: progress?.video_progress || 0,
      }
    : { seconds: 0, percent: 0 };

  const steps: { id: LearningStep; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'understand', label: '1. Understand', icon: BookOpen },
    { id: 'watch', label: '2. Watch Video', icon: Play },
    { id: 'explore', label: '3. Explore Simulation', icon: Activity },
    { id: 'notes', label: '4. Read Notes', icon: FileText },
    { id: 'quiz', label: '5. Practice Quiz', icon: Award },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-12 sm:pt-6 sm:pb-14 pb-safe-lg space-y-5 sm:space-y-6">
      {/* 1. TOP BREADCRUMB & SIBLING NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200/80 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 min-w-0">
          <button
            onClick={() => onNavigate('subject_detail', { id: subject.id })}
            className="hover:text-blue-600 transition-colors cursor-pointer"
          >
            {subject.name}
          </button>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <button
            onClick={() => onNavigate('chapter_detail', { id: chapter.id })}
            className="hover:text-blue-600 transition-colors cursor-pointer"
          >
            {chapter.title}
          </button>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <span className="text-blue-600 font-semibold truncate">{subtopic.title}</span>
        </div>

        {/* Previous / Next Topic Jumpers */}
        <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
          <button
            disabled={!navigation.prev}
            onClick={() => navigation.prev && onNavigate('subtopic_learn', { id: navigation.prev.id })}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <span className="font-mono text-slate-400 text-[11px] px-1">
            {navigation.current} / {navigation.total}
          </span>

          <button
            disabled={!navigation.next}
            onClick={() => navigation.next && onNavigate('subtopic_learn', { id: navigation.next.id })}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. SUBTOPIC HERO HEADER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div className="space-y-1.5 max-w-2xl min-w-0">
          <div className="type-label text-blue-600 uppercase tracking-wider">
            {subject.name} • {chapter.title} • Subtopic {subtopic.order}
          </div>
          <h1 className="type-page-title text-slate-900 break-words">
            {subtopic.title}
          </h1>
          <p className="type-helper sm:text-sm text-slate-600 leading-relaxed">{subtopic.description}</p>
        </div>

        {/* Action + Status completion controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsAiTutorOpen(true)}
            className="px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl type-btn inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask AI Doubt</span>
          </button>

          <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                progress?.completed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {progress?.completed ? (
                <Check className="w-5 h-5 text-emerald-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-900">
                {progress?.completed ? 'Topic Mastered' : 'In Progress'}
              </div>
              <div className="text-slate-500 text-[11px]">
                {progress?.completed ? 'Quiz passed & verified' : 'Complete steps below'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SMART STUDY PROGRESS NAVIGATION TABS */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-1.5 flex overflow-x-auto sm:flex-wrap gap-1.5 shadow-xs scrollbar-none">
        {steps.map((st) => {
          const Icon = st.icon;
          const isActive = activeStep === st.id;
          return (
            <button
              key={st.id}
              onClick={() => setActiveStep(st.id)}
              className={`shrink-0 sm:flex-1 sm:min-w-[130px] py-2 px-3 type-nav rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0 text-blue-600" />
              <span className="whitespace-nowrap">{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. MAIN CONTENT WORKSPACE AREA */}
      <div className="space-y-6">
        {/* STEP 1: UNDERSTAND */}
        {activeStep === 'understand' && content && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 space-y-6 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <div className="type-label text-blue-600 uppercase tracking-wider">
                Step 1: Conceptual Foundation
              </div>
              <h2 className="type-section-title text-slate-900 mt-1">
                {content.explanation.title}
              </h2>
              <p className="type-body text-slate-600 mt-2">
                {content.explanation.summary}
              </p>
            </div>

            {content.explanation.formulaOrConcept && (
              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-blue-700 font-mono font-semibold uppercase tracking-wider">
                    GOVERNING PRINCIPLE / FORMULA
                  </div>
                  <div className="text-sm sm:text-[15px] font-semibold text-blue-900 font-mono mt-0.5 break-words">
                    {content.explanation.formulaOrConcept}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="type-card-title text-slate-900">Core Learning Objectives</h3>
              <div className="grid grid-cols-1 gap-2.5">
                {content.explanation.keyPoints.map((pt, i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-xs text-slate-700 leading-relaxed"
                  >
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-900">Real-World Context: </span>
              {content.explanation.deepDive}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveStep('watch')}
                className="py-2.5 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Step 2: Watch Video</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: WATCH VIDEO (Strictly Topic-Matched Published Teacher Videos) */}
        {activeStep === 'watch' && (
          <div className="space-y-6">
            {canAuthorContent && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 text-xs">
                <div className="text-blue-900 font-medium">
                  Teacher View: Videos published for <strong>{subtopic.title}</strong> appear here automatically for enrolled students.
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddVideoOpen(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Video</span>
                </button>
              </div>
            )}

            {mediaLoading ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500">Loading lesson videos...</p>
              </div>
            ) : activeVideo ? (
              <div className="space-y-4">
                {topicVideos.length > 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {topicVideos.map((vid, idx) => {
                      const selected = vid.id === activeVideo.id;
                      return (
                        <button
                          key={vid.id}
                          type="button"
                          onClick={() => setSelectedVideoId(vid.id)}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
                            selected
                              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/20'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="w-20 aspect-video rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center relative">
                            {vid.thumbnailUrl ? (
                              <img
                                src={vid.thumbnailUrl}
                                alt={vid.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Play className="w-5 h-5 text-white/80" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-blue-600 uppercase">
                                Video {idx + 1}
                              </span>
                              {vid.status === 'draft' && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-0.5">
                                  <EyeOff className="w-2.5 h-2.5" />
                                  Draft
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                              {vid.title}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeVideo.status === 'draft' && (
                  <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2">
                    <EyeOff className="w-4 h-4 shrink-0" />
                    <span>
                      Draft Preview: This video is only visible to you. Publish it from Curriculum Management so students can watch it.
                    </span>
                  </div>
                )}

                <VideoPlayer
                  subtopicId={subtopic.id}
                  video={{
                    title: activeVideo.title,
                    video_url: activeVideo.contentUrl,
                    video_type: activeVideo.sourceType === 'youtube' ? 'youtube' : 'embedded',
                    duration_seconds: activeVideo.durationSeconds || 0,
                    description: activeVideo.description,
                  }}
                  poster={activeVideo.thumbnailUrl}
                  initialProgress={activeVideoResume.percent}
                  initialSeconds={activeVideoResume.seconds}
                  onSaveProgress={(watchedSecs, durSecs, pct) => {
                    if (!activeVideo.id.startsWith('legacy_')) {
                      setVideoResumeMap((prev) => ({
                        ...prev,
                        [activeVideo.id]: { seconds: watchedSecs, percent: pct },
                      }));
                      saveStudentVideoProgress({
                        videoId: activeVideo.id,
                        subjectId: subject.id,
                        topicId: activeVideo.topicId,
                        watchedSeconds: watchedSecs,
                        durationSeconds: durSecs,
                        completionPercent: pct,
                      }).catch(() => {});
                    }
                  }}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-10 sm:p-12 text-center shadow-xs space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                  <VideoIcon className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  No video available for this topic yet.
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {canAuthorContent
                    ? `Attach a lecture video or YouTube explanation specifically for "${subtopic.title}" so enrolled students can watch it here.`
                    : 'Your teacher has not published a video lesson for this topic yet. Continue to the next step or check back soon.'}
                </p>
                {canAuthorContent && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddVideoOpen(true)}
                      className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Video for This Topic</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
              <button
                onClick={() => setActiveStep('understand')}
                className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                ← Back to Explanation
              </button>

              <button
                onClick={() => setActiveStep('explore')}
                className="py-2.5 px-4 sm:px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Step 3: Explore Simulation</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: EXPLORE SIMULATION (Strictly Topic-Matched Published Teacher Simulations — ZERO Unrelated Fallbacks) */}
        {activeStep === 'explore' && (
          <div className="space-y-6">
            {canAuthorContent && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-200 rounded-xl px-4 py-3 text-xs">
                <div className="text-indigo-900 font-medium">
                  Teacher View: Only simulations linked to <strong>{subtopic.title}</strong> are shown here.
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSimOpen(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Simulation</span>
                </button>
              </div>
            )}

            {mediaLoading ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500">Loading topic simulations...</p>
              </div>
            ) : activeSimulation ? (
              <div className="space-y-4">
                {topicSimulations.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {topicSimulations.map((sim) => {
                      const selected = sim.id === activeSimulation.id;
                      return (
                        <button
                          key={sim.id}
                          type="button"
                          onClick={() => setSelectedSimulationId(sim.id)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>{sim.title}</span>
                          {sim.status === 'draft' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Draft
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <SimulationFrame
                  simulation={activeSimulation}
                  subjectName={subject.name}
                  chapterTitle={chapter.title}
                  topicTitle={subtopic.title}
                  onInteract={() => {
                    api.recordInteractiveExplored(subtopic.id).catch(() => {});
                  }}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-10 sm:p-12 text-center shadow-xs space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                  <Activity className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  No simulation available for this topic yet.
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {canAuthorContent
                    ? `Add a subject-relevant interactive simulation for "${subtopic.title}" (URL or uploaded HTML simulation) so students can explore it directly in this step.`
                    : 'Your instructor has not published an interactive simulation for this topic yet. You can continue to Faculty Notes or Practice Quiz.'}
                </p>
                {canAuthorContent && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddSimOpen(true)}
                      className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Simulation</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
              <button
                onClick={() => setActiveStep('watch')}
                className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                ← Back to Video
              </button>

              <button
                onClick={() => setActiveStep('notes')}
                className="py-2.5 px-4 sm:px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Step 4: Faculty Notes</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: READ NOTES */}
        {activeStep === 'notes' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-semibold break-words">
                  Verified Faculty Study Notes for {subtopic.title}
                </span>
              </div>
              <span className="text-slate-400 shrink-0">Strict Read-Only Access</span>
            </div>

            <PdfNotesViewer subtopicId={subtopic.id} notes={notes} onNotesRead={() => {}} />

            <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
              <button
                onClick={() => setActiveStep('explore')}
                className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                ← Back to Simulation
              </button>

              <button
                onClick={() => setActiveStep('quiz')}
                className="py-2.5 px-4 sm:px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Step 5: Practice Quiz</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: PRACTICE QUIZ */}
        {activeStep === 'quiz' && (
          <div className="space-y-6">
            {quiz ? (
              <QuizRunner
                quiz={quiz}
                subtopicTitle={subtopic.title}
                serverTime={data?.serverTime || null}
                onQuizComplete={() => {
                  loadSubtopic();
                }}
                onNavigateToStep={(stepIdx) => {
                  const stepKeys: LearningStep[] = ['understand', 'watch', 'explore', 'notes'];
                  if (stepKeys[stepIdx]) setActiveStep(stepKeys[stepIdx]);
                }}
              />
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-slate-500 text-xs shadow-xs">
                No quiz has been created for this subtopic yet.
              </div>
            )}

            {navigation.next && (
              <div className="p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 sm:gap-4 shadow-xs">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Ready for the next lesson?
                  </div>
                  <div className="text-sm font-bold text-slate-900 break-words">{navigation.next.title}</div>
                </div>
                <button
                  onClick={() =>
                    navigation.next && onNavigate('subtopic_learn', { id: navigation.next.id })
                  }
                  className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>Start Next Subtopic</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Teacher Quick Add Video / Simulation Modals */}
      {canAuthorContent && (
        <>
          <CurriculumVideoModal
            isOpen={isAddVideoOpen}
            onClose={() => setIsAddVideoOpen(false)}
            subjects={[subject]}
            initialSubjectId={subject.id}
            initialChapterId={chapter.id}
            initialTopicId={subtopic.id}
            onSaved={async () => {
              await loadTopicMedia(subject, chapter, subtopic, content);
            }}
          />

          <CurriculumSimulationModal
            isOpen={isAddSimOpen}
            onClose={() => setIsAddSimOpen(false)}
            subjects={[subject]}
            initialSubjectId={subject.id}
            initialChapterId={chapter.id}
            initialTopicId={subtopic.id}
            onSaved={async () => {
              await loadTopicMedia(subject, chapter, subtopic, content);
            }}
          />
        </>
      )}

      {/* Contextual AI Doubt Solver Modal */}
      {isAiTutorOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsAiTutorOpen(false)}
        >
          <div
            className="w-full sm:max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider truncate">
                  {subject.name} · {chapter.title}
                </div>
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  AI Doubt Solver — {subtopic.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAiTutorOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
                aria-label="Close AI Doubt Solver"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-4 overflow-y-auto">
              <AiDoubtSolverPanel
                enrolledSubjects={[subject]}
                defaultSubjectId={subject.id}
                defaultSubjectName={subject.name}
                defaultChapterTitle={chapter.title}
                defaultTopicTitle={subtopic.title}
                variant="compact"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
