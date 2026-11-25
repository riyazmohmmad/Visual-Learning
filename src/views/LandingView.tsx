import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  Dna,
  Atom,
  Calculator,
  Play,
  Activity,
  FileText,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  GraduationCap,
  UserCheck,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FEATURES } from '../config/features';
import { api } from '../services/api';
import { Subject } from '../types';

interface Props {
  onNavigate: (view: string, params?: any) => void;
}

export const LandingView: React.FC<Props> = ({ onNavigate }) => {
  const { isAuthenticated, isTeacher, isAdmin } = useAuth();
  const [featuredSubjects, setFeaturedSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    api.getSubjects()
      .then((res) => {
        if (active && res.subjects) {
          setFeaturedSubjects(res.subjects.slice(0, 3));
        }
      })
      .catch(() => {
        if (active) setFeaturedSubjects([]);
      })
      .finally(() => {
        if (active) setLoadingSubjects(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleStartLearning = () => {
    if (isAuthenticated) {
      if (isAdmin) {
        onNavigate('admin_dashboard');
      } else {
        onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard');
      }
    } else {
      onNavigate('signin', { mode: 'login', role: 'student', redirectTarget: { view: 'student_dashboard' } });
    }
  };

  const handleExploreSubjects = () => {
    onNavigate('subjects');
  };

  return (
    <div className="space-y-12 sm:space-y-20">
      {/* 1. HERO SECTION */}
      <section className="relative pt-6 sm:pt-20 pb-8 sm:pb-12 overflow-hidden">
        {/* Soft background ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-50/70 via-indigo-50/30 to-transparent pointer-events-none -z-10 rounded-b-3xl" />

        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto space-y-4 sm:space-y-5">
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
              Visual Curriculum &amp; Live Classroom Platform
            </div>

            <h1 className="type-display text-slate-900">
              Learn Smarter. <span className="text-blue-600">Understand Deeper.</span>
            </h1>

            <p className="type-body sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Structured visual lessons, interactive simulations, live classes, faculty notes, AI doubt solving, and mastery quizzes — unified for students, teachers, and institutions.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
              <button
                onClick={handleStartLearning}
                className="w-full sm:w-auto justify-center py-3 px-5 sm:px-6 min-h-[46px] type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm hover:shadow flex items-center gap-2 group cursor-pointer active:scale-[0.98]"
              >
                <span>{isAuthenticated ? 'Open My Portal' : 'Start Learning'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Public Portal Access Buttons - Configurable via FEATURES flag */}
              {FEATURES.PUBLIC_PORTAL_BUTTONS_ENABLED && (
                <>
                  <button
                    onClick={() => onNavigate('student_dashboard', { message: 'Please sign in as a student to continue.' })}
                    className="w-full sm:w-auto justify-center min-h-[44px] py-2.5 px-4 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs active:scale-[0.98]"
                  >
                    <GraduationCap className="w-4 h-4 text-blue-600" />
                    <span>Student Portal</span>
                  </button>

                  <button
                    onClick={() => onNavigate('teacher_dashboard', { message: 'Please sign in as a teacher to continue.' })}
                    className="w-full sm:w-auto justify-center min-h-[44px] py-2.5 px-4 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs active:scale-[0.98]"
                  >
                    <UserCheck className="w-4 h-4 text-purple-600" />
                    <span>Teacher Portal</span>
                  </button>
                </>
              )}

              {/* Public Explore Subjects Button - Configurable via FEATURES flag */}
              {FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED && (
                <button
                  onClick={handleExploreSubjects}
                  className="w-full sm:w-auto justify-center min-h-[44px] py-2.5 px-4 text-xs sm:text-sm font-medium bg-slate-100 hover:bg-slate-200/70 text-slate-700 rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
                >
                  Explore Subjects
                </button>
              )}
            </div>
          </div>

          {/* Interactive Educational Workflow Banner: Chapter → Animation → Notes → Quiz → Progress */}
          <div className="mt-10 sm:mt-14 max-w-4xl mx-auto">
            <div className="p-5 sm:p-7 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider text-center mb-5 flex items-center justify-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>The VisuaLearn Smart Study Cycle</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* Step 1: Chapter */}
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900">01. Chapter</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Structured syllabus</p>
                </div>

                {/* Step 2: Animation & Video */}
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200 flex flex-col items-center text-center shadow-2xs">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2">
                    <Play className="w-4 h-4 fill-current" />
                  </div>
                  <div className="text-xs font-semibold text-blue-900">02. Animation</div>
                  <p className="text-[11px] text-blue-700 mt-0.5">Visual simulation</p>
                </div>

                {/* Step 3: Notes */}
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900">03. Notes</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Verified PDFs</p>
                </div>

                {/* Step 4: Quiz */}
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900">04. Quiz</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Active practice</p>
                </div>

                {/* Step 5: Progress */}
                <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900">05. Progress</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Mastery verified</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CURATED SUBJECT SHOWCASE */}
      {FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="type-section-title text-slate-900">
                Featured STEM Curricula
              </h2>
              <p className="type-body text-slate-600 mt-1">
                Explore structured chapters with embedded interactive laboratory sandboxes
              </p>
            </div>
            <button
              onClick={() => onNavigate('subjects')}
              className="type-btn text-blue-600 hover:text-blue-700 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <span>View All Subjects</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {featuredSubjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {featuredSubjects.map((subj) => (
                <div
                  key={subj.id}
                  onClick={() => onNavigate('subject_detail', { id: subj.id })}
                  className="group cursor-pointer bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md rounded-2xl p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3.5 group-hover:scale-105 transition-transform">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <h3 className="type-card-title text-slate-900 group-hover:text-blue-600 transition-colors">
                      {subj.name}
                    </h3>
                    <p className="text-[13px] sm:text-sm text-slate-600 mt-1.5 leading-relaxed line-clamp-3">
                      {subj.description || 'Structured academic curriculum with chapters, visual concepts, and classroom resources.'}
                    </p>
                    <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500">
                      <span>{subj.section ? `Section ${subj.section}` : 'Curriculum Class'}</span>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between text-xs font-semibold text-blue-600">
                    <span>Open Class</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center max-w-xl mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No public curricula published yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Instructors can create STEM courses and live classes directly from the teacher dashboard.
              </p>
              <button
                onClick={() => onNavigate('subjects')}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Explore Course Directory</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>
      )}

      {/* 3. HOW IT WORKS (Methodology) */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="type-section-title text-slate-900">
            How VisuaLearn Works
          </h2>
          <p className="type-body text-slate-600 mt-2">
            A research-backed cognitive study methodology that transitions students from abstract theory to tangible intuition.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-xs">
            <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">STAGE 1</div>
            <h3 className="type-card-title text-slate-900">Understand &amp; Watch</h3>
            <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed">
              Begin with concise conceptual breakdowns followed by high-definition educational video walkthroughs with automatic progress saving.
            </p>
          </div>

          <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-xs">
            <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">STAGE 2</div>
            <h3 className="type-card-title text-slate-900">Explore &amp; Read</h3>
            <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed">
              Interact directly with dynamic laboratory sandboxes—manipulate mass, force, slopes, and cell organelles—then review teacher notes.
            </p>
          </div>

          <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-xs">
            <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">STAGE 3</div>
            <h3 className="type-card-title text-slate-900">Practice &amp; Progress</h3>
            <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed">
              Reinforce understanding with interactive quizzes. If a question is missed, receive customized smart study recommendations.
            </p>
          </div>
        </div>
      </section>

      {/* 4. FEATURES SECTION */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="type-section-title text-slate-900">
            Built for Students &amp; Educators
          </h2>
          <p className="type-body text-slate-600 mt-2">
            Engineered with strict role-based access control, persistent progress tracking, and secure document distribution.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-xs">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-1">
              <Activity className="w-5 h-5" />
            </div>
            <h4 className="type-card-title text-slate-900">Interactive Simulations</h4>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Real-time physics engines, coordinate graphers, and cellular models right in the browser.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-xs">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-1">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="type-card-title text-slate-900">Faculty Notes Security</h4>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Tamper-proof notes with zoom, page flipping, and authenticated document download.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-xs">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-1">
              <Sparkles className="w-5 h-5" />
            </div>
            <h4 className="type-card-title text-slate-900">Smart Study System</h4>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Automatic remedial study workflows generated when quiz performance requires reinforcement.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-xs">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h4 className="type-card-title text-slate-900">Progress Analytics</h4>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Detailed tracking for video completion percentages, quiz scores, and chapter mastery.
            </p>
          </div>
        </div>
      </section>

      {/* 5. ABOUT SECTION & CTA BANNER */}
      <section id="about" className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-10 rounded-3xl bg-blue-600 text-white text-center space-y-5 shadow-sm">
          <div className="max-w-2xl mx-auto space-y-2.5">
            <h3 className="type-page-title">
              Ready to Transform Your Learning Journey?
            </h3>
            <p className="type-body text-blue-100 leading-relaxed">
              Join thousands of students understanding complex STEM subjects step-by-step through visualization, animated media, and verified teacher notes.
            </p>
          </div>

          <div className="pt-1 flex justify-center gap-4">
            <button
              onClick={handleStartLearning}
              className="w-full sm:w-auto min-h-[46px] py-2.5 px-7 type-btn bg-white text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              Get Started Now
            </button>
          </div>
        </div>
      </section>

      {/* 6. CREATOR CREDIT SECTION */}
      <section
        aria-label="Creator credit"
        className="!mt-0 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 flex flex-col items-center justify-center text-center"
      >
        <p className="text-lg sm:text-xl md:text-[22px] font-bold tracking-tight text-slate-900">
          Created by Riyaz Mohmmad
        </p>

        <div className="mt-5 sm:mt-6 flex items-center justify-center gap-4 sm:gap-5">
          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/riyaz-mohmmad-aa66b4328"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#0A66C2]/35 hover:shadow-md hover:shadow-[#0A66C2]/10 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#0A66C2"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              />
            </svg>
          </a>

          {/* Instagram */}
          <a
            href="https://www.instagram.com/riaazkhn?lqvp=MWp6ZHNteWZ4cXVkaA=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center transition-all duration-200 ease-out hover:-translate-y-1 hover:border-pink-400/40 hover:shadow-md hover:shadow-pink-500/10 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id="visualearn-ig-gradient" cx="30%" cy="107%" r="150%">
                  <stop offset="0%" stopColor="#fdf497" />
                  <stop offset="5%" stopColor="#fdf497" />
                  <stop offset="45%" stopColor="#fd5949" />
                  <stop offset="60%" stopColor="#d6249f" />
                  <stop offset="90%" stopColor="#285AEB" />
                </radialGradient>
              </defs>
              <path
                fill="url(#visualearn-ig-gradient)"
                d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
              />
            </svg>
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/riyazmohmmad"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center transition-all duration-200 ease-out hover:-translate-y-1 hover:border-slate-400/70 hover:shadow-md hover:shadow-slate-900/10 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#181717"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
};
