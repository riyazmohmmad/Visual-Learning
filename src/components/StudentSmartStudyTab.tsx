import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  BookOpen,
  FileText,
  Play,
  Activity,
  Award,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { SmartStudyPlan, SmartStudyStep } from '../types';
import { api } from '../services/api';

interface Props {
  onNavigate: (view: string, params?: any) => void;
  onOpenSimulation?: (simulationId: string) => void;
}

export const StudentSmartStudyTab: React.FC<Props> = ({ onNavigate, onOpenSimulation }) => {
  const [plans, setPlans] = useState<SmartStudyPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SmartStudyPlan | null>(null);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed'>('all');

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getSmartStudyPlans();
      const loadedPlans = res.plans || [];
      setPlans(loadedPlans);
      if (loadedPlans.length > 0) {
        setSelectedPlan((prev) => {
          if (prev) {
            return loadedPlans.find((p) => p.id === prev.id) || loadedPlans[0];
          }
          return loadedPlans[0];
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load your Smart Study plans right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStepComplete = async (planId: string, stepId: string) => {
    try {
      setCompletingStepId(stepId);
      const res = await api.completeSmartStudyStep(planId, stepId);
      setSelectedPlan(res.plan);
      setPlans((prev) => prev.map((p) => (p.id === planId ? res.plan : p)));
    } catch (err) {
      console.error('Failed to complete step:', err);
    } finally {
      setCompletingStepId(null);
    }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'subtopic_review':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'notes_reading':
        return <FileText className="w-4 h-4 text-emerald-500" />;
      case 'video_watch':
        return <Play className="w-4 h-4 text-rose-500" />;
      case 'simulation_explore':
        return <Activity className="w-4 h-4 text-purple-500" />;
      case 'practice_review':
      case 'quiz_retry':
        return <Award className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-blue-500" />;
    }
  };

  const handleActionStep = (step: SmartStudyStep) => {
    if (step.resource_type === 'subtopic' && step.resource_id) {
      onNavigate('subtopic_learn', { id: step.resource_id });
    } else if (step.resource_type === 'simulation' && step.resource_id) {
      if (onOpenSimulation) {
        onOpenSimulation(step.resource_id);
      }
    } else if (step.resource_type === 'quiz' && step.resource_id) {
      // Navigate to quiz subtopic or direct subtopic
      if (selectedPlan?.subtopic_id) {
        onNavigate('subtopic_learn', { id: selectedPlan.subtopic_id });
      }
    } else if (selectedPlan?.subtopic_id) {
      onNavigate('subtopic_learn', { id: selectedPlan.subtopic_id });
    }
  };

  const filteredPlans = plans.filter((p) => {
    if (statusFilter === 'in_progress') return p.status !== 'completed';
    if (statusFilter === 'completed') return p.status === 'completed';
    return true;
  });

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500">Analyzing performance and generating study paths...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-semibold text-blue-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Guided Remedial Learning</span>
          </div>
          <h2 className="type-section-title text-white">Smart Study Remediation Plans</h2>
          <p className="type-helper sm:text-sm text-slate-200 leading-relaxed">
            When quiz results indicate weak topic retention (&lt;80%), personalized study paths are automatically
            formulated from your class notes, video walkthroughs, and interactive simulations.
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Could not load Smart Study Plans</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => void loadPlans()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="type-card-title text-slate-900">No Remedial Plans Required</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Complete a quiz or learning activity to receive personalized recommendations. When quiz results indicate weak topic retention (&lt;80%), personalized study paths will be generated automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Plan selector list */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Active Study Plans ({filteredPlans.length})
              </span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('in_progress')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    statusFilter === 'in_progress' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setStatusFilter('completed')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    statusFilter === 'completed' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Completed
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredPlans.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id;
                const isDone = plan.status === 'completed';

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {plan.subject_name}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">
                          {plan.topic_title || plan.subtopic_title || 'Weak Concept Review'}
                        </h4>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isDone
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isDone ? 'Completed' : `${plan.progress_percentage}% Done`}
                      </span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>Quiz score: <strong className="text-red-600 font-mono">{plan.trigger_score}%</strong></span>
                      <span>{plan.steps.filter((s) => s.completed).length} of {plan.steps.length} steps</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Plan Step-by-Step details */}
          <div className="lg:col-span-7">
            {selectedPlan && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-6">
                {/* Plan Header */}
                <div className="border-b border-slate-100 pb-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          {selectedPlan.subject_name}
                        </span>
                        {selectedPlan.chapter_title && (
                          <span className="text-xs text-slate-500 font-medium">· {selectedPlan.chapter_title}</span>
                        )}
                      </div>
                      <h3 className="type-card-title text-slate-900 mt-1">
                        {selectedPlan.topic_title || selectedPlan.subtopic_title}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-500">Overall Progress</div>
                      <div className="text-lg font-bold font-mono text-blue-600">
                        {selectedPlan.progress_percentage}%
                      </div>
                    </div>
                  </div>

                  {/* Why recommended notice */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Why recommended: </span>
                      <span>{selectedPlan.trigger_reason}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${selectedPlan.progress_percentage}%` }}
                    />
                  </div>
                </div>

                {/* Step List */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Remedial Study Path Steps
                  </h4>

                  <div className="space-y-3">
                    {selectedPlan.steps.map((step, idx) => {
                      const isCompleted = step.completed;

                      return (
                        <div
                          key={step.id}
                          className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                            isCompleted
                              ? 'bg-slate-50/60 border-slate-200 text-slate-600'
                              : 'bg-white border-slate-200/90 shadow-2xs hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-xs ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                            </div>

                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                {getStepIcon(step.type)}
                                <span className={`text-sm font-bold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                  {step.title}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">{step.description}</p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                            <button
                              onClick={() => handleActionStep(step)}
                              className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Open Resource</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </button>

                            {!isCompleted ? (
                              <button
                                onClick={() => handleStepComplete(selectedPlan.id, step.id)}
                                disabled={completingStepId === step.id}
                                className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                {completingStepId === step.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>Mark Complete</span>
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-600 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-200/60">
                                Done
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Final step encouragement */}
                {selectedPlan.status === 'completed' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                    <div className="text-sm font-bold text-emerald-900">Remedial Plan Fully Completed!</div>
                    <p className="text-xs text-emerald-700">
                      Your mastery analytics have been updated. Great job reinforcing key concepts!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
