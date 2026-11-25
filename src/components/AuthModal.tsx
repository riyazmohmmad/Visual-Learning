import React, { useState, useEffect } from 'react';
import { X, GraduationCap, UserCheck, AlertCircle, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
  defaultRole?: UserRole;
  onSuccess?: (role: UserRole) => void;
}

export const AuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultMode = 'login',
  defaultRole = 'student',
  onSuccess,
}) => {
  const { login, loginWithGoogle, register, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(defaultMode);
  const [role, setRole] = useState<'student' | 'teacher'>(
    defaultRole === 'teacher' ? 'teacher' : 'student'
  );

  // Form fields
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [institution, setInstitution] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode(defaultMode);
    setRole(defaultRole === 'teacher' ? 'teacher' : 'student');
    setError(null);
    setStatusMessage(null);
  }, [defaultMode, defaultRole, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const loggedUser = await login(email.trim().toLowerCase(), password);
        if (onSuccess) onSuccess(loggedUser.role);
        onClose();
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        const createdUser = await register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          role,
          institution: institution.trim() || undefined,
        });
        if (onSuccess) onSuccess(createdUser.role);
        onClose();
      } else if (mode === 'forgot') {
        await sendPasswordReset(email.trim().toLowerCase());
        setStatusMessage(`Password reset link sent to ${email.trim().toLowerCase()}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setStatusMessage(null);
    setLoading(true);
    try {
      const loggedUser = await loginWithGoogle(role);
      if (onSuccess) onSuccess(loggedUser.role);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const headerContent = (
    <div className="px-4 py-4 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
      <div className="min-w-0">
        <h3 className="type-card-title text-slate-900">
          {mode === 'login' ? 'Sign In to VisuaLearn' : mode === 'register' ? 'Create Account' : 'Reset Password'}
        </h3>
        <p className="type-helper text-slate-500 mt-0.5">
          {mode === 'login'
            ? 'Continue your personalized learning journey'
            : mode === 'register'
            ? 'Join students and educators worldwide'
            : 'Enter your email to receive recovery instructions'}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close modal"
        className="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={mode === 'login' ? 'Sign In to VisuaLearn' : mode === 'register' ? 'Create Account' : 'Reset Password'}
      maxWidthClass="max-w-[460px]"
      header={headerContent}
      bodyClassName="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Role Selector (Student vs Teacher) */}
          {mode !== 'forgot' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Account Role</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    role === 'student'
                      ? 'bg-white text-blue-600 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole('teacher')}
                  className={`py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    role === 'teacher'
                      ? 'bg-white text-purple-600 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Teacher
                </button>
              </div>
            </div>
          )}

          {/* Name Field (Register only) */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan Miller"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          )}

          {/* Email Field */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. alex@example.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* Password Field */}
          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (minimum 6 characters)"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
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

          {/* Confirm Password (Register only) */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
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

          {/* Institution / College (Register only) */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Institution / College (Optional)</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. University School of Science"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] py-2.5 px-4 type-btn bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-[0.98]"
          >
            {loading ? (
              'Processing...'
            ) : mode === 'login' ? (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : mode === 'register' ? (
              <>
                <span>Register as {role === 'teacher' ? 'Teacher' : 'Student'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>

          {mode !== 'forgot' && (
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>
                {mode === 'register'
                  ? `Continue with Google as ${role === 'teacher' ? 'Teacher' : 'Student'}`
                  : 'Continue with Google'}
              </span>
            </button>
          )}

          {/* Toggle Mode Footer */}
          <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
            {mode === 'login' ? (
              <span>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
      </form>
    </ResponsiveModal>
  );
};
