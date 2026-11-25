import React, { useState } from 'react';
import {
  FileText,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Lock,
  ExternalLink,
  HardDrive,
  Calendar,
  UserCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileUrl?: string;
  fileName?: string;
  teacherName?: string;
  fileSize?: string;
  pagesCount?: number;
  pagesContent?: Array<{
    pageNumber: number;
    title: string;
    content: string[];
    diagramLabel?: string;
  }>;
  downloadUrl?: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  fileUrl,
  fileName,
  teacherName,
  fileSize,
  pagesCount = 1,
  pagesContent,
  downloadUrl,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'embedded' | 'pages'>(fileUrl ? 'embedded' : 'pages');

  if (!isOpen) return null;

  const resolvedDownloadUrl = downloadUrl || fileUrl || '#';
  const hasPages = pagesContent && pagesContent.length > 0;
  const activePage = hasPages
    ? pagesContent.find((p) => p.pageNumber === currentPage) || pagesContent[0]
    : null;
  const totalPages = hasPages ? pagesContent.length : pagesCount || 1;

  const handleDownload = () => {
    if (resolvedDownloadUrl && resolvedDownloadUrl !== '#') {
      const link = document.createElement('a');
      link.href = resolvedDownloadUrl;
      link.download = fileName || `${title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        className={`bg-slate-900 border border-slate-700/80 w-full flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'h-dvh max-w-full rounded-none'
            : 'h-dvh sm:h-[92dvh] sm:max-w-5xl rounded-none sm:rounded-2xl'
        }`}
      >
        {/* Top Header Toolbar */}
        <div className="px-3 sm:px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-white pt-safe">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-full">
                  {title}
                </h3>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 items-center gap-1 shrink-0">
                  <Lock className="w-2.5 h-2.5" />
                  Read-Only PDF
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5">
                {fileName && <span className="truncate max-w-[160px] sm:max-w-[200px]">{fileName}</span>}
                {teacherName && (
                  <span className="flex items-center gap-1 font-sans">
                    <UserCheck className="w-3 h-3 text-slate-400" />
                    {teacherName}
                  </span>
                )}
                {fileSize && (
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-slate-400" />
                    {fileSize}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls: Mode toggle, Zoom, Page, Download, Fullscreen, Close */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {fileUrl && hasPages && (
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setViewMode('embedded')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                    viewMode === 'embedded' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  PDF Document
                </button>
                <button
                  onClick={() => setViewMode('pages')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                    viewMode === 'pages' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Study Reader
                </button>
              </div>
            )}

            {viewMode === 'pages' && hasPages && (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs text-slate-300">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 hover:bg-slate-700 disabled:opacity-40 rounded transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono px-2 text-[11px]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 hover:bg-slate-700 disabled:opacity-40 rounded transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {viewMode === 'pages' && (
              <div className="hidden sm:flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono px-1 text-slate-300 text-[11px]">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={handleDownload}
              className="py-1.5 px-3 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Download PDF Document"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden bg-slate-950 flex flex-col relative">
          {viewMode === 'embedded' && fileUrl ? (
            <div className="w-full h-full flex flex-col bg-slate-900">
              <iframe
                src={`${fileUrl}#toolbar=1&navpanes=0`}
                title={title}
                className="w-full h-full border-0 bg-slate-900"
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 sm:p-8 flex justify-center bg-slate-950">
              <div
                className="bg-white text-slate-900 rounded-xl shadow-2xl p-4 sm:p-10 w-full max-w-3xl transition-transform origin-top flex flex-col justify-between min-h-[480px] sm:min-h-[600px]"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                <div>
                  {/* Document Page Header */}
                  <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-wrap justify-between items-end gap-2">
                    <div>
                      <div className="text-[10px] tracking-wider text-slate-500 uppercase font-mono font-semibold">
                        VisuaLearn Academic Study Material · Faculty Handout
                      </div>
                      <h2 className="type-section-title text-slate-950 mt-1">
                        {activePage?.title || title}
                      </h2>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      Page {currentPage} of {totalPages}
                    </div>
                  </div>

                  {/* Document Body */}
                  <div className="space-y-4 text-sm leading-relaxed text-slate-800">
                    {activePage?.content && activePage.content.length > 0 ? (
                      activePage.content.map((paragraph, idx) => (
                        <p key={idx} className="text-justify leading-relaxed">
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-600 italic">
                        No text excerpt preview available for this page. Please use the Download or PDF Document tab to view the complete formatted PDF.
                      </p>
                    )}
                  </div>

                  {/* Diagram / Note Callout */}
                  {activePage?.diagramLabel && (
                    <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                      <div className="font-semibold flex items-center gap-1.5 mb-1 font-mono">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        FIGURE / DIAGRAM NOTE: {activePage.diagramLabel}
                      </div>
                      <p className="text-blue-700 text-[11px]">
                        Refer to course lectures and interactive simulations for 3D visual cross-examination.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 pt-4 mt-10 flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <span>Instructor: {teacherName || 'Faculty Course Lead'}</span>
                  <span>CONFIDENTIAL &amp; READ-ONLY · VISUALEARN PLATFORM</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Status Strip */}
        <div className="px-3 sm:px-5 py-2.5 pb-safe bg-slate-950 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-400">
          <span className="flex items-center gap-1.5 min-w-0">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Read-only access for verified students &amp; educators.</span>
          </span>
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>Open in New Tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
