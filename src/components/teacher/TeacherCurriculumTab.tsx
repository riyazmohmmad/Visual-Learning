import React, { useState, useEffect, useRef } from 'react';
import {
  FolderTree,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  Layers,
  FileText,
  Video,
  Award,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Check,
  Maximize2,
  Minimize2,
  Activity,
  Eye,
  EyeOff,
  Send,
  FileEdit,
} from 'lucide-react';
import { Subject, Chapter, Topic, Subtopic } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  CurriculumVideo,
  CurriculumSimulation,
  listTeacherVideos,
  listTeacherSimulations,
  updateCurriculumVideoStatus,
  updateCurriculumSimulationStatus,
  deleteCurriculumVideo,
  deleteCurriculumSimulation,
} from '../../services/curriculumMediaService';
import { CurriculumVideoModal } from './CurriculumVideoModal';
import { CurriculumSimulationModal } from './CurriculumSimulationModal';

interface Props {
  subjects: Subject[];
  initialSubjectId?: string;
  onNavigate: (view: string, params?: any) => void;
}

export const TeacherCurriculumTab: React.FC<Props> = ({
  subjects,
  initialSubjectId,
  onNavigate,
}) => {
  const { user, firebaseUser } = useAuth();
  const teacherUid = firebaseUser?.uid || user?.uid || '';

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    initialSubjectId || subjects[0]?.id || ''
  );
  const [curriculumData, setCurriculumData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cloud Firestore Curriculum Videos & Simulations for the selected subject
  const [subjectVideos, setSubjectVideos] = useState<CurriculumVideo[]>([]);
  const [subjectSimulations, setSubjectSimulations] = useState<CurriculumSimulation[]>([]);
  const [videoModalCtx, setVideoModalCtx] = useState<{
    chapterId?: string;
    topicId?: string;
    editing?: CurriculumVideo | null;
  } | null>(null);
  const [simModalCtx, setSimModalCtx] = useState<{
    chapterId?: string;
    topicId?: string;
    editing?: CurriculumSimulation | null;
  } | null>(null);
  const [mediaBusyId, setMediaBusyId] = useState<string | null>(null);

  // Expansion state
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  // Modals
  // Chapter Modal
  const [chapterModal, setChapterModal] = useState<{
    mode: 'create' | 'edit';
    chapter?: Chapter;
  } | null>(null);
  const [chapTitle, setChapTitle] = useState('');
  const [chapDesc, setChapDesc] = useState('');
  const [chapOrder, setChapOrder] = useState(1);
  const [chapStatus, setChapStatus] = useState<'published' | 'draft'>('published');

  // Topic Modal
  const [topicModal, setTopicModal] = useState<{
    mode: 'create' | 'edit';
    chapterId: string;
    topic?: Topic;
  } | null>(null);
  const [topTitle, setTopTitle] = useState('');
  const [topDesc, setTopDesc] = useState('');
  const [topOrder, setTopOrder] = useState(1);

  // Subtopic Modal
  const [subtopicModal, setSubtopicModal] = useState<{
    mode: 'create' | 'edit';
    chapterId: string;
    topicId?: string;
    subtopic?: Subtopic;
  } | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subObjectives, setSubObjectives] = useState('');
  const [subMinutes, setSubMinutes] = useState(20);
  const [subOrder, setSubOrder] = useState(1);

  // Delete Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'chapter' | 'topic' | 'subtopic' | 'video' | 'simulation';
    id: string;
    name: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  // Monotonic request IDs ensure slow async responses from a previous class never overwrite the current class
  const curriculumReqRef = useRef(0);
  const mediaReqRef = useRef(0);

  useEffect(() => {
    if (initialSubjectId && subjects.some((s) => s.id === initialSubjectId)) {
      setSelectedSubjectId(initialSubjectId);
    } else if (selectedSubjectId && !subjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(subjects[0]?.id || '');
    } else if (!selectedSubjectId && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [initialSubjectId, subjects]);

  const loadCurriculum = async (subjectId: string) => {
    const reqId = ++curriculumReqRef.current;
    if (!subjectId) {
      setCurriculumData(null);
      setExpandedChapters({});
      setExpandedTopics({});
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.getCurriculum(subjectId);
      if (reqId !== curriculumReqRef.current) return;
      setCurriculumData(res);
      // Auto-expand all chapters and topics on initial load
      const chapExp: Record<string, boolean> = {};
      const topExp: Record<string, boolean> = {};
      res.chapters?.forEach((c: any) => {
        chapExp[c.id] = true;
        c.topics?.forEach((t: any) => {
          topExp[t.id] = true;
        });
      });
      setExpandedChapters(chapExp);
      setExpandedTopics(topExp);
    } catch (err: any) {
      if (reqId !== curriculumReqRef.current) return;
      setCurriculumData(null);
      showNotification('error', err.message || 'Failed to load curriculum.');
    } finally {
      if (reqId === curriculumReqRef.current) {
        setLoading(false);
      }
    }
  };

  const loadSubjectMedia = async (subjectId: string) => {
    const reqId = ++mediaReqRef.current;
    if (!subjectId || !teacherUid) {
      setSubjectVideos([]);
      setSubjectSimulations([]);
      return;
    }
    try {
      const [vids, sims] = await Promise.all([
        listTeacherVideos(teacherUid, subjectId),
        listTeacherSimulations(teacherUid, subjectId),
      ]);
      if (reqId !== mediaReqRef.current) return;
      setSubjectVideos(vids);
      setSubjectSimulations(sims);
    } catch {
      if (reqId !== mediaReqRef.current) return;
      setSubjectVideos([]);
      setSubjectSimulations([]);
    }
  };

  useEffect(() => {
    // Immediately clear previous class data so old chapters/videos/simulations never flash while switching classes
    setCurriculumData(null);
    setSubjectVideos([]);
    setSubjectSimulations([]);
    setExpandedChapters({});
    setExpandedTopics({});

    if (selectedSubjectId) {
      loadCurriculum(selectedSubjectId);
      loadSubjectMedia(selectedSubjectId);
    } else {
      curriculumReqRef.current += 1;
      mediaReqRef.current += 1;
      setLoading(false);
    }
  }, [selectedSubjectId, teacherUid]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const toggleAll = (expand: boolean) => {
    if (!curriculumData?.chapters) return;
    const chapExp: Record<string, boolean> = {};
    const topExp: Record<string, boolean> = {};
    curriculumData.chapters.forEach((c: any) => {
      chapExp[c.id] = expand;
      c.topics?.forEach((t: any) => {
        topExp[t.id] = expand;
      });
    });
    setExpandedChapters(chapExp);
    setExpandedTopics(topExp);
  };

  // Chapter Handlers
  const handleOpenCreateChapter = () => {
    const nextOrder = (curriculumData?.chapters?.length || 0) + 1;
    setChapTitle('');
    setChapDesc('');
    setChapOrder(nextOrder);
    setChapStatus('published');
    setChapterModal({ mode: 'create' });
  };

  const handleOpenEditChapter = (chap: Chapter) => {
    setChapTitle(chap.title);
    setChapDesc(chap.description);
    setChapOrder(chap.order);
    setChapStatus((chap.status as any) || 'published');
    setChapterModal({ mode: 'edit', chapter: chap });
  };

  const handleSaveChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapTitle.trim()) return;

    try {
      setSaving(true);
      if (chapterModal?.mode === 'create') {
        await api.createChapter({
          subject_id: selectedSubjectId,
          title: chapTitle.trim(),
          description: chapDesc.trim(),
          order: chapOrder,
          status: chapStatus,
        });
        showNotification('success', 'Chapter created successfully!');
      } else if (chapterModal?.chapter) {
        await api.updateChapter(chapterModal.chapter.id, {
          title: chapTitle.trim(),
          description: chapDesc.trim(),
          order: chapOrder,
          status: chapStatus,
        });
        showNotification('success', 'Chapter updated successfully!');
      }
      setChapterModal(null);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', err.message || 'Error saving chapter.');
    } finally {
      setSaving(false);
    }
  };

  // Topic Handlers
  const handleOpenCreateTopic = (chapterId: string) => {
    const chap = curriculumData?.chapters?.find((c: any) => c.id === chapterId);
    const nextOrder = (chap?.topics?.length || 0) + 1;
    setTopTitle('');
    setTopDesc('');
    setTopOrder(nextOrder);
    setTopicModal({ mode: 'create', chapterId });
  };

  const handleOpenEditTopic = (chapterId: string, topic: Topic) => {
    setTopTitle(topic.title);
    setTopDesc(topic.description);
    setTopOrder(topic.order);
    setTopicModal({ mode: 'edit', chapterId, topic });
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topTitle.trim() || !topicModal) return;

    try {
      setSaving(true);
      if (topicModal.mode === 'create') {
        await api.createTopic({
          chapter_id: topicModal.chapterId,
          subject_id: selectedSubjectId,
          title: topTitle.trim(),
          description: topDesc.trim(),
          order: topOrder,
        });
        showNotification('success', 'Topic created successfully!');
      } else if (topicModal.topic) {
        await api.updateTopic(topicModal.topic.id, {
          title: topTitle.trim(),
          description: topDesc.trim(),
          order: topOrder,
        });
        showNotification('success', 'Topic updated successfully!');
      }
      setTopicModal(null);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', err.message || 'Error saving topic.');
    } finally {
      setSaving(false);
    }
  };

  // Subtopic Handlers
  const handleOpenCreateSubtopic = (chapterId: string, topicId?: string) => {
    setSubTitle('');
    setSubDesc('');
    setSubObjectives('');
    setSubMinutes(20);
    setSubOrder(1);
    setSubtopicModal({ mode: 'create', chapterId, topicId });
  };

  const handleOpenEditSubtopic = (chapterId: string, sub: Subtopic) => {
    setSubTitle(sub.title);
    setSubDesc(sub.description);
    setSubObjectives(sub.learning_objectives?.join('\n') || '');
    setSubMinutes(sub.estimated_minutes || 20);
    setSubOrder(sub.order);
    setSubtopicModal({ mode: 'edit', chapterId, topicId: sub.topic_id, subtopic: sub });
  };

  const handleSaveSubtopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle.trim() || !subtopicModal) return;

    try {
      setSaving(true);
      const objectives = subObjectives
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      if (subtopicModal.mode === 'create') {
        await api.createSubtopic({
          chapter_id: subtopicModal.chapterId,
          topic_id: subtopicModal.topicId,
          title: subTitle.trim(),
          description: subDesc.trim(),
          learning_objectives: objectives.length > 0 ? objectives : [subDesc.trim().slice(0, 80)],
          estimated_minutes: subMinutes,
          order: subOrder,
        });
        showNotification('success', 'Subtopic created successfully!');
      } else if (subtopicModal.subtopic) {
        await api.updateSubtopic(subtopicModal.subtopic.id, {
          title: subTitle.trim(),
          description: subDesc.trim(),
          learning_objectives: objectives.length > 0 ? objectives : [subDesc.trim().slice(0, 80)],
          estimated_minutes: subMinutes,
          order: subOrder,
          topic_id: subtopicModal.topicId,
        });
        showNotification('success', 'Subtopic updated successfully!');
      }
      setSubtopicModal(null);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', err.message || 'Error saving subtopic.');
    } finally {
      setSaving(false);
    }
  };

  // Reordering helpers
  const handleMoveChapter = async (chapIndex: number, direction: 'up' | 'down') => {
    const chapters = [...(curriculumData?.chapters || [])];
    const targetIndex = direction === 'up' ? chapIndex - 1 : chapIndex + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    // Swap orders
    const temp = chapters[chapIndex].order;
    chapters[chapIndex].order = chapters[targetIndex].order;
    chapters[targetIndex].order = temp;

    const orders = chapters.map((c, i) => ({ id: c.id, order: i + 1 }));
    try {
      await api.reorderChapters(selectedSubjectId, orders);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', 'Failed to reorder chapters.');
    }
  };

  const handleMoveTopic = async (chapterId: string, topicIndex: number, direction: 'up' | 'down') => {
    const chap = curriculumData?.chapters?.find((c: any) => c.id === chapterId);
    if (!chap || !chap.topics) return;
    const topics = [...chap.topics];
    const targetIndex = direction === 'up' ? topicIndex - 1 : topicIndex + 1;
    if (targetIndex < 0 || targetIndex >= topics.length) return;

    const [moved] = topics.splice(topicIndex, 1);
    topics.splice(targetIndex, 0, moved);

    const orders = topics.map((t, i) => ({ id: t.id, order: i + 1 }));
    try {
      await api.reorderTopics(chapterId, orders);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', 'Failed to reorder topics.');
    }
  };

  // Delete Action
  const handleExecuteDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setSaving(true);
      if (deleteConfirm.type === 'chapter') {
        await api.deleteChapter(deleteConfirm.id);
        showNotification('success', `Chapter "${deleteConfirm.name}" deleted.`);
      } else if (deleteConfirm.type === 'topic') {
        await api.deleteTopic(deleteConfirm.id);
        showNotification('success', `Topic "${deleteConfirm.name}" deleted.`);
      } else if (deleteConfirm.type === 'subtopic') {
        await api.deleteSubtopic(deleteConfirm.id);
        showNotification('success', `Subtopic "${deleteConfirm.name}" deleted.`);
      } else if (deleteConfirm.type === 'video') {
        await deleteCurriculumVideo(deleteConfirm.id);
        showNotification('success', `Video "${deleteConfirm.name}" deleted.`);
        setDeleteConfirm(null);
        await loadSubjectMedia(selectedSubjectId);
        return;
      } else if (deleteConfirm.type === 'simulation') {
        await deleteCurriculumSimulation(deleteConfirm.id);
        showNotification('success', `Simulation "${deleteConfirm.name}" deleted.`);
        setDeleteConfirm(null);
        await loadSubjectMedia(selectedSubjectId);
        return;
      }
      setDeleteConfirm(null);
      loadCurriculum(selectedSubjectId);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete item.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVideoStatus = async (vid: CurriculumVideo) => {
    const nextStatus = vid.status === 'published' ? 'draft' : 'published';
    try {
      setMediaBusyId(vid.id);
      await updateCurriculumVideoStatus(vid.id, nextStatus);
      showNotification(
        'success',
        nextStatus === 'published'
          ? `Video "${vid.title}" published to students.`
          : `Video "${vid.title}" saved as draft.`
      );
      await loadSubjectMedia(selectedSubjectId);
    } catch {
      showNotification('error', 'Failed to update video status.');
    } finally {
      setMediaBusyId(null);
    }
  };

  const handleToggleSimStatus = async (sim: CurriculumSimulation) => {
    const nextStatus = sim.status === 'published' ? 'draft' : 'published';
    try {
      setMediaBusyId(sim.id);
      await updateCurriculumSimulationStatus(sim.id, nextStatus);
      showNotification(
        'success',
        nextStatus === 'published'
          ? `Simulation "${sim.title}" published to students.`
          : `Simulation "${sim.title}" saved as draft.`
      );
      await loadSubjectMedia(selectedSubjectId);
    } catch {
      showNotification('error', 'Failed to update simulation status.');
    } finally {
      setMediaBusyId(null);
    }
  };

  const renderAttachedMedia = (chapterId: string, targetTopicId: string) => {
    const vids = subjectVideos.filter(
      (v) => v.chapterId === chapterId && v.topicId === targetTopicId
    );
    const sims = subjectSimulations.filter(
      (s) => s.chapterId === chapterId && s.topicId === targetTopicId
    );

    if (vids.length === 0 && sims.length === 0) return null;

    return (
      <div className="mt-2.5 pt-2 border-t border-slate-200/70 space-y-1.5">
        {vids.map((vid) => (
          <div
            key={vid.id}
            className="px-2.5 py-2 sm:py-1.5 rounded-lg bg-blue-50/70 border border-blue-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px]"
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
              <Video className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                <span className="font-semibold text-slate-800 break-words [overflow-wrap:anywhere] sm:truncate">
                  {vid.title}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 shrink-0 ${
                    vid.status === 'published'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {vid.status === 'published' ? (
                    <Eye className="w-2.5 h-2.5" />
                  ) : (
                    <EyeOff className="w-2.5 h-2.5" />
                  )}
                  {vid.status}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 pl-5 sm:pl-0 sm:shrink-0">
              <button
                type="button"
                disabled={mediaBusyId === vid.id}
                onClick={() => handleToggleVideoStatus(vid)}
                className="px-2 py-1 sm:px-1.5 sm:py-0.5 text-[10px] font-semibold text-blue-700 bg-white/80 sm:bg-transparent hover:bg-blue-100 border border-blue-200/70 sm:border-0 rounded inline-flex items-center gap-0.5 cursor-pointer"
                title={vid.status === 'published' ? 'Move to Draft' : 'Publish Video'}
              >
                {vid.status === 'published' ? (
                  <>
                    <FileEdit className="w-2.5 h-2.5" />
                    <span>Draft</span>
                  </>
                ) : (
                  <>
                    <Send className="w-2.5 h-2.5" />
                    <span>Publish</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  setVideoModalCtx({
                    chapterId: vid.chapterId,
                    topicId: vid.topicId,
                    editing: vid,
                  })
                }
                className="p-1.5 sm:p-1 text-slate-500 hover:text-blue-600 rounded cursor-pointer"
                title="Edit Video"
              >
                <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setDeleteConfirm({ type: 'video', id: vid.id, name: vid.title })
                }
                className="p-1.5 sm:p-1 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                title="Delete Video"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
            </div>
          </div>
        ))}

        {sims.map((sim) => (
          <div
            key={sim.id}
            className="px-2.5 py-2 sm:py-1.5 rounded-lg bg-indigo-50/70 border border-indigo-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px]"
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
              <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                <span className="font-semibold text-slate-800 break-words [overflow-wrap:anywhere] sm:truncate">
                  {sim.title}
                </span>
                {sim.category && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white text-indigo-700 border border-indigo-200/70 shrink-0">
                    {sim.category}
                  </span>
                )}
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 shrink-0 ${
                    sim.status === 'published'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {sim.status === 'published' ? (
                    <Eye className="w-2.5 h-2.5" />
                  ) : (
                    <EyeOff className="w-2.5 h-2.5" />
                  )}
                  {sim.status}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 pl-5 sm:pl-0 sm:shrink-0">
              <button
                type="button"
                disabled={mediaBusyId === sim.id}
                onClick={() => handleToggleSimStatus(sim)}
                className="px-2 py-1 sm:px-1.5 sm:py-0.5 text-[10px] font-semibold text-indigo-700 bg-white/80 sm:bg-transparent hover:bg-indigo-100 border border-indigo-200/70 sm:border-0 rounded inline-flex items-center gap-0.5 cursor-pointer"
                title={sim.status === 'published' ? 'Move to Draft' : 'Publish Simulation'}
              >
                {sim.status === 'published' ? (
                  <>
                    <FileEdit className="w-2.5 h-2.5" />
                    <span>Draft</span>
                  </>
                ) : (
                  <>
                    <Send className="w-2.5 h-2.5" />
                    <span>Publish</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSimModalCtx({
                    chapterId: sim.chapterId,
                    topicId: sim.topicId,
                    editing: sim,
                  })
                }
                className="p-1.5 sm:p-1 text-slate-500 hover:text-indigo-600 rounded cursor-pointer"
                title="Edit Simulation"
              >
                <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setDeleteConfirm({ type: 'simulation', id: sim.id, name: sim.title })
                }
                className="p-1.5 sm:p-1 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                title="Delete Simulation"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const currentSubject = subjects.find((s) => s.id === selectedSubjectId);
  const chapters = curriculumData?.chapters || [];

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

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
            <FolderTree className="w-4 h-4 shrink-0" />
            <span>Interactive Curriculum Builder</span>
          </div>
          <h2 className="type-section-title text-slate-900 mt-1">Curriculum Structure</h2>
          <p className="type-helper text-slate-500 mt-0.5 break-words">
            4-Level Hierarchical Outline: <span className="font-semibold text-slate-700">Subject → Chapter → Topic → Subtopic</span>
          </p>
        </div>

        {/* Subject Selector & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto min-w-0">
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="w-full sm:w-auto max-w-full min-w-0 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-blue-500 cursor-pointer"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code || s.section || 'General'})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setVideoModalCtx({})}
            disabled={!selectedSubjectId || chapters.length === 0}
            className="py-2 px-3 sm:px-3.5 text-xs font-semibold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 disabled:opacity-50 rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Attach a lecture video or YouTube link to a curriculum topic"
          >
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span>Add Video</span>
          </button>

          <button
            type="button"
            onClick={() => setSimModalCtx({})}
            disabled={!selectedSubjectId || chapters.length === 0}
            className="py-2 px-3 sm:px-3.5 text-xs font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 disabled:opacity-50 rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Attach a topic-specific interactive simulation"
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Add Simulation</span>
          </button>

          <button
            onClick={handleOpenCreateChapter}
            className="py-2 px-3 sm:px-3.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>+ Create Chapter</span>
          </button>
        </div>
      </div>

      {/* Tree View Controls */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-600">
          <span className="font-bold text-slate-800">
            {currentSubject?.name || 'Subject'}
          </span>
          <span className="text-slate-400">·</span>
          <span>{chapters.length} Chapters</span>
          <span className="text-slate-400">·</span>
          <span>
            {chapters.reduce(
              (acc: number, c: any) =>
                acc + (c.topics?.length || 0) + (c.unassignedSubtopics?.length || 0),
              0
            )}{' '}
            Topics/Units
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-blue-700 font-semibold">{subjectVideos.length} Videos</span>
          <span className="text-slate-400">·</span>
          <span className="text-indigo-700 font-semibold">{subjectSimulations.length} Simulations</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => toggleAll(true)}
            className="py-1 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <Maximize2 className="w-3 h-3 text-slate-500" />
            <span>Expand All</span>
          </button>
          <button
            onClick={() => toggleAll(false)}
            className="py-1 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <Minimize2 className="w-3 h-3 text-slate-500" />
            <span>Collapse All</span>
          </button>
        </div>
      </div>

      {/* CURRICULUM TREE */}
      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-500">Loading curriculum hierarchy...</div>
        </div>
      ) : chapters.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Chapters in this Subject</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Start structuring this subject curriculum by adding Chapter 1.
          </p>
          <button
            onClick={handleOpenCreateChapter}
            className="mt-4 py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create First Chapter</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-6 shadow-xs space-y-4">
          {/* ROOT SUBJECT LEVEL */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className="w-8 h-8 rounded-lg text-white flex items-center justify-center font-bold text-xs shrink-0"
                style={{ backgroundColor: currentSubject?.color || '#2563EB' }}
              >
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-slate-900 break-words">
                  {currentSubject?.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold shrink-0">
                  {currentSubject?.code || currentSubject?.class_code?.split('-')[0] || 'CSE101'}
                </span>
              </div>
            </div>

            <button
              onClick={handleOpenCreateChapter}
              className="py-1.5 px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Chapter</span>
            </button>
          </div>

          {/* CHAPTERS LIST */}
          <div className="space-y-3.5 pl-2 sm:pl-4 border-l-2 border-blue-100">
            {chapters.map((chap: any, cIdx: number) => {
              const isChapExpanded = !!expandedChapters[chap.id];

              return (
                <div
                  key={chap.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/50 overflow-hidden transition-all"
                >
                  {/* CHAPTER ROW */}
                  <div className="p-3 sm:p-3.5 bg-slate-100/70 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-2">
                    <div className="flex items-start gap-2 min-w-0 w-full sm:flex-1">
                      <button
                        onClick={() =>
                          setExpandedChapters((prev) => ({ ...prev, [chap.id]: !isChapExpanded }))
                        }
                        className="p-1 -ml-0.5 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
                        aria-label={isChapExpanded ? 'Collapse chapter' : 'Expand chapter'}
                      >
                        {isChapExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-1" />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="text-xs font-bold text-slate-900 leading-snug break-words [overflow-wrap:anywhere]">
                            Chapter {cIdx + 1}: {chap.title}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold shrink-0">
                            {chap.topics?.length || 0} Topics
                          </span>
                        </div>
                        {chap.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words sm:truncate">
                            {chap.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Chapter Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 w-full sm:w-auto sm:shrink-0 pt-2 sm:pt-0 pl-7 sm:pl-0 border-t border-slate-200/70 sm:border-t-0">
                      <button
                        onClick={() => handleOpenCreateTopic(chap.id)}
                        className="py-1 px-2 text-[11px] font-semibold text-blue-700 bg-blue-50/90 sm:bg-transparent hover:bg-blue-100/70 border border-blue-200/70 sm:border-0 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                        title="Add Topic inside this Chapter"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span>Topic</span>
                      </button>

                      <button
                        onClick={() => handleOpenCreateSubtopic(chap.id)}
                        className="py-1 px-2 text-[11px] font-medium text-slate-700 sm:text-slate-600 bg-white sm:bg-transparent hover:bg-slate-200 border border-slate-200 sm:border-0 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                        title="Add Direct Subtopic"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span>Subtopic</span>
                      </button>

                      <div className="hidden sm:block h-4 w-px bg-slate-300 mx-1" />

                      <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
                        <button
                          onClick={() => handleMoveChapter(cIdx, 'up')}
                          disabled={cIdx === 0}
                          className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded cursor-pointer"
                          title="Move Chapter Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveChapter(cIdx, 'down')}
                          disabled={cIdx === chapters.length - 1}
                          className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded cursor-pointer"
                          title="Move Chapter Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEditChapter(chap)}
                          className="p-1.5 sm:p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50 cursor-pointer"
                          title="Edit Chapter"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() =>
                            setDeleteConfirm({ type: 'chapter', id: chap.id, name: chap.title })
                          }
                          className="p-1.5 sm:p-1 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                          title="Delete Chapter"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CHAPTER CHILDREN (TOPICS & DIRECT SUBTOPICS) */}
                  {isChapExpanded && (
                    <div className="p-2.5 sm:p-4 space-y-3 pl-2.5 sm:pl-7 border-l-2 border-indigo-100 ml-1.5 sm:ml-3">
                      {/* TOPICS IN CHAPTER */}
                      {chap.topics?.length === 0 &&
                      (!chap.unassignedSubtopics || chap.unassignedSubtopics.length === 0) ? (
                        <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-500">
                          <span>No topics created in this chapter yet. </span>
                          <button
                            onClick={() => handleOpenCreateTopic(chap.id)}
                            className="text-blue-600 font-bold hover:underline cursor-pointer"
                          >
                            + Create Topic
                          </button>
                        </div>
                      ) : (
                        <>
                          {chap.topics?.map((top: any, tIdx: number) => {
                            const isTopExpanded = !!expandedTopics[top.id];

                            return (
                              <div
                                key={top.id}
                                className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-2xs"
                              >
                                {/* TOPIC ROW */}
                                <div className="p-3 sm:p-2.5 bg-slate-50/90 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-2">
                                  {/* Topic Title Container */}
                                  <div className="flex items-start gap-2 min-w-0 w-full sm:flex-1">
                                    <button
                                      onClick={() =>
                                        setExpandedTopics((prev) => ({
                                          ...prev,
                                          [top.id]: !isTopExpanded,
                                        }))
                                      }
                                      className="p-0.5 mt-0.5 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer shrink-0"
                                      aria-label={isTopExpanded ? 'Collapse topic' : 'Expand topic'}
                                    >
                                      {isTopExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-bold text-slate-800 leading-snug break-words [overflow-wrap:anywhere]">
                                        Topic {tIdx + 1}: {top.title}
                                      </div>
                                      {top.description && (
                                        <p className="text-[11px] sm:text-[10px] text-slate-500 sm:text-slate-400 mt-0.5 leading-snug break-words sm:truncate">
                                          {top.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Topic Actions Container */}
                                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 w-full sm:w-auto sm:shrink-0 pt-2 sm:pt-0 pl-6 sm:pl-0 border-t border-slate-200/70 sm:border-t-0">
                                    <button
                                      onClick={() => handleOpenCreateSubtopic(chap.id, top.id)}
                                      className="py-1 sm:py-0.5 px-2 text-[11px] sm:text-[10px] font-semibold text-indigo-700 sm:text-indigo-600 bg-indigo-50/90 sm:bg-transparent hover:bg-indigo-100/80 border border-indigo-200/70 sm:border-0 rounded-md transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                                      title="Add Subtopic"
                                    >
                                      <Plus className="w-3 h-3 shrink-0" />
                                      <span>Subtopic</span>
                                    </button>

                                    <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
                                      <button
                                        onClick={() => handleMoveTopic(chap.id, tIdx, 'up')}
                                        disabled={tIdx === 0}
                                        className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded cursor-pointer"
                                        title="Move Topic Up"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleMoveTopic(chap.id, tIdx, 'down')}
                                        disabled={tIdx === chap.topics.length - 1}
                                        className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded cursor-pointer"
                                        title="Move Topic Down"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                      </button>

                                      <button
                                        onClick={() => handleOpenEditTopic(chap.id, top)}
                                        className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 cursor-pointer"
                                        title="Edit Topic"
                                      >
                                        <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                      </button>

                                      <button
                                        onClick={() =>
                                          setDeleteConfirm({
                                            type: 'topic',
                                            id: top.id,
                                            name: top.title,
                                          })
                                        }
                                        className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                        title="Delete Topic"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* SUBTOPICS IN TOPIC */}
                                {isTopExpanded && (
                                  <div className="p-2 sm:p-2.5 space-y-2 pl-2.5 sm:pl-7 border-l-2 border-emerald-100 ml-1.5 sm:ml-3 my-1.5">
                                    {top.subtopics?.length === 0 ? (
                                      <div className="p-2 text-center text-[11px] text-slate-400 italic">
                                        No subtopics in this topic.{' '}
                                        <button
                                          onClick={() => handleOpenCreateSubtopic(chap.id, top.id)}
                                          className="text-indigo-600 font-bold hover:underline"
                                        >
                                          + Add Subtopic
                                        </button>
                                      </div>
                                    ) : (
                                      top.subtopics.map((sub: any) => (
                                        <div
                                          key={sub.id}
                                          className="p-2.5 rounded-lg bg-slate-50/80 hover:bg-white border border-slate-200/70 text-xs transition-colors group"
                                        >
                                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-2">
                                            {/* Subtopic Title & Duration */}
                                            <div className="flex items-start gap-2 min-w-0 w-full sm:flex-1">
                                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                                              <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                                <span className="font-semibold text-slate-800 leading-snug break-words [overflow-wrap:anywhere]">
                                                  {sub.title}
                                                </span>
                                                {sub.estimated_minutes && (
                                                  <span className="text-[11px] sm:text-[10px] text-slate-500 sm:text-slate-400 shrink-0">
                                                    ({sub.estimated_minutes} min)
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Subtopic Badges & Controls */}
                                            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:justify-end sm:shrink-0 min-w-0 pl-3.5 sm:pl-0 pt-2 sm:pt-0 border-t border-slate-200/60 sm:border-t-0">
                                              {sub.materialsCount > 0 && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded font-medium">
                                                  <FileText className="w-2.5 h-2.5 shrink-0" />
                                                  {sub.materialsCount}
                                                </span>
                                              )}
                                              {sub.hasQuiz && (
                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded font-medium">
                                                  <Award className="w-2.5 h-2.5 shrink-0" />
                                                  Quiz
                                                </span>
                                              )}

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setVideoModalCtx({
                                                    chapterId: chap.id,
                                                    topicId: sub.id,
                                                  })
                                                }
                                                className="px-2 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                                title="Add Video to this Subtopic"
                                              >
                                                <Video className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0" />
                                                <span>+ Video</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setSimModalCtx({
                                                    chapterId: chap.id,
                                                    topicId: sub.id,
                                                  })
                                                }
                                                className="px-2 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                                title="Add Simulation to this Subtopic"
                                              >
                                                <Activity className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0" />
                                                <span>+ Simulation</span>
                                              </button>

                                              <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
                                                <button
                                                  onClick={() =>
                                                    onNavigate('subtopic_learn', { id: sub.id })
                                                  }
                                                  className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                                  title="Open / View Subtopic"
                                                >
                                                  <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                                </button>

                                                <button
                                                  onClick={() =>
                                                    handleOpenEditSubtopic(chap.id, sub)
                                                  }
                                                  className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                                  title="Edit Subtopic"
                                                >
                                                  <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                                </button>

                                                <button
                                                  onClick={() =>
                                                    setDeleteConfirm({
                                                      type: 'subtopic',
                                                      id: sub.id,
                                                      name: sub.title,
                                                    })
                                                  }
                                                  className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                                  title="Delete Subtopic"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                          {renderAttachedMedia(chap.id, sub.id)}
                                        </div>
                                      ))
                                    )}
                                    {renderAttachedMedia(chap.id, top.id)}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* DIRECT / UNASSIGNED SUBTOPICS IN CHAPTER */}
                          {chap.unassignedSubtopics?.map((sub: any) => (
                            <div
                              key={sub.id}
                              className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-xs shadow-2xs"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-2">
                                {/* Direct Subtopic Title & Metadata */}
                                <div className="flex items-start gap-2 min-w-0 w-full sm:flex-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                                  <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                    <span className="font-semibold text-slate-800 leading-snug break-words [overflow-wrap:anywhere]">
                                      {sub.title}
                                    </span>
                                    {sub.estimated_minutes && (
                                      <span className="text-[11px] sm:text-[10px] text-slate-500 sm:text-slate-400 shrink-0">
                                        ({sub.estimated_minutes} min)
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      (Direct Subtopic)
                                    </span>
                                  </div>
                                </div>

                                {/* Direct Subtopic Controls */}
                                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:justify-end sm:shrink-0 min-w-0 pl-3.5 sm:pl-0 pt-2 sm:pt-0 border-t border-slate-200/60 sm:border-t-0">
                                  {sub.materialsCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded font-medium">
                                      <FileText className="w-2.5 h-2.5 shrink-0" />
                                      {sub.materialsCount}
                                    </span>
                                  )}
                                  {sub.hasQuiz && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded font-medium">
                                      <Award className="w-2.5 h-2.5 shrink-0" />
                                      Quiz
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVideoModalCtx({
                                        chapterId: chap.id,
                                        topicId: sub.id,
                                      })
                                    }
                                    className="px-2 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                    title="Add Video to this Subtopic"
                                  >
                                    <Video className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0" />
                                    <span>+ Video</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSimModalCtx({
                                        chapterId: chap.id,
                                        topicId: sub.id,
                                      })
                                    }
                                    className="px-2 py-1 sm:py-0.5 text-[11px] sm:text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                    title="Add Simulation to this Subtopic"
                                  >
                                    <Activity className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0" />
                                    <span>+ Simulation</span>
                                  </button>

                                  <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
                                    <button
                                      onClick={() =>
                                        onNavigate('subtopic_learn', { id: sub.id })
                                      }
                                      className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                      title="Open Subtopic"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleOpenEditSubtopic(chap.id, sub)}
                                      className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                                      title="Edit Subtopic"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setDeleteConfirm({
                                          type: 'subtopic',
                                          id: sub.id,
                                          name: sub.title,
                                        })
                                      }
                                      className="p-1.5 sm:p-1 text-slate-500 sm:text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                      title="Delete Subtopic"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                              {renderAttachedMedia(chap.id, sub.id)}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CHAPTER MODAL */}
      {chapterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {chapterModal.mode === 'create' ? 'Create Chapter' : 'Edit Chapter'}
              </h3>
              <button
                onClick={() => setChapterModal(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveChapter} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chapter Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={chapTitle}
                  onChange={(e) => setChapTitle(e.target.value)}
                  placeholder="e.g. Introduction to Computers"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={chapDesc}
                  onChange={(e) => setChapDesc(e.target.value)}
                  placeholder="High-level overview of chapter goals..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order / Position
                  </label>
                  <input
                    type="number"
                    value={chapOrder}
                    onChange={(e) => setChapOrder(Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={chapStatus}
                    onChange={(e) => setChapStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setChapterModal(null)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : chapterModal.mode === 'create' ? 'Create Chapter' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOPIC MODAL */}
      {topicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {topicModal.mode === 'create' ? 'Create Topic' : 'Edit Topic'}
              </h3>
              <button
                onClick={() => setTopicModal(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTopic} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Topic Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={topTitle}
                  onChange={(e) => setTopTitle(e.target.value)}
                  placeholder="e.g. Basics of Computers"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={topDesc}
                  onChange={(e) => setTopDesc(e.target.value)}
                  placeholder="Topic summary and context..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Topic Order
                </label>
                <input
                  type="number"
                  value={topOrder}
                  onChange={(e) => setTopOrder(Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTopicModal(null)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : topicModal.mode === 'create' ? 'Create Topic' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBTOPIC MODAL */}
      {subtopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {subtopicModal.mode === 'create' ? 'Create Subtopic' : 'Edit Subtopic'}
              </h3>
              <button
                onClick={() => setSubtopicModal(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubtopic} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subtopic Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="e.g. Hardware Components"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={subDesc}
                  onChange={(e) => setSubDesc(e.target.value)}
                  placeholder="Core lesson explanation and overview..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Learning Objectives (one per line)
                </label>
                <textarea
                  rows={2}
                  value={subObjectives}
                  onChange={(e) => setSubObjectives(e.target.value)}
                  placeholder="Identify CPU components&#10;Understand primary memory"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Est. Minutes
                  </label>
                  <input
                    type="number"
                    value={subMinutes}
                    onChange={(e) => setSubMinutes(Number(e.target.value))}
                    min={5}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order
                  </label>
                  <input
                    type="number"
                    value={subOrder}
                    onChange={(e) => setSubOrder(Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSubtopicModal(null)}
                  className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : subtopicModal.mode === 'create' ? 'Create Subtopic' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Delete{' '}
              {deleteConfirm.type === 'chapter'
                ? 'Chapter'
                : deleteConfirm.type === 'topic'
                  ? 'Topic'
                  : deleteConfirm.type === 'video'
                    ? 'Video'
                    : deleteConfirm.type === 'simulation'
                      ? 'Simulation'
                      : 'Subtopic'}
              ?
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deleteConfirm.name}"</span>?
              {deleteConfirm.type === 'chapter' && ' This will also remove all topics and subtopics inside this chapter.'}
              {deleteConfirm.type === 'topic' && ' This will also remove all subtopics inside this topic.'}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="py-2 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={saving}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT CURRICULUM VIDEO MODAL */}
      <CurriculumVideoModal
        isOpen={Boolean(videoModalCtx)}
        onClose={() => setVideoModalCtx(null)}
        subjects={subjects}
        initialSubjectId={selectedSubjectId}
        initialChapterId={videoModalCtx?.chapterId}
        initialTopicId={videoModalCtx?.topicId}
        editingVideo={videoModalCtx?.editing || null}
        onSaved={async (saved) => {
          showNotification(
            'success',
            saved.status === 'published'
              ? `Video "${saved.title}" published to Curriculum.`
              : `Video "${saved.title}" saved as Draft.`
          );
          await loadSubjectMedia(selectedSubjectId);
        }}
      />

      {/* ADD / EDIT CURRICULUM SIMULATION MODAL */}
      <CurriculumSimulationModal
        isOpen={Boolean(simModalCtx)}
        onClose={() => setSimModalCtx(null)}
        subjects={subjects}
        initialSubjectId={selectedSubjectId}
        initialChapterId={simModalCtx?.chapterId}
        initialTopicId={simModalCtx?.topicId}
        editingSimulation={simModalCtx?.editing || null}
        onSaved={async (saved) => {
          showNotification(
            'success',
            saved.status === 'published'
              ? `Simulation "${saved.title}" published to Curriculum.`
              : `Simulation "${saved.title}" saved as Draft.`
          );
          await loadSubjectMedia(selectedSubjectId);
        }}
      />
    </div>
  );
};
