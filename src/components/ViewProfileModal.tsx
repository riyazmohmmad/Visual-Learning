import React from 'react';
import { X, User, Phone, Calendar, Award, BookOpen, Building, Edit3, CheckCircle2 } from 'lucide-react';
import { User as UserType } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEditProfile: () => void;
  user: UserType | null;
}

export const ViewProfileModal: React.FC<Props> = ({ isOpen, onClose, onEditProfile, user }) => {
  const active = isOpen && Boolean(user);
  if (!active || !user) return null;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return { label: 'Super Administrator', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'admin':
        return { label: 'Administrator', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'sub_admin':
        return { label: 'Sub Administrator', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'teacher':
        return { label: 'Faculty / Teacher', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      default:
        return { label: 'Student', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  const badge = getRoleBadge(user.role);
  const initials = (user.name || 'U')
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const headerContent = (
    <div className="bg-white border-b border-slate-100">
      {/* Blue Gradient Banner & Close Button */}
      <div
        data-testid="profile-modal-banner"
        className="h-20 sm:h-24 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          data-testid="profile-modal-close-x"
          className="absolute top-2.5 right-2.5 min-w-[40px] min-h-[40px] rounded-full bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Avatar & Role Badge Row — kept inside non-scrolling header so avatar is NEVER clipped */}
      <div className="px-4 sm:px-6 pb-3.5">
        <div className="-mt-10 sm:-mt-12 flex items-end justify-between gap-2.5 relative z-10">
          <div
            data-testid="profile-modal-avatar"
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-white bg-slate-100 overflow-hidden shadow-md flex items-center justify-center shrink-0"
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-700 font-bold text-xl sm:text-2xl">
                {initials}
              </div>
            )}
          </div>

          <span
            data-testid="profile-modal-role-badge"
            className={`mb-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 max-w-[calc(100%-5.75rem)] truncate ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>

        {/* User Name & Email */}
        <div className="mt-3 min-w-0">
          <h2
            data-testid="profile-modal-name"
            className="type-section-title text-slate-900 break-words leading-snug"
          >
            {user.name}
          </h2>
          <p
            data-testid="profile-modal-email"
            className="text-xs sm:text-[13px] text-slate-500 mt-0.5 break-all"
          >
            {user.email}
          </p>
        </div>
      </div>
    </div>
  );

  const footerContent = (
    <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] grid grid-cols-2 sm:flex sm:justify-end gap-2.5">
      <button
        type="button"
        onClick={onClose}
        data-testid="profile-modal-close-btn"
        className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-[13px] font-semibold rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
      >
        Close
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          onEditProfile();
        }}
        data-testid="profile-modal-edit-btn"
        className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.98]"
      >
        <Edit3 className="w-3.5 h-3.5 shrink-0" />
        <span>Edit Profile</span>
      </button>
    </div>
  );

  const hasDetails = Boolean(
    user.institution ||
      user.phone ||
      user.dateOfBirth ||
      user.gender ||
      (user.role === 'teacher' && (user.qualification || user.specialization))
  );

  return (
    <ResponsiveModal
      isOpen={active}
      onClose={onClose}
      ariaLabel="User Profile"
      testId="profile-modal"
      maxWidthClass="max-w-[520px] lg:max-w-[540px]"
      header={headerContent}
      footer={footerContent}
      bodyClassName="px-4 sm:px-6 py-4 space-y-4"
    >
      {/* Institutional / System ID & Account Status */}
      <div
        data-testid="profile-modal-meta-card"
        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
      >
        <div className="min-w-0">
          <span className="text-[10px] text-slate-500 uppercase font-semibold block">Institutional ID</span>
          <span className="font-mono text-blue-600 font-bold break-all mt-0.5 block">
            {user.studentId || user.teacherId || user.adminId || `ID-${user.id.slice(-6).toUpperCase()}`}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] text-slate-500 uppercase font-semibold block">Account Status</span>
          <span className="text-emerald-700 font-semibold flex items-center gap-1 capitalize mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{user.status || 'Active'}</span>
          </span>
        </div>
      </div>

      {/* Bio */}
      {user.bio && (
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider block mb-1.5">
            Biography / About
          </span>
          <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200 break-words">
            {user.bio}
          </p>
        </div>
      )}

      {/* Details list */}
      {hasDetails && (
        <div
          data-testid="profile-modal-details"
          className="space-y-2.5 text-xs sm:text-[13px] border-t border-slate-100 pt-4"
        >
          {user.institution && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <Building className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Institution:</span>
              <span className="font-medium text-slate-900 break-words min-w-0">{user.institution}</span>
            </div>
          )}

          {user.phone && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Phone:</span>
              <span className="font-mono text-slate-900 break-all min-w-0">{user.phone}</span>
            </div>
          )}

          {user.dateOfBirth && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Date of Birth:</span>
              <span className="text-slate-900">{user.dateOfBirth}</span>
            </div>
          )}

          {user.gender && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Gender:</span>
              <span className="text-slate-900 capitalize">{user.gender.replace('_', ' ')}</span>
            </div>
          )}

          {user.role === 'teacher' && user.qualification && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <Award className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Qualification:</span>
              <span className="text-slate-900 break-words min-w-0">{user.qualification}</span>
            </div>
          )}

          {user.role === 'teacher' && user.specialization && (
            <div className="flex items-start gap-2.5 text-slate-700 min-w-0">
              <BookOpen className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="text-slate-500 shrink-0">Specialization:</span>
              <span className="text-slate-900 break-words min-w-0">{user.specialization}</span>
            </div>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
};
