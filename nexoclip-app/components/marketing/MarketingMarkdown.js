'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * Renders inline Markdown tokens: **bold**, *italic*, `code`, [label](url),
 * bare https:// URLs, and @mention pills.
 */
function renderInline(text, keyPrefix = 'in') {
  const raw = String(text || '');
  if (!raw) return null;

  const pattern =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*|(https?:\/\/[^\s<>()]+))/g;

  const nodes = [];
  let last = 0;
  let m;
  let idx = 0;

  while ((m = pattern.exec(raw)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`${keyPrefix}-t-${idx++}`}>{raw.slice(last, m.index)}</span>);
    }
    if (m[2] && m[3]) {
      // [label](url)
      nodes.push(
        <a
          key={`${keyPrefix}-a-${idx++}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#4F46E5] underline decoration-[#4F46E5]/35 underline-offset-2 transition hover:text-[#3730A3] hover:decoration-[#4F46E5]"
        >
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      // `code`
      nodes.push(
        <code
          key={`${keyPrefix}-c-${idx++}`}
          className="rounded-md bg-[#F2F2F6] px-1.5 py-0.5 font-mono text-[12px] text-[#282A35]"
        >
          {m[4]}
        </code>,
      );
    } else if (m[5]) {
      // **bold**
      nodes.push(
        <strong key={`${keyPrefix}-b-${idx++}`} className="font-semibold text-[#14151F]">
          {renderInline(m[5], `${keyPrefix}-bi-${idx}`)}
        </strong>,
      );
    } else if (m[6]) {
      // *italic*
      nodes.push(
        <em key={`${keyPrefix}-i-${idx++}`} className="italic text-[#363847]">
          {renderInline(m[6], `${keyPrefix}-ii-${idx}`)}
        </em>,
      );
    } else if (m[7]) {
      // bare URL
      const url = m[7].replace(/[.,;:!?)]+$/, '');
      const trailing = m[7].slice(url.length);
      const display = url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 44);
      nodes.push(
        <a
          key={`${keyPrefix}-u-${idx++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-[#4F46E5] underline decoration-[#4F46E5]/30 underline-offset-2 transition hover:text-[#3730A3]"
        >
          <span>{display}</span>
          <ExternalLink className="inline h-2.5 w-2.5 opacity-70" />
        </a>,
      );
      if (trailing) nodes.push(<span key={`${keyPrefix}-tr-${idx++}`}>{trailing}</span>);
    }
    last = m.index + m[0].length;
  }

  if (last < raw.length) {
    nodes.push(<span key={`${keyPrefix}-e-${idx++}`}>{raw.slice(last)}</span>);
  }
  return nodes;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line || '');
}

function splitTableRow(line) {
  let clean = String(line || '').trim();
  if (clean.startsWith('|')) clean = clean.slice(1);
  if (clean.endsWith('|')) clean = clean.slice(0, -1);
  return clean.split('|').map((cell) => cell.trim());
}

function parseBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule ---
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Heading #..####
    const hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() });
      i += 1;
      continue;
    }

    // GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Blockquote / Callout Bubble (> ...)
    if (trimmed.startsWith('>')) {
      const qLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        qLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'callout', content: qLines.join('\n') });
      continue;
    }

    // Unordered list (- / * / •)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (1. / 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      pLines.push(lines[i].trim());
      i += 1;
    }
    if (pLines.length) {
      blocks.push({ type: 'p', text: pLines.join('\n') });
    }
  }

  return blocks;
}

function CodeBlock({ content, lang }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#E7E7EF] bg-[#F7F7FA]">
      <div className="flex items-center justify-between border-b border-[#ECECF2] px-3 py-1.5 text-[11px] text-[#7A7D8F]">
        <span className="font-mono uppercase">{lang || 'prompt'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[#525568] transition hover:bg-white hover:text-[#171821]"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-[#242632] whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
}

/**
 * Clean editorial Markdown renderer tailored for AI Creative Marketing:
 * supports GFM tables, rounded gray insight callout bubbles (`> ...`),
 * headings, lists, links, inline code, and copyable prompt code blocks.
 */
export default function MarketingMarkdown({ content = '', nested = false }) {
  const blocks = parseBlocks(content);
  if (!blocks.length) return null;

  return (
    <div className={nested ? 'space-y-2 text-[13.5px] leading-[1.6] text-[#282A35]' : 'space-y-3.5 text-[14px] leading-[1.68] text-[#242632]'}>
      {blocks.map((blk, idx) => {
        if (blk.type === 'hr') {
          return <hr key={idx} className="my-4 border-t border-[#EFEFF5]" />;
        }

        if (blk.type === 'heading') {
          const cls =
            blk.level === 1
              ? 'mt-4 text-[18px] font-semibold tracking-[-0.02em] text-[#14151F]'
              : blk.level === 2
                ? 'mt-4 text-[15.5px] font-semibold tracking-[-0.015em] text-[#14151F]'
                : 'mt-3 text-[14px] font-semibold text-[#171821]';
          return (
            <div key={idx} className={cls}>
              {renderInline(blk.text, `h-${idx}`)}
            </div>
          );
        }

        if (blk.type === 'p') {
          const pLines = blk.text.split('\n');
          return (
            <p key={idx} className="break-words">
              {pLines.map((ln, li) => (
                <span key={li}>
                  {li > 0 && <br />}
                  {renderInline(ln, `p-${idx}-${li}`)}
                </span>
              ))}
            </p>
          );
        }

        if (blk.type === 'callout') {
          return (
            <div
              key={idx}
              className="rounded-2xl bg-[#F2F2F5] px-4 py-3.5 text-[13.5px] leading-[1.62] text-[#282A35]"
            >
              <MarketingMarkdown content={blk.content} nested />
            </div>
          );
        }

        if (blk.type === 'table') {
          return (
            <div key={idx} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E6E6EE] text-[11.5px] font-medium text-[#7A7D8F]">
                    {blk.headers.map((h, hi) => (
                      <th key={hi} className="px-3 py-2.5 font-medium first:pl-1 last:pr-1">
                        {renderInline(h, `th-${idx}-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F5]">
                  {blk.rows.map((row, ri) => (
                    <tr key={ri} className="align-top transition-colors hover:bg-[#FAFAFC]">
                      {blk.headers.map((_, ci) => (
                        <td
                          key={ci}
                          className={`px-3 py-3 leading-[1.55] first:pl-1 last:pr-1 ${
                            ci === 0 ? 'font-medium text-[#171821]' : 'text-[#3A3D4D]'
                          }`}
                        >
                          {renderInline(row[ci] || '', `td-${idx}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (blk.type === 'ul') {
          return (
            <ul key={idx} className="space-y-1.5 pl-4">
              {blk.items.map((item, li) => (
                <li key={li} className="relative pl-1.5 before:absolute before:-left-3 before:top-[0.62em] before:h-1 before:w-1 before:rounded-full before:bg-[#8C8FA1]">
                  {renderInline(item, `ul-${idx}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (blk.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-[#6B6E80]">
              {blk.items.map((item, li) => (
                <li key={li} className="pl-0.5">
                  {renderInline(item, `ol-${idx}-${li}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (blk.type === 'code') {
          return <CodeBlock key={idx} content={blk.content} lang={blk.lang} />;
        }

        return null;
      })}
    </div>
  );
}
