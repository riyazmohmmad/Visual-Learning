import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Video,
  Award,
  BookOpen,
  FileText,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { StudentAnalyticsData } from '../types';
import { api } from '../services/api';

interface Props {
  subjectId?: string;
}

export const StudentProgressAnalyticsTab: React.FC<Props> = ({ subjectId }) => {
  const [analytics, setAnalytics] = useState<StudentAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [subjectId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getStudentAnalytics(subjectId);
      setAnalytics(res.analytics);
    } catch (err: any) {
      setError(err.message || 'Failed to load progress analytics.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500">Calculating your real-time learning metrics...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-8 bg-white border border-slate-200/90 rounded-2xl text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-800">{error || 'No learning activity recorded yet.'}</p>
        <p className="text-xs text-slate-500">
          Watch videos, complete interactive simulations, and attempt quizzes to generate your personalized learning analytics.
        </p>
      </div>
    );
  }

  const {
    overall_progress,
    subjects_progress,
    chapters_mastery,
    video_analytics,
    quiz_analytics,
    assignment_analytics,
    learning_analytics,
  } = analytics;

  return (
    <div className="space-y-6">
      {/* 1. TOP OVERVIEW METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Completion */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="type-label font-medium uppercase tracking-wider">Overall Progress</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="type-metric font-mono text-slate-900">
            {overall_progress}%
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${overall_progress}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">Across all enrolled curriculum topics</p>
        </div>

        {/* Video Completion */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="type-label font-medium uppercase tracking-wider">Video Watch Rate</span>
            <Video className="w-4 h-4 text-purple-600" />
          </div>
          <div className="type-metric font-mono text-slate-900">
            {video_analytics.overall_completion_percentage}%
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 rounded-full" style={{ width: `${video_analytics.overall_completion_percentage}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">
            {video_analytics.videos_completed} of {video_analytics.total_videos} videos finished (≥90%)
          </p>
        </div>

        {/* Quiz Performance */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="type-label font-medium uppercase tracking-wider">Average Quiz Score</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="type-metric font-mono text-slate-900">
            {quiz_analytics.average_score}%
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${quiz_analytics.average_score}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">
            {quiz_analytics.total_attempts} quiz attempts ({quiz_analytics.passed_attempts} passed)
          </p>
        </div>

        {/* Assignments Rate */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="type-label font-medium uppercase tracking-wider">Assignments</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="type-metric font-mono text-slate-900">
            {assignment_analytics.submitted} / {assignment_analytics.total_assignments}
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-600 rounded-full"
              style={{
                width: `${assignment_analytics.total_assignments > 0 ? (assignment_analytics.submitted / assignment_analytics.total_assignments) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Avg marks: <strong className="font-semibold text-slate-800">{assignment_analytics.average_marks}%</strong>
          </p>
        </div>
      </div>

      {/* 2. CHAPTER MASTERY BREAKDOWN (Real Activity) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="type-card-title text-slate-900">Chapter Mastery Analysis</h3>
            <p className="text-xs text-slate-500">
              Evaluated from subtopic completions, lecture videos watched, simulations explored, and quiz attempts.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
            {chapters_mastery.length} Chapters
          </span>
        </div>

        {chapters_mastery.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Not enough activity data to calculate chapter mastery yet.
          </div>
        ) : (
          <div className="space-y-4">
            {chapters_mastery.map((chap) => {
              const mastery = chap.mastery_percentage;
              let statusColor = 'text-red-700 bg-red-50 border-red-200';
              if (mastery >= 80) statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
              else if (mastery >= 60) statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
              else if (mastery >= 40) statusColor = 'text-amber-700 bg-amber-50 border-amber-200';

              return (
                <div key={chap.chapter_id} className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">{chap.subject_name}</div>
                      <h4 className="text-sm font-bold text-slate-900">{chap.chapter_title}</h4>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                        {chap.status} ({mastery}%)
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        mastery >= 80 ? 'bg-emerald-500' : mastery >= 60 ? 'bg-blue-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${mastery}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>
                      Subtopics: {chap.subtopics_completed} of {chap.total_subtopics} completed
                    </span>
                    <span>
                      Quiz performance: {chap.avg_quiz_score !== undefined ? `${chap.avg_quiz_score}%` : 'Not attempted'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. TOPIC MASTERY & SMART REMEDIATION INDICATORS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mastered Topics */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">Mastered Concepts (≥80%)</h3>
          </div>
          {learning_analytics.mastered_topics && learning_analytics.mastered_topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {learning_analytics.mastered_topics.map((t, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg"
                >
                  ✓ {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Score ≥80% on topic quizzes to verify mastery.</p>
          )}
        </div>

        {/* Needs Practice / Weak Topics */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-900">Concepts Needing Reinforcement</h3>
          </div>
          {learning_analytics.weak_topics && learning_analytics.weak_topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {learning_analytics.weak_topics.map((t, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium rounded-lg"
                >
                  ⚡ {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No weak topics flagged! Excellent work.</p>
          )}
        </div>
      </div>

      {/* 4. RECENT QUIZZES PERFORMANCE TABLE */}
      {quiz_analytics.recent_quizzes && quiz_analytics.recent_quizzes.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Recent Quiz Performance</h3>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Quiz Title</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quiz_analytics.recent_quizzes.map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{q.quiz_title}</td>
                    <td className="py-2.5 px-3 text-slate-500">{q.subject_name}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{q.score}%</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          q.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {q.passed ? 'Mastered' : 'Needs Practice'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(q.submitted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
