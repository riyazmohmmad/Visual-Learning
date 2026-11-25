import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SearchModal } from './components/SearchModal';
import { AuthModal } from './components/AuthModal';
import { LandingView } from './views/LandingView';
import { SignInView } from './views/SignInView';
import { StudentDashboardView } from './views/StudentDashboardView';
import { TeacherDashboardView } from './views/TeacherDashboardView';
import { SubjectsListView } from './views/SubjectsListView';
import { SubjectView } from './views/SubjectView';
import { ChapterView } from './views/ChapterView';
import { SubtopicLearningView } from './views/SubtopicLearningView';
import { LiveClassroomView } from './views/LiveClassroomView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { AdminSignInView } from './views/AdminSignInView';
import { EditProfileView } from './views/EditProfileView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FEATURES } from './config/features';

export interface NavigationState {
  view:
    | 'landing'
    | 'signin'
    | 'admin_signin'
    | 'admin_security_setup'
    | 'student_dashboard'
    | 'teacher_dashboard'
    | 'admin_dashboard'
    | 'subjects'
    | 'subject_detail'
    | 'chapter_detail'
    | 'subtopic_learn'
    | 'live_classroom'
    | 'edit_profile';
  params?: any;
}

const AppContent: React.FC = () => {
  const {
    user,
    loading,
    isAuthenticated,
    isTeacher,
    isStudent,
    isAdmin,
    isSuperAdmin,
    isSubAdmin,
    logout,
    authModalOpen,
    authModalMode,
    authModalInitialRole,
    closeAuthModal,
    openAuthModal,
  } = useAuth();

  const [navState, setNavState] = useState<NavigationState>({ view: 'landing' });
  const [routeInitialized, setRouteInitialized] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [rbacNotice, setRbacNotice] = useState<string | null>(null);

  // Keyboard shortcut ⌘K / Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Only open search if authenticated or public browsing is enabled
        if (isAuthenticated || FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          setIsSearchOpen(true);
        }
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Central Route & Direct URL Synchronizer with Strict Authentication and RBAC Guards
  useEffect(() => {
    if (loading) return; // Wait for initial session validation from backend

    const handleUrlSync = () => {
      const path = window.location.pathname;

      // 1. Direct Live Classroom URL: /live-class/:id or /teacher/live-class/:id or /student/live-class/:id
      const liveMatch = path.match(/\/(?:teacher|student)?\/?live-class\/(.+)/);
      if (liveMatch && liveMatch[1]) {
        const id = liveMatch[1];
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/signin');
          setNavState({
            view: 'signin',
            params: {
              mode: 'login',
              message: 'Please sign in to access your live classroom.',
              redirectTarget: { view: 'live_classroom', params: { classId: id, sessionId: id } },
            },
          });
        } else {
          setNavState({
            view: 'live_classroom',
            params: { classId: id, sessionId: id },
          });
        }
        return;
      }

      // Helper to resolve authoritative dashboard view & path for current user role
      const getDashboardRoute = () => {
        if (isAdmin) return { view: 'admin_dashboard' as const, url: '/admin' };
        if (isTeacher) return { view: 'teacher_dashboard' as const, url: '/teacher' };
        return { view: 'student_dashboard' as const, url: '/student' };
      };

      // 2. Direct Sign In / Register / Forgot Password routes
      if (path === '/signin' || path === '/login') {
        if (isAuthenticated) {
          const dest = getDashboardRoute();
          window.history.replaceState(null, '', dest.url);
          setNavState({ view: dest.view });
        } else {
          setNavState({ view: 'signin', params: { mode: 'login' } });
        }
        return;
      }
      if (path === '/register' || path === '/signup') {
        if (isAuthenticated) {
          const dest = getDashboardRoute();
          window.history.replaceState(null, '', dest.url);
          setNavState({ view: dest.view });
        } else {
          setNavState({ view: 'signin', params: { mode: 'register' } });
        }
        return;
      }
      if (path === '/forgot-password') {
        setNavState({ view: 'signin', params: { mode: 'forgot' } });
        return;
      }

      // 3. Student Portal / Dashboard routes: /student, /student/dashboard, /student/classes, /student/*
      if (path === '/student' || path.startsWith('/student/')) {
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/signin');
          setNavState({
            view: 'signin',
            params: {
              mode: 'login',
              role: 'student',
              message: 'Please sign in as a student to continue.',
              redirectTarget: { view: 'student_dashboard' },
            },
          });
        } else if (!isStudent) {
          const dest = getDashboardRoute();
          window.history.replaceState(null, '', dest.url);
          setRbacNotice(`Access denied: Redirected to your ${isAdmin ? 'Admin' : 'Teacher'} Dashboard.`);
          setNavState({ view: dest.view });
        } else {
          setNavState({ view: 'student_dashboard' });
        }
        return;
      }

      // 4. Teacher Portal / Dashboard routes: /teacher, /teacher/dashboard, /teacher/classes, /teacher/*
      if (path === '/teacher' || path.startsWith('/teacher/')) {
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/signin');
          setNavState({
            view: 'signin',
            params: {
              mode: 'login',
              role: 'teacher',
              message: 'Please sign in as a teacher to continue.',
              redirectTarget: { view: 'teacher_dashboard' },
            },
          });
        } else if (!isTeacher) {
          const dest = getDashboardRoute();
          window.history.replaceState(null, '', dest.url);
          setRbacNotice(`Access denied: Teacher credentials required.`);
          setNavState({ view: dest.view });
        } else {
          setNavState({ view: 'teacher_dashboard' });
        }
        return;
      }

      // 5. Admin Security / Account settings direct URL route: /admin/security-setup, /admin/account
      if (path === '/admin/security-setup' || path === '/admin/account') {
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/admin/login');
          setNavState({
            view: 'admin_signin',
            params: {
              mode: 'login',
              message: 'Please sign in with administrator credentials.',
              redirectTarget: { view: 'admin_dashboard', params: { activeTab: 'security' } },
            },
          });
        } else if (!isAdmin) {
          window.history.replaceState(null, '', isTeacher ? '/teacher' : '/student');
          setRbacNotice('Access denied: Administrator privileges required.');
          setNavState({ view: isTeacher ? 'teacher_dashboard' : 'student_dashboard' });
        } else {
          window.history.replaceState(null, '', '/admin');
          setNavState({ view: 'admin_dashboard', params: { activeTab: 'security' } });
        }
        return;
      }

      // 6. Dedicated Single Admin Authentication routes: /admin/login, /admin/signin, /admin/setup, /admin/forgot-password
      if (path === '/admin/login' || path === '/admin/signin' || path === '/admin/setup') {
        if (isAuthenticated && isAdmin) {
          window.history.replaceState(null, '', '/admin');
          setNavState({ view: 'admin_dashboard' });
        } else {
          setNavState({
            view: 'admin_signin',
            params: { mode: path === '/admin/setup' ? 'setup' : 'login' },
          });
        }
        return;
      }
      if (path === '/admin/forgot-password') {
        setNavState({ view: 'admin_signin', params: { mode: 'forgot' } });
        return;
      }

      // 7. Admin Portal routes: /admin, /admin/*
      if (path === '/admin' || path.startsWith('/admin/')) {
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/admin/login');
          setNavState({
            view: 'admin_signin',
            params: {
              mode: 'login',
              message: 'Please sign in with administrator credentials.',
              redirectTarget: { view: 'admin_dashboard' },
            },
          });
        } else if (!isAdmin) {
          window.history.replaceState(null, '', isTeacher ? '/teacher' : '/student');
          setRbacNotice('Access denied: Administrator privileges required.');
          setNavState({ view: isTeacher ? 'teacher_dashboard' : 'student_dashboard' });
        } else {
          setNavState({ view: 'admin_dashboard' });
        }
        return;
      }

      // 5b. User Profile & Edit Profile routes: /profile, /profile/edit, /settings
      if (path === '/profile' || path === '/profile/edit' || path === '/settings' || path === '/settings/profile') {
        if (!isAuthenticated) {
          window.history.replaceState(null, '', '/signin');
          setNavState({
            view: 'signin',
            params: {
              mode: 'login',
              message: 'Please sign in to access your profile.',
              redirectTarget: { view: 'edit_profile' },
            },
          });
        } else {
          setNavState({ view: 'edit_profile' });
        }
        return;
      }

      // 6. Curriculum Subjects list, detail, or class routes:
      // /subjects, /subjects/*, /classes, /classes/*, /chapter/*, /subtopic/*
      if (
        path === '/subjects' ||
        path.startsWith('/subjects/') ||
        path === '/classes' ||
        path.startsWith('/classes/') ||
        path.startsWith('/chapter/') ||
        path.startsWith('/subtopic/')
      ) {
        if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          window.history.replaceState(null, '', '/signin');
          setNavState({
            view: 'signin',
            params: {
              mode: 'login',
              message: 'Please sign in to access classes.',
              redirectTarget: { view: 'subjects' },
            },
          });
          return;
        }

        if (path === '/subjects' || path === '/classes') {
          setNavState({ view: 'subjects' });
          return;
        }

        const subjMatch = path.match(/\/(?:subjects|classes)\/(.+)/);
        if (subjMatch && subjMatch[1]) {
          setNavState({ view: 'subject_detail', params: { id: subjMatch[1] } });
          return;
        }

        const chapMatch = path.match(/\/chapter\/(.+)/);
        if (chapMatch && chapMatch[1]) {
          setNavState({ view: 'chapter_detail', params: { id: chapMatch[1] } });
          return;
        }

        const subMatch = path.match(/\/subtopic\/(.+)/);
        if (subMatch && subMatch[1]) {
          setNavState({ view: 'subtopic_learn', params: { id: subMatch[1] } });
          return;
        }
      }

      // 7. Explicit public overview page (/home)
      if (path === '/home') {
        setNavState({ view: 'landing' });
        return;
      }

      // 8. Root entry (/): Auto-redirect authenticated users to their role dashboard;
      //    otherwise show the Login screen (returning users are never asked to register again).
      if (isAuthenticated) {
        const dest = getDashboardRoute();
        window.history.replaceState(null, '', dest.url);
        setNavState({ view: dest.view });
      } else {
        setNavState({ view: 'signin', params: { mode: 'login' } });
      }
    };

    handleUrlSync();
    setRouteInitialized(true);
    window.addEventListener('popstate', handleUrlSync);
    return () => window.removeEventListener('popstate', handleUrlSync);
  }, [loading, isAuthenticated, isTeacher, isStudent, isAdmin]);

  // Clean Navigation Handler that enforces Auth and RBAC
  const handleNavigate = (view: string, params?: any) => {
    setRbacNotice(null);

    // SIGN IN / AUTHENTICATION (Full-page)
    if (view === 'signin') {
      const mode = params?.mode || 'login';
      const url = mode === 'register' ? '/register' : mode === 'forgot' ? '/forgot-password' : '/signin';
      window.history.pushState(null, '', url);
      setNavState({ view: 'signin', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // STUDENT DASHBOARD / PORTAL
    if (view === 'student_dashboard') {
      if (!isAuthenticated) {
        const message = params?.message || 'Please sign in as a student to continue.';
        window.history.pushState(null, '', '/signin');
        setNavState({
          view: 'signin',
          params: {
            mode: 'login',
            role: 'student',
            message,
            redirectTarget: { view: 'student_dashboard' },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!isStudent) {
        const fallbackUrl = isAdmin ? '/admin' : '/teacher';
        const fallbackView = isAdmin ? 'admin_dashboard' : 'teacher_dashboard';
        window.history.replaceState(null, '', fallbackUrl);
        setRbacNotice(`Access denied: You are signed in as ${isAdmin ? 'an Administrator' : 'a Teacher'}.`);
        setNavState({ view: fallbackView });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/student');
      setNavState({ view: 'student_dashboard', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // TEACHER DASHBOARD / PORTAL
    if (view === 'teacher_dashboard') {
      if (!isAuthenticated) {
        const message = params?.message || 'Please sign in as a teacher to continue.';
        window.history.pushState(null, '', '/signin');
        setNavState({
          view: 'signin',
          params: {
            mode: 'login',
            role: 'teacher',
            message,
            redirectTarget: { view: 'teacher_dashboard' },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!isTeacher) {
        const fallbackUrl = isAdmin ? '/admin' : '/student';
        const fallbackView = isAdmin ? 'admin_dashboard' : 'student_dashboard';
        window.history.replaceState(null, '', fallbackUrl);
        setRbacNotice('Access denied: Teacher credentials required.');
        setNavState({ view: fallbackView });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/teacher');
      setNavState({ view: 'teacher_dashboard', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // ADMIN ACCOUNT & SECURITY SETTINGS
    if (view === 'admin_security_setup') {
      if (!isAuthenticated) {
        window.history.pushState(null, '', '/admin/login');
        setNavState({
          view: 'admin_signin',
          params: {
            mode: 'login',
            message: 'Please sign in with administrator credentials.',
            redirectTarget: { view: 'admin_dashboard', params: { activeTab: 'security' } },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!isAdmin) {
        window.history.replaceState(null, '', isTeacher ? '/teacher' : '/student');
        setRbacNotice('Access denied: Administrator privileges required.');
        setNavState({ view: isTeacher ? 'teacher_dashboard' : 'student_dashboard' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/admin');
      setNavState({ view: 'admin_dashboard', params: { activeTab: 'security', ...params } });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // DEDICATED SINGLE ADMIN LOGIN
    if (view === 'admin_signin') {
      if (isAuthenticated && isAdmin) {
        window.history.pushState(null, '', '/admin');
        setNavState({ view: 'admin_dashboard' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/admin/login');
      setNavState({ view: 'admin_signin', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // ADMIN DASHBOARD / PORTAL
    if (view === 'admin_dashboard') {
      if (!isAuthenticated) {
        const message = params?.message || 'Please sign in with administrator credentials.';
        window.history.pushState(null, '', '/admin/login');
        setNavState({
          view: 'admin_signin',
          params: {
            mode: 'login',
            message,
            redirectTarget: { view: 'admin_dashboard', params },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!isAdmin) {
        window.history.replaceState(null, '', isTeacher ? '/teacher' : '/student');
        setRbacNotice('Access denied: Administrator privileges required.');
        setNavState({ view: isTeacher ? 'teacher_dashboard' : 'student_dashboard' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/admin');
      setNavState({ view: 'admin_dashboard', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // USER PROFILE & EDIT PROFILE
    if (view === 'edit_profile') {
      if (!isAuthenticated) {
        window.history.pushState(null, '', '/signin');
        setNavState({
          view: 'signin',
          params: {
            mode: 'login',
            message: 'Please sign in to access your profile.',
            redirectTarget: { view: 'edit_profile' },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.pushState(null, '', '/profile/edit');
      setNavState({ view: 'edit_profile', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // FULL-SCREEN LIVE CLASSROOM
    if (view === 'live_classroom') {
      if (!isAuthenticated) {
        const message = 'Please sign in to access your live classroom.';
        window.history.pushState(null, '', '/signin');
        setNavState({
          view: 'signin',
          params: {
            mode: 'login',
            message,
            redirectTarget: { view: 'live_classroom', params },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const targetId = params?.sessionId || params?.classId || 'session';
      const rolePrefix = isTeacher ? 'teacher' : 'student';
      window.history.pushState(null, '', `/${rolePrefix}/live-class/${targetId}`);
      setNavState({ view: 'live_classroom', params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // CURRICULUM SUBJECTS & CLASSES
    if (view === 'subjects' || view === 'subject_detail' || view === 'chapter_detail' || view === 'subtopic_learn') {
      if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
        window.history.pushState(null, '', '/signin');
        setNavState({
          view: 'signin',
          params: {
            mode: 'login',
            message: 'Please sign in to access classes.',
            redirectTarget: { view, params },
          },
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (view === 'subjects') {
        window.history.pushState(null, '', '/subjects');
      }
      setNavState({ view: view as any, params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // PUBLIC HOME / LANDING VIEW
    if (view === 'landing') {
      window.history.pushState(null, '', '/home');
      setNavState({ view: 'landing' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Default other views
    setNavState({ view: view as any, params });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Secure Logout Handler
  const handleLogout = async () => {
    await logout();
    window.history.replaceState(null, '', '/signin');
    setNavState({
      view: 'signin',
      params: {
        mode: 'login',
        message: 'You have been signed out successfully.',
      },
    });
  };

  // 0. Initial Session & Route Validation Screen (prevents landing/footer/login flash before auth & route resolve)
  if (loading || !routeInitialized) {
    return (
      <div className="w-full min-h-dvh bg-[#F8FAFC] flex flex-col items-center justify-center space-y-4 text-slate-600 select-none font-sans px-4 py-8">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shadow-xs" />
        <div className="text-center space-y-1">
          <div className="text-sm font-bold text-slate-900 tracking-tight">VisuaLearn</div>
          <div className="text-xs font-medium text-slate-500">Checking authentication session...</div>
        </div>
      </div>
    );
  }

  // 1. FULL-SCREEN DEDICATED SIGN-IN PAGE (Occupies 100vw & min-100vh with no dashboard headers or footers)
  if (navState.view === 'signin') {
    return (
      <SignInView
        initialMode={navState.params?.mode || 'login'}
        initialRole={navState.params?.role || 'student'}
        noticeMessage={navState.params?.message || null}
        redirectTarget={navState.params?.redirectTarget || null}
        onNavigate={handleNavigate}
      />
    );
  }

  // 1b. FULL-SCREEN DEDICATED ADMIN SIGN-IN PAGE (Strictly separated from student/teacher auth)
  if (navState.view === 'admin_signin') {
    return (
      <AdminSignInView
        initialMode={navState.params?.mode || 'login'}
        noticeMessage={navState.params?.message || null}
        redirectTarget={navState.params?.redirectTarget || null}
        onNavigate={handleNavigate}
      />
    );
  }

  if (navState.view === 'admin_security_setup') {
    if (!isAuthenticated) {
      return (
        <AdminSignInView
          initialMode="login"
          noticeMessage="Please sign in with administrator credentials."
          redirectTarget={{ view: 'admin_dashboard', params: { activeTab: 'security' } }}
          onNavigate={handleNavigate}
        />
      );
    }
    return <AdminDashboardView initialTab="security" onNavigate={handleNavigate} />;
  }

  // Safe redirect helper to avoid updating state during render
  const RedirectEffect: React.FC<{ to: string; params?: any }> = ({ to, params }) => {
    useEffect(() => {
      handleNavigate(to, params);
    }, [to]);
    return null;
  };

  // 2. FULL-SCREEN LIVE CLASSROOM (No dashboard header, sidebar, or footer; 100vw, 100vh)
  if (navState.view === 'live_classroom') {
    if (!isAuthenticated) {
      return (
        <RedirectEffect
          to="signin"
          params={{
            mode: 'login',
            message: 'Please sign in to access your live classroom.',
            redirectTarget: { view: 'live_classroom', params: navState.params },
          }}
        />
      );
    }

    return (
      <div className="min-h-dvh w-full bg-slate-950 text-slate-100 select-none flex flex-col">
        <LiveClassroomView
          classId={navState.params?.classId || ''}
          sessionId={navState.params?.sessionId}
          sessionTitle={navState.params?.sessionTitle}
          onNavigate={handleNavigate}
        />
      </div>
    );
  }

  // 3. Normal Viewport Views (with standard Top Navbar & Footer)
  const renderCurrentView = () => {
    switch (navState.view) {
      case 'landing':
        return <LandingView onNavigate={handleNavigate} />;

      case 'student_dashboard':
        if (!isAuthenticated) {
          return (
            <RedirectEffect
              to="signin"
              params={{
                mode: 'login',
                role: 'student',
                message: 'Please sign in as a student to continue.',
                redirectTarget: { view: 'student_dashboard', params: navState.params },
              }}
            />
          );
        }
        if (!isStudent) {
          return <RedirectEffect to={isAdmin ? 'admin_dashboard' : 'teacher_dashboard'} />;
        }
        return (
          <StudentDashboardView
            initialTab={navState.params?.activeTab}
            onNavigate={handleNavigate}
          />
        );

      case 'teacher_dashboard':
        if (!isAuthenticated) {
          return (
            <RedirectEffect
              to="signin"
              params={{
                mode: 'login',
                role: 'teacher',
                message: 'Please sign in as a teacher to continue.',
                redirectTarget: { view: 'teacher_dashboard', params: navState.params },
              }}
            />
          );
        }
        if (!isTeacher) {
          return <RedirectEffect to={isAdmin ? 'admin_dashboard' : 'student_dashboard'} />;
        }
        return <TeacherDashboardView initialTab={navState.params?.activeTab} onNavigate={handleNavigate} />;

      case 'admin_dashboard':
        if (!isAuthenticated) {
          return (
            <RedirectEffect
              to="admin_signin"
              params={{
                mode: 'login',
                message: 'Please sign in with administrator credentials.',
                redirectTarget: { view: 'admin_dashboard', params: navState.params },
              }}
            />
          );
        }
        if (!isAdmin) {
          return <RedirectEffect to={isTeacher ? 'teacher_dashboard' : 'student_dashboard'} />;
        }
        return <AdminDashboardView initialTab={navState.params?.activeTab} onNavigate={handleNavigate} />;

      case 'subjects':
        if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          return <RedirectEffect to="signin" params={{ mode: 'login', message: 'Please sign in to access classes.' }} />;
        }
        return <SubjectsListView onNavigate={handleNavigate} />;

      case 'subject_detail':
        if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          return <RedirectEffect to="signin" params={{ mode: 'login', message: 'Please sign in to access classes.' }} />;
        }
        return (
          <SubjectView
            subjectId={navState.params?.id || ''}
            onNavigate={handleNavigate}
          />
        );

      case 'chapter_detail':
        if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          return <RedirectEffect to="signin" params={{ mode: 'login', message: 'Please sign in to access classes.' }} />;
        }
        return (
          <ChapterView
            chapterId={navState.params?.id || ''}
            onNavigate={handleNavigate}
          />
        );

      case 'subtopic_learn':
        if (!isAuthenticated && !FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) {
          return <RedirectEffect to="signin" params={{ mode: 'login', message: 'Please sign in to access classes.' }} />;
        }
        return (
          <SubtopicLearningView
            subtopicId={navState.params?.id || ''}
            onNavigate={handleNavigate}
          />
        );

      case 'edit_profile':
        if (!isAuthenticated) {
          return (
            <RedirectEffect
              to="signin"
              params={{
                mode: 'login',
                message: 'Please sign in to access your profile.',
                redirectTarget: { view: 'edit_profile' },
              }}
            />
          );
        }
        return <EditProfileView onNavigate={handleNavigate} />;

      default:
        return <LandingView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-dvh w-full max-w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 font-sans">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Navigation Bar */}
        <Navbar
          currentView={navState.view}
          onNavigate={handleNavigate}
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        {/* Global RBAC Notice Banner if user attempted an unauthorized route */}
        {rbacNotice && (
          <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-2 font-medium">
            <span className="min-w-0 break-words">{rbacNotice}</span>
            <button
              onClick={() => setRbacNotice(null)}
              className="text-amber-600 hover:text-amber-900 font-bold p-1 shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 w-full">
          {renderCurrentView()}
        </main>
      </div>

      {/* Public website footer: rendered exclusively on the public Home/Landing Page */}
      {navState.view === 'landing' && (
        <Footer
          isAuthenticated={isAuthenticated}
          isTeacher={isTeacher}
          isAdmin={isAdmin}
          onNavigate={handleNavigate}
        />
      )}

      {/* Global Modals */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSubtopic={(id) => handleNavigate('subtopic_learn', { id })}
        onSelectChapter={(id) => handleNavigate('chapter_detail', { id })}
        onSelectSubject={(id) => handleNavigate('subject_detail', { id })}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        defaultMode={authModalMode}
        defaultRole={authModalInitialRole}
        onSuccess={(role) => {
          if (role === 'admin' || role === 'super_admin' || role === 'sub_admin') {
            handleNavigate('admin_dashboard');
          } else if (role === 'teacher') {
            handleNavigate('teacher_dashboard');
          } else {
            handleNavigate('student_dashboard');
          }
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
