'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  Play,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';

/**
 * Clean interactive multi-step Option Picker Card emitted by `ask_clarifying_questions`
 * (radio options + custom "Lainnya…" input + Submit/Continue button, matching reference UI).
 */
export function ClarifyingQuestionsBlock({ questions = [], disabled = false, onSelectOption }) {
  const safeQuestions = Array.isArray(questions) ? questions.filter((q) => q?.question && Array.isArray(q.options) && q.options.length > 0) : [];
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [customInput, setCustomInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (safeQuestions.length === 0) return null;

  const clampedIdx = Math.min(stepIndex, safeQuestions.length - 1);
  const current = safeQuestions[clampedIdx];
  const currentAnswer = answers[clampedIdx] || '';
  const isLast = clampedIdx === safeQuestions.length - 1;
  const effectiveCurrentValue = customInput.trim() || currentAnswer;

  const formatOpt = (opt) => {
    if (typeof opt === 'string') return { label: opt, description: '' };
    return { label: String(opt?.label || opt?.title || ''), description: String(opt?.description || '') };
  };

  const commitAll = (overrideFinalValue = null) => {
    const finalAnswers = { ...answers };
    if (overrideFinalValue !== null) finalAnswers[clampedIdx] = overrideFinalValue;
    else if (customInput.trim()) finalAnswers[clampedIdx] = customInput.trim();

    const parts = safeQuestions
      .map((q, qi) => {
        const val = String(finalAnswers[qi] || '').trim();
        if (!val) return '';
        return safeQuestions.length === 1 ? val : `${q.question} → ${val}`;
      })
      .filter(Boolean);

    if (!parts.length) return;
    setSubmitted(true);
    onSelectOption?.(parts.join('\n'));
  };

  const handleAdvanceOrSubmit = () => {
    if (!effectiveCurrentValue || disabled || submitted) return;
    const nextAnswers = { ...answers, [clampedIdx]: effectiveCurrentValue };
    setAnswers(nextAnswers);
    setCustomInput('');
    if (!isLast) {
      setStepIndex(clampedIdx + 1);
    } else {
      commitAll(effectiveCurrentValue);
    }
  };

  if (submitted) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#EAEAF2] bg-[#F7F7FA] px-3.5 py-2.5 text-[12.5px] text-[#525568]">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>Pilihanmu sudah dikirim.</span>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5E5EE] bg-white shadow-[0_2px_14px_-4px_rgba(15,23,42,0.06)]">
      {/* Header with Question + Stepper */}
      <div className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-3.5">
        <div className="text-[13.5px] font-semibold leading-snug text-[#171821]">{current.question}</div>
        {safeQuestions.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[#7A7D8F]">
            <button
              type="button"
              disabled={clampedIdx === 0}
              onClick={() => {
                setCustomInput('');
                setStepIndex((i) => Math.max(0, i - 1));
              }}
              className="rounded-md p-0.5 transition hover:bg-[#F2F2F6] disabled:opacity-35"
              aria-label="Pertanyaan sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span>
              {clampedIdx + 1} / {safeQuestions.length}
            </span>
            <button
              type="button"
              disabled={isLast}
              onClick={() => {
                setCustomInput('');
                setStepIndex((i) => Math.min(safeQuestions.length - 1, i + 1));
              }}
              className="rounded-md p-0.5 transition hover:bg-[#F2F2F6] disabled:opacity-35"
              aria-label="Pertanyaan berikutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Radio Option Rows */}
      <div className="space-y-1 px-2.5 pb-2">
        {(current.options || []).map((rawOpt, oi) => {
          const opt = formatOpt(rawOpt);
          const isSelected = !customInput.trim() && currentAnswer === opt.label;
          return (
            <button
              key={oi}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustomInput('');
                setAnswers((prev) => ({ ...prev, [clampedIdx]: opt.label }));
              }}
              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                isSelected
                  ? 'bg-[#F4F3FF] ring-1 ring-[#5B45F2]/35'
                  : 'hover:bg-[#F7F7FA]'
              } disabled:opacity-50`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                  isSelected ? 'border-[#5B45F2] bg-[#5B45F2]' : 'border-[#CFCFD9] bg-white'
                }`}
              >
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] font-medium ${isSelected ? 'text-[#171821]' : 'text-[#282A35]'}`}>
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-[#7A7D8F]">{opt.description}</span>
                )}
              </span>
            </button>
          );
        })}

        {/* Custom free-text option row */}
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              customInput.trim() ? 'border-[#5B45F2] bg-[#5B45F2]' : 'border-[#CFCFD9] bg-white'
            }`}
          >
            {customInput.trim() && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <input
            type="text"
            disabled={disabled}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdvanceOrSubmit();
              }
            }}
            placeholder="Atau tulis pilihanmu sendiri…"
            className="w-full bg-transparent text-[13px] text-[#171821] placeholder:text-[#9A9DB0] outline-none"
          />
        </div>
      </div>

      {/* Footer Submit / Continue */}
      <div className="flex items-center justify-end gap-2 border-t border-[#F0F0F5] bg-[#FAFAFC] px-3.5 py-2.5">
        <button
          type="button"
          disabled={disabled || !effectiveCurrentValue}
          onClick={handleAdvanceOrSubmit}
          className="rounded-xl bg-[#5B45F2] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-40"
        >
          {isLast ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}

const OPTION_CARD_THEMES = [
  { header: 'bg-[#5B45F2] text-white', badge: 'text-white/75' },
  { header: 'bg-[#1D1E26] text-white', badge: 'text-white/65' },
  { header: 'bg-[#ECEBFF] text-[#1B1D29]', badge: 'text-[#5B45F2]' },
  { header: 'bg-[#F2F2F6] text-[#1B1D29]', badge: 'text-[#6B6E80]' },
];

/**
 * 3-column horizontal visual Concept Option Cards emitted by `present_creative_options`
 * (or inline research opportunities), clickable to pick & proceed immediately.
 */
export function ConceptOptionsGrid({ options = [], disabled = false, onSelect }) {
  const safeOptions = Array.isArray(options) ? options.filter((o) => o?.title || o?.headline) : [];
  if (safeOptions.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {safeOptions.slice(0, 6).map((opt, idx) => {
        const theme = OPTION_CARD_THEMES[idx % OPTION_CARD_THEMES.length];
        const tags = Array.isArray(opt.tags) ? opt.tags.filter(Boolean).slice(0, 3) : [];
        return (
          <button
            key={opt.id || idx}
            type="button"
            disabled={disabled}
            onClick={() =>
              onSelect?.(
                opt.prompt ||
                  `Lanjut pakai Option ${idx + 1}: "${opt.title || opt.headline}"${opt.description ? ` — ${opt.description}` : ''}`,
              )
            }
            className="group flex flex-col overflow-hidden rounded-2xl border border-[#E5E5EE] bg-white text-left shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-[#5B45F2]/55 hover:shadow-[0_10px_24px_-12px_rgba(91,69,242,0.28)] disabled:opacity-55"
          >
            <div className={`flex min-h-[112px] flex-col justify-between p-3.5 ${theme.header}`}>
              <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${theme.badge}`}>
                {opt.badge || `Option ${idx + 1}`}
              </span>
              <div className="mt-2 text-[13.5px] font-semibold leading-snug">
                {opt.headline || opt.title}
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between p-3.5">
              <div>
                {tags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {tags.map((t, ti) => (
                      <span
                        key={ti}
                        className="rounded-md bg-[#F2F2F6] px-1.5 py-0.5 text-[10px] font-medium text-[#55576B]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {opt.description && (
                  <p className="line-clamp-4 text-[12px] leading-relaxed text-[#525568]">{opt.description}</p>
                )}
              </div>
              <div className="mt-3 text-[11.5px] font-semibold text-[#5B45F2] opacity-85 transition group-hover:opacity-100">
                Pilih konsep ini →
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Clean inline Campaign Plan Table rendered right inside chat (no right-side Artifact pane).
 */
export function InlineCampaignCard({ campaign, openingDeliverableId = null, onOpenInCanvas }) {
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const deliverables = Array.isArray(campaign?.deliverables) ? campaign.deliverables : [];
  if (!campaign || deliverables.length === 0) return null;

  const copyPrompt = async (d) => {
    const text = d.script_json?.visualPrompt || d.hook || d.title;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(d.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#E6E6EF] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] bg-[#FAFAFC] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[#5B45F2]" />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-[#171821]">{campaign.title}</div>
            {campaign.objective && (
              <div className="truncate text-[11.5px] text-[#7A7D8F]">{campaign.objective}</div>
            )}
          </div>
        </div>
        <span className="rounded-full bg-[#EFEFFE] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B45F2]">
          {deliverables.length} deliverables · Seedance 2.5 Omni
        </span>
      </div>

      <div className="divide-y divide-[#F0F0F5]">
        {deliverables.map((d) => {
          const isOpen = expandedId === d.id;
          const isBusy = openingDeliverableId === d.id;
          return (
            <div key={d.id} className="px-4 py-3 transition hover:bg-[#FAFAFC]/70">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-[#171821] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Day {d.day_index}
                    </span>
                    <span className="rounded-md bg-[#F2F2F6] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#525568]">
                      {d.platform}
                    </span>
                    <span className="text-[11px] text-[#7A7D8F]">{d.format}</span>
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-[#171821]">{d.title}</div>
                  {d.hook && (
                    <div className="mt-1 text-[12.5px] text-[#3E4050]">“{d.hook}”</div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : d.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5EE] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#525568] transition hover:bg-[#F5F5FA]"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {isOpen ? 'Tutup' : 'Prompt'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onOpenInCanvas?.(d)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                    {isBusy ? 'Opening…' : 'Open in Canvas'}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-2.5 space-y-2 rounded-xl bg-[#F4F4F7] p-3 text-[12px] text-[#363847]">
                  {d.script_json?.visualPrompt && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-[#7A7D8F]">
                        <span>Visual Prompt (Seedance 2.5)</span>
                        <button
                          type="button"
                          onClick={() => copyPrompt(d)}
                          className="inline-flex items-center gap-1 text-[#5B45F2] hover:underline"
                        >
                          {copiedId === d.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === d.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{d.script_json.visualPrompt}</p>
                    </div>
                  )}
                  {d.script_json?.voiceover && (
                    <div>
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7A7D8F]">Voiceover</div>
                      <p className="mt-0.5 whitespace-pre-wrap">{d.script_json.voiceover}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Clean inline Research Report Summary rendered directly inside chat (no Artifact drawer).
 */
export function InlineResearchCard({ artifact, disabled = false, onPromptAction }) {
  const [showRefs, setShowRefs] = useState(false);
  const data = artifact?.data_json || {};
  const hooks = Array.isArray(data.winningHooks) ? data.winningHooks : [];
  const opportunities = Array.isArray(data.creativeOpportunities) ? data.creativeOpportunities : [];
  const refs = Array.isArray(data.references) ? data.references : [];

  if (!artifact || (!hooks.length && !opportunities.length && !refs.length)) return null;

  return (
    <div className="mt-4 space-y-3.5">
      {opportunities.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#525568]">
            <FileSearch className="h-3.5 w-3.5 text-[#5B45F2]" />
            <span>Creative Opportunities dari Riset</span>
          </div>
          <ConceptOptionsGrid
            disabled={disabled}
            onSelect={onPromptAction}
            options={opportunities.slice(0, 3).map((opp, idx) => ({
              badge: `Opportunity ${idx + 1}`,
              title: opp.title,
              headline: opp.title,
              tags: [opp.recommendedFormat].filter(Boolean),
              description: opp.angle || opp.rationale || '',
              prompt: `Buatkan storyboard + siapkan render video Seedance 2.5 berdasarkan opportunity "${opp.title}" (${opp.recommendedFormat || 'UGC 9:16'}) dengan angle: ${opp.angle || ''}`,
            }))}
          />
        </div>
      )}

      {refs.length > 0 && (
        <div className="rounded-xl border border-[#EAEAF2] bg-[#FAFAFC]">
          <button
            type="button"
            onClick={() => setShowRefs((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12px] font-medium text-[#525568] hover:text-[#171821]"
          >
            <span>Lihat {refs.length} referensi iklan & konten real</span>
            {showRefs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showRefs && (
            <div className="grid grid-cols-1 gap-2 border-t border-[#EFEFF5] p-3 sm:grid-cols-2">
              {refs.slice(0, 6).map((ref, ri) => (
                <a
                  key={ri}
                  href={ref.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 rounded-xl border border-[#EAEAF2] bg-white p-2.5 transition hover:border-[#5B45F2]/40"
                >
                  {ref.thumbnailUrl ? (
                    <img src={ref.thumbnailUrl} alt={ref.title} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F2F2F6] text-[10px] font-bold uppercase text-[#525568]">
                      {String(ref.platform || 'ad').slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[#171821]">{ref.title}</div>
                    <div className="text-[11px] font-medium text-emerald-700">{ref.metric}</div>
                    {ref.hookExcerpt && (
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-[#7A7D8F]">{ref.hookExcerpt}</div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Timestamped Storyboard Table emitted by `create_storyboard`.
 */
export function StoryboardCard({ storyboard }) {
  if (!storyboard || !Array.isArray(storyboard.shots) || storyboard.shots.length === 0) return null;
  return (
    <div className="mt-3.5 overflow-hidden rounded-xl border border-[#E6E6F0] bg-[#FAFAFC]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAEAF2] bg-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-[#5B45F2]" />
          <span className="text-[12.5px] font-semibold text-[#171821]">{storyboard.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7A7D8F]">
          <span className="rounded-md bg-[#F1F1F5] px-2 py-0.5">{storyboard.aspectRatio || '9:16'}</span>
          <span className="rounded-md bg-[#F1F1F5] px-2 py-0.5">{storyboard.durationSeconds || 30}s</span>
        </div>
      </div>

      {storyboard.conceptSummary && (
        <div className="border-b border-[#EFEFF5] bg-white/60 px-3.5 py-2 text-[12px] leading-relaxed text-[#4B4E5F]">
          {storyboard.conceptSummary}
        </div>
      )}

      <div className="overflow-x-auto bg-white">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#EFEFF5] bg-[#F8F8FB] text-[10.5px] font-semibold uppercase tracking-wider text-[#8C8FA1]">
              <th className="w-16 px-3 py-2">Time</th>
              <th className="px-3 py-2">Visual / Shot</th>
              <th className="w-44 px-3 py-2">On-Screen Text</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F2F7]">
            {storyboard.shots.map((shot, idx) => (
              <tr key={idx} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-[#5B45F2]">
                  {shot.time}
                </td>
                <td className="px-3 py-2 leading-relaxed text-[#282A35]">{shot.visual}</td>
                <td className="px-3 py-2 text-[#525568]">{shot.onScreenText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(storyboard.voiceoverScript || storyboard.musicDirection) && (
        <div className="space-y-1.5 border-t border-[#EFEFF5] bg-[#FAFAFC] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#4B4E5F]">
          {storyboard.voiceoverScript && (
            <div>
              <strong className="font-semibold text-[#171821]">Voiceover:</strong> {storyboard.voiceoverScript}
            </div>
          )}
          {storyboard.musicDirection && (
            <div>
              <strong className="font-semibold text-[#171821]">Music:</strong> {storyboard.musicDirection}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION_META = {
  generate_scene_kit: { label: 'Pre-Production Pack', icon: Sparkles },
  generate_brand_avatar: { label: 'Brand Avatar → My Brand', icon: Sparkles },
  generate_keyframe: { label: 'Keyframe Image', icon: ImageIcon },
  generate_voiceover: { label: 'Voiceover MP3', icon: Mic },
  generate_music: { label: 'Background Music', icon: Music },
  generate_video: { label: 'Video Render', icon: Film },
  launch_meta_campaign: { label: 'Meta Ads (Paused)', icon: Target },
  update_brand: { label: 'Update My Brand', icon: Sparkles },
};

/**
 * Human-in-the-Loop Approval Card for paid media generation / external actions.
 * Supports live status polling & inline `<video controls>` playback for async video renders.
 */
export function ApprovalActionCard({ approval, busy = false, openingCanvas = false, onDecide, onPollStatus, onOpenInCanvas }) {
  const approvalId = approval?.id || null;
  const status = approval?.status || 'pending';
  const result = approval?.result_json || {};
  const generationId = result?.generationId || null;
  const shouldPoll = Boolean(approvalId && status === 'executing' && generationId && onPollStatus);

  useEffect(() => {
    if (!shouldPoll) return undefined;
    let cancelled = false;
    const poll = () => {
      if (!cancelled) onPollStatus(approvalId);
    };
    const initialTimer = setTimeout(poll, 1800);
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [shouldPoll, approvalId, onPollStatus]);

  if (!approval) return null;
  const meta = ACTION_META[approval.action_type] || { label: approval.action_type, icon: Sparkles };
  const Icon = meta.icon;
  const jobStatus = String(result.jobStatus || 'queued').toLowerCase();
  const progress = Math.min(100, Math.max(0, Number(result.progress || 0)));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[#E4E4EE] bg-[#FAFAFC]">
      <div className="flex items-start justify-between gap-3 bg-white px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F1F1F5] text-[#282A35]">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-semibold text-[#171821]">{approval.title}</span>
              <span className="rounded-md bg-[#F1F1F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#525568]">
                {meta.label}
              </span>
              {Number(approval.estimated_credits) > 0 && status === 'pending' && (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                  ~{approval.estimated_credits} credits
                </span>
              )}
            </div>
            {approval.description && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#64677A]">{approval.description}</p>
            )}
            {status === 'pending' && approval.action_type === 'generate_scene_kit' && approval.payload_json?.sceneKit && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {approval.payload_json.sceneKit.avatar?.name && (
                  <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-800 ring-1 ring-violet-200/70">
                    Avatar: @{approval.payload_json.sceneKit.avatar.name}
                  </span>
                )}
                {approval.payload_json.sceneKit.location?.name && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
                    Background: @{approval.payload_json.sceneKit.location.name} ({(approval.payload_json.sceneKit.location.shots || []).length || 1} angle)
                  </span>
                )}
                {Array.isArray(approval.payload_json.sceneKit.productSubProps?.shots) && approval.payload_json.sceneKit.productSubProps.shots.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10.5px] font-semibold text-sky-800 ring-1 ring-sky-200/70">
                    Sub-Props: {approval.payload_json.sceneKit.productSubProps.shots.map((s) => s.label).filter(Boolean).join(', ')}
                  </span>
                )}
                {(approval.payload_json.sceneKit.extraProps || []).map((ep, idx) => (
                  <span key={idx} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-900 ring-1 ring-amber-200/70">
                    Prop: @{ep.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {status === 'executing' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-[#5B45F2] ring-1 ring-violet-200/70">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress > 0 ? `Rendering ${progress}%` : jobStatus === 'processing' || jobStatus === 'running' ? 'Rendering…' : 'Queued…'}
            </span>
          )}
          {status === 'completed' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Done
            </span>
          )}
          {status === 'rejected' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-zinc-500">
              Dismissed
            </span>
          )}
          {status === 'failed' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-600">
              <AlertCircle className="h-3 w-3" /> Failed
            </span>
          )}
        </div>
      </div>

      {/* Pending Action Buttons */}
      {status === 'pending' && (
        <div className="flex items-center justify-between gap-2 border-t border-[#EFEFF5] bg-[#FAFAFC] px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-[#7A7D8F]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#5B45F2]" />
            Requires your approval before running
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide?.(approval.id, 'reject')}
              className="rounded-lg border border-[#E2E2EC] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#525568] transition hover:bg-zinc-100 disabled:opacity-50"
            >
              Dismiss
            </button>
            {onOpenInCanvas && ['generate_scene_kit', 'generate_brand_avatar', 'generate_video', 'generate_keyframe', 'generate_voiceover', 'generate_music'].includes(approval.action_type) && (
              <button
                type="button"
                disabled={openingCanvas}
                onClick={() => onOpenInCanvas(approval)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCDCE6] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#171821] transition hover:bg-[#F2F2F7] disabled:opacity-50"
                title="Buka di AI Video Canvas (Seedance 2.5 Omni + Props & @mentions)"
              >
                {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3 text-[#5B45F2]" />}
                Canvas
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide?.(approval.id, 'approve')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B45F2] px-3 py-1 text-[11.5px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {busy ? 'Running…' : 'Approve & Run'}
            </button>
          </div>
        </div>
      )}

      {/* Live Video Render Progress */}
      {status === 'executing' && result.mediaType === 'video_job' && (
        <div className="space-y-2 border-t border-[#EFEFF5] bg-[#FAFAFC] px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <span className="font-medium text-[#282A35]">
              {result.videoModelLabel || result.videoModel || 'Seedance 2.5'} · {result.duration || 8}s ·{' '}
              {result.resolution || '720p'} · {result.aspectRatio || '9:16'}
              {result.generateAudio ? ' · Audio' : ''}
              {result.referenceCount > 0 ? ` · ${result.referenceCount} refs` : ''}
            </span>
            {result.estimatedCredits ? (
              <span className="text-[11px] text-[#7A7D8F]">Reserved ~{result.estimatedCredits} credits</span>
            ) : null}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E6E6F0]">
            <div
              className="h-full rounded-full bg-[#5B45F2] transition-all duration-500"
              style={{ width: `${progress > 5 ? progress : 18}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7A7D8F]">
            <span>Rendering video on {result.videoModelLabel || 'Seedance 2.5'} (est. 1–2 min). Playback will appear here automatically.</span>
            {onOpenInCanvas && (
              <button
                type="button"
                disabled={openingCanvas}
                onClick={() => onOpenInCanvas(approval)}
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#5B45F2] hover:underline disabled:opacity-60"
              >
                {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                Open in Canvas
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completed Result Preview (Keyframe Image / Playable Audio MP3 / Playable Video MP4 / Meta Campaign) */}
      {status === 'completed' && (
        <div className="border-t border-[#EFEFF5] bg-[#FAFAFC] px-3.5 py-3">
          {result.mediaType === 'video' && result.url && (
            <div className="space-y-2.5">
              <div className="overflow-hidden rounded-xl border border-[#E4E4EE] bg-black">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={result.url}
                  className="mx-auto max-h-[380px] w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#525568]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[#171821]">
                    {result.videoModelLabel || result.videoModel || 'Seedance 2.5'}
                  </span>
                  <span>· {result.duration || 8}s</span>
                  <span>· {result.resolution || '720p'}</span>
                  <span>· {result.aspectRatio || '9:16'}</span>
                  {result.creditsCharged ? <span>· {result.creditsCharged} credits</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={result.downloadUrl || result.url}
                    download={result.filename || 'nexoclip-ad.mp4'}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DCDCE6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171821] transition hover:bg-[#F2F2F7]"
                  >
                    <Download className="h-3 w-3" /> Download MP4
                  </a>
                  {onOpenInCanvas && (
                    <button
                      type="button"
                      disabled={openingCanvas}
                      onClick={() => onOpenInCanvas(approval)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
                    >
                      {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                      Open in Canvas
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {result.mediaType === 'scene_kit' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#525568]">
                <span className="font-semibold text-[#171821]">
                  Pre-Production Asset Pack ready ({result.totalAssets || 0} assets · {result.creditsCharged || 0} credits)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {result.avatar?.savedToMyBrand && (
                    <a
                      href="/studio/brand-kit"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#DCDCE6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171821] transition hover:bg-[#F2F2F7]"
                    >
                      View Avatar in My Brand <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {onOpenInCanvas && (
                    <button
                      type="button"
                      disabled={openingCanvas}
                      onClick={() => onOpenInCanvas(approval)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
                    >
                      {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                      Open in Canvas
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {result.avatar?.url && (
                  <a href={result.avatar.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-[#E4E4EE] bg-white">
                    <img src={result.avatar.url} alt={result.avatar.name} className="h-28 w-full object-cover" />
                    <div className="p-2">
                      <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                        @{result.avatar.tag || result.avatar.name}
                      </span>
                      <div className="mt-0.5 truncate text-[10.5px] text-[#64677A]">Character · Avatar</div>
                    </div>
                  </a>
                )}

                {(result.location?.assets || []).map((loc, i) => (
                  <a key={`loc-${i}`} href={loc.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-[#E4E4EE] bg-white">
                    <img src={loc.url} alt={loc.label || result.location.name} className="h-28 w-full object-cover" />
                    <div className="p-2">
                      <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        @{result.location.tag || result.location.name}
                      </span>
                      <div className="mt-0.5 truncate text-[10.5px] text-[#64677A]">{loc.label || `Background ${String.fromCharCode(65 + i)}`}</div>
                    </div>
                  </a>
                ))}

                {(result.productSubProps?.assets || []).map((sp, i) => (
                  <a key={`sub-${i}`} href={sp.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-[#E4E4EE] bg-white">
                    <img src={sp.url} alt={sp.label || result.productSubProps.productName} className="h-28 w-full object-cover" />
                    <div className="p-2">
                      <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        @{result.productSubProps.tag || result.productSubProps.productName}
                      </span>
                      <div className="mt-0.5 truncate text-[10.5px] text-[#64677A]">{sp.label || `Sub-Prop ${String.fromCharCode(66 + i)}`}</div>
                    </div>
                  </a>
                ))}

                {(result.extraProps || []).map((ep, i) => (
                  <a key={`ep-${i}`} href={ep.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-[#E4E4EE] bg-white">
                    <img src={ep.url} alt={ep.name} className="h-28 w-full object-cover" />
                    <div className="p-2">
                      <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        @{ep.tag || ep.name}
                      </span>
                      <div className="mt-0.5 truncate text-[10.5px] text-[#64677A]">Extra Prop</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.mediaType === 'avatar' && result.url && (
            <div className="flex items-start gap-3.5">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="block shrink-0 overflow-hidden rounded-xl border border-[#E4E4EE] bg-white shadow-2xs">
                <img src={result.url} alt={result.name || approval.title} className="h-32 w-24 object-cover" />
              </a>
              <div className="min-w-0 flex-1 space-y-1.5 text-[12px] text-[#525568]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[#171821]">{result.name || 'Brand Avatar'}</span>
                  {result.savedToMyBrand && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                      <CheckCircle2 className="h-3 w-3" /> Saved to My Brand → Avatars
                    </span>
                  )}
                </div>
                {result.description && (
                  <p className="text-[11.5px] leading-relaxed text-[#525568]">{result.description}</p>
                )}
                <div className="text-[11px] text-[#7A7D8F]">
                  {result.modelLabel || 'AI Influencer (Nano Banana Pro)'} · Ready as <strong>Characters</strong> folder (@{String(result.name || 'Creator').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')}) in AI Video Canvas · {result.creditsCharged || 8} credits
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="/studio/brand-kit"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DCDCE6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171821] transition hover:bg-[#F2F2F7]"
                  >
                    View in My Brand <ExternalLink className="h-3 w-3" />
                  </a>
                  {onOpenInCanvas && (
                    <button
                      type="button"
                      disabled={openingCanvas}
                      onClick={() => onOpenInCanvas(approval)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
                    >
                      {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                      Open in Canvas
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {result.mediaType === 'image' && result.url && (
            <div className="flex items-start gap-3">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="block shrink-0 overflow-hidden rounded-lg border border-[#E4E4EE] bg-white">
                <img src={result.url} alt={approval.title} className="h-28 w-20 object-cover" />
              </a>
              <div className="space-y-1 text-[11.5px] text-[#525568]">
                <div className="font-semibold text-[#171821]">Keyframe saved to Asset Library</div>
                <div>Model: {result.model || 'Seedream'} · Aspect: {result.aspectRatio || '9:16'}</div>
                {result.creditsCharged ? <div>Used: {result.creditsCharged} credits</div> : null}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[#5B45F2] hover:underline"
                  >
                    Open full image <ExternalLink className="h-3 w-3" />
                  </a>
                  {onOpenInCanvas && (
                    <button
                      type="button"
                      disabled={openingCanvas}
                      onClick={() => onOpenInCanvas(approval)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#4934DC] disabled:opacity-60"
                    >
                      {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                      Open in Canvas
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {result.mediaType === 'audio' && result.url && (
            <div className="space-y-1.5">
              <audio controls src={result.url} className="h-9 w-full" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64677A]">
                <span>
                  {result.subtype === 'voiceover'
                    ? `Voice: ${result.voiceName || 'ElevenLabs'} · ${result.seconds || '?'}s`
                    : `Instrumental BGM · ${result.seconds || '?'}s`}
                </span>
                {result.creditsCharged ? <span>{result.creditsCharged} credits</span> : null}
              </div>
              {result.speechCheckNote && (
                <div className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-[#4B4E5F] ring-1 ring-[#EAEAF2]">
                  <strong>Speech check:</strong> {result.speechCheckNote}
                </div>
              )}
            </div>
          )}

          {result.mediaType === 'video_handoff' && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="text-[#4B4E5F]">{result.note || 'Ready to edit & render in AI Video Canvas.'}</span>
              {onOpenInCanvas && (
                <button
                  type="button"
                  disabled={openingCanvas}
                  onClick={() => onOpenInCanvas(approval)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#4934DC] disabled:opacity-60"
                >
                  {openingCanvas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Workflow className="h-3 w-3" />}
                  Open in Canvas
                </button>
              )}
            </div>
          )}

          {result.campaignId && (
            <div className="text-[12px] text-emerald-700">
              Meta Ads Campaign created in <strong>PAUSED</strong> status (ID: {result.campaignId}).
            </div>
          )}
        </div>
      )}

      {status === 'failed' && result.error && (
        <div className="border-t border-red-100 bg-red-50/70 px-3.5 py-2 text-[11.5px] text-red-700">
          {result.error}
        </div>
      )}
    </div>
  );
}

const ROUTINE_PRESETS = [
  {
    title: 'Weekly Competitor Radar',
    scheduleLabel: 'Every Monday · 09:00',
    cadence: 'weekly',
    prompt:
      'Cek iklan Meta Ads & TikTok terbaru dari kompetitor di My Brand, cari iklan yang running >= 14 hari, simpan Research Report, dan rangkum 3 peluang hook minggu ini.',
  },
  {
    title: 'Monday Ad Account Audit',
    scheduleLabel: 'Every Monday · 08:30',
    cadence: 'weekly',
    prompt:
      'Audit performa akun iklan yang terhubung (last_7d), identifikasi anomali CTR/CPC/spend atau indikasi creative fatigue, lalu rekomendasikan 2 variasi hook baru.',
  },
  {
    title: 'Friday Fresh Hook Pack',
    scheduleLabel: 'Every Friday · 14:00',
    cadence: 'weekly',
    prompt:
      'Buatkan 5 ide konten segar & 10 variasi hook 0–3 detik untuk konten TikTok & Reels minggu depan berdasarkan produk unggulan di My Brand.',
  },
];

/**
 * Right-side Routines Panel (Creatify Max-style recurring 24/7 marketing tasks).
 */
export function RoutinesPanel({
  routines = [],
  onClose,
  onCreateRoutine,
  onToggleRoutine,
  onDeleteRoutine,
  onRunRoutine,
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleLabel, setScheduleLabel] = useState('Every Monday · 09:00');
  const [cadence, setCadence] = useState('weekly');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim() || saving) return;
    setSaving(true);
    try {
      await onCreateRoutine?.({ title, prompt, cadence, scheduleLabel, requireApproval: true });
      setTitle('');
      setPrompt('');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-[#EBEBF2] bg-white">
      <div className="flex items-center justify-between border-b border-[#EFEFF4] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-[#5B45F2]" />
          <h3 className="text-sm font-semibold text-[#171821]">Routines</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#F1F1F5] px-2.5 py-1 text-xs font-semibold text-[#171821] transition hover:bg-[#E6E6EE]"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {creating && (
          <form onSubmit={handleSubmit} className="space-y-2.5 rounded-xl border border-[#E4E4EE] bg-[#FAFAFC] p-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nama routine (mis. Weekly Competitor Radar)"
              className="w-full rounded-lg border border-[#E2E2EC] bg-white px-2.5 py-1.5 text-xs text-[#171821] outline-none focus:border-[#5B45F2]"
            />
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Instruksi bahasa biasa yang dijalankan AI setiap jadwal…"
              className="w-full resize-none rounded-lg border border-[#E2E2EC] bg-white px-2.5 py-1.5 text-xs text-[#171821] outline-none focus:border-[#5B45F2]"
            />
            <div className="flex gap-2">
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="rounded-lg border border-[#E2E2EC] bg-white px-2 py-1.5 text-xs text-[#282A35] outline-none"
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual</option>
              </select>
              <input
                type="text"
                value={scheduleLabel}
                onChange={(e) => setScheduleLabel(e.target.value)}
                placeholder="Every Monday · 09:00"
                className="min-w-0 flex-1 rounded-lg border border-[#E2E2EC] bg-white px-2.5 py-1.5 text-xs text-[#171821] outline-none"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-200/60"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#5B45F2] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4934DC] disabled:opacity-60"
              >
                {saving ? 'Menyimpan…' : 'Simpan Routine'}
              </button>
            </div>
          </form>
        )}

        {routines.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-[#7A7D8F]">
              Routines menjalankan tugas riset, audit performa, atau brief konten secara terjadwal — tetap aman dengan Approval Card sebelum aksi berbiaya.
            </p>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9A9DB0]">Quick Templates</div>
            <div className="space-y-2">
              {ROUTINE_PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#EAEAF2] bg-[#FAFAFC] p-3 transition hover:border-[#5B45F2]/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#171821]">{preset.title}</span>
                    <button
                      type="button"
                      onClick={() => onCreateRoutine?.({ ...preset, requireApproval: true })}
                      className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-[#5B45F2] ring-1 ring-[#E4E3F7] hover:bg-violet-50"
                    >
                      + Aktifkan
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10.5px] text-[#8C8FA1]">
                    <Clock className="h-3 w-3" />
                    <span>{preset.scheduleLabel}</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#525568]">{preset.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {routines.map((rt) => (
              <div key={rt.id} className="rounded-xl border border-[#EAEAF2] bg-white p-3 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[#171821]">{rt.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#8C8FA1]">
                      <Clock className="h-3 w-3" />
                      <span>{rt.schedule_label}</span>
                      {rt.require_approval && (
                        <span className="rounded bg-[#F1F1F5] px-1.5 py-0.5 text-[10px] text-[#525568]">
                          Approval gate
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRoutine?.(rt.id, !rt.enabled)}
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition ${
                      rt.enabled
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {rt.enabled ? 'Active' : 'Paused'}
                  </button>
                </div>

                <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-[#525568]">{rt.prompt}</p>

                <div className="mt-2.5 flex items-center justify-between border-t border-[#F2F2F7] pt-2">
                  <button
                    type="button"
                    onClick={() => onRunRoutine?.(rt)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#F1F1F5] px-2.5 py-1 text-[11px] font-semibold text-[#171821] transition hover:bg-[#E5E5EE]"
                  >
                    <Play className="h-3 w-3" /> Run now
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRoutine?.(rt.id)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    title="Hapus routine"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
