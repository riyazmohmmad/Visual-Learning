import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export type AiDetailLevel = 'concise' | 'balanced' | 'detailed';
export type AiLanguageMode = 'auto' | 'english' | 'hinglish';

export interface AiDoubtHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiDoubtRequest {
  question: string;
  subjectName?: string;
  chapterTitle?: string;
  topicTitle?: string;
  detailLevel?: AiDetailLevel;
  language?: AiLanguageMode;
  history?: AiDoubtHistoryItem[];
}

export interface AiDoubtAnswer {
  content: string;
  followUpQuestions: string[];
  modelUsed: string;
}

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const FOLLOWUP_DELIMITER = '---FOLLOWUPS---';

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined;

function getGeminiClient(): GoogleGenAI {
  const rawKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!rawKey || rawKey === 'MY_GEMINI_API_KEY' || rawKey.length < 10) {
    throw Object.assign(
      new Error('AI Doubt Solver API key is not configured. Please check GEMINI_API_KEY in Settings > Secrets.'),
      { status: 503 }
    );
  }
  if (!cachedClient || cachedKey !== rawKey) {
    cachedClient = new GoogleGenAI({
      apiKey: rawKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedKey = rawKey;
  }
  return cachedClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        Object.assign(
          new Error('The AI request took too long to respond. Please try again.'),
          { status: 504 }
        )
      );
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function extractReadableError(err: any): { status: number; message: string; isTransient: boolean } {
  const rawMessage = String(err?.message || 'Unable to reach AI Doubt Solver right now.');
  let parsedMessage = rawMessage;
  let parsedCode: number | undefined = typeof err?.status === 'number' ? err.status : err?.statusCode;

  // Unwrap nested JSON error payloads returned by SDK
  try {
    const jsonStart = rawMessage.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(rawMessage.slice(jsonStart));
      if (parsed?.error?.message) parsedMessage = String(parsed.error.message);
      if (typeof parsed?.error?.code === 'number') parsedCode = parsed.error.code;
    }
  } catch {
    // Keep raw message if not JSON
  }

  const lower = parsedMessage.toLowerCase();
  if (
    parsedCode === 401 ||
    parsedCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied')
  ) {
    return {
      status: 503,
      message: 'AI Doubt Solver authentication failed. Please verify the Gemini API key in Settings > Secrets.',
      isTransient: false,
    };
  }

  if (parsedCode === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'AI Doubt Solver has reached its temporary request limit. Please wait a few seconds and try again.',
      isTransient: true,
    };
  }

  if (
    parsedCode === 503 ||
    parsedCode === 500 ||
    parsedCode === 502 ||
    parsedCode === 504 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return {
      status: 503,
      message: 'Gemini AI is experiencing high demand right now. Please try again in a few seconds.',
      isTransient: true,
    };
  }

  if (parsedCode === 404 || lower.includes('not_found')) {
    return {
      status: 502,
      message: 'The configured AI model is currently unavailable. Please retry in a moment.',
      isTransient: true,
    };
  }

  return {
    status: typeof parsedCode === 'number' && parsedCode >= 400 && parsedCode < 600 ? parsedCode : 500,
    message: parsedMessage,
    isTransient: false,
  };
}

function buildSystemInstruction(input: AiDoubtRequest): string {
  const detailMap: Record<AiDetailLevel, string> = {
    concise:
      'Keep the explanation crisp, direct, and easy to scan (short summary + key steps or formula + 1 brief example).',
    balanced:
      'Give a clear, intuitive explanation with step-by-step reasoning, worked examples or code when relevant, and a short Key Takeaways list.',
    detailed:
      'Give a thorough, in-depth academic explanation with intuition, complete step-by-step derivation or code walkthrough, real-world analogies, edge cases/common mistakes, and a mini practice check.',
  };

  const languageMap: Record<AiLanguageMode, string> = {
    auto:
      'Match the student’s language naturally. If the student writes in Hinglish (Hindi in Roman script mixed with English, e.g., "recursion kya hota hai"), reply in clear, friendly Hinglish while keeping technical terms, formulas, and code accurate. Otherwise reply in clear, simple English.',
    english: 'Respond in clear, simple, student-friendly English.',
    hinglish:
      'Respond in natural, easy-to-understand Hinglish (conversational Hindi written in Roman English mixed with accurate English technical terms, formulas, and code).',
  };

  const detailRule = detailMap[input.detailLevel || 'balanced'];
  const languageRule = languageMap[input.language || 'auto'];

  const contextLines: string[] = [];
  if (input.subjectName) contextLines.push(`Subject: ${input.subjectName}`);
  if (input.chapterTitle) contextLines.push(`Chapter: ${input.chapterTitle}`);
  if (input.topicTitle) contextLines.push(`Topic: ${input.topicTitle}`);

  return [
    'You are VisuaLearn AI Doubt Solver, an expert, patient academic tutor helping students across all subjects — including Mathematics, Physics, Chemistry, Biology, Programming (Python, C++, Java, JavaScript, SQL, DSA), Cybersecurity, Computer Networking, Cloud Computing, and General Studies.',
    languageRule,
    detailRule,
    'Formatting rules:',
    '- Use clean Markdown: short headings (###), numbered steps for derivations/problem solving, and bullet lists for takeaways.',
    '- For ANY programming or command-line question (Python, Java, C++, JS, SQL, Linux, AWS CLI, etc.), ALWAYS wrap code in fenced code blocks with the language tag (e.g. ```python ... ```) followed by a clear explanation.',
    '- For Mathematics, Physics, and Chemistry problems, show EVERY calculation step clearly, format key equations on their own lines using $$...$$ (or clear Unicode symbols like ×, ÷, ², √, →), and highlight the final answer clearly.',
    '- For Cybersecurity, Networking (OSI, TCP/IP, subnetting, firewalls), and Cloud Computing (IAM, VPC, serverless, containers), include practical architecture/flow explanations and real-world scenarios.',
    '- Always stay context-aware of previous messages in the conversation so follow-up requests ("make it shorter", "explain step 2", "give Python code", "solve another example") build directly on the prior discussion.',
    contextLines.length > 0 ? `Student Course Context:\n${contextLines.join('\n')}` : '',
    `At the very end of your response, add a line containing exactly ${FOLLOWUP_DELIMITER} followed by 3 short, helpful follow-up questions the student could ask next (one per line, plain text, no bullets or numbers).`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseModelOutput(rawText: string): { content: string; followUpQuestions: string[] } {
  const trimmed = rawText.trim();
  const idx = trimmed.lastIndexOf(FOLLOWUP_DELIMITER);
  if (idx === -1) {
    return {
      content: trimmed,
      followUpQuestions: [],
    };
  }

  const content = trimmed.slice(0, idx).trim();
  const tail = trimmed.slice(idx + FOLLOWUP_DELIMITER.length).trim();
  const followUpQuestions = tail
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length >= 4 && line.length <= 140)
    .slice(0, 3);

  return { content: content || trimmed, followUpQuestions };
}

async function callGeminiModel(
  ai: GoogleGenAI,
  model: string,
  systemInstruction: string,
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> {
  const config: Record<string, any> = {
    systemInstruction,
  };

  if (model === PRIMARY_MODEL) {
    // Low thinking level minimizes latency while preserving strong STEM/coding accuracy
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }

  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config,
    }),
    45000
  );

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('The AI tutor returned an empty response. Please try asking again.');
  }
  return text;
}

const PRIMARY_COOLDOWN_MS = 60_000;
let primaryModelCooldownUntil = 0;

export async function solveAcademicDoubt(input: AiDoubtRequest): Promise<AiDoubtAnswer> {
  const ai = getGeminiClient();
  const systemInstruction = buildSystemInstruction(input);

  // Build proper multi-turn contents array so Gemini remembers exact conversation context
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  const recentHistory = (input.history || []).slice(-12);

  for (const item of recentHistory) {
    const cleanText = String(item.text || '').trim();
    if (!cleanText) continue;
    const role: 'user' | 'model' = item.role === 'assistant' ? 'model' : 'user';
    // Merge consecutive same-role turns if any exist
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n\n${cleanText.slice(0, 3000)}`;
    } else {
      contents.push({ role, parts: [{ text: cleanText.slice(0, 3000) }] });
    }
  }

  // Ensure the conversation starts with a user turn (Gemini API requirement)
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  const currentQuestion = input.question.trim();
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${currentQuestion}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: currentQuestion }] });
  }

  // Smart routing with temporary cooldown when primary model is under high demand (503/429)
  const inPrimaryCooldown = Date.now() < primaryModelCooldownUntil;
  const attempts: { model: string; delayBeforeMs: number }[] = inPrimaryCooldown
    ? [
        { model: FALLBACK_MODEL, delayBeforeMs: 0 },
        { model: FALLBACK_MODEL, delayBeforeMs: 700 },
        { model: PRIMARY_MODEL, delayBeforeMs: 1400 },
      ]
    : [
        { model: PRIMARY_MODEL, delayBeforeMs: 0 },
        { model: FALLBACK_MODEL, delayBeforeMs: 300 },
        { model: FALLBACK_MODEL, delayBeforeMs: 1100 },
        { model: PRIMARY_MODEL, delayBeforeMs: 2000 },
      ];

  let lastParsedError: { status: number; message: string; isTransient: boolean } | null = null;

  for (const attempt of attempts) {
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }
    try {
      const rawText = await callGeminiModel(ai, attempt.model, systemInstruction, contents);
      const { content, followUpQuestions } = parseModelOutput(rawText);
      if (attempt.model === PRIMARY_MODEL) {
        primaryModelCooldownUntil = 0;
      }
      return {
        content,
        followUpQuestions,
        modelUsed: attempt.model,
      };
    } catch (err: any) {
      const parsed = extractReadableError(err);
      lastParsedError = parsed;

      // Put primary model on short cooldown when it hits transient 503/429 high demand
      if (
        attempt.model === PRIMARY_MODEL &&
        parsed.isTransient &&
        (parsed.status === 503 || parsed.status === 429)
      ) {
        primaryModelCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      }

      if (!parsed.isTransient) {
        break;
      }
    }
  }

  throw Object.assign(
    new Error(lastParsedError?.message || 'Unable to generate an answer right now. Please try again.'),
    { status: lastParsedError?.status || 503 }
  );
}
