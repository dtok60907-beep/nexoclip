'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  ExternalLink,
  FileSearch,
  Layers,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';

const DELIVERABLE_STATUS_LABELS = {
  idea: { label: 'Idea', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  scripted: { label: 'Scripted', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  producing: { label: 'Producing', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ready: { label: 'Ready', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  published: { label: 'Published', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

const PLATFORM_BADGE = {
  tiktok: 'bg-zinc-900 text-white',
  instagram: 'bg-gradient-to-r from-fuchsia-600 to-amber-500 text-white',
  youtube: 'bg-red-600 text-white',
  meta_ads: 'bg-blue-600 text-white',
  tiktok_shop: 'bg-teal-600 text-white',
};

const MEMORY_CATEGORY_LABELS = {
  preference: 'User Preference',
  creative_history: 'Creative History',
  feedback: 'Feedback Memory',
  performance: 'Performance Memory',
  audience_insight: 'Audience Insight',
};

function SectionTitle({ icon: Icon, children, right = null }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {Icon && <Icon className="h-3.5 w-3.5 text-violet-600" />}
        <span>{children}</span>
      </div>
      {right}
    </div>
  );
}

function ResearchReportPanel({ artifact, onPromptAction }) {
  const data = artifact?.data_json || {};
  const insights = Array.isArray(data.marketInsights) ? data.marketInsights : [];
  const hooks = Array.isArray(data.winningHooks) ? data.winningHooks : [];
  const opportunities = Array.isArray(data.creativeOpportunities) ? data.creativeOpportunities : [];
  const refs = Array.isArray(data.references) ? data.references : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-4">
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
          <FileSearch className="h-3 w-3" />
          Research Report
        </div>
        <h3 className="text-base font-semibold text-zinc-900">{artifact.title}</h3>
        {artifact.summary && <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{artifact.summary}</p>}
      </div>

      {opportunities.length > 0 && (
        <div>
          <SectionTitle icon={Sparkles}>Creative Opportunities</SectionTitle>
          <div className="space-y-2.5">
            {opportunities.map((opp, i) => (
              <div key={i} className="rounded-xl border border-zinc-200/90 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{opp.title}</div>
                    <div className="mt-0.5 text-xs font-medium text-violet-700">{opp.recommendedFormat}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onPromptAction?.(
                        `Buatkan campaign 7 hari berbasis opportunity "${opp.title}" (${opp.recommendedFormat}) dengan angle: ${opp.angle}`,
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    Jadikan Campaign
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-700">{opp.angle}</p>
                {opp.rationale && <p className="mt-1 text-xs text-zinc-500">{opp.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {hooks.length > 0 && (
        <div>
          <SectionTitle icon={Target}>Winning Hooks (0–3s)</SectionTitle>
          <div className="space-y-2">
            {hooks.map((h, i) => (
              <div key={i} className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                    {h.format}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-zinc-900">“{h.hook}”</p>
                {h.whyItWorks && <p className="mt-1 text-xs text-zinc-500">{h.whyItWorks}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <SectionTitle icon={Compass}>Market Insights</SectionTitle>
          <ul className="space-y-2 rounded-xl border border-zinc-200/80 bg-white p-3.5 text-xs leading-relaxed text-zinc-700">
            {insights.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {refs.length > 0 && (
        <div>
          <SectionTitle icon={Layers}>Referensi Real ({refs.length})</SectionTitle>
          <div className="grid grid-cols-1 gap-2.5">
            {refs.map((ref, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-zinc-200/80 bg-white p-3">
                {ref.thumbnailUrl ? (
                  <img
                    src={ref.thumbnailUrl}
                    alt={ref.title}
                    className="h-16 w-16 shrink-0 rounded-lg bg-zinc-100 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-xs font-bold uppercase text-violet-600">
                    {(ref.platform || 'ref').slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        PLATFORM_BADGE[ref.platform] || 'bg-zinc-800 text-white'
                      }`}
                    >
                      {String(ref.platform || 'social').replace('_', ' ')}
                    </span>
                    {ref.metric && (
                      <span className="truncate text-[11px] font-medium text-emerald-700">{ref.metric}</span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-zinc-900">{ref.title}</div>
                  {ref.hookExcerpt && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{ref.hookExcerpt}</p>
                  )}
                  {ref.url && (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline"
                    >
                      Buka sumber
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeStrategyPanel({ artifact, onPromptAction }) {
  const data = artifact?.data_json || {};
  const angles = Array.isArray(data.angles) ? data.angles : [];
  const painPoints = Array.isArray(data.painPoints) ? data.painPoints : [];
  const ctas = Array.isArray(data.ctaDirection) ? data.ctaDirection : [];
  const rules = Array.isArray(data.doAndDonts) ? data.doAndDonts : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-4">
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
          <Target className="h-3 w-3" />
          Creative Strategy
        </div>
        <h3 className="text-base font-semibold text-zinc-900">{artifact.title}</h3>
        {artifact.summary && <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{artifact.summary}</p>}
        <button
          type="button"
          onClick={() =>
            onPromptAction?.(
              `Berdasarkan Creative Strategy "${artifact.title}", buatkan Campaign Plan 7 hari lintas TikTok & Instagram lengkap dengan hook dan visual prompt untuk Canvas.`,
            )
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#5B45F2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4C38DC]"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Ubah Jadi Campaign 7 Hari
        </button>
      </div>

      {(data.corePositioning || data.targetAudience) && (
        <div className="grid grid-cols-1 gap-2.5">
          {data.corePositioning && (
            <div className="rounded-xl border border-zinc-200/80 bg-white p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Core Positioning</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-800">{data.corePositioning}</p>
            </div>
          )}
          {data.targetAudience && (
            <div className="rounded-xl border border-zinc-200/80 bg-white p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Target Audience</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-800">{data.targetAudience}</p>
            </div>
          )}
        </div>
      )}

      {painPoints.length > 0 && (
        <div>
          <SectionTitle>Customer Pain Points</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {painPoints.map((p, i) => (
              <span key={i} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {angles.length > 0 && (
        <div>
          <SectionTitle icon={Sparkles}>Marketing Angles ({angles.length})</SectionTitle>
          <div className="space-y-2.5">
            {angles.map((a, i) => (
              <div key={i} className="rounded-xl border border-zinc-200/90 bg-white p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">{a.name}</div>
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    {a.format}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-700">{a.promise}</p>
                {a.proof && <p className="mt-1 text-xs text-zinc-500">Visual proof: {a.proof}</p>}
                {a.sampleHook && (
                  <div className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-2 text-xs font-medium text-zinc-900">
                    Hook: “{a.sampleHook}”
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ctas.length > 0 && (
        <div>
          <SectionTitle>CTA Direction</SectionTitle>
          <div className="space-y-1.5">
            {ctas.map((c, i) => (
              <div key={i} className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2 text-xs text-zinc-700">
                {c}
              </div>
            ))}
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div>
          <SectionTitle>Brand Guardrails</SectionTitle>
          <ul className="space-y-1.5 rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 text-xs text-zinc-700">
            {rules.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CampaignPanel({ campaign, onOpenInCanvas, openingDeliverableId, onUpdateDeliverableStatus }) {
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const deliverables = Array.isArray(campaign?.deliverables) ? campaign.deliverables : [];

  const copyPrompt = async (d) => {
    const text = d.script_json?.visualPrompt || d.hook || d.title;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(d.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {}
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
            <CalendarDays className="h-3 w-3" />
            Campaign · {campaign.duration_days} hari
          </div>
          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[11px] font-medium capitalize text-zinc-600">
            {campaign.status || 'draft'}
          </span>
        </div>
        <h3 className="mt-2 text-base font-semibold text-zinc-900">{campaign.title}</h3>
        {campaign.objective && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{campaign.objective}</p>}
        {Array.isArray(campaign.platforms) && campaign.platforms.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {campaign.platforms.map((p) => (
              <span
                key={p}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  PLATFORM_BADGE[p] || 'bg-zinc-800 text-white'
                }`}
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <SectionTitle icon={Layers}>Deliverables ({deliverables.length})</SectionTitle>
        {deliverables.map((d) => {
          const isOpen = expandedId === d.id;
          const st = DELIVERABLE_STATUS_LABELS[d.status] || DELIVERABLE_STATUS_LABELS.idea;
          const isBusy = openingDeliverableId === d.id;
          return (
            <div
              key={d.id}
              className="rounded-xl border border-zinc-200/90 bg-white p-3.5 transition hover:border-violet-300/80"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Day {d.day_index}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        PLATFORM_BADGE[d.platform] || 'bg-zinc-800 text-white'
                      }`}
                    >
                      {d.platform}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-500">{d.format}</span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-zinc-900">{d.title}</div>
                </div>
                <select
                  aria-label="Deliverable status"
                  value={d.status || 'idea'}
                  onChange={(e) => onUpdateDeliverableStatus?.(d.id, e.target.value)}
                  className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium outline-none ${st.cls}`}
                >
                  {Object.entries(DELIVERABLE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {d.hook && (
                <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800">
                  <span className="font-semibold text-violet-700">Hook: </span>“{d.hook}”
                </p>
              )}
              {d.angle && <p className="mt-1.5 text-xs text-zinc-600">{d.angle}</p>}

              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-zinc-100 pt-2.5 text-xs">
                  {d.script_json?.visualPrompt && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        Visual Prompt (Canvas)
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap rounded-lg bg-violet-50/50 p-2 text-zinc-700">
                        {d.script_json.visualPrompt}
                      </p>
                    </div>
                  )}
                  {d.script_json?.voiceover && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Voiceover / Script</div>
                      <p className="mt-0.5 whitespace-pre-wrap text-zinc-700">{d.script_json.voiceover}</p>
                    </div>
                  )}
                  {d.cta && (
                    <div className="text-zinc-600">
                      <span className="font-semibold text-zinc-800">CTA:</span> {d.cta}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : d.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                >
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {isOpen ? 'Tutup script' : 'Lihat script & prompt'}
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyPrompt(d)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50"
                  >
                    {copiedId === d.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copiedId === d.id ? 'Tersalin' : 'Copy Prompt'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onOpenInCanvas?.(d)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B45F2] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#4C38DC] disabled:opacity-60"
                  >
                    <Workflow className="h-3.5 w-3.5" />
                    {isBusy ? 'Membuka...' : d.canvas_project_id ? 'Lanjut di Canvas' : 'Open in Canvas'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrandMemoryPanel({ memories = [], onAddMemory, onDeleteMemory }) {
  const [category, setCategory] = useState('preference');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      await onAddMemory?.({ category, content: content.trim() });
      setContent('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-4">
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
          <Brain className="h-3 w-3" />
          Brand Memory
        </div>
        <h3 className="text-base font-semibold text-zinc-900">Yang Dipelajari AI dari Brand Kamu</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          Preferensi, feedback, dan pola kreatif yang tersimpan di sini otomatis dipakai AI di setiap riset & campaign berikutnya.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-800">Tambah aturan / preferensi baru</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 outline-none"
          >
            {Object.entries(MEMORY_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder='Contoh: "Jangan pakai avatar kaku; lebih suka hook pertanyaan santai pakai sapaan kamu"'
          className="w-full resize-none rounded-lg border border-zinc-200 px-2.5 py-2 text-xs text-zinc-900 outline-none focus:border-violet-400"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!content.trim() || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-[#5B45F2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4C38DC] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Menyimpan...' : 'Simpan Memory'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {memories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
            Belum ada Brand Memory. Ceritakan preferensimu di chat atau tambahkan langsung di atas.
          </div>
        ) : (
          memories.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3">
              <div className="min-w-0">
                <span className="inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                  {MEMORY_CATEGORY_LABELS[m.category] || m.category}
                </span>
                <p className="mt-1 text-xs leading-relaxed text-zinc-800">{m.content}</p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteMemory?.(m.id)}
                className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                title="Hapus memory"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ArtifactViewer({
  panel,
  memories,
  onClose,
  onPromptAction,
  onOpenInCanvas,
  openingDeliverableId,
  onUpdateDeliverableStatus,
  onAddMemory,
  onDeleteMemory,
}) {
  if (!panel) return null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-zinc-200/90 bg-[#FAFAFC]">
      <div className="flex items-center justify-between border-b border-zinc-200/80 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">
            {panel.kind === 'campaign'
              ? 'Persistent Campaign'
              : panel.kind === 'memory'
                ? 'Brand Intelligence'
                : 'Persistent Artifact'}
          </div>
          <div className="truncate text-sm font-semibold text-zinc-900">
            {panel.kind === 'memory'
              ? 'Brand Memory'
              : panel.data?.title || 'Artifact'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          title="Tutup panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {panel.kind === 'memory' && (
          <BrandMemoryPanel memories={memories} onAddMemory={onAddMemory} onDeleteMemory={onDeleteMemory} />
        )}
        {panel.kind === 'campaign' && panel.data && (
          <CampaignPanel
            campaign={panel.data}
            onOpenInCanvas={onOpenInCanvas}
            openingDeliverableId={openingDeliverableId}
            onUpdateDeliverableStatus={onUpdateDeliverableStatus}
          />
        )}
        {panel.kind === 'artifact' && panel.data?.type === 'research_report' && (
          <ResearchReportPanel artifact={panel.data} onPromptAction={onPromptAction} />
        )}
        {panel.kind === 'artifact' && panel.data?.type === 'creative_strategy' && (
          <CreativeStrategyPanel artifact={panel.data} onPromptAction={onPromptAction} />
        )}
        {panel.kind === 'artifact' &&
          panel.data &&
          panel.data.type !== 'research_report' &&
          panel.data.type !== 'creative_strategy' && (
            <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
              {JSON.stringify(panel.data.data_json || panel.data, null, 2)}
            </pre>
          )}
      </div>
    </aside>
  );
}
