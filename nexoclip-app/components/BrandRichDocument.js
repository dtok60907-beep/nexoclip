'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Heading2,
  Image as ImageIcon,
  Link2,
  List,
  ListOrdered,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Volume2,
  X,
} from 'lucide-react';

const SECTION_TARGETS = new Map([
  ['overview', 'overview'],
  ['brand kit', 'brand-kit'],
  ['audience', 'audience'],
  ['messaging', 'messaging'],
  ['competitors', 'competitors'],
  ['products', 'products'],
  ['avatars', 'avatars'],
  ['voices', 'voices'],
]);

/**
 * Renders plain text with clickable inline subpage link pills (`[[New Evowhey]]`
 * or automatic matching of existing subpage titles) matching Notion/Ad-Agent pill style.
 */
export function RichInlineText({ text = '', subpages = [], onOpenSubpage, onJumpSection }) {
  const tokens = useMemo(() => {
    const raw = String(text || '');
    if (!raw) return [];

    // 1. First split explicit [[...]] tokens
    const explicitParts = raw.split(/(\[\[[^\]]+\]\])/g);
    const titleLookup = new Map();
    for (const sp of subpages || []) {
      if (sp?.title) titleLookup.set(sp.title.toLowerCase(), sp);
    }

    // Build regex for auto-detecting subpage titles in plain segments (longest first)
    const sortedTitles = (subpages || [])
      .map((sp) => String(sp?.title || '').trim())
      .filter((t) => t.length >= 3)
      .sort((a, b) => b.length - a.length);
    const autoRe = sortedTitles.length
      ? new RegExp(`\\b(${sortedTitles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
      : null;

    const pushPlainWithUrls = (str) => {
      if (!str) return;
      const urlRe = /(https?:\/\/[^\s<>"')]+)/gi;
      let last = 0;
      let um;
      while ((um = urlRe.exec(str)) !== null) {
        if (um.index > last) result.push({ kind: 'text', value: str.slice(last, um.index) });
        const rawUrl = um[0].replace(/[.,;:!?]+$/, '');
        const trailing = um[0].slice(rawUrl.length);
        result.push({ kind: 'url', href: rawUrl, label: rawUrl });
        if (trailing) result.push({ kind: 'text', value: trailing });
        last = um.index + um[0].length;
      }
      if (last < str.length) result.push({ kind: 'text', value: str.slice(last) });
    };

    const result = [];
    for (const part of explicitParts) {
      if (!part) continue;
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const label = part.slice(2, -2).trim();
        const sp = titleLookup.get(label.toLowerCase()) || null;
        const sec = SECTION_TARGETS.get(label.toLowerCase()) || null;
        result.push({ kind: 'pill', label, subpage: sp, section: sec });
      } else if (autoRe) {
        let lastIdx = 0;
        let m;
        autoRe.lastIndex = 0;
        while ((m = autoRe.exec(part)) !== null) {
          if (m.index > lastIdx) pushPlainWithUrls(part.slice(lastIdx, m.index));
          const matched = m[0];
          result.push({
            kind: 'pill',
            label: matched,
            subpage: titleLookup.get(matched.toLowerCase()) || null,
            section: null,
          });
          lastIdx = m.index + matched.length;
        }
        if (lastIdx < part.length) pushPlainWithUrls(part.slice(lastIdx));
      } else {
        pushPlainWithUrls(part);
      }
    }
    return result;
  }, [text, subpages]);

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.kind === 'text') return <span key={i}>{tok.value}</span>;
        if (tok.kind === 'url') {
          return (
            <a
              key={i}
              href={tok.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 break-all font-medium text-[#5B45F2] underline decoration-[#5B45F2]/30 underline-offset-2 transition hover:text-[#432FE0] hover:decoration-[#432FE0]"
              title={`Buka ${tok.href} di tab baru`}
            >
              <span>{tok.label}</span>
              <ExternalLink size={11} className="inline shrink-0 opacity-75" />
            </a>
          );
        }
        const clickable = Boolean(tok.subpage || tok.section);
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (tok.subpage) onOpenSubpage?.(tok.subpage.id);
              else if (tok.section) onJumpSection?.(tok.section);
            }}
            className={`mx-0.5 inline-flex items-center gap-1 rounded-[6px] bg-[#EFEFF4] px-1.5 py-[1px] align-baseline text-[12.5px] font-medium text-[#1E1F28] transition ${
              clickable ? 'cursor-pointer hover:bg-violet-100 hover:text-[#5B45F2]' : 'cursor-default opacity-80'
            }`}
            title={tok.subpage ? `Buka subpage ${tok.subpage.title}` : tok.section ? `Lihat ${tok.label}` : tok.label}
          >
            <Link2 size={11} className="shrink-0 opacity-65" />
            <span>{tok.label}</span>
          </button>
        );
      })}
    </>
  );
}

/**
 * "+ Add" block picker menu supporting Heading, Bullet list, Numbered list, Paragraph, Image, and Subpage.
 */
export function AddBlockMenu({ onAddBlock, onCreateSubpage, label = 'Add' }) {
  const [open, setOpen] = useState(false);

  const pick = (type) => {
    setOpen(false);
    if (type === 'subpage') {
      onCreateSubpage?.();
      return;
    }
    const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (type === 'heading') onAddBlock?.({ id, type: 'heading', text: 'New section' });
    else if (type === 'paragraph') onAddBlock?.({ id, type: 'paragraph', text: '' });
    else if (type === 'bullets') onAddBlock?.({ id, type: 'bullets', items: [''] });
    else if (type === 'numbers') onAddBlock?.({ id, type: 'numbers', items: [''] });
    else if (type === 'image') onAddBlock?.({ id, type: 'image', url: '', caption: '' });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5EE] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#2E303C] transition hover:border-violet-300 hover:text-[#5B45F2]"
      >
        <Plus size={13} strokeWidth={2.2} />
        <span>{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border border-[#E6E6EF] bg-white p-1.5 shadow-lg shadow-zinc-900/10">
            {[
              { id: 'heading', label: 'Heading', icon: Heading2 },
              { id: 'paragraph', label: 'Text', icon: Type },
              { id: 'bullets', label: 'Bullet list', icon: List },
              { id: 'numbers', label: 'Numbered list', icon: ListOrdered },
              { id: 'image', label: 'Image', icon: ImageIcon },
              ...(onCreateSubpage ? [{ id: 'subpage', label: 'New subpage', icon: FileText }] : []),
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[#282A35] transition hover:bg-violet-50 hover:text-[#5B45F2]"
                >
                  <Icon size={14} className="text-zinc-400" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Editable Notion-style document blocks (Heading, Paragraph, Bullet list, Numbered list, Image).
 */
export function BrandDocumentBlocks({
  blocks = [],
  subpages = [],
  onChangeBlocks,
  onOpenSubpage,
  onJumpSection,
}) {
  const [editingId, setEditingId] = useState(null);

  const updateBlock = (idx, patch) => {
    const next = blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChangeBlocks?.(next);
  };

  const removeBlock = (idx) => {
    onChangeBlocks?.(blocks.filter((_, i) => i !== idx));
  };

  if (!blocks.length) return null;

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        const isEditing = editingId === block.id;

        if (block.type === 'heading') {
          return (
            <div key={block.id || idx} className="group flex items-center gap-2 pt-2">
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={block.text || ''}
                  onChange={(e) => updateBlock(idx, { text: e.target.value })}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                  className="w-full border-b border-dashed border-[#5B45F2] bg-transparent text-[15px] font-semibold text-[#171821] outline-none"
                />
              ) : (
                <h4
                  onClick={() => setEditingId(block.id)}
                  className="cursor-text border-b border-transparent text-[15px] font-semibold text-[#171821] hover:border-dashed hover:border-[#5B45F2]/50"
                >
                  {block.text || 'Untitled heading'}
                </h4>
              )}
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                className="rounded p-1 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                title="Hapus blok"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        }

        if (block.type === 'bullets' || block.type === 'numbers') {
          const items = Array.isArray(block.items) ? block.items : [];
          return (
            <div key={block.id || idx} className="group relative">
              {isEditing ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Satu baris = satu item (gunakan [[Nama Subpage]] untuk link pill)</span>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="font-semibold text-[#5B45F2] hover:underline"
                    >
                      Selesai
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    rows={Math.max(3, items.length + 1)}
                    value={items.join('\n')}
                    onChange={(e) => updateBlock(idx, { items: e.target.value.split('\n') })}
                    className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 text-[13px] leading-relaxed text-[#1E1F28] outline-none focus:border-[#5B45F2]"
                  />
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  {block.type === 'numbers' ? (
                    <ol
                      onClick={() => setEditingId(block.id)}
                      className="flex-1 cursor-text list-decimal space-y-1.5 pl-5 text-[13.5px] leading-[1.65] text-[#282A35]"
                    >
                      {items.filter(Boolean).map((item, j) => (
                        <li key={j}>
                          <RichInlineText
                            text={item}
                            subpages={subpages}
                            onOpenSubpage={onOpenSubpage}
                            onJumpSection={onJumpSection}
                          />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <ul
                      onClick={() => setEditingId(block.id)}
                      className="flex-1 cursor-text list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.65] text-[#282A35]"
                    >
                      {items.filter(Boolean).map((item, j) => (
                        <li key={j}>
                          <RichInlineText
                            text={item}
                            subpages={subpages}
                            onOpenSubpage={onOpenSubpage}
                            onJumpSection={onJumpSection}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="rounded p-1 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Hapus list"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        }

        if (block.type === 'image') {
          return (
            <div key={block.id || idx} className="group relative">
              {!block.url || isEditing ? (
                <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/30 p-3">
                  <input
                    autoFocus
                    type="url"
                    value={block.url || ''}
                    placeholder="https://... (URL gambar produk / visual)"
                    onChange={(e) => updateBlock(idx, { url: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#5B45F2]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={block.caption || ''}
                      placeholder="Caption (opsional)"
                      onChange={(e) => updateBlock(idx, { caption: e.target.value })}
                      className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#5B45F2]"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg bg-[#5B45F2] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="inline-block max-w-xs overflow-hidden rounded-xl border border-[#EAEAEF] bg-[#FAFAFC]">
                  <img
                    src={block.url}
                    alt={block.caption || 'Brand media'}
                    onClick={() => setEditingId(block.id)}
                    className="max-h-56 w-auto cursor-pointer object-contain"
                  />
                  {block.caption && (
                    <div className="border-t border-[#EFEFF4] px-2.5 py-1.5 text-[11px] text-zinc-500">
                      {block.caption}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="absolute right-2 top-2 rounded-lg bg-white/90 p-1 text-zinc-500 opacity-0 shadow-sm transition hover:text-red-500 group-hover:opacity-100"
                    title="Hapus gambar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        }

        // Paragraph block
        return (
          <div key={block.id || idx} className="group flex items-start justify-between gap-2">
            {isEditing ? (
              <textarea
                autoFocus
                rows={3}
                value={block.text || ''}
                placeholder="Tulis paragraf... gunakan [[Nama Subpage]] untuk link."
                onChange={(e) => updateBlock(idx, { text: e.target.value })}
                onBlur={() => setEditingId(null)}
                className="w-full resize-y rounded-lg border border-[#5B45F2] bg-white p-2 text-[13.5px] leading-[1.65] text-[#282A35] outline-none"
              />
            ) : (
              <p
                onClick={() => setEditingId(block.id)}
                className="flex-1 cursor-text whitespace-pre-wrap text-[13.5px] leading-[1.65] text-[#282A35]"
              >
                {block.text ? (
                  <RichInlineText
                    text={block.text}
                    subpages={subpages}
                    onOpenSubpage={onOpenSubpage}
                    onJumpSection={onJumpSection}
                  />
                ) : (
                  <span className="text-zinc-400">Klik untuk menulis teks…</span>
                )}
              </p>
            )}
            <button
              type="button"
              onClick={() => removeBlock(idx)}
              className="rounded p-1 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              title="Hapus paragraf"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function computeBacklinks(subpage, allSubpages = [], kit = null) {
  if (!subpage?.title) return [];
  const needle = String(subpage.title).trim();
  if (needle.length < 2) return [];
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(\\[\\[${esc}\\]\\]|\\b${esc}\\b)`, 'i');
  const links = [];
  const seen = new Set();
  const push = (entry) => {
    const key = `${entry.targetType}:${entry.targetId}:${entry.context}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(entry);
  };

  // 1. Other subpages that mention or [[link]] this subpage
  for (const other of allSubpages || []) {
    if (!other || other.id === subpage.id) continue;
    let currentHeading = '';
    for (const blk of other.blocks || []) {
      if (blk.type === 'heading') {
        currentHeading = blk.text || '';
        continue;
      }
      const txt = blk.type === 'bullets' || blk.type === 'numbers' ? (blk.items || []).join(' ') : blk.text || '';
      if (re.test(txt)) {
        push({
          targetType: 'subpage',
          targetId: other.id,
          sourceTitle: other.title,
          context: currentHeading || (other.parent === 'competitors' ? 'Ad angles' : 'Overview'),
        });
        break;
      }
    }
  }

  // 2. Main Brand Kit sections
  if (kit) {
    if ((kit.audience || []).some((line) => re.test(line))) {
      push({ targetType: 'section', targetId: 'audience', sourceTitle: 'Audience', context: 'Target segments' });
    }
    if (re.test(kit.leadWith || '')) {
      push({ targetType: 'section', targetId: 'products', sourceTitle: 'Products', context: 'Lead with' });
    }
    if ((kit.products || []).some((line) => re.test(line)) || subpage.parent === 'products') {
      push({ targetType: 'section', targetId: 'products', sourceTitle: 'Products', context: 'Lineup' });
    }
    if ((kit.competitors || []).some((line) => re.test(line)) || subpage.parent === 'competitors') {
      push({ targetType: 'section', targetId: 'competitors', sourceTitle: 'Competitors', context: 'Landscape' });
    }
    if (re.test(kit.compareAgainst || '')) {
      push({ targetType: 'section', targetId: 'competitors', sourceTitle: 'Competitors', context: 'Compare against' });
    }
    if ((kit.sellingPoints || []).some((line) => re.test(line))) {
      push({ targetType: 'section', targetId: 'messaging', sourceTitle: 'Messaging', context: 'Selling points' });
    }
  }

  return links.slice(0, 10);
}

/**
 * Full Subpage detail view (e.g. "My Brand / Products / New Evowhey") with automatic "Linked from" backlinks.
 * Breadcrumb lives in the main top bar (bs-topbar) so it is never duplicated.
 */
export function BrandSubpageView({
  subpage,
  allSubpages = [],
  kit = null,
  onBack,
  onChangeSubpage,
  onDeleteSubpage,
  onOpenSubpage,
  onJumpSection,
}) {
  const [editingUrl, setEditingUrl] = useState(false);
  const backlinks = useMemo(
    () => computeBacklinks(subpage, allSubpages, kit),
    [subpage, allSubpages, kit],
  );

  if (!subpage) return null;

  const cleanHost = (() => {
    if (!subpage.url) return '';
    try {
      return new URL(subpage.url).hostname.replace(/^www\./i, '');
    } catch {
      return subpage.url;
    }
  })();

  return (
    <div className="min-h-full bg-[#FAFAFC] px-4 py-8 sm:px-8">
      <article className="mx-auto max-w-[760px] rounded-2xl border border-[#EBEBF2] bg-white p-7 shadow-[0_1px_4px_rgba(15,23,42,0.03)] sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={subpage.title}
              onChange={(e) => onChangeSubpage?.({ ...subpage, title: e.target.value })}
              className="w-full bg-transparent font-serif text-[32px] font-normal tracking-tight text-[#171821] outline-none"
            />
            <input
              type="text"
              value={subpage.subtitle || ''}
              onChange={(e) => onChangeSubpage?.({ ...subpage, subtitle: e.target.value })}
              placeholder="Add a short subtitle…"
              className="mt-1 w-full bg-transparent text-[13.5px] text-[#7A7D8F] outline-none placeholder:text-zinc-300"
            />
            {(subpage.parent === 'competitors' || subpage.parent === 'products' || subpage.url) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {editingUrl ? (
                  <input
                    autoFocus
                    type="url"
                    value={subpage.url || ''}
                    placeholder="https://official-website.com"
                    onChange={(e) => onChangeSubpage?.({ ...subpage, url: e.target.value })}
                    onBlur={() => setEditingUrl(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') setEditingUrl(false);
                    }}
                    className="w-full max-w-sm rounded-lg border border-[#5B45F2] bg-white px-2.5 py-1 text-[12.5px] text-[#171821] outline-none"
                  />
                ) : subpage.url ? (
                  <>
                    <a
                      href={/^https?:\/\//i.test(subpage.url) ? subpage.url : `https://${subpage.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E3F7] bg-[#F6F5FF] px-3 py-1 text-[12px] font-medium text-[#5B45F2] transition hover:border-[#5B45F2] hover:bg-violet-100/70"
                    >
                      <Globe size={12.5} />
                      <span>{cleanHost || subpage.url}</span>
                      <ExternalLink size={11.5} className="opacity-75" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditingUrl(true)}
                      className="text-[11.5px] text-zinc-400 transition hover:text-[#171821]"
                    >
                      Edit URL
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingUrl(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-[11.5px] text-zinc-500 transition hover:border-[#5B45F2] hover:text-[#5B45F2]"
                  >
                    <Globe size={12} />
                    <span>Add official website URL</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <AddBlockMenu
              onAddBlock={(blk) =>
                onChangeSubpage?.({
                  ...subpage,
                  blocks: [...(subpage.blocks || []), blk],
                })
              }
            />
            <button
              type="button"
              onClick={() => onDeleteSubpage?.(subpage.id)}
              className="rounded-lg border border-transparent p-1.5 text-zinc-400 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
              title="Delete subpage"
              aria-label="Delete subpage"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mt-7">
          <BrandDocumentBlocks
            blocks={subpage.blocks || []}
            subpages={allSubpages}
            onChangeBlocks={(nextBlocks) => onChangeSubpage?.({ ...subpage, blocks: nextBlocks })}
            onOpenSubpage={onOpenSubpage}
            onJumpSection={(sec) => {
              onBack?.();
              onJumpSection?.(sec);
            }}
          />
        </div>

        {/* Linked from — Automatic Backlinks Footer */}
        {backlinks.length > 0 && (
          <div className="mt-10 border-t border-[#EFEFF4] pt-5">
            <div className="mb-2.5 text-[11.5px] font-medium text-[#8C8FA1]">Linked from</div>
            <div className="space-y-1.5">
              {backlinks.map((bl, idx) => (
                <button
                  key={`${bl.targetId}-${bl.context}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (bl.targetType === 'subpage') onOpenSubpage?.(bl.targetId);
                    else {
                      onBack?.();
                      onJumpSection?.(bl.targetId);
                    }
                  }}
                  className="flex items-center gap-1.5 text-left text-[12.5px] transition hover:text-[#5B45F2]"
                >
                  <span className="font-semibold text-[#171821] hover:text-[#5B45F2]">{bl.sourceTitle}</span>
                  <span className="text-zinc-300">·</span>
                  <span className="text-[#8C8FA1]">{bl.context}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

function formatHistoryDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recent';
  const now = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatHistoryTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Right-side History drawer (clock icon in topbar) showing Manual edits and Ad Agent updates.
 */
export function BrandHistoryDrawer({ history = [], onClose, onOpenSubpage, onJumpSection }) {
  const [expandedIds, setExpandedIds] = useState(() => {
    const firstAgent = (history || []).find((h) => h.actorType === 'agent');
    return firstAgent ? { [firstAgent.id]: true } : {};
  });

  const grouped = useMemo(() => {
    const groups = [];
    for (const item of history || []) {
      const day = formatHistoryDay(item.createdAt);
      let g = groups.find((x) => x.day === day);
      if (!g) {
        g = { day, items: [] };
        groups.push(g);
      }
      g.items.push(item);
    }
    return groups;
  }, [history]);

  const toggle = (id) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/5" onClick={onClose} />
      <aside className="fixed right-4 top-14 z-50 flex max-h-[82vh] w-[340px] flex-col overflow-hidden rounded-2xl border border-[#E6E6EF] bg-white shadow-2xl shadow-zinc-900/12">
        <div className="flex items-center justify-between border-b border-[#EFEFF4] px-4 py-3.5">
          <h3 className="text-[15px] font-semibold text-[#171821]">History</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close history"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-xs text-zinc-400">
              <Clock size={22} className="mb-2 text-zinc-300" />
              <p>Belum ada riwayat perubahan.</p>
              <p className="mt-1 text-[11px]">Setiap hasil analisis Ad Agent &amp; tombol Save akan tercatat di sini.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((grp) => (
                <div key={grp.day}>
                  <div className="mb-3 text-[12px] font-medium text-[#8C8FA1]">{grp.day}</div>
                  <div className="relative space-y-4">
                    {grp.items.map((entry, idx) => {
                      const isAgent = entry.actorType === 'agent';
                      const pages = Array.isArray(entry.pages) ? entry.pages : [];
                      const isExpanded = Boolean(expandedIds[entry.id]);
                      const hasNext = idx < grp.items.length - 1;
                      return (
                        <div key={entry.id || idx} className="relative flex gap-3">
                          {hasNext && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-[-18px] left-[13px] top-7 w-px bg-[#ECECF3]"
                            />
                          )}
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                              isAgent
                                ? 'bg-[#5B45F2] text-white'
                                : 'bg-[#EFEFF4] text-[#4C4E5D]'
                            }`}
                          >
                            {isAgent ? <Sparkles size={13} /> : (entry.actorName || 'U').charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggle(entry.id)}
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <div className="truncate text-[13px] text-[#282A35]">
                                <strong className="font-semibold text-[#171821]">{entry.actorName}</strong>{' '}
                                updated {pages.length || 1} {pages.length === 1 ? 'page' : 'pages'}
                              </div>
                              {isExpanded ? (
                                <ChevronDown size={14} className="shrink-0 text-zinc-400" />
                              ) : (
                                <ChevronRight size={14} className="shrink-0 text-zinc-400" />
                              )}
                            </button>
                            <div className="mt-0.5 text-[11.5px] text-[#8C8FA1]">
                              {entry.source} · {formatHistoryTime(entry.createdAt)}
                            </div>

                            {!isExpanded && pages.length > 0 && pages.length <= 3 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {pages.map((p, pi) => (
                                  <button
                                    key={pi}
                                    type="button"
                                    onClick={() => {
                                      if (p.targetType === 'subpage') onOpenSubpage?.(p.targetId);
                                      else onJumpSection?.(p.targetId);
                                      onClose?.();
                                    }}
                                    className="rounded-md bg-[#F2F2F6] px-2 py-0.5 text-[11.5px] font-medium text-[#2E303C] transition hover:bg-violet-50 hover:text-[#5B45F2]"
                                  >
                                    {p.title}
                                  </button>
                                ))}
                              </div>
                            )}

                            {isExpanded && pages.length > 0 && (
                              <div className="mt-2.5 space-y-2.5">
                                {pages.map((p, pi) => (
                                  <button
                                    key={pi}
                                    type="button"
                                    onClick={() => {
                                      if (p.targetType === 'subpage') onOpenSubpage?.(p.targetId);
                                      else onJumpSection?.(p.targetId);
                                      onClose?.();
                                    }}
                                    className="block w-full rounded-lg px-1.5 py-1 text-left transition hover:bg-violet-50/70"
                                  >
                                    <div className="text-[12.5px] font-semibold text-[#171821]">{p.title}</div>
                                    {p.summary && (
                                      <div className="truncate text-[11.5px] text-[#8C8FA1]">{p.summary}</div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Progressive "Writing brand pages · X/6 pages" skeleton canvas shown while Ad Agent analyzes the website.
 */
export function BrandAnalyzingSkeleton({ websiteUrl = '', onCancelToManual }) {
  const [pageStep, setPageStep] = useState(1);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPageStep(2), 2500),
      setTimeout(() => setPageStep(3), 6000),
      setTimeout(() => setPageStep(4), 10000),
      setTimeout(() => setPageStep(5), 14500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const pages = [
    { id: 'overview', title: 'Overview', subtitle: 'Who the brand is, its category and positioning.' },
    { id: 'brand-kit', title: 'Brand Kit', subtitle: 'Logo, colors, fonts and how to say the name.' },
    { id: 'audience', title: 'Audience', subtitle: 'Who the ads speak to.' },
    { id: 'messaging', title: 'Messaging', subtitle: 'Selling points and tone.' },
    { id: 'competitors', title: 'Competitors', subtitle: 'Who the brand competes with and how they advertise.' },
    { id: 'products', title: 'Products', subtitle: 'What the brand sells.' },
  ];

  return (
    <div className="flex h-full min-h-screen w-full bg-[#FAFAFC]">
      {/* Left muted tree sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[#EBEBF2] bg-white px-3 py-4 md:flex">
        <div className="mb-3 px-2 text-[14px] font-semibold text-[#171821]">My Brand</div>
        <div className="space-y-1">
          {pages.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] ${
                idx < pageStep ? 'font-medium text-[#5B45F2] bg-violet-50/70' : 'text-zinc-400'
              }`}
            >
              <span>{p.title}</span>
              {idx < pageStep && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5B45F2]" />}
            </div>
          ))}
          <div className="my-2 border-t border-zinc-100" />
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-700">
            <Sparkles size={13} className="text-zinc-400" />
            Avatars
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-700">
            <Volume2 size={13} className="text-zinc-400" />
            Voices
          </div>
        </div>
      </aside>

      {/* Main skeleton column */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EFEFF4] bg-[#FAFAFC]/90 px-6 py-3 backdrop-blur">
          <div className="text-[12.5px] text-zinc-500">
            My Brand <span className="mx-1 text-zinc-300">/</span> <span className="font-semibold text-[#171821]">Overview</span>
            {websiteUrl && <span className="ml-2 text-xs text-zinc-400">({websiteUrl})</span>}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-[12px] font-medium text-[#2E303C] shadow-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#5B45F2]" />
              <span>Writing brand pages</span>
              <span className="text-zinc-400">{pageStep}/6 pages</span>
            </div>
            {onCancelToManual && (
              <button
                type="button"
                onClick={onCancelToManual}
                className="text-[11.5px] font-medium text-zinc-400 hover:text-zinc-700"
              >
                Edit manual
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-[740px] space-y-5 px-4 py-8">
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-2.5 text-center text-[12px] text-[#5B45F2]">
            Ad Agent sedang menganalisis website & menyusun halaman brand di latar belakang — kamu bebas pindah ke halaman lain, hasilnya otomatis siap saat kembali.
          </div>

          {pages.map((p, idx) => (
            <section
              key={p.id}
              className="rounded-2xl border border-[#ECECF3] bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.02)]"
            >
              <h2 className="font-serif text-[26px] font-normal text-[#B9BBC8]">{p.title}</h2>
              <p className="mt-1 text-[12.5px] text-[#8E91A2]">{p.subtitle}</p>
              <div className="mt-4 text-[12px] font-medium text-[#7D8094]">
                {idx < pageStep ? 'Ad Agent is writing this page…' : 'Ad Agent will write this page'}
              </div>
              <div className="mt-3 space-y-2.5">
                <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-[#EBEBF2]" />
                <div className="h-2.5 w-full animate-pulse rounded-full bg-[#F1F1F6]" />
                <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-[#EBEBF2]" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
