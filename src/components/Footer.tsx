import React from 'react';
import { FEATURES } from '../config/features';
import { useTripleTapAdmin } from '../hooks/useTripleTapAdmin';

interface FooterProps {
  isAuthenticated: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  onNavigate: (view: string, params?: any) => void;
}

export const Footer: React.FC<FooterProps> = ({
  isAuthenticated,
  isTeacher,
  isAdmin,
  onNavigate,
}) => {
  const handleLogoTap = useTripleTapAdmin({
    onTripleTap: () => {
      if (isAuthenticated && isAdmin) {
        onNavigate('admin_dashboard');
      } else {
        onNavigate('admin_signin', {
          mode: 'login',
          message: 'Please sign in with administrator credentials.',
          redirectTarget: { view: 'admin_dashboard' },
        });
      }
    },
  });

  return (
    <footer className="border-t border-slate-200/80 bg-white pt-8 mt-0 pb-8 pb-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div
          onClick={handleLogoTap}
          className="flex items-center gap-2.5 flex-wrap justify-center md:justify-start select-none"
        >
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            V
          </div>
          <span className="font-semibold text-slate-800 tracking-tight text-sm">VisuaLearn</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">Modern Education Platform</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <button
            onClick={() => onNavigate('landing')}
            className="hover:text-blue-600 font-medium transition-colors cursor-pointer"
          >
            Home
          </button>
          <button
            onClick={() => {
              if (isAuthenticated || FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
                onNavigate('subjects');
              } else {
                onNavigate('signin', { mode: 'login', message: 'Please sign in to access classes.' });
              }
            }}
            className="hover:text-blue-600 font-medium transition-colors cursor-pointer"
          >
            Curriculum
          </button>
          <button
            onClick={() => {
              if (isAuthenticated) {
                onNavigate(
                  isAdmin
                    ? 'admin_dashboard'
                    : isTeacher
                    ? 'teacher_dashboard'
                    : 'student_dashboard'
                );
              } else {
                onNavigate('signin', { mode: 'login' });
              }
            }}
            className="hover:text-blue-600 font-medium transition-colors cursor-pointer"
          >
            Portal Access
          </button>
        </div>

        <div className="text-slate-400">
          © {new Date().getFullYear()} VisuaLearn. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
