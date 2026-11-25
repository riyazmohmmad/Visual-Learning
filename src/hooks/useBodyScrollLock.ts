import { useEffect } from 'react';

let activeLockCount = 0;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';

/**
 * Reference-counted background scroll lock for modals, dialogs, and bottom sheets.
 * Safe with nested modals and preserves scroll position without layout jumps.
 */
export function useBodyScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (activeLockCount === 0) {
      previousHtmlOverflow = document.documentElement.style.overflow;
      previousBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [isLocked]);
}
