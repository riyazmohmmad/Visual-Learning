import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Search,
  BookOpen,
  Layers,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Subject } from '../types';
import { api } from '../services/api';
import {
  CurriculumSimulation,
  listPublishedSimulationsForSubjects,
} from '../services/curriculumMediaService';
import { SimulationFrame } from './SimulationFrame';

interface Props {
  initialSimulationId?: string;
  enrolledSubjects?: Subject[];
  onNavigate?: (view: string, params?: any) => void;
}

export const StudentSimulationsTab: React.FC<Props> = ({
  initialSimulationId,
  enrolledSubjects: propEnrolledSubjects,
}) => {
  const [enrolledSubjects, setEnrolledSubjects] = useState<Subject[]>(propEnrolledSubjects || []);
  const [simulations, setSimulations] = useState<CurriculumSimulation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSim, setSelectedSim] = useState<CurriculumSimulation | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    enrolledSubjects.forEach((s) => map.set(s.id, s));
    return map;
  }, [enrolledSubjects]);

  useEffect(() => {
    void loadEnrolledSimulations();
  }, [propEnrolledSubjects]);

  const loadEnrolledSimulations = async () => {
    try {
      setLoading(true);
      setError(null);

      let subjects: Subject[] = propEnrolledSubjects || [];
      if (!propEnrolledSubjects) {
        const dash = await api.getStudentDashboard();
        subjects = dash?.subjects || [];
      }
      setEnrolledSubjects(subjects);

      const subjectIds = subjects.map((s) => s.id);
      const publishedSims = await listPublishedSimulationsForSubjects(subjectIds);
      setSimulations(publishedSims);

      if (publishedSims.length > 0) {
        if (initialSimulationId) {
          const match = publishedSims.find((s) => s.id === initialSimulationId);
          setSelectedSim(match || publishedSims[0]);
        } else {
          setSelectedSim(publishedSims[0]);
        }
      } else {
        setSelectedSim(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load simulations right now. Please try again.');
      setSimulations([]);
      setSelectedSim(null);
    } finally {
      setLoading(false);
    }
  };

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    simulations.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [simulations]);

  const filteredSimulations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return simulations.filter((s) => {
      if (subjectFilter !== 'all' && s.subjectId !== subjectFilter) return false;
      if (categoryFilter !== 'all' && (s.category || 'General') !== categoryFilter) return false;
      if (
        q &&
        !s.title.toLowerCase().includes(q) &&
        !s.description.toLowerCase().includes(q) &&
        !(s.category || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [simulations, subjectFilter, categoryFilter, searchQuery]);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500">Loading simulations for your enrolled classes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-md">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-semibold text-blue-200">
            <Activity className="w-3.5 h-3.5" />
            <span>Class Virtual Labs</span>
          </div>
          <h2 className="type-section-title text-white">Interactive Simulations</h2>
          <p className="type-helper sm:text-sm text-slate-200 leading-relaxed">
            Explore interactive labs published by your teachers for your enrolled subjects and curriculum topics.
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-xs space-y-3">
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Could not load Simulations</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => void loadEnrolledSimulations()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : simulations.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="type-card-title text-slate-900">
            No simulation available for your classes yet.
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            When your teachers publish interactive simulations for your enrolled subjects, they will automatically appear here and inside each curriculum topic.
          </p>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500"
              >
                <option value="all">All Enrolled Subjects</option>
                {enrolledSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {availableCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500"
                >
                  <option value="all">All Domains</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search simulations..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 w-full sm:w-52"
              />
            </div>
          </div>

          {/* Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
                Published Simulations ({filteredSimulations.length})
              </div>

              {filteredSimulations.length === 0 ? (
                <div className="bg-white border border-slate-200/90 rounded-xl p-6 text-center text-xs text-slate-500">
                  No simulations match your search or filter.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSimulations.map((sim) => {
                    const isSelected = selectedSim?.id === sim.id;
                    const subj = subjectMap.get(sim.subjectId);

                    return (
                      <div
                        key={sim.id}
                        onClick={() => setSelectedSim(sim)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                            {sim.category || 'Interactive Lab'}
                          </span>
                          {subj && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 truncate max-w-[140px]">
                              <BookOpen className="w-3 h-3 shrink-0" />
                              {subj.name}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                          {sim.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {sim.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-8">
              {selectedSim ? (
                <SimulationFrame
                  simulation={selectedSim}
                  subjectName={subjectMap.get(selectedSim.subjectId)?.name}
                />
              ) : (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
                  Select a simulation from the list to launch the interactive lab.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
