'use client';

import { useState } from 'react';
import { formatCredits, resolutionLabel, useModelPrices, usePublicPlans } from './publicPricing';

const rupiah = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v) || 0);

// Durations offered at a resolution (Seedance 2.5 goes to 30 s, but 4K only to 16 s).
const durationsAt = (m, resolution) => m.durations.filter((d) => d <= (m.maxSeconds?.[resolution] ?? Infinity));

// Keep the chosen options when they exist on the new model, otherwise take its defaults.
function forModel(data, kind, id, prev) {
  if (kind === 'image') {
    const m = data.image.find((x) => x.id === id) || data.image[0];
    return { ...prev, kind, model: m.id, resolution: m.resolutions.includes(prev.resolution) ? prev.resolution : (m.resolutions[0] ?? '') };
  }
  const m = data.video.find((x) => x.id === id) || data.video[0];
  const resolution = m.resolutions.includes(prev.resolution) ? prev.resolution : (m.resolutions.includes('720p') ? '720p' : (m.resolutions[0] ?? ''));
  const ds = durationsAt(m, resolution);
  const duration = ds.includes(prev.duration) ? prev.duration : (ds.includes(5) ? 5 : ds[0]);
  return { ...prev, kind, model: m.id, resolution, duration, audio: true };
}

function unitCredits(data, d) {
  if (d.kind === 'image') return data.image.find((m) => m.id === d.model)?.prices[d.resolution] ?? 0;
  return data.video.find((m) => m.id === d.model)?.prices[`${d.resolution}|${d.duration}|${d.audio ? 1 : 0}`] ?? 0;
}

function describe(data, d) {
  if (d.kind === 'image') return [data.image.find((m) => m.id === d.model)?.name, d.resolution].filter(Boolean).join(' · ');
  const m = data.video.find((x) => x.id === d.model);
  return [m?.name, d.resolution && resolutionLabel(d.resolution), `${d.duration}s`, m?.audio && (d.audio ? 'audio' : 'no audio')].filter(Boolean).join(' · ');
}

const chip = (on) => `rounded-full border px-3.5 py-1.5 text-sm transition ${on ? 'border-[#d4ff64] bg-[#d4ff64]/10 text-[#d4ff64]' : 'border-white/10 text-white/70 hover:border-white/30'}`;
const fieldLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[.14em] text-white/40';

// How many credits a mix of generations needs per month, and which plan covers it. Prices
// are the app's own (the same engine as the Generate button).
export default function CreditCalculator({ onChoosePlan }) {
  const data = useModelPrices();
  const publicPlans = usePublicPlans();
  const [draft, setDraft] = useState(null);
  const [items, setItems] = useState([]);
  const [nextKey, setNextKey] = useState(1);

  if (!data) return <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((k) => <div key={k} className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[.03]" />)}</div>;
  const current = draft || forModel(data, 'video', 'seedance-2.5', { kind: 'video', model: '', resolution: '720p', duration: 5, audio: true, quantity: 1 });
  const set = (patch) => setDraft({ ...current, ...patch });
  const video = current.kind === 'video' ? data.video.find((m) => m.id === current.model) : null;
  const image = current.kind === 'image' ? data.image.find((m) => m.id === current.model) : null;
  const resolutions = (video || image)?.resolutions || [];
  const durations = video ? durationsAt(video, current.resolution) : [];

  const unit = unitCredits(data, current);
  const counted = items.length ? items : [{ ...current, key: 0 }];
  const total = counted.reduce((sum, i) => sum + unitCredits(data, i) * i.quantity, 0);
  const monthly = (publicPlans?.plans || []).filter((p) => p.interval === 'monthly');
  const fit = monthly.find((p) => p.monthlyCredits >= total);

  return <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
    <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="mb-5 inline-flex rounded-full border border-white/10 p-1 text-sm font-semibold">
        {[['video', 'Video', 'seedance-2.5'], ['image', 'Image', 'nano-banana-2']].map(([kind, label, model]) => (
          <button key={kind} type="button" onClick={() => setDraft(forModel(data, kind, model, current))} className={`rounded-full px-4 py-1.5 ${current.kind === kind ? 'bg-[#d4ff64] text-black' : 'text-white/60'}`}>{label}</button>
        ))}
      </div>

      <label className="mb-4 block">
        <span className={fieldLabel}>Model</span>
        <select value={current.model} onChange={(e) => setDraft(forModel(data, current.kind, e.target.value, current))} className="w-full rounded-xl border border-white/10 bg-[#191d1a] px-3 py-2.5 text-sm text-white">
          {(current.kind === 'video' ? data.video : data.image).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      {resolutions.length > 0 && <div className="mb-4">
        <span className={fieldLabel}>Resolution</span>
        <div className="flex flex-wrap gap-1.5">
          {resolutions.map((r) => <button key={r} type="button" className={chip(current.resolution === r)} onClick={() => {
            if (!video) return set({ resolution: r });
            const ds = durationsAt(video, r);
            set({ resolution: r, duration: ds.includes(current.duration) ? current.duration : ds[ds.length - 1] });
          }}>{resolutionLabel(r)}</button>)}
        </div>
      </div>}

      {video && <div className="mb-4">
        <span className={fieldLabel}>Duration</span>
        {durations.length > 4
          ? <div className="flex items-center gap-3">
            <input type="range" min={durations[0]} max={durations[durations.length - 1]} step={1} value={current.duration} onChange={(e) => set({ duration: Number(e.target.value) })} className="flex-1 accent-[#d4ff64]" aria-label="Duration in seconds" />
            <strong className="w-20 text-right text-sm">{current.duration} seconds</strong>
          </div>
          : <div className="flex flex-wrap gap-1.5">{durations.map((d) => <button key={d} type="button" className={chip(current.duration === d)} onClick={() => set({ duration: d })}>{d} seconds</button>)}</div>}
      </div>}

      {video?.audio && <div className="mb-4">
        <span className={fieldLabel}>Audio</span>
        <div className="flex gap-1.5">
          <button type="button" className={chip(current.audio)} onClick={() => set({ audio: true })}>With audio</button>
          <button type="button" className={chip(!current.audio)} onClick={() => set({ audio: false })}>No audio</button>
        </div>
      </div>}

      <div className="mb-4">
        <span className={fieldLabel}>How many {current.kind === 'video' ? 'videos' : 'images'}</span>
        <div className="inline-flex items-center rounded-full border border-white/10">
          <button type="button" aria-label="Fewer" className="h-9 w-9 text-lg" onClick={() => set({ quantity: Math.max(1, current.quantity - 1) })}>−</button>
          <input type="number" min={1} max={9999} value={current.quantity} onChange={(e) => set({ quantity: Math.min(9999, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} className="w-14 bg-transparent text-center font-bold [appearance:textfield]" aria-label="Quantity" />
          <button type="button" aria-label="More" className="h-9 w-9 text-lg" onClick={() => set({ quantity: Math.min(9999, current.quantity + 1) })}>+</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
        <div>
          <p className="text-xs text-white/45">{formatCredits(unit)} credits × {current.quantity}</p>
          <p className="text-3xl font-bold">{formatCredits(unit * current.quantity)} <span className="text-sm font-medium text-white/45">credits</span></p>
        </div>
        <button type="button" onClick={() => { setItems([...items, { ...current, key: nextKey }]); setNextKey(nextKey + 1); }} className="rounded-full bg-[#d4ff64] px-4 py-2 text-sm font-bold text-black hover:bg-[#e0ff8c]">+ Add to monthly plan</button>
      </div>
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <p className={fieldLabel}>Monthly plan</p>
      {items.length
        ? <ul className="space-y-1.5">{items.map((i) => <li key={i.key} className="flex items-center gap-2 rounded-xl bg-white/[.05] px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-white/75"><b className="text-white">{i.quantity}×</b> {describe(data, i)}</span>
          <b>{formatCredits(unitCredits(data, i) * i.quantity)}</b>
          <button type="button" aria-label="Remove" className="px-1 text-white/40 hover:text-white" onClick={() => setItems(items.filter((x) => x.key !== i.key))}>×</button>
        </li>)}</ul>
        : <p className="text-sm text-white/45">Set a model on the left, then press <em>Add to monthly plan</em> to combine videos and images. Counting now: {current.quantity}× {describe(data, current)}.</p>}

      <div className="my-4 flex items-baseline justify-between border-y border-white/10 py-3">
        <span className="text-sm text-white/55">Total per month</span>
        <strong className="text-2xl text-[#d4ff64]">{formatCredits(total)} credits</strong>
      </div>

      <div className="space-y-2">
        {monthly.map((p) => {
          const share = Math.min(100, (total / p.monthlyCredits) * 100);
          const over = total > p.monthlyCredits;
          return <div key={p.code} className={`rounded-xl border px-3.5 py-3 ${p === fit ? 'border-[#d4ff64]/60 bg-[#d4ff64]/[.05]' : 'border-white/10'}`}>
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><b>{p.name}</b><span className="text-white/45">{rupiah(p.priceIdr)} · {formatCredits(p.monthlyCredits)} credits</span></div>
            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${over ? 'bg-white/30' : 'bg-[#d4ff64]'}`} style={{ width: `${share}%` }} /></div>
            <p className={`text-xs ${over ? 'text-orange-200' : 'text-white/45'}`}>{over ? `${formatCredits(total - p.monthlyCredits)} credits short` : `${Math.round(share)}% used, ${formatCredits(p.monthlyCredits - total)} credits left`}</p>
          </div>;
        })}
      </div>

      <p className="mt-4 text-sm text-white/70">
        {fit ? <>Enough: <b className="text-[#d4ff64]">{fit.name}</b> ({rupiah(fit.priceIdr)}/month). {onChoosePlan && <button type="button" className="font-semibold text-[#d4ff64] underline-offset-2 hover:underline" onClick={onChoosePlan}>See plans</button>}</>
          : 'More than the Pro plan: take Pro and add top-ups, or ask us about Enterprise.'}
      </p>
      <p className="mt-2 text-xs text-white/40">Estimate without reference images or videos. The exact cost shows on the Generate button before any credits are used, and failed generations are refunded.</p>
    </div>
  </div>;
}
