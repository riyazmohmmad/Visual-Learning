import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Send,
  BookOpen,
  AlertCircle,
  Check,
  Copy,
  Plus,
  Trash2,
  Eraser,
  MessageSquarePlus,
  Loader2,
  ArrowRight,
  History,
  X,
  RefreshCw,
  SlidersHorizontal,
  Languages,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import {
  Subject,
  AiDetailLevel,
  AiLanguageMode,
  AiChatMessage,
  AiChatSessionSummary,
} from '../types';
import { api } from '../services/api';
import { AiMarkdownRenderer } from './AiMarkdownRenderer';

interface Props {
  enrolledSubjects: Subject[];
  defaultSubjectId?: string;
  defaultSubjectName?: string;
  defaultChapterTitle?: string;
  defaultTopicTitle?: string;
  variant?: 'full' | 'compact';
  onEscalateToInstructor?: (payload: {
    subjectId: string;
    title: string;
    description: string;
  }) => void;
}

const GENERAL_SUBJECT_PRESETS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Programming & DSA',
  'Cybersecurity',
  'Computer Networking',
  'Cloud Computing',
  'Database & SQL',
  'Operating Systems',
];

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const AiDoubtSolverPanel: React.FC<Props> = ({
  enrolledSubjects,
  defaultSubjectId,
  defaultSubjectName,
  defaultChapterTitle,
  defaultTopicTitle,
  variant = 'full',
  onEscalateToInstructor,
}) => {
  const isCompact = variant === 'compact';

  // Chat sessions & active session state
  const [sessions, setSessions] = useState<AiChatSessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState<boolean>(false);

  // Mobile history drawer & context bar toggles
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [showContextBar, setShowContextBar] = useState<boolean>(!isCompact);

  // Inline confirmation states (no window.confirm)
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Academic context & preferences
  const [selectedSubjectValue, setSelectedSubjectValue] = useState<string>(() => {
    if (defaultSubjectId) return `enrolled:${defaultSubjectId}`;
    if (defaultSubjectName) return `preset:${defaultSubjectName}`;
    return enrolledSubjects[0]?.id ? `enrolled:${enrolledSubjects[0].id}` : '';
  });
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState<string>(defaultChapterTitle || '');
  const [topicInput, setTopicInput] = useState<string>(defaultTopicTitle || '');
  const [detailLevel, setDetailLevel] = useState<AiDetailLevel>('balanced');
  const [language, setLanguage] = useState<AiLanguageMode>('auto');

  // Composer & request state
  const [question, setQuestion] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{
    prompt: string;
    detail?: AiDetailLevel;
    lang?: AiLanguageMode;
  } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resolve current subject context
  const resolvedSubject = (() => {
    if (selectedSubjectValue.startsWith('enrolled:')) {
      const id = selectedSubjectValue.slice('enrolled:'.length);
      const found = enrolledSubjects.find((s) => s.id === id);
      return { id: found?.id, name: found?.name || defaultSubjectName };
    }
    if (selectedSubjectValue.startsWith('preset:')) {
      return { id: undefined, name: selectedSubjectValue.slice('preset:'.length) };
    }
    return { id: undefined, name: undefined };
  })();

  // Load persisted chat history for the authenticated student
  const loadSessions = useCallback(
    async (autoSelectLatest: boolean) => {
      try {
        setLoadingSessions(true);
        const res = await api.getAiChats();
        const list = res.sessions || [];
        setSessions(list);

        if (autoSelectLatest && list.length > 0 && !defaultTopicTitle) {
          // Open the latest conversation if it already has messages
          const latestNonEmpty = list.find((s) => s.messageCount > 0);
          if (latestNonEmpty) {
            await openSession(latestNonEmpty.id);
          }
        }
      } catch (err: any) {
        console.warn('Could not fetch AI chat history:', err?.message);
      } finally {
        setLoadingSessions(false);
      }
    },
    [defaultTopicTitle]
  );

  useEffect(() => {
    loadSessions(!isCompact);
  }, [loadSessions, isCompact]);

  // Load chapters when an enrolled subject is selected
  useEffect(() => {
    if (!resolvedSubject.id) {
      setChapters([]);
      return;
    }
    let cancelled = false;
    api
      .getSubject(resolvedSubject.id)
      .then((res) => {
        if (cancelled) return;
        const list = (res.chapters || []).map((c: any) => ({ id: c.id, title: c.title }));
        setChapters(list);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedSubject.id]);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, pendingUserText]);

  // Auto-resize composer textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question]);

  const openSession = async (sessionId: string) => {
    try {
      setLoadingSessionDetail(true);
      setError(null);
      setLastFailedRequest(null);
      setConfirmClear(false);
      const res = await api.getAiChat(sessionId);
      const sess = res.session;
      setActiveSessionId(sess.id);
      setMessages(sess.messages || []);
      setDetailLevel(sess.detail_level || 'balanced');
      setLanguage(sess.language || 'auto');
      if (sess.subject_id) {
        setSelectedSubjectValue(`enrolled:${sess.subject_id}`);
      } else if (sess.subject_name) {
        setSelectedSubjectValue(`preset:${sess.subject_name}`);
      }
      if (sess.chapter_title) setSelectedChapterTitle(sess.chapter_title);
      if (sess.topic_title) setTopicInput(sess.topic_title);
      setHistoryOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Unable to load that conversation.');
    } finally {
      setLoadingSessionDetail(false);
    }
  };

  const handleStartNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setPendingUserText(null);
    setError(null);
    setLastFailedRequest(null);
    setConfirmClear(false);
    setHistoryOpen(false);
    textareaRef.current?.focus();
  };

  const handleClearChat = async () => {
    setConfirmClear(false);
    setError(null);
    setLastFailedRequest(null);
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    try {
      await api.clearAiChatMessages(activeSessionId);
      setMessages([]);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, title: 'New Doubt Chat', messageCount: 0, lastMessagePreview: '' }
            : s
        )
      );
    } catch (err: any) {
      setError(err?.message || 'Unable to clear chat right now.');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setConfirmDeleteId(null);
    try {
      await api.deleteAiChat(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to delete conversation.');
    }
  };

  const handleCopyAnswer = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedMessageId(msgId);
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === msgId ? null : prev));
    }, 1800);
  };

  const sendQuestion = async (
    overridePrompt?: string,
    overrideOptions?: { detailLevel?: AiDetailLevel; language?: AiLanguageMode }
  ) => {
    const cleanQ = (overridePrompt ?? question).trim();
    if (cleanQ.length < 2 || sending) return;

    const effectiveDetail = overrideOptions?.detailLevel || detailLevel;
    const effectiveLanguage = overrideOptions?.language || language;
    if (overrideOptions?.detailLevel) setDetailLevel(overrideOptions.detailLevel);
    if (overrideOptions?.language) setLanguage(overrideOptions.language);

    setError(null);
    setLastFailedRequest(null);
    setConfirmClear(false);
    setPendingUserText(cleanQ);
    if (!overridePrompt) setQuestion('');
    setSending(true);

    try {
      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const created = await api.createAiChat({
          subject_id: resolvedSubject.id,
          subject_name: resolvedSubject.name,
          chapter_title: selectedChapterTitle.trim() || undefined,
          topic_title: topicInput.trim() || undefined,
          detail_level: effectiveDetail,
          language: effectiveLanguage,
        });
        targetSessionId = created.session.id;
        setActiveSessionId(targetSessionId);
      }

      const res = await api.sendAiChatMessage(targetSessionId, {
        question: cleanQ,
        subject_id: resolvedSubject.id,
        subject_name: resolvedSubject.name,
        chapter_title: selectedChapterTitle.trim() || undefined,
        topic_title: topicInput.trim() || undefined,
        detail_level: effectiveDetail,
        language: effectiveLanguage,
      });

      setMessages(res.session.messages || []);
      setPendingUserText(null);

      // Update sidebar list with latest title & preview
      const updatedSummary: AiChatSessionSummary = {
        id: res.session.id,
        title: res.session.title,
        subject_id: res.session.subject_id,
        subject_name: res.session.subject_name,
        chapter_title: res.session.chapter_title,
        topic_title: res.session.topic_title,
        language: res.session.language,
        detail_level: res.session.detail_level,
        messageCount: res.session.messages.length,
        lastMessagePreview: res.assistantMessage.content.slice(0, 100),
        created_at: res.session.created_at,
        updated_at: res.session.updated_at,
      };
      setSessions((prev) => [
        updatedSummary,
        ...prev.filter((s) => s.id !== updatedSummary.id),
      ]);
    } catch (err: any) {
      const msg =
        err?.message || 'Unable to reach AI Doubt Solver right now. Please try again.';
      setError(msg);
      setLastFailedRequest({
        prompt: cleanQ,
        detail: effectiveDetail,
        lang: effectiveLanguage,
      });
      setPendingUserText(null);
      // Restore typed text if composer was emptied
      if (!overridePrompt) {
        setQuestion(cleanQ);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === 'user')?.content || question.trim();

  // Dynamic contextual starter prompts
  const starterPrompts = (() => {
    if (defaultTopicTitle) {
      return [
        `Explain "${defaultTopicTitle}" step by step in simple language`,
        `Give me a worked example of "${defaultTopicTitle}"`,
        `Explain "${defaultTopicTitle}" in Hinglish with a real-life analogy`,
        `What are the most important exam questions on "${defaultTopicTitle}"?`,
      ];
    }
    if (resolvedSubject.name) {
      return [
        `Explain the core fundamentals of ${resolvedSubject.name} step by step`,
        `Solve a practice numerical or coding problem in ${resolvedSubject.name}`,
        `Explain a tricky ${resolvedSubject.name} concept in simple Hinglish`,
        `What common mistakes should I avoid in ${resolvedSubject.name} exams?`,
      ];
    }
    return [
      'Solve 2x² - 7x + 3 = 0 step by step using the quadratic formula',
      'Write a Python function for Binary Search and explain its time complexity',
      'Explain TCP 3-way handshake and how firewalls filter packets',
      'Recursion kya hota hai? Simple Hinglish mein example ke saath samjhao',
    ];
  })();

  const renderHistoryList = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-blue-600" />
          <span>Chat History</span>
        </span>
        <button
          type="button"
          onClick={handleStartNewChat}
          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loadingSessions ? (
          <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Loading chats...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 space-y-1.5">
            <MessageSquare className="w-5 h-5 mx-auto text-slate-300" />
            <p className="font-medium text-slate-500">No saved chats yet</p>
            <p className="text-[11px]">Your AI doubt conversations will be saved here automatically.</p>
          </div>
        ) : (
          sessions.map((sess) => {
            const isActive = sess.id === activeSessionId;
            const isDeleting = confirmDeleteId === sess.id;
            return (
              <div
                key={sess.id}
                className={`group rounded-xl border transition-colors ${
                  isActive
                    ? 'bg-blue-50/90 border-blue-200'
                    : 'bg-transparent border-transparent hover:bg-slate-100/80'
                }`}
              >
                {isDeleting ? (
                  <div className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-red-700">Delete chat?</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(sess.id)}
                        className="px-2 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 p-2.5">
                    <button
                      type="button"
                      onClick={() => openSession(sess.id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div
                        className={`text-xs font-semibold truncate ${
                          isActive ? 'text-blue-800' : 'text-slate-800'
                        }`}
                      >
                        {sess.title || 'New Doubt Chat'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                        {sess.subject_name && (
                          <span className="truncate max-w-[110px] font-medium text-slate-600">
                            {sess.subject_name}
                          </span>
                        )}
                        {sess.subject_name && <span>·</span>}
                        <span className="tabular-nums shrink-0">
                          {formatRelativeTime(sess.updated_at)}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(sess.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                      aria-label={`Delete conversation ${sess.title}`}
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden flex ${
        isCompact
          ? 'h-[min(64dvh,560px)] min-h-[360px] sm:h-[min(70dvh,640px)]'
          : 'h-[min(66dvh,580px)] min-h-[380px] sm:h-[min(72dvh,660px)] lg:h-[720px]'
      }`}
    >
      {/* Desktop Chat History Sidebar */}
      {!isCompact && (
        <aside className="hidden md:flex md:w-64 lg:w-68 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70">
          {renderHistoryList()}
        </aside>
      )}

      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Top Toolbar */}
        <div className="px-3.5 sm:px-5 py-3 border-b border-slate-200/80 bg-slate-50/60 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className={`${
                  isCompact ? 'inline-flex' : 'md:hidden inline-flex'
                } items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0`}
                aria-label="Open chat history"
              >
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">History</span>
                {sessions.length > 0 && (
                  <span className="text-[10px] text-slate-500 tabular-nums">({sessions.length})</span>
                )}
              </button>

              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="truncate">VisuaLearn AI Tutor</span>
                </h3>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowContextBar((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  showContextBar
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Set Subject, Chapter, and Topic context"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Subject</span>
                {showContextBar ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              <button
                type="button"
                onClick={handleStartNewChat}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                title="Start a new conversation"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Chat</span>
              </button>

              {messages.length > 0 && (
                confirmClear ? (
                  <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1 text-[11px]">
                    <span className="text-red-800 font-semibold">Clear?</span>
                    <button
                      type="button"
                      onClick={handleClearChat}
                      className="px-1.5 py-0.5 bg-red-600 text-white rounded font-semibold hover:bg-red-700 cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-1.5 py-0.5 bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Clear messages in this chat"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Language & Explanation Depth Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 max-w-full">
            {/* Explanation Depth */}
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] max-w-full overflow-x-auto scrollbar-none">
              {(
                [
                  { key: 'concise', label: 'Shorter' },
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'detailed', label: 'Detailed' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDetailLevel(opt.key)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    detailLevel === opt.key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Language Mode (Auto / English / Hinglish) */}
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] max-w-full overflow-x-auto scrollbar-none">
              <span className="px-1.5 text-slate-400 flex items-center shrink-0" title="Response Language">
                <Languages className="w-3.5 h-3.5" />
              </span>
              {(
                [
                  { key: 'auto', label: 'Auto' },
                  { key: 'english', label: 'English' },
                  { key: 'hinglish', label: 'Hinglish' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLanguage(opt.key)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    language === opt.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Collapsible Academic Subject / Chapter / Topic Context */}
          {showContextBar && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <label htmlFor="ai-subject-select" className="sr-only">
                  Subject
                </label>
                <select
                  id="ai-subject-select"
                  value={selectedSubjectValue}
                  onChange={(e) => {
                    setSelectedSubjectValue(e.target.value);
                    setSelectedChapterTitle('');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-blue-500"
                >
                  <option value="">Any Subject (General)</option>
                  {enrolledSubjects.length > 0 && (
                    <optgroup label="My Enrolled Classes">
                      {enrolledSubjects.map((subj) => (
                        <option key={subj.id} value={`enrolled:${subj.id}`}>
                          {subj.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Academic Subjects">
                    {GENERAL_SUBJECT_PRESETS.map((preset) => (
                      <option key={preset} value={`preset:${preset}`}>
                        {preset}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label htmlFor="ai-chapter-select" className="sr-only">
                  Chapter
                </label>
                {chapters.length > 0 ? (
                  <select
                    id="ai-chapter-select"
                    value={selectedChapterTitle}
                    onChange={(e) => setSelectedChapterTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="">All chapters (optional)</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.title}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="ai-chapter-select"
                    type="text"
                    value={selectedChapterTitle}
                    onChange={(e) => setSelectedChapterTitle(e.target.value)}
                    placeholder="Chapter (optional)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                  />
                )}
              </div>

              <div>
                <label htmlFor="ai-topic-input" className="sr-only">
                  Topic
                </label>
                <input
                  id="ai-topic-input"
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="Topic (e.g. Recursion, TCP/IP, Calculus)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Conversation Feed */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-5 py-4 space-y-4 bg-white">
          {loadingSessionDetail ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span>Loading conversation...</span>
            </div>
          ) : messages.length === 0 && !pendingUserText ? (
            <div className="py-6 sm:py-10 text-center max-w-xl mx-auto space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-slate-900">
                  {defaultTopicTitle
                    ? `Ask anything about ${defaultTopicTitle}`
                    : 'Ask any academic doubt — step by step'}
                </h4>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Math &amp; numericals, Python/Java/C++ code, Cybersecurity, Networking, Cloud Computing, Physics, Chemistry, or any subject — in English or Hinglish.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                {starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendQuestion(prompt)}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/80 text-slate-700 hover:text-blue-800 border border-slate-200/90 hover:border-blue-200 text-xs font-medium leading-relaxed transition-colors cursor-pointer flex items-start justify-between gap-2 group"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isLastAssistant =
                  msg.role === 'assistant' && idx === messages.length - 1;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[92%] sm:max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-xs">
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <div className="text-[10px] text-blue-100/90 mt-1.5 text-right tabular-nums">
                          {formatMessageTime(msg.createdAt)}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-[98%] sm:max-w-[92%] min-w-0 overflow-hidden bg-slate-50/90 border border-slate-200/90 rounded-2xl rounded-tl-sm p-3.5 sm:p-5 space-y-3">
                        {/* Assistant Message Header + Copy Answer */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>AI Tutor Explanation</span>
                            {msg.language === 'hinglish' && (
                              <span className="text-[10px] font-semibold text-slate-500">
                                · Hinglish
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {formatMessageTime(msg.createdAt)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyAnswer(msg.id, msg.content)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                              aria-label="Copy answer"
                            >
                              {copiedMessageId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-500" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Rich Academic Markdown Body */}
                        <AiMarkdownRenderer content={msg.content} />

                        {/* Quick Academic Refine Controls on latest AI reply */}
                        {isLastAssistant && !sending && (
                          <div className="pt-2.5 border-t border-slate-200/70 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                                Adjust answer:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  sendQuestion(
                                    'Summarize your previous explanation into a shorter, quick-revision version.',
                                    { detailLevel: 'concise' }
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-[11px] font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Minimize2 className="w-3 h-3" />
                                <span>Shorter</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendQuestion(
                                    'Give a more detailed step-by-step breakdown of the previous explanation with deeper intuition.',
                                    { detailLevel: 'detailed' }
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-[11px] font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Maximize2 className="w-3 h-3" />
                                <span>More Detailed</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendQuestion(
                                    'Give me a clear worked example or real-world analogy for what you just explained.'
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-[11px] font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Lightbulb className="w-3 h-3" />
                                <span>Add Example</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendQuestion(
                                    msg.language === 'hinglish'
                                      ? 'Explain the same answer again in simple English.'
                                      : 'Isi explanation ko simple Hinglish mein samjhao.',
                                    {
                                      language:
                                        msg.language === 'hinglish' ? 'english' : 'hinglish',
                                    }
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-[11px] font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Languages className="w-3 h-3" />
                                <span>
                                  {msg.language === 'hinglish'
                                    ? 'In English'
                                    : 'Explain in Hinglish'}
                                </span>
                              </button>
                            </div>

                            {/* Contextual Follow-Up Questions */}
                            {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-[11px] font-semibold text-slate-500">
                                  Suggested follow-ups:
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.followUpQuestions.map((fq, fqIdx) => (
                                    <button
                                      key={fqIdx}
                                      type="button"
                                      onClick={() => sendQuestion(fq)}
                                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 text-xs font-medium text-left inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <span>{fq}</span>
                                      <ArrowRight className="w-3 h-3 shrink-0" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Optimistic user message while Gemini is generating */}
              {pendingUserText && (
                <div className="flex flex-col items-end">
                  <div className="max-w-[92%] sm:max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-xs">
                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {pendingUserText}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Real-Time Loading Indicator */}
          {sending && (
            <div className="flex items-start">
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-3 text-xs font-medium text-slate-700 shadow-2xs">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <div>
                  <div className="font-semibold text-slate-800">
                    Solving your doubt step by step...
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Preparing explanation, examples, and formatting
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actionable Error Alert with Retry & Escalate */}
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lastFailedRequest && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      sendQuestion(lastFailedRequest.prompt, {
                        detailLevel: lastFailedRequest.detail,
                        language: lastFailedRequest.lang,
                      })
                    }
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                )}
                {onEscalateToInstructor && lastUserMessage && enrolledSubjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onEscalateToInstructor({
                        subjectId: resolvedSubject.id || enrolledSubjects[0]?.id || '',
                        title: lastUserMessage.slice(0, 90),
                        description: lastUserMessage,
                      })
                    }
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-100 rounded-lg font-semibold whitespace-nowrap cursor-pointer"
                  >
                    Ask Instructor
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Message Composer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50/70 space-y-2 shrink-0">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask any doubt, paste code, or type a math problem... (Shift+Enter for new line)"
                maxLength={4000}
                disabled={sending}
                className="w-full px-3.5 py-2.5 min-h-[44px] max-h-[160px] bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 resize-none leading-relaxed disabled:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={sending || question.trim().length < 2}
              className="px-4 sm:px-5 h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
              aria-label="Send question"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Ask AI</span>
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              {question.length > 3200 ? (
                <span className="text-amber-600 font-semibold tabular-nums">
                  {question.length} / 4000 chars
                </span>
              ) : (
                <span>Supports Math, Coding, Cybersecurity, Networking, Cloud &amp; Hinglish</span>
              )}
            </span>

            {onEscalateToInstructor && enrolledSubjects.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onEscalateToInstructor({
                    subjectId: resolvedSubject.id || enrolledSubjects[0]?.id || '',
                    title: lastUserMessage ? lastUserMessage.slice(0, 90) : '',
                    description: lastUserMessage || '',
                  })
                }
                className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Ask Instructor Instead</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Compact History Drawer */}
        {historyOpen && (
          <div
            className="absolute inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] flex"
            onClick={() => setHistoryOpen(false)}
          >
            <div
              className="w-72 max-w-[85%] bg-white h-full shadow-xl border-r border-slate-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-end p-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  aria-label="Close chat history"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">{renderHistoryList()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
