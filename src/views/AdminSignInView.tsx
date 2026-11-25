import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isPrivilegedRole, SUPER_ADMIN_EMAIL_UNVERIFIED_CODE } from '../services/firebaseAuthService';

interface Props {
  initialMode?: 'login' | 'setup' | 'forgot';
  noticeMessage?: string | null;
  redirectTarget?: { view: string; params?: any } | null;
  onNavigate: (view: string, params?: any) => void;
}

export const AdminSignInView: React.FC<Props> = ({
  initialMode = 'login',
  noticeMessage,
  redirectTarget,
  onNavigate,
}) => {
  const {
    login,
    loginWithGoogle,
    sendPasswordReset,
    resendSuperAdminVerificationEmail,
    checkSuperAdminEmailVerification,
    logout,
    isAuthenticated,
    isAdmin,
    unverifiedSuperAdminEmail,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'forgot'>(
    initialMode === 'forgot' ? 'forgot' : 'login'
  );
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [verifyBusy, setVerifyBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(noticeMessage || null);

  useEffect(() => {
    setMode(initialMode === 'forgot' ? 'forgot' : 'login');
    if (noticeMessage) {
      setBannerNotice(noticeMessage);
    }
  }, [initialMode, noticeMessage]);

  // If already authenticated as an Admin, redirect directly to Admin Dashboard
  useEffect(() => {
    if (isAuthenticated) {
      if (isAdmin) {
        if (
          redirectTarget &&
          redirectTarget.view !== 'admin_signin' &&
          redirectTarget.view !== 'signin'
        ) {
          onNavigate(redirectTarget.view, redirectTarget.params);
        } else {
          onNavigate('admin_dashboard');
        }
      } else {
        setError(
          'You are currently signed in with a non-administrative account. Please sign out and log in with administrator credentials.'
        );
      }
    }
  }, [isAuthenticated, isAdmin, redirectTarget, onNavigate]);

  const navigateToDashboard = () => {
    if (
      redirectTarget &&
      redirectTarget.view !== 'admin_signin' &&
      redirectTarget.view !== 'signin'
    ) {
      onNavigate(redirectTarget.view, redirectTarget.params);
    } else {
      onNavigate('admin_dashboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const loggedUser = await login(email.trim(), password, 'super_admin');
        if (!isPrivilegedRole(loggedUser.role)) {
          await logout();
          throw new Error('Access denied: This login portal is strictly reserved for administrators.');
        }
        navigateToDashboard();
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          throw new Error('Please enter your administrator email address.');
        }
        await sendPasswordReset(email.trim().toLowerCase());
        setSuccessInfo(`Password recovery link sent to ${email.trim().toLowerCase()}.`);
      }
    } catch (err: any) {
      if (err?.code === SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        setError(null);
      } else {
        setError(
          err?.message || 'Unable to authenticate administrator. Please check your credentials.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setError(null);
    setSuccessInfo(null);
    setGoogleLoading(true);

    try {
      const loggedUser = await loginWithGoogle('student');
      if (!isPrivilegedRole(loggedUser.role)) {
        await logout();
        throw new Error('Access denied: This Google account does not have administrator privileges.');
      }
      navigateToDashboard();
    } catch (err: any) {
      if (err?.code !== SUPER_ADMIN_EMAIL_UNVERIFIED_CODE) {
        setError(err?.message || 'Unable to authenticate administrator with Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setSuccessInfo(null);
    setVerifyBusy(true);
    try {
      await resendSuperAdminVerificationEmail();
      setSuccessInfo(
        `Verification email sent to ${unverifiedSuperAdminEmail}. Open the link in your inbox, then click "I've Verified — Continue".`
      );
    } catch (err: any) {
      setError(err?.message || 'Could not send verification email right now.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setError(null);
    setSuccessInfo(null);
    setVerifyBusy(true);
    try {
      const verifiedUser = await checkSuperAdminEmailVerification();
      if (verifiedUser && isPrivilegedRole(verifiedUser.role)) {
        navigateToDashboard();
      }
    } catch (err: any) {
      setError(err?.message || 'Email is still unverified.');
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#F8FAFC] text-slate-800 flex flex-col justify-between font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="min-h-14 sm:min-h-16 pt-safe py-2 px-3 sm:px-8 border-b border-slate-200/90 bg-white/95 backdrop-blur-md flex items-center justify-between gap-2 z-20 shadow-2xs sticky top-0">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 sm:gap-2.5 min-h-[44px] cursor-pointer min-w-0 shrink-0 active:scale-95 transition-transform"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-[15px] sm:text-base font-bold tracking-tight text-slate-900">
            Visua<span className="text-blue-600">Learn</span>
          </span>
          <span className="hidden min-[360px]:inline-flex ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 uppercase tracking-wider">
            Admin
          </span>
        </button>

        <button
          onClick={() => onNavigate('signin', { mode: 'login' })}
          className="min-h-[44px] px-2.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Student / Teacher Sign In</span>
          <span className="sm:hidden">Sign In</span>
        </button>
      </header>

      {/* Main Administrative Login Card */}
      <main className="flex-1 flex flex-col px-3 py-6 sm:p-6 lg:p-8 relative">
        <div className="w-full max-w-md my-auto mx-auto bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-8 shadow-xs relative z-10 space-y-5">
          {/* Header Title */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 mb-1">
              {unverifiedSuperAdminEmail ? (
                <ShieldCheck className="w-6 h-6 text-amber-600" />
              ) : (
                <Shield className="w-6 h-6" />
              )}
            </div>

            <h1 className="type-page-title text-slate-900">
              {unverifiedSuperAdminEmail
                ? 'Verify Your Email'
                : mode === 'login'
                ? 'Administrator Login'
                : 'Password Recovery'}
            </h1>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              {unverifiedSuperAdminEmail
                ? 'Email verification is required before Super Admin privileges are granted.'
                : mode === 'login'
                ? 'Sign in with your verified Firebase administrator account'
                : 'Enter your registered administrator email to receive recovery instructions'}
            </p>
          </div>

          {/* Email Verification Required Card for Unverified Super Admin */}
          {unverifiedSuperAdminEmail && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <p className="font-semibold">Email verification required</p>
                  <p className="text-amber-900">
                    Your account <span className="font-mono font-semibold">{unverifiedSuperAdminEmail}</span> is signed in,
                    but its email address is not verified yet. Verify your email via the link sent by Firebase, or sign in with Google.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={handleResendVerification}
                  className="flex-1 min-h-[40px] px-3 py-2 bg-white hover:bg-amber-100/70 disabled:opacity-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-950 transition-colors cursor-pointer"
                >
                  {verifyBusy ? 'Sending...' : 'Send Verification Email'}
                </button>
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={handleCheckVerification}
                  className="flex-1 min-h-[40px] px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>I&apos;ve Verified — Continue</span>
                </button>
              </div>
              <button
                type="button"
                disabled={verifyBusy}
                onClick={() => void logout()}
                className="w-full text-center text-[11px] font-medium text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Sign out and use another account
              </button>
            </div>
          )}

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

          {/* Error Notice */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700 text-xs ml-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Success Notice */}
          {successInfo && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successInfo}</div>
            </div>
          )}

          {/* Login / Forgot Form */}
          {!unverifiedSuperAdminEmail && (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Email Field */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Password Field */}
              {mode === 'login' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">Password</label>
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
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white type-btn rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-[0.98]"
              >
                <span>
                  {loading
                    ? 'Verifying...'
                    : mode === 'login'
                    ? 'Login'
                    : 'Send Recovery Email'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {mode === 'login' && !unverifiedSuperAdminEmail && (
            <>
              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200" />
                <span className="px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  or
                </span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <button
                type="button"
                disabled={loading || googleLoading}
                onClick={handleGoogleAdminLogin}
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
                  {googleLoading ? 'Verifying Admin...' : 'Sign In with Admin Google Account'}
                </span>
              </button>
            </>
          )}

          {/* Toggle back to Login from Forgot */}
          {mode === 'forgot' && (
            <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
              Remember your administrator password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessInfo(null);
                }}
                className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="min-h-[48px] py-3 pb-safe px-4 border-t border-slate-200 bg-white text-center flex items-center justify-center text-xs text-slate-400">
        © {new Date().getFullYear()} VisuaLearn. Protected Administrative Environment.
      </footer>
    </div>
  );
};
