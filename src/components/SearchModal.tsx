import React, { useState, useEffect, useRef } from 'react';
import { Search, X, BookOpen, Layers, FileText, ArrowRight, Video, Sparkles } from 'lucide-react';
import { api } from '../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectSubtopic: (subtopicId: string) => void;
  onSelectChapter: (chapterId: string) => void;
  onSelectSubject: (subjectId: string) => void;
}

export const SearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectSubtopic,
  onSelectChapter,
  onSelectSubject,
}) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<any>({ subjects: [], chapters: [], subtopics: [], notes: [] });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ subjects: [], chapters: [], subtopics: [], notes: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await api.search(query);
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const totalResults =
    results.subjects.length + results.chapters.length + results.subtopics.length + results.notes.length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-3 sm:pt-24 px-2.5 sm:px-4 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200/90 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[84dvh]"
      >
        {/* Search Input Bar */}
        <div className="px-3.5 py-2.5 sm:p-4 border-b border-slate-100 flex items-center gap-2.5 sm:gap-3 bg-white">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes, chapters, subtopics, notes..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden min-h-[40px]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-700 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer rounded-lg hover:bg-slate-100 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close search"
            className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center text-xs font-mono text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl sm:rounded-lg cursor-pointer transition-colors shrink-0 active:scale-95"
          >
            <X className="w-4 h-4 sm:hidden" />
            <span className="hidden sm:inline">ESC</span>
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          {isLoading && (
            <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Searching curriculum...</span>
            </div>
          )}

          {!isLoading && query && totalResults === 0 && (
            <div className="py-8 text-center text-xs text-slate-500">
              No matching learning content found for &quot;{query}&quot;. Try &quot;Biology&quot;, &quot;Physics&quot;, or &quot;Calculus&quot;.
            </div>
          )}

          {/* Subtopics */}
          {results.subtopics.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                Subtopics &amp; Lessons ({results.subtopics.length})
              </div>
              <div className="space-y-1.5">
                {results.subtopics.map((sub: any) => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      onSelectSubtopic(sub.id);
                      onClose();
                    }}
                    className="w-full min-h-[48px] text-left p-3 rounded-xl bg-slate-50/70 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-200 transition-colors flex items-center justify-between gap-2 group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-700 break-words">
                        {sub.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {sub.subjectName} · {sub.chapterTitle}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chapters */}
          {results.chapters.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider">
                Chapters ({results.chapters.length})
              </div>
              <div className="space-y-1.5">
                {results.chapters.map((chap: any) => (
                  <button
                    key={chap.id}
                    onClick={() => {
                      onSelectChapter(chap.id);
                      onClose();
                    }}
                    className="w-full min-h-[48px] text-left p-3 rounded-xl bg-slate-50/70 hover:bg-purple-50/50 border border-slate-200/80 hover:border-purple-200 transition-colors flex items-center justify-between gap-2 group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-purple-700 break-words">
                        {chap.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{chap.subjectName}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subjects */}
          {results.subjects.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
                Classes ({results.subjects.length})
              </div>
              <div className="space-y-1.5">
                {results.subjects.map((subj: any) => (
                  <button
                    key={subj.id}
                    onClick={() => {
                      onSelectSubject(subj.id);
                      onClose();
                    }}
                    className="w-full min-h-[48px] text-left p-3 rounded-xl bg-slate-50/70 hover:bg-emerald-50/50 border border-slate-200/80 hover:border-emerald-200 transition-colors flex items-center justify-between gap-2 group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-emerald-700 break-words">
                        {subj.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{subj.description}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {results.notes.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
                Study Notes ({results.notes.length})
              </div>
              <div className="space-y-1.5">
                {results.notes.map((note: any) => (
                  <button
                    key={note.id}
                    onClick={() => {
                      onSelectSubtopic(note.subtopic_id);
                      onClose();
                    }}
                    className="w-full min-h-[48px] text-left p-3 rounded-xl bg-slate-50/70 hover:bg-amber-50/50 border border-slate-200/80 hover:border-amber-200 transition-colors flex items-center justify-between gap-2 group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-amber-700 break-words">
                        {note.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {note.teacher_name} · {note.file_size}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1.5">
          <span>Navigate directly to verified Subtopics, Videos, and Notes</span>
          <span className="hidden sm:inline font-mono text-slate-400">Press ESC to dismiss</span>
        </div>
      </div>
    </div>
  );
};
