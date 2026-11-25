import { useState, useEffect } from 'react';

export type ScheduleCategory = 'upcoming' | 'available' | 'submitted' | 'overdue' | 'completed';

export const ALLOWED_ASSIGNMENT_FILE_TYPES = [
  { ext: '.pdf', label: 'PDF (.pdf)' },
  { ext: '.docx', label: 'Word (.docx)' },
  { ext: '.doc', label: 'Word Legacy (.doc)' },
  { ext: '.pptx', label: 'PowerPoint (.pptx)' },
  { ext: '.xlsx', label: 'Excel (.xlsx)' },
  { ext: '.zip', label: 'ZIP Archive (.zip)' },
  { ext: '.txt', label: 'Text (.txt)' },
  { ext: '.png', label: 'PNG Image (.png)' },
  { ext: '.jpg', label: 'JPEG Image (.jpg)' },
] as const;

export const DEFAULT_ALLOWED_FILE_TYPES = ['.pdf', '.docx', '.zip', '.png', '.jpg'];

export const QUIZ_DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

/**
 * Combines a local date input (YYYY-MM-DD) and optional time input (HH:mm) into an ISO-8601 UTC string.
 * If date is empty, returns undefined. If time is empty, defaults to 00:00 (for start) or 23:59 (for due).
 */
export function combineDateAndTime(
  dateStr?: string,
  timeStr?: string,
  defaultTime: 'start' | 'end' = 'start'
): string | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;
  const cleanDate = dateStr.trim();
  const fallbackTime = defaultTime === 'end' ? '23:59' : '00:00';
  const cleanTime = timeStr && timeStr.trim() ? timeStr.trim() : fallbackTime;
  const dt = new Date(`${cleanDate}T${cleanTime}:00`);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

/**
 * Splits an ISO-8601 timestamp string into local YYYY-MM-DD and HH:mm values for HTML date/time inputs.
 */
export function splitIsoToDateTime(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  return { date, time };
}

/**
 * Formats an ISO timestamp into a readable local date & time (e.g. "25 Nov 2026, 10:00 AM").
 */
export function formatDateTime(iso?: string): string {
  if (!iso) return 'Not scheduled';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'Not scheduled';
  return dt.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats milliseconds into human-readable countdown units (e.g., "1d 4h 12m" or "2h 30m 15s").
 */
export function formatDurationMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Formats remaining seconds as MM:SS or HH:MM:SS for active quiz timer display.
 */
export function formatTimerClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Hook that returns an authoritative synced server timestamp (ms) ticking every 1 second.
 * Uses serverTimeOffsetMs = serverTimeMs - localClientMs so device clock tampering cannot skew timers.
 */
export function useServerNow(serverTimeIso?: string | null): number {
  const [offsetMs, setOffsetMs] = useState<number>(() => {
    if (!serverTimeIso) return 0;
    const parsed = new Date(serverTimeIso).getTime();
    return Number.isNaN(parsed) ? 0 : parsed - Date.now();
  });

  const [now, setNow] = useState<number>(() => Date.now() + offsetMs);

  useEffect(() => {
    if (!serverTimeIso) return;
    const parsed = new Date(serverTimeIso).getTime();
    if (!Number.isNaN(parsed)) {
      const nextOffset = parsed - Date.now();
      setOffsetMs(nextOffset);
      setNow(Date.now() + nextOffset);
    }
  }, [serverTimeIso]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now() + offsetMs);
    }, 1000);
    return () => window.clearInterval(id);
  }, [offsetMs]);

  return now;
}

export interface QuizScheduleEvaluation {
  category: ScheduleCategory;
  statusLabel: string;
  countdownText: string;
  canStart: boolean;
  isBeforeStart: boolean;
  isPastDue: boolean;
  isLateWindow: boolean;
  attemptsUsed: number;
  maxAttempts: number;
  attemptsRemaining: number;
  hasActiveAttempt: boolean;
  tone: 'blue' | 'emerald' | 'amber' | 'red' | 'slate';
}

export function evaluateQuizSchedule(quiz: any, nowMs: number): QuizScheduleEvaluation {
  const startMs = quiz.start_date ? new Date(quiz.start_date).getTime() : null;
  const dueMs = quiz.due_date ? new Date(quiz.due_date).getTime() : null;
  const allowLate = Boolean(quiz.allow_late_submission);
  const maxAttempts = Math.max(1, Number(quiz.max_attempts || 1));
  const attemptsUsed = Number(quiz.attemptsCount ?? (quiz.mySubmission ? 1 : 0));
  const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
  const hasPassed = Boolean(quiz.passed || quiz.mySubmission?.passed);
  const hasActiveAttempt = Boolean(
    quiz.activeAttempt &&
      quiz.activeAttempt.status === 'in_progress' &&
      new Date(quiz.activeAttempt.expires_at).getTime() > nowMs
  );

  const isBeforeStart = startMs !== null && !Number.isNaN(startMs) && nowMs < startMs;
  const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs;
  const isLateWindow = isPastDue && allowLate;

  let category: ScheduleCategory = 'available';
  let statusLabel = 'Available Now';
  let countdownText = 'Open now';
  let canStart = true;
  let tone: QuizScheduleEvaluation['tone'] = 'emerald';

  if (attemptsUsed > 0) {
    const canRetake = attemptsRemaining > 0 && !isBeforeStart && (!isPastDue || allowLate);
    if (hasPassed || attemptsRemaining === 0 || (isPastDue && !allowLate)) {
      category = 'completed';
      statusLabel = hasPassed ? 'Completed · Passed' : 'Completed';
      countdownText =
        quiz.mySubmission?.submitted_at
          ? `Submitted ${formatDateTime(quiz.mySubmission.submitted_at)}`
          : 'Completed';
      canStart = canRetake;
      tone = hasPassed ? 'emerald' : 'slate';
    } else {
      category = 'submitted';
      statusLabel = `Submitted (${attemptsUsed}/${maxAttempts})`;
      countdownText = dueMs ? `Due in ${formatDurationMs(dueMs - nowMs)}` : 'Retake available';
      canStart = canRetake;
      tone = 'blue';
    }
  } else if (isBeforeStart && startMs !== null) {
    category = 'upcoming';
    statusLabel = 'Upcoming';
    countdownText = `Starts in ${formatDurationMs(startMs - nowMs)}`;
    canStart = false;
    tone = 'blue';
  } else if (isPastDue) {
    if (allowLate) {
      category = 'overdue';
      statusLabel = 'Overdue · Late Allowed';
      countdownText = 'Deadline passed (Late allowed)';
      canStart = attemptsRemaining > 0;
      tone = 'amber';
    } else {
      category = 'overdue';
      statusLabel = 'Deadline Passed';
      countdownText = 'Submission closed';
      canStart = false;
      tone = 'red';
    }
  } else {
    category = 'available';
    statusLabel = hasActiveAttempt ? 'In Progress' : 'Available Now';
    if (hasActiveAttempt && quiz.activeAttempt?.expires_at) {
      const rem = new Date(quiz.activeAttempt.expires_at).getTime() - nowMs;
      countdownText = `Attempt ends in ${formatDurationMs(rem)}`;
    } else if (dueMs !== null && !Number.isNaN(dueMs)) {
      countdownText = `Due in ${formatDurationMs(dueMs - nowMs)}`;
    } else {
      countdownText = 'Available anytime';
    }
    canStart = true;
    tone = 'emerald';
  }

  return {
    category,
    statusLabel,
    countdownText,
    canStart,
    isBeforeStart,
    isPastDue,
    isLateWindow,
    attemptsUsed,
    maxAttempts,
    attemptsRemaining,
    hasActiveAttempt,
    tone,
  };
}

export interface AssignmentScheduleEvaluation {
  category: ScheduleCategory;
  statusLabel: string;
  countdownText: string;
  canSubmit: boolean;
  isBeforeStart: boolean;
  isPastDue: boolean;
  isLateWindow: boolean;
  tone: 'blue' | 'emerald' | 'amber' | 'red' | 'slate';
}

export function evaluateAssignmentSchedule(asg: any, nowMs: number): AssignmentScheduleEvaluation {
  const startMs = asg.start_date ? new Date(asg.start_date).getTime() : null;
  const dueMs = asg.due_date ? new Date(asg.due_date).getTime() : null;
  const allowLate = Boolean(asg.allow_late_submission);
  const sub = asg.mySubmission || asg.submission || null;
  const isGraded = Boolean(sub && (sub.status === 'graded' || typeof sub.marks === 'number'));
  const isSubmitted = Boolean(sub);

  const isBeforeStart = startMs !== null && !Number.isNaN(startMs) && nowMs < startMs;
  const isPastDue = dueMs !== null && !Number.isNaN(dueMs) && nowMs > dueMs;
  const isLateWindow = isPastDue && allowLate;

  let category: ScheduleCategory = 'available';
  let statusLabel = 'Available Now';
  let countdownText = 'Open for submission';
  let canSubmit = true;
  let tone: AssignmentScheduleEvaluation['tone'] = 'emerald';

  if (isGraded) {
    category = 'completed';
    statusLabel = `Completed · ${sub.marks}/${asg.max_marks || 100}`;
    countdownText = sub.graded_at ? `Graded ${formatDateTime(sub.graded_at)}` : 'Evaluated';
    canSubmit = false;
    tone = 'emerald';
  } else if (isSubmitted) {
    category = 'submitted';
    statusLabel = sub.is_late ? 'Submitted (Late)' : 'Submitted';
    countdownText = `Submitted ${formatDateTime(sub.submitted_at)}`;
    canSubmit = !isPastDue || allowLate;
    tone = sub.is_late ? 'amber' : 'blue';
  } else if (isBeforeStart && startMs !== null) {
    category = 'upcoming';
    statusLabel = 'Upcoming';
    countdownText = `Starts in ${formatDurationMs(startMs - nowMs)}`;
    canSubmit = false;
    tone = 'blue';
  } else if (isPastDue) {
    if (allowLate) {
      category = 'overdue';
      statusLabel = 'Overdue · Late Allowed';
      countdownText = asg.late_penalty_percent
        ? `Deadline passed (${asg.late_penalty_percent}% penalty)`
        : 'Deadline passed (Late allowed)';
      canSubmit = true;
      tone = 'amber';
    } else {
      category = 'overdue';
      statusLabel = 'Overdue · Closed';
      countdownText = 'Submission closed';
      canSubmit = false;
      tone = 'red';
    }
  } else {
    category = 'available';
    statusLabel = 'Available Now';
    countdownText =
      dueMs !== null && !Number.isNaN(dueMs)
        ? `Due in ${formatDurationMs(dueMs - nowMs)}`
        : 'Open submission';
    canSubmit = true;
    tone = 'emerald';
  }

  return {
    category,
    statusLabel,
    countdownText,
    canSubmit,
    isBeforeStart,
    isPastDue,
    isLateWindow,
    tone,
  };
}

/**
 * Validates that a dynamic attachment URL uses only safe relative /uploads/ or http(s) schemes.
 */
export function isSafeAttachmentUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#') return false;
  if (trimmed.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
