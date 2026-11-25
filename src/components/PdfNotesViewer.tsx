import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Lock, CheckCircle2, UserCheck, Calendar, HardDrive } from 'lucide-react';
import { NoteDocument } from '../types';
import { api } from '../services/api';
import { PdfViewerModal } from './PdfViewerModal';

interface Props {
  subtopicId: string;
  notes: NoteDocument[];
  onNotesRead?: () => void;
}

export const PdfNotesViewer: React.FC<Props> = ({ subtopicId, notes, onNotesRead }) => {
  const [selectedNote, setSelectedNote] = useState<NoteDocument | null>(notes[0] || null);
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  useEffect(() => {
    if (notes.length > 0 && !selectedNote) {
      setSelectedNote(notes[0]);
    }
  }, [notes]);

  const handleOpenReader = (note: NoteDocument) => {
    setSelectedNote(note);
    setCurrentPage(1);
    setZoomLevel(100);
    setIsViewerOpen(true);
    api.recordNotesViewed(subtopicId).catch(console.error);
    if (onNotesRead) onNotesRead();
  };

  const handleDownload = (noteId: string) => {
    window.location.href = `/api/notes/${noteId}/download`;
  };

  if (!notes || notes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <FileText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
        <h4 className="text-sm font-semibold text-slate-300">No Notes Uploaded Yet</h4>
        <p className="text-xs text-slate-400 mt-1">
          Your instructor will upload verified course handouts and lecture summaries for this subtopic.
        </p>
      </div>
    );
  }

  const activePage = selectedNote?.pages.find((p) => p.pageNumber === currentPage) || selectedNote?.pages[0];

  return (
    <div className="space-y-4">
      {/* Notes List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notes.map((note) => (
          <div
            key={note.id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition-all shadow-lg flex flex-col justify-between min-w-0"
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-white text-sm leading-snug line-clamp-1">{note.title}</h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{note.file_name}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                {note.description}
              </p>

              {/* Metadata strip (No pills) */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                  {note.teacher_name}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 font-mono">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                  {note.file_size}
                </span>
                <span aria-hidden="true">·</span>
                <span>{note.pages_count} Pages</span>
              </div>
            </div>

            {/* Read & Download Action Buttons */}
            <div className="mt-5 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleOpenReader(note)}
                className="flex-1 py-2 px-3 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Read Notes
              </button>
              <button
                onClick={() => handleDownload(note.id)}
                className="py-2 px-3 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                title="Download verified document"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FULL READ-ONLY PDF DOCUMENT VIEWER MODAL */}
      {selectedNote && (
        <PdfViewerModal
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          title={selectedNote.title}
          fileUrl={selectedNote.file_url}
          fileName={selectedNote.file_name}
          teacherName={selectedNote.teacher_name}
          fileSize={selectedNote.file_size}
          pagesCount={selectedNote.pages_count}
          pagesContent={selectedNote.pages}
          downloadUrl={selectedNote.file_url || `/api/notes/${selectedNote.id}/download`}
        />
      )}
    </div>
  );
};
