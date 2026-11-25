import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { isPrivilegedRole, SUPER_ADMIN_EMAIL_UNVERIFIED_CODE } from '../services/firebaseAuthService';
import { useTripleTapAdmin } from '../hooks/useTripleTapAdmin';

interface Props {
  initialMode?: 'login' | 'register' | 'forgot';
  initialRole?: UserRole;
  noticeMessage?: string | null;
  redirectTarget?: { view: string; params?: any } | null;
  onNavigate: (view: string, params?: any) => void;
}

function getDashboardForRole(role: UserRole): string {
  if (isPrivilegedRole(role)) return 'admin_dashboard';
  if (role === 'teacher') return 'teacher_dashboard';
  return 'student_dashboard';
}

export const SignInView: React.FC<Props> = ({
  initialMode = 'login',
  initialRole = 'student',
  noticeMessage,
  redirectTarget,
  onNavigate,
}) => {
  const {
    login,
    loginWithGoogle,
    register,
    sendPasswordReset,
    isAuthenticated,
    isTeacher,
    isAdmin,
  } = useAuth();

  // If an admin attempt is routed here, immediately redirect to dedicated admin signin
  useEffect(() => {
    if (isPrivilegedRole(initialRole)) {
      onNavigate('admin_signin', {
        mode: initialMode === 'forgot' ? 'forgot' : 'login',
        message: noticeMessage || 'Please sign in with administrator credentials.',
        redirectTarget,
      });
    }
  }, [initialRole, initialMode, noticeMessage, redirectTarget, onNavigate]);

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [role, setRole] = useState<'student' | 'teacher'>(
    initialRole === 'teacher' ? 'teacher' : 'student'
  );

  // Form inputs
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [institution, setInstitution] = useState<string>('');

  // Password visibility states (Default: hidden)
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Status and feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicateEmailError, setIsDuplicateEmailError] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(noticeMessage || null);

  useEffect(() => {
    setMode(initialMode);
    setRole(initialRole === 'teacher' ? 'teacher' : 'student');
    if (noticeMessage) {
      setBannerNotice(noticeMessage);
    }
  }, [initialMode, initialRole, noticeMessage]);

  // If already authenticated and visits /signin or /register directly, redirect immediately to authoritative role dashboard
  useEffect(() => {
    if (isAuthenticated) {
      if (redirectTarget && redirectTarget.view !== 'signin' && redirectTarget.view !== 'admin_signin') {
        onNavigate(redirectTarget.view, redirectTarget.params);
      } else if (isAdmin) {
        onNavigate('admin_dashboard');
      } else {
        onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard');
      }
    }
  }, [isAuthenticated, isTeacher, isAdmin, redirectTarget, onNavigate]);

  const redirectAfterAuth = (userRole: UserRole) => {
    if (redirectTarget && redirectTarget.view !== 'signin' && redirectTarget.view !== 'admin_signin') {
      onNavigate(redirectTarget.view, redirectTarget.params);
    } else {
      onNavigate(getDashboardForRole(userRole));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsDuplicateEmailError(false);
    setSuccessInfo(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const loggedUser = await login(email.trim().toLowerCase(), password);
        redirectAfterAuth(loggedUser.role);
      } else if (mode === 'register') {
        if (!name.trim()) {
          throw new Error('Please enter your full name.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please re-enter.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }

        const createdUser = await register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          role,
          institution: institution.trim() || undefined,
        });

        redirectAfterAuth(createdUser.role);
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          throw new Error('Please enter your registered email address.');
        }
        await sendPasswordReset(email.trim().toLowerCase());
        setSuccessInfo(`Password reset link sent to ${email.trim().toLowerCase()}. Please check your inbox.`);
      }
    } catch (err: any) {
      if (err?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        onNavigate('admin_signin', { mode: 'login' });
        return;
      }
      const msg = err?.message || 'Unable to sign in right now. Please try again.';
      setError(msg);
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
        setIsDuplicateEmailError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setIsDuplicateEmailError(false);
    setSuccessInfo(null);
    setGoogleLoading(true);

    try {
      const loggedUser = await loginWithGoogle(role);
      redirectAfterAuth(loggedUser.role);
    } catch (err: any) {
      if (err?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        onNavigate('admin_signin', { mode: 'login' });
        return;
      }
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const roleLabel = role === 'teacher' ? 'Teacher' : 'Student';

  const handleLogoTap = useTripleTapAdmin({
    onSingleTap: () => onNavigate('landing'),
    onTripleTap: () =>
      onNavigate('admin_signin', {
        mode: 'login',
        message: 'Please sign in with administrator credentials.',
        redirectTarget: { view: 'admin_dashboard' },
      }),
  });

  return (
    <div className="min-h-dvh w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header Bar */}
      <header className="min-h-14 sm:min-h-16 pt-safe py-2 px-3 sm:px-8 border-b border-slate-200/90 bg-white/95 backdrop-blur-md flex items-center justify-between gap-2 z-20 shadow-2xs sticky top-0">
        <button
          onClick={handleLogoTap}
          className="flex items-center gap-2 sm:gap-2.5 min-h-[44px] cursor-pointer min-w-0 shrink-0 active:scale-95 transition-transform select-none"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="text-[15px] sm:text-base font-bold tracking-tight text-slate-900">
            Visua<span className="text-blue-600">Learn</span>
          </span>
        </button>

        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <button
            onClick={() => onNavigate('landing')}
            className="min-h-[44px] px-2.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-xl flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Overview</span>
          </button>
        </div>
      </header>

      {/* Main Authentication Viewport */}
      <main className="flex-1 flex flex-col px-3 py-6 sm:p-6 lg:p-8 relative">
        <div className="w-full max-w-md my-auto mx-auto bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-8 shadow-xs relative z-10 space-y-5">
          {/* Header Title */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 mb-1">
              {mode === 'register' && role === 'teacher' ? (
                <UserCheck className="w-6 h-6" />
              ) : (
                <GraduationCap className="w-6 h-6" />
              )}
            </div>

            <h1 className="type-page-title text-slate-900">
              {mode === 'login'
                ? 'Sign In to VisuaLearn'
                : mode === 'register'
                ? `${roleLabel} Registration`
                : 'Reset Your Password'}
            </h1>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              {mode === 'login'
                ? 'Sign in with your permanent account to go directly to your dashboard'
                : mode === 'register'
                ? `Create your permanent ${roleLabel.toLowerCase()} account to start learning`
                : 'Enter your registered email address to receive a password reset link'}
            </p>
          </div>

          {/* Banner Notice */}
          {bannerNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{bannerNotice}</div>
              <button
                onClick={() => setBannerNotice(null)}
                className="text-amber-600 hover:text-amber-900 text-xs ml-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2 font-medium">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <div className="flex-1 leading-relaxed">{error}</div>
                <button
                  onClick={() => {
                    setError(null);
                    setIsDuplicateEmailError(false);
                  }}
                  className="text-red-500 hover:text-red-700 text-xs ml-1 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>
              {isDuplicateEmailError && mode === 'register' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setIsDuplicateEmailError(false);
                  }}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline cursor-pointer pl-6"
                >
                  Switch to Sign In with this email →
                </button>
              )}
            </div>
          )}

          {/* Success Message */}
          {successInfo && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successInfo}</div>
            </div>
          )}

          {/* Role Switcher: Student vs Teacher (used during Registration and new Google account creation) */}
          {mode !== 'forgot' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 block">
                {mode === 'register' ? 'Register As' : 'Account Role (for new Google sign-ins)'}
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    role === 'student'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                  <span>Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('teacher')}
                  className={`py-2 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    role === 'teacher'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>Teacher</span>
                </button>
              </div>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Registration: Name Field */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Carter"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            {/* Password Field */}
            {mode !== 'forgot' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setSuccessInfo(null);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Optional Institution */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Institution / School (Optional)</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Apex Academy"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white type-btn rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-[0.98]"
            >
              <span>
                {loading
                  ? mode === 'register'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'login'
                  ? 'Sign In'
                  : mode === 'register'
                  ? `Create ${roleLabel} Account`
                  : 'Send Reset Link'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Google Sign-In Option */}
          {mode !== 'forgot' && (
            <>
              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200" />
                <span className="px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">or</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <button
                type="button"
                disabled={loading || googleLoading}
                onClick={handleGoogleAuth}
                className="w-full min-h-[46px] py-2.5 px-4 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 type-btn rounded-xl border border-slate-200 transition-all shadow-2xs flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
                <span>
                  {googleLoading
                    ? 'Connecting with Google...'
                    : mode === 'register'
                    ? `Continue with Google as ${roleLabel}`
                    : 'Continue with Google'}
                </span>
              </button>
            </>
          )}

          {/* Toggle between Login, Register, Forgot */}
          <div className="pt-2 text-center text-xs text-slate-500 space-y-2 border-t border-slate-100">
            {mode === 'login' && (
              <div>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setIsDuplicateEmailError(false);
                    setSuccessInfo(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Register Now
                </button>
              </div>
            )}

            {mode === 'register' && (
              <div>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setIsDuplicateEmailError(false);
                    setSuccessInfo(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            )}

            {mode === 'forgot' && (
              <div>
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setIsDuplicateEmailError(false);
                    setSuccessInfo(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="min-h-[48px] py-3 pb-safe px-4 border-t border-slate-200 bg-white text-center flex items-center justify-center text-xs text-slate-400">
        © {new Date().getFullYear()} VisuaLearn. Modern Education Platform.
      </footer>
    </div>
  );
};
