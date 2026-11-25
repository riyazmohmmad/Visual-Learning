import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Award,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Sparkles,
  Clock,
  Calendar,
  Lock,
  Play,
  Loader2,
  X,
} from 'lucide-react';
import { Quiz, QuizAttempt } from '../types';
import { api } from '../services/api';
import {
  evaluateQuizSchedule,
  formatDateTime,
  formatTimerClock,
  useServerNow,
} from '../utils/scheduleUtils';

interface Props {
  quiz: Quiz & {
    teacherName?: string;
    attemptsCount?: number;
    maxAttempts?: number;
    attemptsRemaining?: number;
    activeAttempt?: QuizAttempt | null;
    mySubmission?: any;
  };
  subtopicTitle?: string;
  initialAttempt?: QuizAttempt | null;
  serverTime?: string | null;
  onQuizComplete?: (passed: boolean, score: number) => void;
  onNavigateToStep?: (stepIndex: number) => void;
  onClose?: () => void;
}

interface SubmissionResult {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  marksObtained?: number;
  totalMarks?: number;
  passed: boolean;
  passingScore: number;
  passingMarks?: number;
  attemptNumber?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
  isLate?: boolean;
  autoSubmitted?: boolean;
  feedback: {
    questionId: string;
    question: string;
    questionType: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
  }[];
  recommendations: string[];
}

export const QuizRunner: React.FC<Props> = ({
  quiz,
  initialAttempt = null,
  serverTime = null,
  onQuizComplete,
  onNavigateToStep,
  onClose,
}) => {
  const [syncedServerTime, setSyncedServerTime] = useState<string | null>(serverTime);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(initialAttempt || quiz.activeAttempt || null);
  const [startingAttempt, setStartingAttempt] = useState<boolean>(false);
  const [attemptsUsed, setAttemptsUsed] = useState<number>(quiz.attemptsCount ?? 0);
  const [maxAttempts, setMaxAttempts] = useState<number>(Math.max(1, Number(quiz.max_attempts || quiz.maxAttempts || 1)));

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmIncomplete, setConfirmIncomplete] = useState<boolean>(false);
  const autoSubmittedRef = useRef<boolean>(false);

  const serverNow = useServerNow(syncedServerTime);

  useEffect(() => {
    if (serverTime) setSyncedServerTime(serverTime);
  }, [serverTime]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // If no serverTime prop was passed (e.g. direct embed), sync once with /api/time
  useEffect(() => {
    if (serverTime) return;
    api
      .getServerTime()
      .then((res) => {
        if (res.serverTime) setSyncedServerTime(res.serverTime);
      })
      .catch(() => {});
  }, [serverTime]);

  const scheduleEval = evaluateQuizSchedule(
    {
      ...quiz,
      attemptsCount: attemptsUsed,
      max_attempts: maxAttempts,
      activeAttempt: attempt,
    },
    serverNow
  );

  const remainingMs = attempt
    ? Math.max(0, new Date(attempt.expires_at).getTime() - serverNow)
    : null;

  const executeSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (isSubmitting) return;
      setConfirmIncomplete(false);
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const res = await api.submitQuiz(quiz.id, answersRef.current, {
          attempt_id: attempt?.id,
          auto_submitted: isAutoSubmit,
        });
        setResult(res);
        setAttempt(null);
        if (typeof res.attemptNumber === 'number') {
          setAttemptsUsed(res.attemptNumber);
        } else {
          setAttemptsUsed((prev) => prev + 1);
        }
        if (typeof res.maxAttempts === 'number') {
          setMaxAttempts(res.maxAttempts);
        }
        if (onQuizComplete) {
          onQuizComplete(res.passed, res.scorePercent);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to submit quiz. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [attempt?.id, isSubmitting, onQuizComplete, quiz.id]
  );

  // Automatic submission when authoritative attempt duration or deadline expires
  useEffect(() => {
    if (!attempt || result || isSubmitting) return;
    if (remainingMs !== null && remainingMs <= 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void executeSubmit(true);
    }
  }, [attempt, remainingMs, result, isSubmitting, executeSubmit]);

  const handleStartAttempt = async () => {
    setErrorMessage(null);
    setStartingAttempt(true);
    autoSubmittedRef.current = false;
    try {
      const res = await api.startQuizAttempt(quiz.id);
      if (res.serverTime) setSyncedServerTime(res.serverTime);
      setAttempt(res.attempt);
      if (typeof res.attemptsUsed === 'number') setAttemptsUsed(res.attemptsUsed);
      if (typeof res.maxAttempts === 'number') setMaxAttempts(res.maxAttempts);
      setResult(null);
      setAnswers({});
      answersRef.current = {};
      setConfirmIncomplete(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to start quiz attempt.');
    } finally {
      setStartingAttempt(false);
    }
  };

  const handleSelectOption = (questionId: string, option: string) => {
    if (result || !attempt) return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    setConfirmIncomplete(false);
  };

  const handleTextChange = (questionId: string, val: string) => {
    if (result || !attempt) return;
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
    setConfirmIncomplete(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const answeredCount = Object.keys(answers).length;
    if (answeredCount < quiz.questions.length && !confirmIncomplete) {
      setConfirmIncomplete(true);
      return;
    }

    await executeSubmit(false);
  };

  const totalMarks = Number(quiz.marks) || 100;
  const passingMarks =
    quiz.passing_marks !== undefined && quiz.passing_marks !== null
      ? Number(quiz.passing_marks)
      : Math.round((totalMarks * (Number(quiz.passing_score) || 70)) / 100);

  const canRetakeAfterResult =
    result !== null &&
    (result.attemptsRemaining ?? Math.max(0, maxAttempts - attemptsUsed)) > 0 &&
    (!scheduleEval.isPastDue || Boolean(quiz.allow_late_submission));

  const timerUrgencyClass =
    remainingMs !== null && remainingMs <= 60_000
      ? 'bg-red-500/20 border-red-500/60 text-red-200 animate-pulse'
      : remainingMs !== null && remainingMs <= 300_000
      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Quiz Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-semibold text-white break-words">{quiz.title}</h3>
          </div>
          {quiz.description && <p className="text-xs text-slate-400 mt-0.5">{quiz.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {attempt && !result && remainingMs !== null && (
            <div
              className={`flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border tabular-nums ${timerUrgencyClass}`}
              aria-live="polite"
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{formatTimerClock(remainingMs)}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300 tabular-nums">
            <span>
              Pass: {passingMarks}/{totalMarks} ({quiz.passing_score || 70}%)
            </span>
            <span>·</span>
            <span>{quiz.questions.length} Qs</span>
            <span>·</span>
            <span>{quiz.time_limit || 20} min</span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              aria-label="Close quiz"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* QUIZ RESULTS VIEW (If Submitted) */}
      {result ? (
        <div className="p-4 sm:p-6 space-y-6">
          <div
            className={`p-4 sm:p-6 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 ${
              result.passed
                ? 'bg-emerald-950/40 border-emerald-500/30'
                : 'bg-amber-950/40 border-amber-500/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
                  result.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {result.passed ? <CheckCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div>
                <h4 className="type-section-title text-white">
                  {result.passed ? 'Mastery Verified!' : 'Needs Review'}
                </h4>
                <p className="text-xs text-slate-300 mt-1 tabular-nums">
                  You scored{' '}
                  <span className="font-mono font-bold">
                    {result.correctCount} of {result.totalQuestions}
                  </span>{' '}
                  ({result.scorePercent}% ·{' '}
                  {result.marksObtained !== undefined
                    ? `${result.marksObtained}/${result.totalMarks || totalMarks} marks`
                    : `${result.scorePercent}%`}
                  ).
                  {result.attemptNumber && (
                    <span className="ml-1.5 text-slate-400">
                      Attempt #{result.attemptNumber} of {result.maxAttempts || maxAttempts}.
                    </span>
                  )}
                </p>
                {(result.autoSubmitted || result.isLate) && (
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                    {result.autoSubmitted && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-semibold">
                        Auto-submitted when timer expired
                      </span>
                    )}
                    {result.isLate && (
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 text-[11px] font-semibold">
                        Late Submission
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {canRetakeAfterResult && (
                <button
                  type="button"
                  onClick={handleStartAttempt}
                  disabled={startingAttempt}
                  className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {startingAttempt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Retake Quiz</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              )}
            </div>
          </div>

          {/* SMART STUDY RECOMMENDATIONS */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                <Sparkles className="w-4 h-4" />
                <span>SMART STUDY RECOMMENDATIONS</span>
              </div>
              <p className="text-xs text-slate-300">
                Based on your quiz performance, here is your customized plan to achieve complete topic mastery:
              </p>
              <div className="space-y-2 mt-2">
                {result.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                        {i + 1}
                      </span>
                      <span className="break-words">{rec}</span>
                    </div>
                    {onNavigateToStep && (
                      <button
                        onClick={() => onNavigateToStep(i % 4)}
                        className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        Go to Step →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Question Breakdown */}
          <div className="space-y-4 pt-2">
            <h4 className="text-sm font-semibold text-white">Answer Breakdown & Explanations</h4>
            {result.feedback.map((item, idx) => (
              <div
                key={item.questionId}
                className={`p-4 rounded-xl border ${
                  item.isCorrect
                    ? 'bg-emerald-950/10 border-emerald-500/20'
                    : 'bg-red-950/10 border-red-500/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {item.isCorrect ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-white">
                        Question {idx + 1}: {item.question}
                      </div>
                      <div className="mt-2 text-xs space-y-1">
                        <div className="text-slate-400">
                          Your answer:{' '}
                          <span className={item.isCorrect ? 'text-emerald-300 font-medium' : 'text-red-300 font-medium'}>
                            {item.studentAnswer || '(No answer provided)'}
                          </span>
                        </div>
                        {!item.isCorrect && (
                          <div className="text-slate-400">
                            Correct answer:{' '}
                            <span className="text-emerald-400 font-medium">{item.correctAnswer}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {item.explanation && (
                  <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-300 bg-slate-950/40 p-2.5 rounded-lg flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Explanation: </span>
                      {item.explanation}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : !attempt ? (
        /* PRE-START TIMED GATE */
        <div className="p-5 sm:p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg text-xs">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Schedule Window</span>
              </div>
              <div className="text-slate-200">
                Opens: <span className="font-semibold">{quiz.start_date ? formatDateTime(quiz.start_date) : 'Immediately'}</span>
              </div>
              <div className="text-slate-200">
                Due: <span className="font-semibold">{quiz.due_date ? formatDateTime(quiz.due_date) : 'No deadline'}</span>
              </div>
              <div className="text-cyan-300 font-medium pt-0.5">{scheduleEval.countdownText}</div>
            </div>

            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 tabular-nums">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Attempt Rules</span>
              </div>
              <div className="text-slate-200">
                Duration: <span className="font-semibold">{quiz.time_limit || 20} minutes</span> (auto-submits when time ends)
              </div>
              <div className="text-slate-200">
                Passing: <span className="font-semibold">{passingMarks} / {totalMarks} marks ({quiz.passing_score || 70}%)</span>
              </div>
              <div className="text-slate-200">
                Attempts used: <span className="font-semibold">{attemptsUsed} / {maxAttempts}</span>
              </div>
            </div>
          </div>

          {!scheduleEval.canStart ? (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3 text-xs text-slate-300">
              <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-white">{scheduleEval.statusLabel}</div>
                <div className="text-slate-400 mt-0.5">
                  {scheduleEval.isBeforeStart
                    ? `This quiz is scheduled for ${formatDateTime(quiz.start_date)}. ${scheduleEval.countdownText}.`
                    : scheduleEval.attemptsRemaining === 0
                    ? `You have used all ${maxAttempts} allowed attempt(s) for this quiz.`
                    : 'The submission deadline for this quiz has passed.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-400">
                Once started, your {quiz.time_limit || 20}-minute timer runs continuously using server time.
              </p>
              <button
                type="button"
                onClick={handleStartAttempt}
                disabled={startingAttempt}
                className="py-2.5 px-6 text-xs font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {startingAttempt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{startingAttempt ? 'Starting...' : 'Start Timed Quiz'}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE QUESTION FORM */
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg text-xs">
              {errorMessage}
            </div>
          )}

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 tabular-nums">
            <span>
              Attempt #{attempt.attempt_number} of {maxAttempts} · Auto-submits at{' '}
              <span className="text-white font-semibold">{formatDateTime(attempt.expires_at)}</span>
            </span>
            {remainingMs !== null && (
              <span className="font-mono font-bold text-cyan-300">
                Time left: {formatTimerClock(remainingMs)}
              </span>
            )}
          </div>

          {quiz.questions.map((q, idx) => (
            <div key={q.id} className="p-4 sm:p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <span className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white leading-relaxed break-words">{q.question}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {q.question_type === 'multiple_choice'
                      ? 'Select one option'
                      : q.question_type === 'true_false'
                      ? 'Select True or False'
                      : 'Type your short answer'}
                  </div>
                </div>
              </div>

              {q.question_type !== 'short_answer' && q.options && (
                <div className="grid grid-cols-1 gap-2 pl-0 sm:pl-9">
                  {q.options.map((opt) => (
                    <label
                      key={opt}
                      onClick={() => handleSelectOption(q.id, opt)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center gap-3 transition-colors ${
                        answers[q.id] === opt
                          ? 'bg-cyan-950/50 border-cyan-500 text-cyan-100 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleSelectOption(q.id, opt)}
                        className="accent-cyan-400 shrink-0"
                      />
                      <span className="break-words">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.question_type === 'short_answer' && (
                <div className="pl-0 sm:pl-9">
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    placeholder="Enter your concise answer..."
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              )}
            </div>
          ))}

          {confirmIncomplete && (
            <div className="p-3.5 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>
                You answered {Object.keys(answers).length} of {quiz.questions.length} questions. Submit anyway?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmIncomplete(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold cursor-pointer"
                >
                  Keep Answering
                </button>
                <button
                  type="button"
                  onClick={() => void executeSubmit(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold cursor-pointer"
                >
                  Submit Anyway
                </button>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-400 tabular-nums">
              {Object.keys(answers).length} of {quiz.questions.length} questions answered
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto justify-center py-2.5 px-6 text-xs bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors flex items-center gap-2 font-bold cursor-pointer"
            >
              {isSubmitting ? 'Evaluating...' : 'Submit Assessment'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
