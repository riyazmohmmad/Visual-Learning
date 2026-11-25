import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

interface Props {
  content: string;
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
};

function toSuper(str: string): string {
  return str
    .split('')
    .map((ch) => SUPERSCRIPTS[ch] || ch)
    .join('');
}

function toSub(str: string): string {
  return str
    .split('')
    .map((ch) => SUBSCRIPTS[ch] || ch)
    .join('');
}

/**
 * Cleanly converts common LaTeX math notation into crisp Unicode mathematical text
 * so equations render accurately without broken raw backslash syntax.
 */
function formatMathExpression(raw: string): string {
  let s = raw.trim();

  // Handle nested \frac{a}{b} iteratively (up to 3 levels)
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)');
  }

  // Handle \sqrt{x} and \sqrt[n]{x}
  s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$1√($2)');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');

  // Text / formatting wrappers
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]+)\}/g, '$1');
  s = s.replace(/\\left|\\right/g, '');

  // Common LaTeX symbols
  const replacements: [RegExp, string][] = [
    [/\\times/g, '×'],
    [/\\cdot/g, '·'],
    [/\\div/g, '÷'],
    [/\\pm/g, '±'],
    [/\\mp/g, '∓'],
    [/\\leq|\\le\b/g, '≤'],
    [/\\geq|\\ge\b/g, '≥'],
    [/\\neq|\\ne\b/g, '≠'],
    [/\\approx/g, '≈'],
    [/\\equiv/g, '≡'],
    [/\\propto/g, '∝'],
    [/\\infty/g, '∞'],
    [/\\rightarrow|\\to\b/g, '→'],
    [/\\leftarrow/g, '←'],
    [/\\Rightarrow|\\implies/g, '⇒'],
    [/\\Leftrightarrow|\\iff/g, '⇔'],
    [/\\in\b/g, '∈'],
    [/\\notin\b/g, '∉'],
    [/\\subset/g, '⊂'],
    [/\\subseteq/g, '⊆'],
    [/\\cup/g, '∪'],
    [/\\cap/g, '∩'],
    [/\\forall/g, '∀'],
    [/\\exists/g, '∃'],
    [/\\partial/g, '∂'],
    [/\\nabla/g, '∇'],
    [/\\sum/g, '∑'],
    [/\\prod/g, '∏'],
    [/\\int/g, '∫'],
    [/\\degree|\^\{\\circ\}|\^\\circ/g, '°'],
    [/\\alpha/g, 'α'],
    [/\\beta/g, 'β'],
    [/\\gamma/g, 'γ'],
    [/\\delta/g, 'δ'],
    [/\\Delta/g, 'Δ'],
    [/\\epsilon|\\varepsilon/g, 'ε'],
    [/\\theta/g, 'θ'],
    [/\\Theta/g, 'Θ'],
    [/\\lambda/g, 'λ'],
    [/\\mu/g, 'μ'],
    [/\\pi/g, 'π'],
    [/\\Pi/g, 'Π'],
    [/\\rho/g, 'ρ'],
    [/\\sigma/g, 'σ'],
    [/\\Sigma/g, 'Σ'],
    [/\\tau/g, 'τ'],
    [/\\phi|\\varphi/g, 'φ'],
    [/\\omega/g, 'ω'],
    [/\\Omega/g, 'Ω'],
    [/\\quad|\\qquad/g, '  '],
    [/\\[,;:!]/g, ' '],
    [/\\\\/g, '\n'],
  ];

  for (const [pattern, symbol] of replacements) {
    s = s.replace(pattern, symbol);
  }

  // Simple superscripts and subscripts
  s = s.replace(/\^\{([0-9+\-ni]+)\}/g, (_, g) => toSuper(g));
  s = s.replace(/\^([0-9n])/g, (_, g) => toSuper(g));
  s = s.replace(/_\{([0-9+\-]+)\}/g, (_, g) => toSub(g));
  s = s.replace(/_([0-9])/g, (_, g) => toSub(g));

  // Clean leftover braces around single tokens
  s = s.replace(/\{([^{}]+)\}/g, '$1');

  return s.trim();
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-800/90 bg-slate-950 shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5 font-mono font-semibold uppercase tracking-wider text-slate-300">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer font-medium"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 sm:p-4 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Renders inline Markdown tokens: inline code, inline math ($...$ or \(...\)), bold, italic.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(`[^`\n]+`|\$\$[^$]+\$\$|\$[^$\n]+\$|\\\([^)]+\\\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-200/75 text-slate-900 font-mono text-[0.88em] break-words"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('$$') && token.endsWith('$$')) {
      nodes.push(
        <span
          key={key}
          className="inline-block px-2 py-0.5 mx-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-blue-950 font-mono text-[0.92em]"
        >
          {formatMathExpression(token.slice(2, -2))}
        </span>
      );
    } else if (
      (token.startsWith('$') && token.endsWith('$')) ||
      (token.startsWith('\\(') && token.endsWith('\\)'))
    ) {
      const inner = token.startsWith('$') ? token.slice(1, -1) : token.slice(2, -2);
      nodes.push(
        <span
          key={key}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-50/80 text-blue-950 font-mono text-[0.92em]"
        >
          {formatMathExpression(inner)}
        </span>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-950">
          {renderInline(token.slice(2, -2), `${key}-b`)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type Segment =
  | { type: 'code'; language: string; content: string }
  | { type: 'text'; content: string };

function splitCodeFences(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const fenceRegex = /```([a-zA-Z0-9_+#.-]*)\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: markdown.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'code',
      language: (match[1] || '').trim(),
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: 'text', content: markdown.slice(lastIndex) });
  }

  return segments;
}

function renderTextBlocks(blockText: string, segIdx: number): React.ReactNode[] {
  const lines = blockText.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip blank lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Multi-line or single-line display equation $$...$$ or \[...\]
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const isBracket = trimmed.startsWith('\\[');
      const endDelimiter = isBracket ? '\\]' : '$$';
      let expr = trimmed.slice(2);

      if (expr.endsWith(endDelimiter) && expr.length >= 2) {
        expr = expr.slice(0, -2);
        i++;
      } else {
        const mathLines = [expr];
        i++;
        while (i < lines.length) {
          const cur = lines[i].trim();
          if (cur.endsWith(endDelimiter)) {
            mathLines.push(cur.slice(0, -endDelimiter.length));
            i++;
            break;
          }
          mathLines.push(cur);
          i++;
        }
        expr = mathLines.join('\n');
      }

      elements.push(
        <div
          key={`math-${segIdx}-${i}`}
          className="my-3 px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-200/80 overflow-x-auto text-center"
        >
          <div className="font-mono text-xs sm:text-sm font-semibold text-blue-950 whitespace-pre-wrap leading-relaxed">
            {formatMathExpression(expr)}
          </div>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr-${segIdx}-${i}`} className="my-3 border-slate-200" />);
      i++;
      continue;
    }

    // Headings (# to ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const headingClasses =
        level === 1
          ? 'text-[15px] sm:text-base font-semibold text-slate-950 mt-3.5 mb-1.5 tracking-tight'
          : level === 2
          ? 'text-sm sm:text-[15px] font-semibold text-slate-900 mt-3 mb-1 tracking-tight'
          : 'text-[13px] sm:text-sm font-semibold text-slate-900 mt-2.5 mb-1';
      elements.push(
        <h4 key={`h-${segIdx}-${i}`} className={headingClasses}>
          {renderInline(text, `h-${segIdx}-${i}`)}
        </h4>
      );
      i++;
      continue;
    }

    // Markdown Table (| col1 | col2 | followed by | --- | --- |)
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      /^\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1].trim())
    ) {
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      elements.push(
        <div
          key={`tbl-${segIdx}-${i}`}
          className="my-3 overflow-x-auto rounded-xl border border-slate-200 bg-white"
        >
          <table className="min-w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">
                    {renderInline(h, `th-${segIdx}-${i}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 align-top">
                      {renderInline(row[cIdx] || '', `td-${segIdx}-${i}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${segIdx}-${i}`}
          className="my-2.5 pl-3.5 pr-3 py-2.5 border-l-3 border-blue-500 bg-blue-50/50 rounded-r-xl text-xs sm:text-sm text-slate-700 leading-relaxed space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInline(ql, `bq-${segIdx}-${i}-${qIdx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Ordered list (1. ..., 2. ...)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)[.)]\s+(.*)$/);
        if (m) {
          items.push({ num: m[1], text: m[2] });
        }
        i++;
      }
      elements.push(
        <ol key={`ol-${segIdx}-${i}`} className="my-2.5 space-y-2">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 bg-white border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-800 leading-relaxed"
            >
              <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/70 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                {item.num}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {renderInline(item.text, `ol-${segIdx}-${i}-${idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Unordered list (- ..., * ..., • ...)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${segIdx}-${i}`} className="my-2 space-y-1.5 pl-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs sm:text-sm text-slate-800 leading-relaxed"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-2" />
              <span className="min-w-0 flex-1 break-words">
                {renderInline(item, `ul-${segIdx}-${i}-${idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph (group consecutive plain lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith('#') ||
        cur.startsWith('>') ||
        cur.startsWith('$$') ||
        cur.startsWith('\\[') ||
        cur.startsWith('|') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(cur) ||
        /^\d+[.)]\s+/.test(cur) ||
        /^[-*•]\s+/.test(cur)
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }

    elements.push(
      <p
        key={`p-${segIdx}-${i}`}
        className="text-xs sm:text-sm text-slate-800 leading-relaxed my-2 break-words"
      >
        {renderInline(paraLines.join(' '), `p-${segIdx}-${i}`)}
      </p>
    );
  }

  return elements;
}

export const AiMarkdownRenderer: React.FC<Props> = ({ content }) => {
  const segments = splitCodeFences(content || '');

  return (
    <div className="ai-markdown-body space-y-1 min-w-0">
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <CodeBlock key={`code-${idx}`} language={seg.language} code={seg.content} />
        ) : (
          <React.Fragment key={`txt-${idx}`}>{renderTextBlocks(seg.content, idx)}</React.Fragment>
        )
      )}
    </div>
  );
};
