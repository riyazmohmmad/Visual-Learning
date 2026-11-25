import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Optional Tailwind max-width classes for tablet/desktop (mobile always uses calc(100% - 24px)) */
  maxWidthClass?: string;
  /** Optional z-index class (defaults to z-[120]) */
  zIndexClass?: string;
  /** Non-scrolling top section (e.g., modal header or gradient banner + avatar) */
  header?: React.ReactNode;
  /** Scrollable middle content area */
  children: React.ReactNode;
  /** Non-scrolling pinned bottom action bar */
  footer?: React.ReactNode;
  /** Additional classes for the scrollable body wrapper */
  bodyClassName?: string;
  /** Additional classes for the dialog panel */
  panelClassName?: string;
  /** Prevent backdrop click and Escape key dismissal while an async action is running */
  disableClose?: boolean;
  /** Optional data-testid for automated layout verification */
  testId?: string;
}

/**
 * Reusable viewport-safe responsive modal used consistently across Student, Teacher, and Admin portals.
 * - Portaled to document.body to escape ancestor overflow, sticky, transform, and backdrop-filter clipping.
 * - Mobile: width calc(100% - 24px), max-height 90dvh, centered in viewport with safe-area padding.
 * - Tablet & Desktop: cleanly centered with responsive max-width and preserved proportions.
 * - Fixed header & action footer; only the middle content area scrolls vertically when needed.
 */
export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  isOpen,
  onClose,
  ariaLabel,
  maxWidthClass = 'max-w-[520px] lg:max-w-[540px]',
  zIndexClass = 'z-[120]',
  header,
  children,
  footer,
  bodyClassName = '',
  panelClassName = '',
  disableClose = false,
  testId,
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, disableClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={() => {
        if (!disableClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid={testId ? `${testId}-backdrop` : undefined}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center py-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-xs font-sans`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        className={`w-[calc(100%-24px)] sm:w-full ${maxWidthClass} max-h-[90dvh] sm:max-h-[min(88dvh,calc(100dvh-2rem))] bg-white border border-slate-200/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative modal-panel-enter ${panelClassName}`}
      >
        {header && (
          <div
            data-testid={testId ? `${testId}-header` : undefined}
            className="shrink-0 relative"
          >
            {header}
          </div>
        )}

        <div
          data-testid={testId ? `${testId}-body` : undefined}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyClassName}`}
        >
          {children}
        </div>

        {footer && (
          <div
            data-testid={testId ? `${testId}-footer` : undefined}
            className="shrink-0"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
