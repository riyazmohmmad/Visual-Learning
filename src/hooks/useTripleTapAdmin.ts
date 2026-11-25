import { useEffect, useRef } from 'react';

interface UseTripleTapAdminOptions {
  onSingleTap?: () => void;
  onTripleTap: () => void;
  /** Maximum time window (ms) in which 3 consecutive taps must occur. */
  windowMs?: number;
  /** Short debounce (ms) before executing single-tap navigation so triple-taps aren't interrupted. */
  singleTapDelayMs?: number;
}

/**
 * Detects 3 consecutive taps/clicks on the brand logo within a short time window
 * to open the hidden Admin Portal sign-in flow, while preserving normal single-tap navigation.
 */
export function useTripleTapAdmin({
  onSingleTap,
  onTripleTap,
  windowMs = 900,
  singleTapDelayMs = 280,
}: UseTripleTapAdminOptions) {
  const tapTimestampsRef = useRef<number[]>([]);
  const singleTapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  const handleTap = () => {
    const now = Date.now();
    const recentTaps = tapTimestampsRef.current.filter((t) => now - t <= windowMs);
    recentTaps.push(now);
    tapTimestampsRef.current = recentTaps;

    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (recentTaps.length >= 3) {
      tapTimestampsRef.current = [];
      onTripleTap();
      return;
    }

    if (onSingleTap) {
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        onSingleTap();
      }, singleTapDelayMs);
    }
  };

  return handleTap;
}
