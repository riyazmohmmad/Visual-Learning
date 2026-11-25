import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Plus,
  Trash2,
  Edit2,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Send,
  FileEdit,
} from 'lucide-react';
import { Subject } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  CurriculumSimulation,
  SIMULATION_CATEGORIES,
  listTeacherSimulations,
  updateCurriculumSimulationStatus,
  deleteCurriculumSimulation,
} from '../../services/curriculumMediaService';
import { CurriculumSimulationModal } from './CurriculumSimulationModal';
import { SimulationFrame } from '../SimulationFrame';

interface Props {
  subjects: Subject[];
}

export const TeacherSimulationsTab: React.FC<Props> = ({ subjects }) => {
  const { user, firebaseUser } = useAuth();
  const teacherUid = firebaseUser?.uid || user?.uid || '';

  const [simulations, setSimulations] = useState<CurriculumSimulation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSim, setSelectedSim] = useState<CurriculumSimulation | null>(null);

  // Filters
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal & Notifications
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSim, setEditingSim] = useState<CurriculumSimulation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CurriculumSimulation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    subjects.forEach((s) => map.set(s.id, s));
    return map;
  }, [subjects]);

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadSimulations = async () => {
    if (!teacherUid) {
      setSimulations([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await listTeacherSimulations(teacherUid);
      setSimulations(list);
      setSelectedSim((prev) => {
        if (prev) {
          const refreshed = list.find((item) => item.id === prev.id);
          if (refreshed) return refreshed;
        }
        return list[0] || null;
      });
    } catch (err: any) {
      showNotice('error', 'Failed to load your simulations from Cloud Firestore.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSimulations();
  }, [teacherUid]);

  const filteredSimulations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return simulations.filter((sim) => {
      if (subjectFilter !== 'all' && sim.subjectId !== subjectFilter) return false;
      if (statusFilter !== 'all' && sim.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && (sim.category || 'General') !== categoryFilter) return false;
      if (
        q &&
        !sim.title.toLowerCase().includes(q) &&
        !sim.description.toLowerCase().includes(q) &&
        !(sim.category || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [simulations, subjectFilter, statusFilter, categoryFilter, searchQuery]);

  // Never keep previewing a simulation from another class when filters change
  useEffect(() => {
    setSelectedSim((prev) => {
      if (prev && filteredSimulations.some((s) => s.id === prev.id)) return prev;
      return filteredSimulations[0] || null;
    });
  }, [filteredSimulations]);

  const handleToggleStatus = async (sim: CurriculumSimulation) => {
    const nextStatus = sim.status === 'published' ? 'draft' : 'published';
    try {
      setBusyId(sim.id);
      await updateCurriculumSimulationStatus(sim.id, nextStatus);
      showNotice(
        'success',
        nextStatus === 'published'
          ? `"${sim.title}" is now published to students.`
          : `"${sim.title}" moved back to Draft.`
      );
      await loadSimulations();
    } catch {
      showNotice('error', 'Could not update simulation status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setBusyId(deleteTarget.id);
      await deleteCurriculumSimulation(deleteTarget.id);
      showNotice('success', `"${deleteTarget.title}" deleted.`);
      if (selectedSim?.id === deleteTarget.id) setSelectedSim(null);
      setDeleteTarget(null);
      await loadSimulations();
    } catch {
      showNotice('error', 'Could not delete simulation.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="type-label uppercase tracking-wider text-blue-600">
            Simulation Management
          </span>
          <h2 className="type-section-title text-slate-900 mt-1">Curriculum Simulations</h2>
          <p className="type-helper text-slate-500 mt-0.5 max-w-2xl">
            Add, preview, and publish topic-specific educational simulations (Networking, Cybersecurity, Cryptography, Cloud Architecture, Operating Systems, Algorithms, STEM). Students only see published simulations linked to their topic.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingSim(null);
            setIsModalOpen(true);
          }}
          disabled={subjects.length === 0}
          className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Simulation</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Domains</option>
            {SIMULATION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs">
            {(['all', 'published', 'draft'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg font-semibold capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex-1 sm:flex-initial">
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

      {/* Main Workspace */}
      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500">Loading your simulations...</p>
        </div>
      ) : simulations.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto">
            <Activity className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Simulations Created Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Create subject-specific simulations by adding an interactive URL or uploading an HTML simulation file, then link it to a Chapter and Topic.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setEditingSim(null);
                setIsModalOpen(true);
              }}
              disabled={subjects.length === 0}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Simulation</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Simulations List */}
          <div className="lg:col-span-5 space-y-2.5">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
              Your Simulations ({filteredSimulations.length})
            </div>

            {filteredSimulations.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 text-center text-xs text-slate-500">
                No simulations match the current filters.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-0.5">
                {filteredSimulations.map((sim) => {
                  const isSelected = selectedSim?.id === sim.id;
                  const subj = subjectMap.get(sim.subjectId);

                  return (
                    <div
                      key={sim.id}
                      onClick={() => setSelectedSim(sim)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2.5 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                            {sim.category || 'General'}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                              sim.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                                : 'bg-amber-50 text-amber-700 border border-amber-200/70'
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

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={busyId === sim.id}
                            onClick={() => handleToggleStatus(sim)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title={sim.status === 'published' ? 'Move to Draft' : 'Publish to Students'}
                          >
                            {sim.status === 'published' ? (
                              <FileEdit className="w-3.5 h-3.5" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSim(sim);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Edit simulation"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(sim)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Delete simulation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-900 leading-snug">{sim.title}</h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{sim.description}</p>
                      </div>

                      {subj && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          <BookOpen className="w-3 h-3 text-blue-600 shrink-0" />
                          <span className="truncate font-medium text-slate-700">{subj.name}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Preview */}
          <div className="lg:col-span-7 space-y-4">
            {selectedSim ? (
              <SimulationFrame
                simulation={selectedSim}
                subjectName={subjectMap.get(selectedSim.subjectId)?.name}
              />
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
                Select a simulation from the list to preview how it appears to students.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Simulation Modal */}
      <CurriculumSimulationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSim(null);
        }}
        subjects={subjects}
        initialSubjectId={subjectFilter !== 'all' ? subjectFilter : subjects[0]?.id}
        editingSimulation={editingSim}
        onSaved={async (saved) => {
          showNotice(
            'success',
            saved.status === 'published'
              ? `Simulation "${saved.title}" published successfully.`
              : `Simulation "${saved.title}" saved as draft.`
          );
          await loadSimulations();
          setSelectedSim(saved);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Simulation?</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Are you sure you want to permanently remove{' '}
                <strong className="text-slate-900">"{deleteTarget.title}"</strong>? Students will no longer see it in their curriculum.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="py-2 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={handleConfirmDelete}
                className="py-2 px-5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {busyId === deleteTarget.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
