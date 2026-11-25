import React, { useRef, useState } from 'react';
import {
  Activity,
  Maximize2,
  Minimize2,
  ExternalLink,
  RefreshCw,
  FileCode2,
  BookOpen,
  EyeOff,
} from 'lucide-react';
import { CurriculumSimulation } from '../services/curriculumMediaService';

interface Props {
  simulation: CurriculumSimulation;
  subjectName?: string;
  chapterTitle?: string;
  topicTitle?: string;
  onInteract?: () => void;
  compact?: boolean;
}

export const SimulationFrame: React.FC<Props> = ({
  simulation,
  subjectName,
  chapterTitle,
  topicTitle,
  onInteract,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [interacted, setInteracted] = useState(false);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const triggerInteraction = () => {
    if (!interacted && onInteract) {
      setInteracted(true);
      onInteract();
    }
  };

  const isLocalUpload = simulation.contentUrl.startsWith('/uploads/');
  const isImageSvg = simulation.contentUrl.toLowerCase().endsWith('.svg');

  return (
    <div
      ref={containerRef}
      onPointerDown={triggerInteraction}
      className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col"
    >
      {/* Top Bar */}
      <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80">
              <Activity className="w-3 h-3" />
              {simulation.category || 'Interactive Simulation'}
            </span>
            {simulation.status === 'draft' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                <EyeOff className="w-3 h-3" />
                Draft Preview
              </span>
            )}
            {isLocalUpload && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                <FileCode2 className="w-3 h-3" />
                Hosted Module
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1 line-clamp-2 sm:truncate">
            {simulation.title}
          </h3>
          {(subjectName || chapterTitle || topicTitle) && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {[subjectName, chapterTitle, topicTitle].filter(Boolean).join(' • ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title="Reload simulation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <a
            href={simulation.contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={triggerInteraction}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
            title="Open simulation in a new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open</span>
          </a>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Simulation Viewport */}
      <div
        className={`relative w-full bg-slate-950 ${
          isFullscreen
            ? 'flex-1 min-h-0'
            : compact
              ? 'h-[300px] sm:h-[400px]'
              : 'h-[340px] sm:h-[520px] lg:h-[580px]'
        }`}
      >
        {isImageSvg ? (
          <div className="w-full h-full bg-white flex items-center justify-center p-4 overflow-auto">
            <img
              key={reloadKey}
              src={simulation.contentUrl}
              alt={simulation.title}
              className="max-w-full max-h-full object-contain"
              onLoad={triggerInteraction}
            />
          </div>
        ) : (
          <iframe
            key={`${simulation.id}_${reloadKey}`}
            src={simulation.contentUrl}
            title={simulation.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
            allow="fullscreen; accelerometer; autoplay; clipboard-write"
            allowFullScreen
            onLoad={triggerInteraction}
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>

      {/* Description & Instructions */}
      {!compact && (simulation.description || simulation.instructions) && (
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200/80 space-y-3">
          {simulation.description && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Overview
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-1">
                {simulation.description}
              </p>
            </div>
          )}

          {simulation.instructions && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>Lab Guide & Exploration Steps</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mt-1.5 whitespace-pre-line">
                {simulation.instructions}
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            If an external website blocks embedded viewing, use the <strong>Open</strong> button above to launch it directly.
          </p>
        </div>
      )}
    </div>
  );
};
