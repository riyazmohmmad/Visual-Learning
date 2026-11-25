import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldAlert,
  X,
  RefreshCw,
  Info,
  Settings,
} from 'lucide-react';
import {
  detectMediaPlatform,
  canOpenNativeDeviceSettings,
  openNativeDeviceSettings,
} from '../../utils/mediaUtils';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
}

type GuideTab = 'android' | 'ios' | 'chrome' | 'safari' | 'firefox';

export const PermissionHelpModal: React.FC<Props> = ({ isOpen, onClose, onRetry }) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('chrome');
  const nativeSettingsAvailable = canOpenNativeDeviceSettings();

  useEffect(() => {
    if (!isOpen) return;
    const platform = detectMediaPlatform();
    if (platform === 'android_capacitor' || platform === 'android_browser') {
      setActiveTab('android');
    } else if (platform === 'ios_capacitor' || platform === 'ios_browser') {
      setActiveTab('ios');
    } else if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) {
      setActiveTab('firefox');
    } else if (
      typeof navigator !== 'undefined' &&
      /safari/i.test(navigator.userAgent) &&
      !/chrome|crios|edg/i.test(navigator.userAgent)
    ) {
      setActiveTab('safari');
    } else {
      setActiveTab('chrome');
    }
  }, [isOpen]);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleOpenSettings = async () => {
    const opened = await openNativeDeviceSettings();
    if (opened) {
      onClose();
    }
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[105] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-slate-900 border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[min(88dvh,calc(100dvh-1.5rem))] mobile-sheet-enter"
      >
        <div className="sm:hidden mobile-drag-handle mt-3 shrink-0" aria-hidden="true" />

        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="type-card-title text-white tracking-tight">
                Enable Camera &amp; Microphone
              </h2>
              <p className="text-xs text-slate-400">
                Permissions were previously blocked on this device
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close guide"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-800/80 flex gap-2 overflow-x-auto scrollbar-none">
          {(
            [
              { id: 'android', label: 'Android' },
              { id: 'ios', label: 'iPhone / iPad' },
              { id: 'chrome', label: 'Chrome / Edge' },
              { id: 'safari', label: 'Safari' },
              { id: 'firefox', label: 'Firefox' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Instructions */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-4 text-sm text-slate-300">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs text-amber-200 leading-relaxed">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              Once permission has been permanently denied, Android, iOS, and browsers require you to re-enable access in settings. After enabling it, return here and VisuaLearn will start your camera automatically.
            </span>
          </div>

          {activeTab === 'android' && (
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Open <span className="font-semibold text-white">Android Settings → Apps → VisuaLearn → Permissions</span> (or Chrome site permissions if using a browser).
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Tap <span className="font-bold text-cyan-400">Camera</span> and choose <span className="font-bold text-emerald-400">Allow only while using the app</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Tap <span className="font-bold text-cyan-400">Microphone</span> and choose <span className="font-bold text-emerald-400">Allow only while using the app</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Return to VisuaLearn and tap <span className="font-semibold text-white">Try Again</span>.
              </li>
            </ol>
          )}

          {activeTab === 'ios' && (
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Open iPhone/iPad <span className="font-semibold text-white">Settings → VisuaLearn</span> (or <span className="font-semibold text-white">Settings → Safari</span>).
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Turn ON <span className="font-bold text-cyan-400">Camera</span> and <span className="font-bold text-cyan-400">Microphone</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Return to VisuaLearn and tap <span className="font-semibold text-white">Try Again</span>.
              </li>
            </ol>
          )}

          {activeTab === 'chrome' && (
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Tap the <span className="font-semibold text-white">Lock / Site Settings icon</span> on the left of the address bar.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Set <span className="font-bold text-cyan-400">Camera</span> and <span className="font-bold text-cyan-400">Microphone</span> to <span className="font-bold text-emerald-400">Allow</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Return to this tab and tap <span className="font-semibold text-white">Try Again</span>.
              </li>
            </ol>
          )}

          {activeTab === 'safari' && (
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Open <span className="font-semibold text-white">Safari → Settings → Websites</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Under <span className="font-bold text-cyan-400">Camera</span> and <span className="font-bold text-cyan-400">Microphone</span>, set VisuaLearn to <span className="font-bold text-emerald-400">Allow</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Tap <span className="font-semibold text-white">Try Again</span> below.
              </li>
            </ol>
          )}

          {activeTab === 'firefox' && (
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Click the <span className="font-semibold text-white">Permissions icon</span> beside the address bar.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Clear the blocked state for <span className="font-bold text-cyan-400">Camera</span> and <span className="font-bold text-cyan-400">Microphone</span>.
              </li>
              <li className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                Tap <span className="font-semibold text-white">Try Again</span> to allow access.
              </li>
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2.5">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {nativeSettingsAvailable && (
              <button
                onClick={handleOpenSettings}
                className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Open Device Settings</span>
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
