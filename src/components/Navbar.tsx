import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Menu,
  X,
  GraduationCap,
  LogOut,
  LayoutDashboard,
  Shield,
  User,
  Edit3,
  ChevronDown,
  Bell,
  Radio,
  HelpCircle,
  ClipboardList,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FEATURES } from '../config/features';
import { ViewProfileModal } from './ViewProfileModal';
import { api } from '../services/api';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useTripleTapAdmin } from '../hooks/useTripleTapAdmin';

interface Props {
  currentView: string;
  onNavigate: (view: string, params?: any) => void;
  onOpenSearch: () => void;
}

interface NotificationItem {
  id: string;
  type: 'live' | 'doubt' | 'assignment' | 'schedule';
  title: string;
  subtitle: string;
  targetView: string;
  targetParams?: any;
  urgent?: boolean;
}

export const Navbar: React.FC<Props> = ({ currentView, onNavigate, onOpenSearch }) => {
  const { user, isAuthenticated, isStudent, isTeacher, isAdmin, isSuperAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState<boolean>(false);
  const [seenNotifIds, setSeenNotifIds] = useState<Set<string>>(new Set());
  const [isViewProfileOpen, setIsViewProfileOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(mobileMenuOpen);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileDropdownOpen(false);
        setNotificationsOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const loadNotifications = async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }
    setLoadingNotifs(true);
    try {
      const items: NotificationItem[] = [];

      if (isStudent) {
        const [liveRes, doubtsRes, assignRes] = await Promise.allSettled([
          api.getLiveClasses(),
          api.getDoubts(),
          api.getStudentAssignments(),
        ]);

        if (liveRes.status === 'fulfilled') {
          const liveList = liveRes.value.liveClasses || [];
          liveList
            .filter((lc: any) => lc.status === 'live')
            .slice(0, 3)
            .forEach((lc: any) => {
              items.push({
                id: `live_${lc.id}`,
                type: 'live',
                title: `Live Now: ${lc.title || lc.subject_name || 'Live Class'}`,
                subtitle: `${lc.teacher_name || 'Instructor'} is streaming now`,
                targetView: 'live_classroom',
                targetParams: { classId: lc.class_id || lc.subject_id, sessionId: lc.id, sessionTitle: lc.title },
                urgent: true,
              });
            });
          liveList
            .filter((lc: any) => lc.status === 'scheduled')
            .slice(0, 2)
            .forEach((lc: any) => {
              items.push({
                id: `sched_${lc.id}`,
                type: 'schedule',
                title: `Upcoming: ${lc.title || 'Scheduled Session'}`,
                subtitle: `${lc.scheduled_date || ''} ${lc.start_time || ''}`.trim() || 'Scheduled live class',
                targetView: 'student_dashboard',
                targetParams: { activeTab: 'live' },
              });
            });
        }

        if (doubtsRes.status === 'fulfilled') {
          (doubtsRes.value.doubts || [])
            .filter((d) => d.status === 'Answered')
            .slice(0, 3)
            .forEach((d) => {
              items.push({
                id: `doubt_${d.id}`,
                type: 'doubt',
                title: `Doubt Answered: ${d.title}`,
                subtitle: d.subject_name || 'Instructor replied to your question',
                targetView: 'student_dashboard',
                targetParams: { activeTab: 'doubts' },
              });
            });
        }

        if (assignRes.status === 'fulfilled') {
          (assignRes.value.assignments || [])
            .filter((a: any) => !a.submitted && a.status !== 'draft')
            .slice(0, 3)
            .forEach((a: any) => {
              items.push({
                id: `asg_${a.id}`,
                type: 'assignment',
                title: `Assignment Pending: ${a.title}`,
                subtitle: a.due_date ? `Due ${a.due_date}` : a.subject_name || 'Open for submission',
                targetView: 'student_dashboard',
                targetParams: { activeTab: 'assignments' },
              });
            });
        }
      } else if (isTeacher) {
        const [doubtsRes, liveRes] = await Promise.allSettled([
          api.getDoubts({ status: 'Pending' }),
          api.getLiveClasses(),
        ]);

        if (doubtsRes.status === 'fulfilled') {
          (doubtsRes.value.doubts || []).slice(0, 4).forEach((d) => {
            items.push({
              id: `tdoubt_${d.id}`,
              type: 'doubt',
              title: `Student Doubt: ${d.title}`,
              subtitle: `${d.student_name || 'Student'} · ${d.subject_name || 'Class'}`,
              targetView: 'teacher_dashboard',
              targetParams: { activeTab: 'doubts' },
              urgent: true,
            });
          });
        }

        if (liveRes.status === 'fulfilled') {
          (liveRes.value.liveClasses || [])
            .filter((lc: any) => lc.status === 'live' || lc.status === 'scheduled')
            .slice(0, 3)
            .forEach((lc: any) => {
              items.push({
                id: `tlive_${lc.id}`,
                type: lc.status === 'live' ? 'live' : 'schedule',
                title: lc.status === 'live' ? `Active Stream: ${lc.title}` : `Scheduled: ${lc.title}`,
                subtitle: `${lc.scheduled_date || ''} ${lc.start_time || ''}`.trim() || 'Live Classroom',
                targetView: 'teacher_dashboard',
                targetParams: { activeTab: 'live_classes' },
                urgent: lc.status === 'live',
              });
            });
        }
      } else if (isAdmin) {
        const [liveRes, doubtsRes] = await Promise.allSettled([
          api.getAdminLiveClasses(),
          api.getDoubts({ status: 'Pending' }),
        ]);

        if (liveRes.status === 'fulfilled') {
          (liveRes.value.liveClasses || [])
            .filter((lc: any) => lc.status === 'live')
            .slice(0, 3)
            .forEach((lc: any) => {
              items.push({
                id: `alive_${lc.id}`,
                type: 'live',
                title: `Active Live Class: ${lc.title || lc.subject_name}`,
                subtitle: lc.teacher_name || 'In progress',
                targetView: 'admin_dashboard',
                targetParams: { activeTab: 'live' },
                urgent: true,
              });
            });
        }

        if (doubtsRes.status === 'fulfilled' && (doubtsRes.value.doubts || []).length > 0) {
          const count = doubtsRes.value.doubts.length;
          items.push({
            id: `adoubts_${count}`,
            type: 'doubt',
            title: `${count} Pending Student ${count === 1 ? 'Doubt' : 'Doubts'}`,
            subtitle: 'Review open academic inquiries across classes',
            targetView: 'admin_dashboard',
            targetParams: { activeTab: 'doubts' },
          });
        }
      }

      setNotifications(items);
    } catch {
      // Non-blocking notification fetch
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, user?.id, user?.role]);

  const unreadCount = notifications.filter((n) => !seenNotifIds.has(n.id)).length;

  const handleNavClick = (view: string, params?: any) => {
    onNavigate(view, params);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  };

  const scrollToLandingSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (currentView !== 'landing') onNavigate('landing');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const portalDashboardView = isAdmin
    ? 'admin_dashboard'
    : isTeacher
    ? 'teacher_dashboard'
    : 'student_dashboard';

  const handleLogoTap = useTripleTapAdmin({
    onSingleTap: () => handleNavClick(isAuthenticated ? portalDashboardView : 'landing'),
    onTripleTap: () => {
      if (isAuthenticated && isAdmin) {
        handleNavClick('admin_dashboard');
      } else {
        handleNavClick('admin_signin', {
          mode: 'login',
          message: 'Please sign in with administrator credentials.',
          redirectTarget: { view: 'admin_dashboard' },
        });
      }
    },
  });

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs pt-safe">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        {/* Zone 1: Brand / Logo */}
        <div className="flex items-center gap-4 lg:gap-8 min-w-0">
          <button
            onClick={handleLogoTap}
            className="flex items-center gap-2 sm:gap-2.5 text-left group cursor-pointer focus:outline-hidden shrink-0 min-h-[44px] select-none"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:bg-blue-700 transition-colors shrink-0">
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] sm:text-base font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors leading-none whitespace-nowrap">
                Visua<span className="text-blue-600">Learn</span>
              </span>
              <span className="hidden sm:block text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">
                Education
              </span>
            </div>
          </button>

          {/* Zone 2: Primary Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 type-nav text-slate-600" aria-label="Main navigation">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => handleNavClick(portalDashboardView)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    currentView === portalDashboardView
                      ? 'text-blue-600 bg-blue-50/80 font-semibold'
                      : 'hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Dashboard
                </button>

                {isStudent && (
                  <>
                    <button
                      onClick={() => handleNavClick('student_dashboard', { activeTab: 'classes' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Classes
                    </button>
                    <button
                      onClick={() => handleNavClick('student_dashboard', { activeTab: 'live' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Live Classes
                    </button>
                    <button
                      onClick={() => handleNavClick('student_dashboard', { activeTab: 'doubts' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      AI Doubt Solver
                    </button>
                  </>
                )}

                {isTeacher && (
                  <>
                    <button
                      onClick={() => handleNavClick('teacher_dashboard', { activeTab: 'subjects' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Subjects
                    </button>
                    <button
                      onClick={() => handleNavClick('teacher_dashboard', { activeTab: 'curriculum' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Curriculum
                    </button>
                    <button
                      onClick={() => handleNavClick('teacher_dashboard', { activeTab: 'live_classes' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Live Classes
                    </button>
                  </>
                )}

                {isAdmin && (
                  <>
                    <button
                      onClick={() => handleNavClick('admin_dashboard', { activeTab: 'users' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Users
                    </button>
                    <button
                      onClick={() => handleNavClick('admin_dashboard', { activeTab: 'subjects' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Classes
                    </button>
                    <button
                      onClick={() => handleNavClick('admin_dashboard', { activeTab: 'analytics' })}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Analytics
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNavClick('landing')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    currentView === 'landing'
                      ? 'text-blue-600 bg-blue-50/80 font-semibold'
                      : 'hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => scrollToLandingSection('how-it-works')}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  How It Works
                </button>
                <button
                  onClick={() => scrollToLandingSection('features')}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Features
                </button>
                <button
                  onClick={() => scrollToLandingSection('about')}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  About
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Zone 3: Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Search (Desktop + Mobile Icon) */}
          {(isAuthenticated || FEATURES.PUBLIC_SUBJECT_BROWSING_ENABLED) && (
            <>
              <button
                onClick={onOpenSearch}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-800 border border-slate-200/80 rounded-lg transition-colors cursor-pointer"
                title="Search curriculum (⌘K)"
                aria-label="Search classes and topics"
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>Search...</span>
                <kbd className="hidden lg:inline text-[10px] font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">
                  ⌘K
                </kbd>
              </button>
              <button
                onClick={onOpenSearch}
                className="sm:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 rounded-xl transition-all cursor-pointer"
                aria-label="Search classes and topics"
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-0.5 sm:gap-2">
              {/* Real Notifications Popover */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    const next = !notificationsOpen;
                    setNotificationsOpen(next);
                    setProfileDropdownOpen(false);
                    if (next) {
                      loadNotifications();
                      setSeenNotifIds(new Set(notifications.map((n) => n.id)));
                    }
                  }}
                  className="relative p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-2 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 rounded-xl sm:rounded-lg transition-all cursor-pointer"
                  title="Notifications"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="w-[18px] h-[18px] sm:w-4 sm:h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 sm:top-1 sm:right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute -right-12 sm:right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Notifications</span>
                      <button
                        onClick={() => {
                          setSeenNotifIds(new Set(notifications.map((n) => n.id)));
                        }}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        Mark all read
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {loadingNotifs && notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">Checking updates...</div>
                      ) : notifications.length === 0 ? (
                        <div className="p-6 text-center space-y-1.5">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                          <div className="text-xs font-semibold text-slate-800">All caught up</div>
                          <p className="text-[11px] text-slate-500">
                            No pending alerts, live sessions, or unread updates right now.
                          </p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleNavClick(n.targetView, n.targetParams)}
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer"
                          >
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                n.type === 'live'
                                  ? 'bg-red-50 text-red-600'
                                  : n.type === 'doubt'
                                  ? 'bg-blue-50 text-blue-600'
                                  : n.type === 'assignment'
                                  ? 'bg-amber-50 text-amber-600'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {n.type === 'live' ? (
                                <Radio className="w-4 h-4" />
                              ) : n.type === 'doubt' ? (
                                <HelpCircle className="w-4 h-4" />
                              ) : n.type === 'assignment' ? (
                                <ClipboardList className="w-4 h-4" />
                              ) : (
                                <Calendar className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-900 truncate">{n.title}</div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">{n.subtitle}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Portal CTA */}
              {isAdmin && (
                <button
                  onClick={() => handleNavClick('admin_dashboard')}
                  className="hidden sm:flex px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>{isSuperAdmin ? 'Super Admin' : 'Sub Admin'}</span>
                </button>
              )}

              {/* User Profile Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => {
                    setProfileDropdownOpen(!profileDropdownOpen);
                    setNotificationsOpen(false);
                  }}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  title="Account Profile"
                  aria-label="Account menu"
                  aria-expanded={profileDropdownOpen}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 overflow-hidden flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                    {user?.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <span className="hidden lg:inline max-w-[110px] truncate text-slate-800">
                    {user?.name?.split(' ')?.[0] || 'User'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                      profileDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-50 text-slate-700">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 overflow-hidden flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {user?.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">{user?.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                        <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mt-0.5">
                          {user?.role?.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="py-1 text-xs">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setIsViewProfileOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <User className="w-4 h-4 text-blue-600" />
                        <span>View Profile</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          handleNavClick('edit_profile');
                        }}
                        className="w-full px-4 py-2.5 text-left text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4 text-slate-500" />
                        <span>Edit Profile & Security</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          handleNavClick(portalDashboardView);
                        }}
                        className="w-full px-4 py-2.5 text-left text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                        <span>My Portal</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await logout();
                          handleNavClick('signin', {
                            mode: 'login',
                            message: 'You have been signed out successfully.',
                          });
                        }}
                        className="w-full px-4 py-2.5 text-left text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer text-xs font-medium"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => handleNavClick('signin', { mode: 'login' })}
                className="hidden min-[380px]:inline-flex px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg transition-colors border border-slate-200 whitespace-nowrap cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => handleNavClick('signin', { mode: 'register' })}
                className="px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:scale-95 rounded-xl transition-all cursor-pointer shrink-0"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      </header>

      {/* Mobile Navigation Drawer (rendered outside <header> backdrop-blur containing block) */}
      {mobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-[calc(4rem+env(safe-area-inset-top,0px))] bottom-0 bg-slate-900/45 backdrop-blur-[2px] z-[90]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-[calc(4rem+env(safe-area-inset-top,0px))] z-[95] bg-white border-b border-slate-200 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-2.5 shadow-2xl max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] sm:max-h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))] overflow-y-auto overscroll-contain">
          {isAuthenticated ? (
            <>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 border border-blue-200 overflow-hidden flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                    {user?.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{user?.name}</div>
                    <div className="text-[10px] text-blue-600 uppercase font-semibold">
                      {user?.role?.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleNavClick('edit_profile')}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg shrink-0"
                >
                  Edit
                </button>
              </div>

              <button
                onClick={() => handleNavClick(portalDashboardView)}
                className="w-full text-left py-2.5 px-3 text-sm font-semibold text-blue-600 bg-blue-50/70 rounded-xl"
              >
                {isAdmin ? 'Admin Portal' : isTeacher ? 'Teacher Dashboard' : 'Student Dashboard'}
              </button>

              {isStudent && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { label: 'My Classes', tab: 'classes' },
                    { label: 'Live Classes', tab: 'live' },
                    { label: 'AI & Doubts', tab: 'doubts' },
                    { label: 'Simulations', tab: 'simulations' },
                    { label: 'Notes & PDFs', tab: 'notes' },
                    { label: 'Videos', tab: 'videos' },
                    { label: 'Quizzes', tab: 'quizzes' },
                    { label: 'Assignments', tab: 'assignments' },
                    { label: 'Smart Study', tab: 'smart_study' },
                    { label: 'My Progress', tab: 'progress' },
                  ].map((item) => (
                    <button
                      key={item.tab}
                      onClick={() => handleNavClick('student_dashboard', { activeTab: item.tab })}
                      className="text-left min-h-[44px] py-2.5 px-3 text-[13px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] rounded-xl transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {isTeacher && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { label: 'Subjects', tab: 'subjects' },
                    { label: 'Live Classes', tab: 'live_classes' },
                    { label: 'Curriculum', tab: 'curriculum' },
                    { label: 'Simulations', tab: 'simulations' },
                    { label: 'Materials', tab: 'materials' },
                    { label: 'Quizzes', tab: 'quizzes' },
                    { label: 'Assignments', tab: 'assignments' },
                    { label: 'Doubts', tab: 'doubts' },
                    { label: 'Progress', tab: 'progress' },
                    { label: 'Settings', tab: 'settings' },
                  ].map((item) => (
                    <button
                      key={item.tab}
                      onClick={() => handleNavClick('teacher_dashboard', { activeTab: item.tab })}
                      className="text-left min-h-[44px] py-2.5 px-3 text-[13px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] rounded-xl transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {isAdmin && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { label: 'Overview', tab: 'overview' },
                    { label: 'Users', tab: 'users' },
                    { label: 'Teachers', tab: 'teachers' },
                    { label: 'Students', tab: 'students' },
                    { label: 'Classes', tab: 'subjects' },
                    { label: 'Live Classes', tab: 'live' },
                    { label: 'Content & Notes', tab: 'content' },
                    { label: 'Analytics', tab: 'analytics' },
                    { label: 'Sub Admins', tab: 'admins' },
                    { label: 'Security', tab: 'security' },
                  ].map((item) => (
                    <button
                      key={item.tab}
                      onClick={() => handleNavClick('admin_dashboard', { activeTab: item.tab })}
                      className="text-left min-h-[44px] py-2.5 px-3 text-[13px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] rounded-xl transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 space-y-1">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsViewProfileOpen(true);
                  }}
                  className="w-full text-left py-2.5 px-3 text-sm text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                >
                  <User className="w-4 h-4 text-blue-600" />
                  <span>View Profile</span>
                </button>
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await logout();
                    handleNavClick('signin', {
                      mode: 'login',
                      message: 'You have been signed out successfully.',
                    });
                  }}
                  className="w-full text-left py-2.5 px-3 text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-medium"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => handleNavClick('landing')}
                className="w-full text-left py-2.5 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                Home
              </button>
              <button
                onClick={() => scrollToLandingSection('how-it-works')}
                className="w-full text-left py-2.5 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToLandingSection('features')}
                className="w-full text-left py-2.5 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                Features
              </button>
              <button
                onClick={() => scrollToLandingSection('about')}
                className="w-full text-left py-2.5 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
              >
                About
              </button>

              <div className="pt-2 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => handleNavClick('signin', { mode: 'login' })}
                  className="flex-1 py-2.5 text-xs font-semibold bg-white text-slate-700 rounded-xl border border-slate-200 text-center"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNavClick('signin', { mode: 'register' })}
                  className="flex-1 py-2.5 text-xs font-semibold bg-blue-600 text-white rounded-xl text-center"
                >
                  Get Started
                </button>
              </div>
            </>
          )}
          </div>
        </>
      )}

      {/* View Profile Modal (portaled to document.body outside header backdrop-blur) */}
      <ViewProfileModal
        isOpen={isViewProfileOpen}
        onClose={() => setIsViewProfileOpen(false)}
        onEditProfile={() => {
          setIsViewProfileOpen(false);
          handleNavClick('edit_profile');
        }}
        user={user}
      />
    </>
  );
};
