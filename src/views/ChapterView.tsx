import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  CheckCircle2,
  Lock,
  Play,
  FileText,
  Award,
  Activity,
  ArrowRight,
  Clock,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { api } from '../services/api';
import { Chapter, Subtopic, Subject } from '../types';
import { JoinClassModal } from '../components/JoinClassModal';

interface Props {
  chapterId: string;
  onNavigate: (view: string, params?: any) => void;
}

export const ChapterView: React.FC<Props> = ({ chapterId, onNavigate }) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [accessRestricted, setAccessRestricted] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);

  const loadChapter = () => {
    setReloadTick((t) => t + 1);
  };

  useEffect(() => {
    let cancelled = false;
    setChapter(null);
    setSubtopics([]);
    setSubject(null);
    setAccessRestricted(false);
    setLoading(true);

    api
      .getChapter(chapterId)
      .then((data) => {
        if (cancelled) return;
        setChapter(data.chapter);
        setSubtopics(data.subtopics || []);
        setSubject(data.subject || null);
        setAccessRestricted(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        if (err.message && err.message.toLowerCase().includes('enrolled')) {
          setAccessRestricted(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapterId, reloadTick]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-slate-500">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <span className="text-sm font-medium">Loading chapter contents...</span>
      </div>
    );
  }

  if (accessRestricted || !chapter) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-slate-200/90 rounded-2xl text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Enrolled Students Only</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          This chapter is part of an ongoing STEM class curriculum. Please join with your teacher's class code to view materials.
        </p>
        <button
          onClick={() => setIsJoinModalOpen(true)}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Enter Class Code
        </button>

        <JoinClassModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
          onSuccess={() => {
            loadChapter();
          }}
        />
      </div>
    );
  }

  const progress =
    subtopics.length > 0
      ? Math.round(
          (subtopics.filter((s) => s.completed).length / subtopics.length) * 100
        )
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 pb-12 sm:pt-8 sm:pb-14 pb-safe-lg space-y-5 sm:space-y-6 font-sans">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <button
          onClick={() => onNavigate('subjects')}
          className="hover:text-blue-600 transition-colors cursor-pointer"
        >
          Classes
        </button>
        <span aria-hidden="true" className="text-slate-300">/</span>
        {subject && (
          <>
            <button
              onClick={() => onNavigate('subject_detail', { id: subject.id })}
              className="hover:text-blue-600 transition-colors cursor-pointer"
            >
              {subject.name}
            </button>
            <span aria-hidden="true" className="text-slate-300">/</span>
          </>
        )}
        <span className="text-slate-900 font-semibold">{chapter.title}</span>
      </div>

      {/* CHAPTER HEADER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div className="space-y-2.5 max-w-2xl min-w-0">
          <div className="type-label text-blue-600 uppercase tracking-wider">
            {subject?.name || 'Class Curriculum'} • Chapter {chapter.order || 1}
          </div>
          <h1 className="type-page-title text-slate-900 break-words">
            {chapter.title}
          </h1>
          <p className="type-body text-slate-600">
            {chapter.description}
          </p>
        </div>

        {/* Overall Chapter Progress Card */}
        <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 w-full md:w-auto md:min-w-[220px] space-y-2">
          <div className="type-label text-slate-500 uppercase tracking-wider">
            Chapter Progress
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono type-metric text-slate-900 tabular-nums">{progress}%</span>
            <span className="text-xs text-slate-500">
              {subtopics.filter((s) => s.completed).length} of {subtopics.length} done
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* SUBTOPICS LIST */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="type-section-title text-slate-900">
            Subtopics & Learning Modules
          </h2>
          <span className="text-xs text-slate-500 font-medium">{subtopics.length} Subtopics</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {subtopics.map((sub, idx) => (
            <div
              key={sub.id}
              onClick={() => onNavigate('subtopic_learn', { id: sub.id })}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xs group ${
                sub.completed
                  ? 'bg-white border-slate-200/90 hover:border-emerald-300'
                  : 'bg-white border-slate-200/90 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Index / Completion badge */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                    sub.completed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {sub.completed ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>

                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {sub.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {sub.description}
                  </p>

                  {/* Feature Availability Indicator: only show resources that exist */}
                  {(sub.hasVideo || sub.hasAnimation || sub.hasNotes || sub.hasQuiz) && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1.5">
                      {sub.hasVideo && (
                        <span className="flex items-center gap-1">
                          <Play className="w-3.5 h-3.5 text-blue-600" />
                          Video
                        </span>
                      )}
                      {sub.hasAnimation && (
                        <span className="flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-purple-600" />
                          Interactive
                        </span>
                      )}
                      {sub.hasNotes && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          Notes
                        </span>
                      )}
                      {sub.hasQuiz && (
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-emerald-600" />
                          Quiz
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button & Status */}
              <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                <div className="text-right hidden md:block">
                  <div className="text-xs font-semibold text-slate-900">
                    {sub.completed ? 'Completed' : sub.videoProgress ? `${sub.videoProgress}% Studied` : 'Not Started'}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 justify-end">
                    <Clock className="w-3 h-3" />
                    <span>~{sub.estimated_minutes || 20} mins</span>
                  </div>
                </div>

                <button className="py-2 px-3.5 text-xs font-semibold bg-blue-600 group-hover:bg-blue-700 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer">
                  <span>{sub.completed ? 'Review Lesson' : 'Start Learning'}</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
