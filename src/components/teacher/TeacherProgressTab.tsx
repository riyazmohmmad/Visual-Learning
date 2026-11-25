import React, { useState, useEffect } from 'react';
import {
  Users,
  Award,
  Video,
  FileText,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Subject, TeacherClassAnalytics, StudentAnalyticsData } from '../../types';
import { api } from '../../services/api';

interface Props {
  subjects: Subject[];
}

export const TeacherProgressTab: React.FC<Props> = ({ subjects }) => {
  const [classesAnalytics, setClassesAnalytics] = useState<TeacherClassAnalytics[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<{ analytics: StudentAnalyticsData; student: any } | null>(null);
  const [loadingStudent, setLoadingStudent] = useState<boolean>(false);

  useEffect(() => {
    loadTeacherAnalytics();
  }, []);

  const loadTeacherAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getTeacherClassesAnalytics();
      const list = res.classes || [];
      setClassesAnalytics(list);
      if (list.length > 0) {
        setSelectedClassId(list[0].subject_id);
      }
    } catch (err) {
      console.error('Failed to load teacher classes analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInspectStudent = async (studentId: string) => {
    try {
      setLoadingStudent(true);
      setSelectedStudentId(studentId);
      const res = await api.getTeacherStudentAnalytics(studentId);
      setStudentDetail(res);
    } catch (err) {
      console.error('Failed to load student detailed analytics:', err);
    } finally {
      setLoadingStudent(false);
    }
  };

  const activeClass = classesAnalytics.find((c) => c.subject_id === selectedClassId) || classesAnalytics[0];

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500">Aggregating real class performance & chapter masteries...</p>
      </div>
    );
  }

  if (classesAnalytics.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center space-y-3">
        <Users className="w-10 h-10 text-slate-400 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">No Class Analytics Available</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Create classes and invite students using your class code to track cohort performance, quiz outcomes, and chapter mastery.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="type-label uppercase tracking-wider text-blue-600">Cohort Insights</span>
          <h2 className="type-section-title text-slate-900 mt-1">Class Progress Analytics</h2>
          <p className="type-helper text-slate-500 mt-0.5">
            Real data aggregated exclusively from students enrolled in your classes.
          </p>
        </div>

        {/* Class Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Select Class:</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedStudentId(null);
              setStudentDetail(null);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-blue-500"
          >
            {classesAnalytics.map((c) => (
              <option key={c.subject_id} value={c.subject_id}>
                {c.subject_name} ({c.section || 'General'}) - {c.total_students} Students
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeClass && (
        <>
          {/* 2. Class Overview Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Average Curriculum Progress</span>
              <div className="type-metric font-mono text-blue-600">{activeClass.average_progress}%</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${activeClass.average_progress}%` }} />
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Average Quiz Score</span>
              <div className="type-metric font-mono text-emerald-600">{activeClass.average_quiz_score}%</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${activeClass.average_quiz_score}%` }} />
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Video Completion Rate</span>
              <div className="type-metric font-mono text-purple-600">{activeClass.video_completion_rate}%</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-purple-600 rounded-full" style={{ width: `${activeClass.video_completion_rate}%` }} />
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Assignments Submitted</span>
              <div className="type-metric font-mono text-amber-600">{activeClass.assignment_completion_rate}%</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-amber-600 rounded-full" style={{ width: `${activeClass.assignment_completion_rate}%` }} />
              </div>
            </div>
          </div>

          {/* 3. Chapter Mastery & Weak Topics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chapter Mastery */}
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="type-card-title text-slate-900">Cohort Chapter Mastery</h3>
                <span className="text-xs text-slate-500">{activeClass.chapter_mastery.length} Chapters</span>
              </div>

              {activeClass.chapter_mastery.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No chapter completion data recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {activeClass.chapter_mastery.map((cm) => (
                    <div key={cm.chapter_id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{cm.chapter_title}</span>
                        <span className="font-mono font-bold text-blue-600">{cm.mastery}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            cm.mastery >= 80 ? 'bg-emerald-500' : cm.mastery >= 60 ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${cm.mastery}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Struggling Topics / Remedial Alerts */}
            <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Concept Weakness Alerts</h3>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>

              {activeClass.weak_topics.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No cohort weaknesses detected. All average quiz scores &gt;70%.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeClass.weak_topics.map((wt, i) => (
                    <div key={i} className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{wt.topic_title}</span>
                        <span className="text-red-600 font-mono font-bold">{wt.avg_score}% avg</span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {wt.students_struggling_count} students in this class scored below 70% and received automated Smart Study remedial paths.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Enrolled Students Breakdown & Drill-Down Inspector */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Enrolled Students Performance Roster</h3>
                <p className="text-xs text-slate-500">
                  Select any student to inspect individual chapter mastery, quiz history, and Smart Study status.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">
                {activeClass.students.length} Enrolled
              </span>
            </div>

            {activeClass.students.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No students currently enrolled in this class.</p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Curriculum Progress</th>
                      <th className="py-2.5 px-3">Avg Quiz Score</th>
                      <th className="py-2.5 px-3">Videos Watched</th>
                      <th className="py-2.5 px-3">Simulations</th>
                      <th className="py-2.5 px-3">Smart Study</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeClass.students.map((st) => (
                      <tr key={st.student_id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{st.student_name}</div>
                          <div className="text-[11px] text-slate-400">{st.student_email}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-blue-600">{st.progress}%</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-emerald-600">{st.avg_quiz_score}%</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{st.videos_completed}</td>
                        <td className="py-2.5 px-3 text-slate-600">{st.simulations_completed}</td>
                        <td className="py-2.5 px-3">
                          {st.has_active_smart_study ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Active Remedial Plan
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              On Track
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleInspectStudent(st.student_id)}
                            className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Student Detailed Drill-Down Modal */}
          {selectedStudentId && studentDetail && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90dvh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="type-label uppercase tracking-wider text-blue-600">Student Profile</span>
                    <h3 className="type-card-title text-slate-900 mt-0.5">{studentDetail.student.name}</h3>
                    <p className="text-xs text-slate-500">{studentDetail.student.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedStudentId(null);
                      setStudentDetail(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Progress</span>
                    <span className="text-lg font-bold font-mono text-blue-600">
                      {studentDetail.analytics.overall_progress}%
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Quiz Average</span>
                    <span className="text-lg font-bold font-mono text-emerald-600">
                      {studentDetail.analytics.quiz_analytics.average_score}%
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Videos Watched</span>
                    <span className="text-lg font-bold font-mono text-purple-600">
                      {studentDetail.analytics.video_analytics.videos_completed}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Simulations</span>
                    <span className="text-lg font-bold font-mono text-cyan-600">
                      {studentDetail.analytics.learning_analytics.simulations_completed}
                    </span>
                  </div>
                </div>

                {/* Chapter Mastery */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Chapter Mastery</h4>
                  <div className="space-y-2">
                    {studentDetail.analytics.chapters_mastery.map((cm) => (
                      <div key={cm.chapter_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{cm.chapter_title}</span>
                        <span className="font-mono font-bold text-blue-600">{cm.mastery_percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setSelectedStudentId(null);
                      setStudentDetail(null);
                    }}
                    className="py-2 px-5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
