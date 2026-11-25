import React, { useState } from 'react';
import { Settings, CheckCircle2, Shield, Bell, Save, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const TeacherSettingsTab: React.FC = () => {
  const { user } = useAuth();
  const [defaultSection, setDefaultSection] = useState('B21');
  const [autoApproveEnrollment, setAutoApproveEnrollment] = useState(true);
  const [doubtNotifications, setDoubtNotifications] = useState(true);
  const [quizAutoGrading, setQuizAutoGrading] = useState(true);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMessage('Teaching preferences saved successfully!');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 max-w-2xl">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2 type-label text-blue-600 uppercase tracking-wider">
          <Settings className="w-4 h-4" />
          <span>Faculty Portal Preferences</span>
        </div>
        <h2 className="type-section-title text-slate-900 mt-1">Instructor Settings</h2>
        <p className="type-helper text-slate-500 mt-0.5">
          Configure default class sections, classroom enrollment codes, and notification alerts.
        </p>
      </div>

      {savedMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{savedMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Default Section Code</label>
          <input
            type="text"
            value={defaultSection}
            onChange={(e) => setDefaultSection(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono uppercase focus:outline-hidden focus:border-blue-500"
          />
          <span className="text-[11px] text-slate-400 mt-1 block">
            Used as default prefix when creating new classes.
          </span>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="font-semibold text-slate-900">Automation & Alerts</div>

          <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApproveEnrollment}
              onChange={(e) => setAutoApproveEnrollment(e.target.checked)}
              className="mt-0.5 rounded text-blue-600"
            />
            <div>
              <span className="font-semibold text-slate-800 block">Instant Code-Based Enrollment</span>
              <span className="text-slate-500 text-[11px]">
                Students automatically join your class roster immediately upon entering a valid class code.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70 cursor-pointer">
            <input
              type="checkbox"
              checked={doubtNotifications}
              onChange={(e) => setDoubtNotifications(e.target.checked)}
              className="mt-0.5 rounded text-blue-600"
            />
            <div>
              <span className="font-semibold text-slate-800 block">Doubt Alerts</span>
              <span className="text-slate-500 text-[11px]">
                Highlight urgent student questions on your dashboard sidebar counter.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70 cursor-pointer">
            <input
              type="checkbox"
              checked={quizAutoGrading}
              onChange={(e) => setQuizAutoGrading(e.target.checked)}
              className="mt-0.5 rounded text-blue-600"
            />
            <div>
              <span className="font-semibold text-slate-800 block">Automated Quiz Scoring</span>
              <span className="text-slate-500 text-[11px]">
                Instantly compute percentages and award completion certificates when passing thresholds are met.
              </span>
            </div>
          </label>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            className="py-2.5 px-6 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
};
