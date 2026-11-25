import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Camera,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Lock,
  Phone,
  Calendar,
  User,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  X,
  Award,
  BookOpen,
  Info,
  LogOut,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { changeFirebaseUserPassword } from '../services/firebaseAuthService';
import { auth } from '../firebase';
import { ResponsiveModal } from '../components/ResponsiveModal';

interface Props {
  onNavigate: (view: string, params?: any) => void;
}

export const EditProfileView: React.FC<Props> = ({ onNavigate }) => {
  const {
    user,
    isTeacher,
    isStudent,
    isAdmin,
    updateUser,
    saveProfileToFirestore,
    logout,
  } = useAuth();

  // Profile Form States
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [qualification, setQualification] = useState<string>('');
  const [specialization, setSpecialization] = useState<string>('');
  const [institution, setInstitution] = useState<string>('');

  // Initial copy to detect unsaved changes
  const [initialData, setInitialData] = useState<any>(null);

  // Status & Feedback States
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [confirmDiscard, setConfirmDiscard] = useState<boolean>(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email Change Workflow States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
  const [pendingEmailAddress, setPendingEmailAddress] = useState<string>('');
  const [emailVerificationCode, setEmailVerificationCode] = useState<string>('');
  const [emailLoading, setEmailLoading] = useState<boolean>(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password Change States
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Load fresh profile from backend
  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await api.getProfile();
      const u = res.user;
      setName(u.name || '');
      setPhone(u.phone || '');
      setDateOfBirth(u.dateOfBirth || '');
      setGender(u.gender || '');
      setBio(u.bio || '');
      setAvatar(u.avatar || null);
      setAvatarPreview(u.avatar || null);
      setQualification(u.qualification || '');
      setSpecialization(u.specialization || '');
      setInstitution(u.institution || '');

      setInitialData({
        name: u.name || '',
        phone: u.phone || '',
        dateOfBirth: u.dateOfBirth || '',
        gender: u.gender || '',
        bio: u.bio || '',
        avatar: u.avatar || null,
        qualification: u.qualification || '',
        specialization: u.specialization || '',
        institution: u.institution || '',
      });
    } catch (err: any) {
      setProfileError(err.message || 'Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Check if form has unsaved changes
  const hasUnsavedChanges = () => {
    if (!initialData) return false;
    return (
      name !== initialData.name ||
      phone !== initialData.phone ||
      dateOfBirth !== initialData.dateOfBirth ||
      gender !== initialData.gender ||
      bio !== initialData.bio ||
      avatar !== initialData.avatar ||
      qualification !== initialData.qualification ||
      specialization !== initialData.specialization ||
      institution !== initialData.institution
    );
  };

  const navigateToDashboard = () => {
    if (isAdmin) onNavigate('admin_dashboard');
    else if (isTeacher) onNavigate('teacher_dashboard');
    else onNavigate('student_dashboard');
  };

  const handleCancel = () => {
    if (hasUnsavedChanges()) {
      setConfirmDiscard(true);
    } else {
      navigateToDashboard();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileError(null);
    setProfileSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setProfileError('Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileError('File size exceeds the 5MB maximum limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAvatar(base64);
      setAvatarPreview(base64);
    };
    reader.onerror = () => {
      setProfileError('Failed to read the image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatar('');
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!name.trim()) {
      setProfileError('Name is a required field.');
      return;
    }

    try {
      setIsSaving(true);
      const payload: any = {
        name: name.trim(),
        phone: phone.trim(),
        dateOfBirth,
        gender,
        bio: bio.trim(),
        avatar: avatar === '' ? null : avatar,
      };

      if (isTeacher) {
        payload.qualification = qualification.trim();
        payload.specialization = specialization.trim();
        payload.institution = institution.trim();
      } else if (isStudent) {
        payload.institution = institution.trim();
      }

      if (auth.currentUser) {
        await saveProfileToFirestore({
          fullName: payload.name,
          phone: payload.phone,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          bio: payload.bio,
          avatar: payload.avatar,
          qualification: payload.qualification,
          specialization: payload.specialization,
          institution: payload.institution,
        });
      }

      const res = await api.updateProfile(payload).catch(() => ({
        user: {
          ...user!,
          ...payload,
          fullName: payload.name,
        },
      }));
      updateUser({ ...res.user, role: user?.role || res.user.role });

      setInitialData({
        name: res.user.name || '',
        phone: res.user.phone || '',
        dateOfBirth: res.user.dateOfBirth || '',
        gender: res.user.gender || '',
        bio: res.user.bio || '',
        avatar: res.user.avatar || null,
        qualification: res.user.qualification || '',
        specialization: res.user.specialization || '',
        institution: res.user.institution || '',
      });

      setProfileSuccess('Profile updated permanently.');
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!newEmailInput.trim()) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmailInput.trim())) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (newEmailInput.toLowerCase().trim() === user?.email.toLowerCase()) {
      setEmailError('The new email must be different from your current email.');
      return;
    }

    try {
      setEmailLoading(true);
      const res = await api.requestEmailChange(newEmailInput.trim());
      setPendingEmailAddress(res.pendingEmail);
      setEmailStep('verify');
      setEmailSuccess(`Verification code dispatched to ${res.pendingEmail}. Please check your inbox.`);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to initiate email verification.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!emailVerificationCode.trim()) {
      setEmailError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setEmailLoading(true);
      const res = await api.verifyEmailChange(emailVerificationCode.trim());
      updateUser(res.user);

      setEmailSuccess('Email address updated successfully.');
      setTimeout(() => {
        setIsEmailModalOpen(false);
        setEmailStep('request');
        setNewEmailInput('');
        setEmailVerificationCode('');
        setEmailSuccess(null);
      }, 1800);
    } catch (err: any) {
      setEmailError(err.message || 'Invalid or expired verification code.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleResendEmailCode = async () => {
    setEmailError(null);
    setEmailSuccess(null);
    try {
      setEmailLoading(true);
      const res = await api.resendEmailChangeCode();
      setEmailSuccess(res.message);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to resend verification code.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCancelEmailChange = async () => {
    try {
      await api.cancelEmailChange();
    } catch (e) {
      // Ignore
    }
    setIsEmailModalOpen(false);
    setEmailStep('request');
    setNewEmailInput('');
    setEmailVerificationCode('');
    setEmailError(null);
    setEmailSuccess(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please provide your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must contain at least 8 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    try {
      setIsChangingPassword(true);
      if (auth.currentUser) {
        await changeFirebaseUserPassword(currentPassword, newPassword);
        setPasswordSuccess('Password updated successfully.');
      } else {
        const res = await api.changePassword({ currentPassword, newPassword, confirmNewPassword });
        setPasswordSuccess(res.message || 'Password updated successfully.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setPasswordSuccess(null), 5000);
    } catch (err: any) {
      setPasswordError(err.message || 'Password update failed.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Administrator';
      case 'sub_admin':
        return 'Sub Administrator';
      case 'teacher':
        return 'Teacher / Faculty';
      default:
        return 'Student';
    }
  };

  const initials = (name || user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-500 text-xs">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
        <span>Loading profile information...</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-slate-800 pt-5 pb-14 sm:pt-8 sm:pb-16 pb-safe-lg px-3 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        {/* Top Navigation & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleCancel}
              className="p-2 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="type-page-title text-slate-900">Edit Profile & Account</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Manage your personal details, profile image, and account security.
              </p>
            </div>
          </div>

          {/* Role badge and Logout */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>{getRoleLabel(user?.role)}</span>
            </div>

            <button
              onClick={async () => {
                await logout();
                onNavigate('signin', {
                  mode: 'login',
                  message: 'You have been signed out successfully.',
                });
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Inline Unsaved Changes Discard Confirmation */}
        {confirmDiscard && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>You have unsaved profile changes. Discard changes and return to your dashboard?</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="px-3 py-1.5 bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 rounded-lg font-semibold cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={navigateToDashboard}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                Discard &amp; Leave
              </button>
            </div>
          </div>
        )}

        {/* Global Feedback Banners */}
        {profileSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between gap-2 font-medium shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
            <button onClick={() => setProfileSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer shrink-0">
              ✕
            </button>
          </div>
        )}

        {profileError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2 font-medium shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{profileError}</span>
            </div>
            <button onClick={() => setProfileError(null)} className="text-red-600 hover:text-red-800 cursor-pointer shrink-0">
              ✕
            </button>
          </div>
        )}

        {/* SECTION 1: PROFILE PICTURE */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 min-w-0">
              <div className="relative group shrink-0">
                <div className="w-22 h-22 rounded-2xl border-2 border-slate-200 bg-slate-100 overflow-hidden shadow-xs flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={name || 'Avatar'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-700 font-bold text-2xl">
                      {initials}
                    </div>
                  )}
                </div>

                {/* Change photo quick overlay */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center text-white text-[10px] font-semibold cursor-pointer"
                >
                  <Camera className="w-5 h-5 mb-1" />
                  <span>Change</span>
                </button>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Profile Photo</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Upload an image (JPEG, PNG, WebP) up to 5MB. This photo will be visible to your teachers and classmates.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                    <span>Change Photo</span>
                  </button>

                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Permanent System Identifier */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 sm:text-right shrink-0">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">System ID</span>
              <span className="font-mono text-blue-600 font-bold text-sm block">
                {user?.studentId || user?.teacherId || user?.adminId || `USR-${user?.id.slice(-6).toUpperCase()}`}
              </span>
              <span className="text-[10px] text-slate-400 block">Verified account credential</span>
            </div>
          </div>
        </div>

        {/* SECTION 2: EDIT PROFILE FORM */}
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Personal & Academic Information</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your contact details and academic background.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* Full Name */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Full Name</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
              />
            </div>

            {/* Email Address with Change Button */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Email Address</span>
                </span>
                <span className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Verified
                </span>
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="flex-1 min-w-0 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 font-mono cursor-not-allowed select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsEmailModalOpen(true);
                    setEmailStep('request');
                    setNewEmailInput('');
                    setEmailVerificationCode('');
                    setEmailError(null);
                    setEmailSuccess(null);
                  }}
                  className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-xl transition-colors border border-blue-200 whitespace-nowrap cursor-pointer shrink-0"
                >
                  Change Email
                </button>
              </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Phone Number</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all font-mono"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date of Birth</span>
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all font-mono"
              />
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
              >
                <option value="">Prefer not to disclose</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Institution */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span>Institution / School</span>
              </label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. Cambridge Science Academy"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
              />
            </div>
          </div>

          {/* Teacher Specific Fields */}
          {isTeacher && (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Faculty Qualifications</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-blue-600" />
                    <span>Highest Qualification</span>
                  </label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="e.g. Ph.D. in Organic Chemistry"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    <span>Specialization Area</span>
                  </label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g. Stereochemistry, Spectroscopy"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Biography */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Biography / About</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell instructors and classmates a bit about yourself..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all resize-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {hasUnsavedChanges() ? 'You have unsaved changes' : 'All changes saved'}
            </span>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasUnsavedChanges()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* SECTION 3: ACCOUNT & SECURITY */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-7 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Account & Security</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Update your account password and security credentials.
              </p>
            </div>
          </div>

          {passwordSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">New Password (min 8 chars)</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-slate-900 placeholder-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isChangingPassword ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EMAIL VERIFICATION MODAL */}
      <ResponsiveModal
        isOpen={isEmailModalOpen}
        onClose={handleCancelEmailChange}
        ariaLabel="Update Email Address"
        maxWidthClass="max-w-[460px]"
        header={
          <div className="px-4 py-4 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-4 h-4 text-blue-600 shrink-0" />
              <h3 className="type-card-title text-slate-900 truncate">Update Email Address</h3>
            </div>
            <button
              type="button"
              onClick={handleCancelEmailChange}
              aria-label="Close modal"
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center cursor-pointer transition-colors shrink-0 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
        bodyClassName="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
      >

            {emailSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{emailSuccess}</span>
              </div>
            )}

            {emailError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{emailError}</span>
              </div>
            )}

            {emailStep === 'request' ? (
              <form onSubmit={handleRequestEmailChange} className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  To protect your account, we will send a 6-digit verification code to your new email address before updating your records.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">New Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    placeholder="e.g. name@example.com"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelEmailChange}
                    className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="min-h-[44px] px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    {emailLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        <span>Send Code</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailChange} className="space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Destination Email</span>
                  <span className="font-mono text-blue-600 font-bold block break-all">{pendingEmailAddress}</span>
                  <span className="text-[10px] text-slate-400">
                    A 6-digit code has been dispatched. The code remains valid for 15 minutes.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Enter 6-Digit Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={emailVerificationCode}
                    onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="w-full bg-slate-50 border border-blue-300 focus:border-blue-500 rounded-xl px-3.5 py-3 text-center text-lg text-slate-900 font-mono tracking-widest outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={handleResendEmailCode}
                    disabled={emailLoading}
                    className="min-h-[36px] text-blue-600 hover:underline cursor-pointer disabled:opacity-50 font-medium"
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailStep('request')}
                    className="min-h-[36px] text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCancelEmailChange}
                    className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading || emailVerificationCode.length < 6}
                    className="min-h-[44px] px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    {emailLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify &amp; Update</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
      </ResponsiveModal>
    </div>
  );
};
