import React, { useState, useEffect } from 'react';
import {
  FileText,
  Lock,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Search,
  AlertCircle,
  Clock,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api';

interface Props {
  materialId: string;
  onClose: () => void;
}

export const AuthenticatedPdfViewerModal: React.FC<Props> = ({ materialId, onClose }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<any>(null);
  const [watermark, setWatermark] = useState<{ studentName: string; studentId: string; subjectName: string } | null>(null);
  const [fileUrl, setFileUrl] = useState<string>('');

  // Reader state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    loadSecureAccess();
  }, [materialId]);

  const loadSecureAccess = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getSecureMaterialAccess(materialId);
      setMaterial(res.material);
      setWatermark(res.watermark);
      setFileUrl(res.fileUrl);
    } catch (err: any) {
      setError(err.message || 'Access Denied: You are not authorized to view this document.');
    } finally {
      setLoading(false);
    }
  };

  const handleSecureDownload = async () => {
    try {
      setDownloading(true);
      setDownloadError(null);
      const res = await api.requestMaterialDownloadToken(materialId);
      if (res.download_url) {
        const link = document.createElement('a');
        link.href = res.download_url;
        link.download = material?.file_name || 'secured_faculty_notes.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      setDownloadError(err.message || 'Download authorization failed.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-white">Verifying Enrollment & Security Token...</div>
          <p className="text-xs text-slate-400">Authenticating access with faculty authorization system.</p>
        </div>
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Protected Document Access Restricted</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{error}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </div>
    );
  }

  // Parse structured pages if embedded or mock pages
  const pages = material.pages_content && material.pages_content.length > 0
    ? material.pages_content
    : [
        {
          pageNumber: 1,
          title: material.title,
          content: [
            material.description || 'Verified Lecture Notes provided by course instructor.',
            'Course topic reference document with detailed theoretical derivations and examination examples.',
            'Confidential faculty distribution document for enrolled course attendees.',
          ],
        },
      ];
  const totalPages = pages.length;
  const activePage = pages[currentPage - 1] || pages[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        className={`bg-slate-900 border border-slate-800 w-full flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'h-dvh max-w-full rounded-none'
            : 'h-dvh sm:h-[92dvh] sm:max-w-5xl rounded-none sm:rounded-2xl'
        }`}
      >
        {/* Top Header & Security Banner */}
        <div className="px-3 sm:px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-white pt-safe">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-full">{material.title}</h3>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  Authenticated Session
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5 truncate">
                {material.file_name} · {material.file_size || '2.4 MB'}
              </div>
            </div>
          </div>

          {/* Top Actions: Zoom, Download, Fullscreen, Close */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-slate-400 px-1">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-slate-800 mx-1" />
            </div>

            <button
              onClick={handleSecureDownload}
              disabled={downloading}
              className="py-1.5 px-2.5 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Generate temporary single-use download token"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden min-[380px]:inline">{downloading ? 'Authorizing...' : 'Download'}</span>
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden sm:flex p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 px-2.5 bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Close Viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="px-4 py-2 bg-red-950/90 border-b border-red-800/70 text-red-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{downloadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setDownloadError(null)}
              className="text-red-300 hover:text-white shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Document Viewport with subtle Security Watermark */}
        <div className="flex-1 overflow-auto bg-slate-950 p-3 sm:p-6 flex justify-center relative select-none">
          {/* Subtle Dynamic Security Watermark (Student Name, Student ID, Subject) */}
          {watermark && (
            <div
              className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-around items-center opacity-[0.07] overflow-hidden"
              style={{ transform: 'rotate(-25deg)' }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="text-sm sm:text-lg font-mono font-bold tracking-widest text-slate-300 text-center">
                  CONFIDENTIAL · {watermark.studentName} · {watermark.studentId} · {watermark.subjectName}
                </div>
              ))}
            </div>
          )}

          {/* Render real PDF embed if available, or digital textbook page */}
          {material.storage_path ? (
            <div
              className="w-full max-w-4xl bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-800 transition-all"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            >
              <iframe
                src={`/api/materials/${material.id}/stream#toolbar=0`}
                className="w-full h-full min-h-[460px] sm:min-h-[600px] border-0"
                title={material.title}
              />
            </div>
          ) : (
            /* Digital Textbook Page View with page-flip navigation */
            <div
              className="w-full max-w-3xl bg-white text-slate-900 rounded-xl p-4 sm:p-10 shadow-2xl border border-slate-200 min-h-[440px] sm:min-h-[540px] flex flex-col justify-between transition-all"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
            >
              <div className="space-y-5 sm:space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                  <div className="min-w-0">
                    <span className="type-label uppercase text-blue-600 tracking-wider">
                      {material.subject_name || 'Faculty Curriculum Notes'}
                    </span>
                    <h2 className="type-section-title text-slate-900 mt-1 break-words">{activePage.title}</h2>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-400 shrink-0">
                    Page {currentPage} of {totalPages}
                  </span>
                </div>

                <div className="space-y-4 text-sm leading-relaxed text-slate-700">
                  {activePage.content.map((paragraph: string, pIdx: number) => (
                    <p key={pIdx}>{paragraph}</p>
                  ))}
                </div>
              </div>

              {/* Page footer stamp */}
              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
                <span>VisuaLearn Secured Textbook System</span>
                <span>Page {currentPage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Pagination & Page Flipping Toolbar */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 pb-safe bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="py-1.5 px-2.5 sm:px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous Page</span>
              <span className="sm:hidden">Prev</span>
            </button>

            <span className="px-2 sm:px-3 py-1 font-mono font-semibold text-slate-200 whitespace-nowrap">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="py-1.5 px-2.5 sm:px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <span className="hidden sm:inline">Next Page</span>
              <span className="sm:hidden">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden md:flex items-center gap-4 text-slate-400">
            <span>Watermark: Enrolled Student ID</span>
            <span>Temporary Download Tokens: 120s TTL</span>
          </div>
        </div>
      </div>
    </div>
  );
};
