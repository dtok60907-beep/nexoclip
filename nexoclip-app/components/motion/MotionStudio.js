'use client';

// Motion studio: pick a motion graphics style, write the scenes (or let the AI director write them from a brief),
// watch it play. The preview is the real Remotion composition (MotionScene) in @remotion/player; rendering to MP4
// is not wired yet.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, Thumbnail } from '@remotion/player';
import MotionScene from './MotionScene';
import AudioPanel from './AudioPanel';
import LottiePicker from './LottiePicker';
import { CUSTOM_ID, DEFAULT_CUSTOM, FAMILIES, FONTS, STYLES, resolveStyle } from './styles';
import { ENTRANCES, EXITS, LOOPS } from './animations';
import { CAMERAS, KINDS, LAYER_TYPES, LAYOUTS, LOTTIE_SIZES, MAX_BARS, MAX_ITEMS, MAX_MESSAGES, MAX_POINTS, SCENE_LIMITS, TRANSITIONS, cleanAudio, cleanLayer, formatRupiah } from './sceneKinds';

const FPS = 30;
const FORMATS = [
  { id: '9:16', label: '9:16', note: 'Reels / TikTok', w: 1080, h: 1920 },
  { id: '1:1', label: '1:1', note: 'Feed', w: 1080, h: 1080 },
  { id: '16:9', label: '16:9', note: 'YouTube', w: 1920, h: 1080 },
];
const LIMITS = { ...SCENE_LIMITS, scenes: SCENE_LIMITS.max };
const STORAGE_KEY = 'nexoclip_motion_draft_v2';
const DEFAULT_DRAFT = {
  styleId: 'auto',
  format: '9:16',
  scenes: [{ kind: 'text', title: 'Konten jadi dalam hitungan detik', subtitle: 'Motion graphic siap posting untuk brand kamu', cta: 'Coba sekarang', vo: '', seconds: 6 }],
  custom: DEFAULT_CUSTOM,
  audio: cleanAudio({}),
  chat: [],
};
const EXAMPLES = [
  'Promo diskon 50% kedai kopi, akhir pekan ini saja',
  'Teaser peluncuran aplikasi keuangan untuk anak muda',
  '3 tips merawat kulit untuk reels edukasi',
];

function loadDraft() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved?.scenes?.length) return DEFAULT_DRAFT;
    return { ...DEFAULT_DRAFT, ...saved, scenes: saved.scenes.map((scene) => ({ vo: '', ...scene })), audio: cleanAudio(saved.audio, { loose: true }), custom: { ...DEFAULT_CUSTOM, ...saved.custom }, chat: Array.isArray(saved.chat) ? saved.chat.slice(-30) : [] };
  } catch {
    return DEFAULT_DRAFT;
  }
}

// The largest box of the given ratio that fits in the element.
function useFit(ratio) {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width / height > ratio) setSize({ width: height * ratio, height });
      else setSize({ width, height: width / ratio });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ratio]);
  return [ref, size];
}

const CHAT_WIDTH_KEY = 'motion_chat_width';
const CHAT_WIDTH_DEFAULT = 360;
const CHAT_WIDTH_MIN = 300;
const CHAT_WIDTH_MAX = 680;

/** Chat column width: draggable, remembered per browser (as in the AI Director). */
function useChatWidth() {
  const [width, setWidth] = useState(CHAT_WIDTH_DEFAULT);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
      if (saved) setWidth(Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, saved)));
    } catch { /* storage unavailable */ }
  }, []);
  const save = (value) => {
    try { window.localStorage.setItem(CHAT_WIDTH_KEY, String(value)); } catch { /* storage unavailable */ }
  };
  const startDrag = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    const move = (e) => {
      latest = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, startWidth + e.clientX - startX));
      setWidth(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      save(latest);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () => { setWidth(CHAT_WIDTH_DEFAULT); save(CHAT_WIDTH_DEFAULT); };
  return { width, startDrag, reset };
}

const requestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const formatCredits = (value) => Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });

const PREVIEW_PROPS = { title: 'Judul kamu', subtitle: 'Subjudul singkat', cta: 'Mulai' };

function StyleCard({ item, active, onSelect }) {
  const resolved = resolveStyle(item.id);
  return (
    <button type="button" onClick={() => onSelect(item.id)} aria-pressed={active} aria-label={item.name}
      className={`group relative flex w-[104px] shrink-0 flex-col gap-2 rounded-2xl p-1.5 text-left transition lg:w-auto ${active ? 'bg-[#d4ff64]/10 ring-2 ring-[#d4ff64]' : 'hover:bg-white/[0.04] ring-1 ring-white/[0.06]'}`}>
      <div aria-hidden="true" className="relative aspect-square w-full overflow-hidden rounded-xl" style={{ background: resolved.palette.bg }}>
        <Thumbnail component={MotionScene} compositionWidth={1080} compositionHeight={1080} frameToDisplay={FPS * 3}
          durationInFrames={FPS * 8} fps={FPS} inputProps={{ ...PREVIEW_PROPS, style: resolved }}
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
        {item.id === 'auto' && <span className="absolute left-2 top-2 rounded-full bg-[#d4ff64] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Auto</span>}
      </div>
      <span className={`px-1 pb-0.5 text-[13px] font-semibold leading-tight ${active ? 'text-[#d4ff64]' : 'text-[#f2eee5]'}`}>{item.name}</span>
    </button>
  );
}

function CustomCard({ active, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(CUSTOM_ID)} aria-pressed={active} aria-label="Buat gaya sendiri"
      className={`flex w-[104px] shrink-0 flex-col gap-2 rounded-2xl p-1.5 text-left transition lg:w-auto ${active ? 'bg-[#d4ff64]/10 ring-2 ring-[#d4ff64]' : 'hover:bg-white/[0.04] ring-1 ring-white/[0.06]'}`}>
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-white/60">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span className="text-[11px]">Atur sendiri</span>
      </div>
      <span className={`px-1 pb-0.5 text-[13px] font-semibold leading-tight ${active ? 'text-[#d4ff64]' : 'text-[#f2eee5]'}`}>Buat gaya sendiri</span>
    </button>
  );
}

function Field({ label, value, onChange, max, multiline }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[12px] font-medium text-white/50">
        {label}
        <span className="font-mono text-[11px] text-white/30">{value.length}/{max}</span>
      </span>
      <Tag value={value} maxLength={max} rows={multiline ? 2 : undefined} onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[14px] text-[#f2eee5] outline-none transition placeholder:text-white/25 focus:border-[#d4ff64]/60 focus:bg-white/[0.05]" />
    </label>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)} title={option.note}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${value === option.id ? 'bg-[#d4ff64] text-black' : 'text-white/60 hover:text-white'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SparkIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
      <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" opacity=".6" />
    </svg>
  );
}

// The AI director chat: a brief in, a plan (style + scenes) applied to the preview.
function DirectorChat({ chat, busy, busyLabel, onSend }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.length, busy]);
  const send = (value = text) => {
    if (!value.trim() || busy) return;
    onSend(value.trim());
    setText('');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={listRef} className="flex min-h-[180px] flex-1 flex-col gap-2.5 overflow-y-auto pr-1 lg:min-h-0">
        {!chat.length && (
          <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-[#d4ff64]/[0.09] to-transparent p-4 ring-1 ring-[#d4ff64]/15">
            <div className="flex items-center gap-2 text-[#d4ff64]"><SparkIcon /><span className="text-[13px] font-bold">AI Motion Director</span></div>
            <p className="text-[13px] leading-relaxed text-white/65">Ceritakan video yang kamu mau. AI memilih gaya, menyusun adegan, dan menulis teksnya. Setelah itu kamu bisa minta revisi lewat chat.</p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => send(example)} disabled={busy}
                  className="rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[12px] text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white">
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((message, index) => (
          message.role === 'user' ? (
            <div key={index} className="ml-8 self-end rounded-2xl rounded-br-md bg-[#d4ff64] px-3.5 py-2 text-[13px] font-medium leading-snug text-black">{message.content}</div>
          ) : (
            <div key={index} className={`mr-6 flex flex-col gap-1 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-snug ring-1 ${message.error ? 'bg-red-500/10 text-red-200 ring-red-500/20' : 'bg-white/[0.04] text-[#f2eee5] ring-white/[0.06]'}`}>
              <span>{message.content}</span>
              {message.plan && (
                <span className="text-[11px] text-white/40">
                  {message.plan.skills?.length > 0 && <>Skill: {message.plan.skills.join(', ')} · </>}
                  {resolveStyle(message.plan.styleId).name} · {message.plan.scenes.length} adegan · {message.plan.scenes.reduce((sum, scene) => sum + scene.seconds, 0)} dtk
                  {message.credits > 0 && <> · {formatCredits(message.credits)} kredit</>}
                </span>
              )}
            </div>
          )
        ))}
        {busy && (
          <div className="mr-6 flex items-center gap-2 self-start rounded-2xl rounded-bl-md bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white/55 ring-1 ring-white/[0.06]">
            <span className="flex gap-1">{[0, 1, 2].map((dot) => <i key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d4ff64]" style={{ animationDelay: `${dot * 120}ms` }} />)}</span>
            {busyLabel || 'Menyusun adegan…'}
          </div>
        )}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.08] focus-within:ring-[#d4ff64]/50">
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={2000}
          placeholder={chat.length ? 'Minta revisi, mis. "lebih ceria, tambah adegan harga"' : 'Contoh: video promo buka cabang baru, gaya ceria, 3 adegan'}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}
          className="w-full resize-none bg-transparent px-2 py-1 text-[13px] text-[#f2eee5] outline-none placeholder:text-white/30" />
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] text-white/35">Seed · dihitung per token, biasanya di bawah 1 kredit</span>
          <button type="submit" disabled={busy || !text.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-[#d4ff64] px-3.5 py-2 text-[12px] font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-40">
            <SparkIcon size={13} /> {chat.length ? 'Kirim' : 'Buat'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Select({ label, value, onChange, options, empty }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-white/40">{label}</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value || undefined)}
        className="w-full rounded-lg border border-white/[0.08] bg-[#15161a] px-2 py-1.5 text-[12px] text-[#f2eee5] outline-none focus:border-[#d4ff64]/60">
        {empty && <option value="">{empty}</option>}
        {Object.entries(options).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
      </select>
    </label>
  );
}

// The fields of one layer, by type (LAYER_TYPES in sceneKinds.js).
function LayerFields({ layer, onChange }) {
  const spec = LAYER_TYPES[layer.type];
  const set = (patch) => onChange({ ...layer, ...patch });
  const fields = spec.fields;
  return (
    <>
      {'src' in fields && <LottiePicker src={layer.src} onChange={(src) => set({ src })} />}
      {'size' in fields && <Segmented label="Ukuran animasi" value={layer.size || 'm'} onChange={(size) => set({ size })} options={Object.entries(LOTTIE_SIZES).map(([id, size]) => ({ id, label: size.label }))} />}
      {'text' in fields && <Field label={layer.type === 'lottie' ? 'Keterangan (opsional)' : layer.type === 'quote' ? 'Kutipan' : layer.type === 'chat' ? 'Nama kontak' : ['number', 'timer', 'progress', 'bars', 'line'].includes(layer.type) ? 'Keterangan' : 'Teks'} value={layer.text || ''} max={fields.text} multiline={fields.text > 60} onChange={(text) => set({ text })} />}
      {'value' in fields && <Field label={layer.type === 'timer' ? 'Waktu (02:00:00, 15:00 atau 3)' : layer.type === 'progress' ? 'Persen (0-100)' : layer.type === 'line' ? 'Label titik akhir (mis. +200%)' : 'Angka (10.000+, 87%, 4,8)'} value={layer.value || ''} max={fields.value} onChange={(value) => set({ value })} />}
      {'items' in fields && (
        <div className="flex flex-col gap-1.5">
          {(layer.items || []).map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <span className="w-4 text-center font-mono text-[11px] text-white/35">{index + 1}</span>
              <input value={item} maxLength={fields.items} aria-label={`Poin ${index + 1}`} onChange={(event) => set({ items: layer.items.map((x, i) => (i === index ? event.target.value : x)) })}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-[#f2eee5] outline-none focus:border-[#d4ff64]/60" />
              <button type="button" aria-label={`Hapus poin ${index + 1}`} onClick={() => set({ items: layer.items.filter((_, i) => i !== index) })} className="h-6 w-6 rounded-md text-white/35 hover:text-red-300">×</button>
            </div>
          ))}
          {(layer.items || []).length < MAX_ITEMS && <button type="button" onClick={() => set({ items: [...(layer.items || []), ''] })} className="self-start text-[12px] font-semibold text-white/50 hover:text-[#d4ff64]">+ Poin</button>}
        </div>
      )}
      {'was' in fields && (
        <div className="flex gap-2">
          {[['was', 'Harga lama'], ['now', 'Harga baru']].map(([key, label]) => (
            <label key={key} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[12px] font-medium text-white/50">{label}</span>
              <input inputMode="numeric" value={layer[key] ? formatRupiah(layer[key]) : ''} placeholder="Rp0" onChange={(event) => set({ [key]: Number(event.target.value.replace(/[^\d]/g, '')) || 0 })}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[14px] text-[#f2eee5] outline-none focus:border-[#d4ff64]/60" />
            </label>
          ))}
        </div>
      )}
      {'values' in fields && <Field label={`Nilai ${layer.type === 'line' ? 'titik' : 'batang'}, pisahkan koma (maks. ${layer.type === 'line' ? MAX_POINTS : MAX_BARS})`} value={(layer.values || []).join(', ')} max={80}
        onChange={(value) => set({ values: value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, layer.type === 'line' ? MAX_POINTS : MAX_BARS).map((v) => Number(v.replace(/[^\d.]/g, '')) || 0) })} />}
      {'messages' in fields && (
        <div className="flex flex-col gap-1.5">
          {(layer.messages || []).map((message, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <button type="button" onClick={() => set({ messages: layer.messages.map((m, i) => (i === index ? { ...m, from: m.from === 'me' ? 'them' : 'me' } : m)) })}
                className={`w-14 shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold ${message.from === 'me' ? 'bg-[#d4ff64]/20 text-[#d4ff64]' : 'bg-white/[0.06] text-white/60'}`}
                aria-label={`Pengirim pesan ${index + 1}`}>{message.from === 'me' ? 'Saya' : 'Dia'}</button>
              <input value={message.text} maxLength={fields.messages} aria-label={`Pesan ${index + 1}`} onChange={(event) => set({ messages: layer.messages.map((m, i) => (i === index ? { ...m, text: event.target.value } : m)) })}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-[#f2eee5] outline-none focus:border-[#d4ff64]/60" />
              <button type="button" aria-label={`Hapus pesan ${index + 1}`} onClick={() => set({ messages: layer.messages.filter((_, i) => i !== index) })} className="h-6 w-6 rounded-md text-white/35 hover:text-red-300">×</button>
            </div>
          ))}
          {(layer.messages || []).length < MAX_MESSAGES && <button type="button" onClick={() => set({ messages: [...(layer.messages || []), { from: (layer.messages || []).at(-1)?.from === 'me' ? 'them' : 'me', text: '' }] })} className="self-start text-[12px] font-semibold text-white/50 hover:text-[#d4ff64]">+ Pesan</button>}
        </div>
      )}
      {'author' in fields && (
        <div className="flex gap-2">
          <Field label="Nama" value={layer.author || ''} max={fields.author} onChange={(author) => set({ author })} />
          <Field label="Keterangan" value={layer.role || ''} max={fields.role} onChange={(role) => set({ role })} />
        </div>
      )}
      {'rating' in fields && <Segmented label="Bintang" value={String(layer.rating || 0)} onChange={(rating) => set({ rating: Number(rating) })}
        options={['0', '1', '2', '3', '4', '5'].map((id) => ({ id, label: id === '0' ? 'Tanpa' : `${id}★` }))} />}
      <div className="flex gap-1.5">
        <Select label="Masuk" value={layer.entrance} options={ENTRANCES} onChange={(entrance) => set({ entrance: entrance || spec.entrance })} />
        <Select label="Efek" value={layer.loop} options={LOOPS} empty="Tanpa" onChange={(loop) => set({ loop })} />
        <Select label="Keluar" value={layer.exit} options={EXITS} empty="Ikut adegan" onChange={(exit) => set({ exit })} />
      </div>
    </>
  );
}

const NEW_LAYER = {
  kicker: { text: 'LABEL' }, heading: { text: 'Judul baru' }, text: { text: 'Kalimat pendukung' }, number: { value: '100+', text: 'Keterangan' },
  list: { items: ['Poin pertama', 'Poin kedua', 'Poin ketiga'] }, price: { was: 50000, now: 35000 }, code: { text: 'HEMAT' },
  timer: { value: '00:15:00', text: 'Berakhir dalam' }, quote: { text: 'Kutipan pelanggan', author: 'Nama', role: '', rating: 5 },
  button: { text: 'Pesan sekarang' }, badge: { text: 'BARU' }, progress: { value: '80', text: 'Keterangan' }, bars: { values: [3, 5, 4, 8], text: 'Keterangan' },
  line: { values: [2, 3, 2.5, 5, 7], value: '+250%', text: 'Keterangan' }, flow: { items: ['Langkah satu', 'Langkah dua', 'Langkah tiga'] },
  lottie: { src: 'noto:rocket', size: 'm', text: '' },
  chat: { text: 'Rina', messages: [{ from: 'them', text: 'Kamu di mana?' }, { from: 'me', text: 'Lagi ngopi nih' }] },
};
const newLayer = (type) => cleanLayer({ type, ...NEW_LAYER[type] }, { loose: true });

function LayerEditor({ layers, onChange }) {
  const [adding, setAdding] = useState('heading');
  const update = (index, layer) => onChange(layers.map((item, i) => (i === index ? layer : item)));
  const move = (index, by) => {
    const next = [...layers];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {layers.map((layer, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl bg-black/20 p-2.5 ring-1 ring-white/[0.05]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#d4ff64]/80">{LAYER_TYPES[layer.type].label}</span>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label="Naikkan layer" disabled={index === 0} onClick={() => move(index, -1)} className="h-6 w-6 rounded-md text-white/45 hover:text-white disabled:opacity-25">↑</button>
              <button type="button" aria-label="Turunkan layer" disabled={index === layers.length - 1} onClick={() => move(index, 1)} className="h-6 w-6 rounded-md text-white/45 hover:text-white disabled:opacity-25">↓</button>
              <button type="button" aria-label="Hapus layer" onClick={() => onChange(layers.filter((_, i) => i !== index))} className="h-6 w-6 rounded-md text-white/35 hover:bg-red-500/15 hover:text-red-300">×</button>
            </div>
          </div>
          <LayerFields layer={layer} onChange={(next) => update(index, next)} />
        </div>
      ))}
      {layers.length < SCENE_LIMITS.layers && (
        <div className="flex gap-1.5">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Jenis layer baru"
            className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#15161a] px-2 py-1.5 text-[12px] text-[#f2eee5] outline-none">
            {Object.entries(LAYER_TYPES).map(([id, type]) => <option key={id} value={id}>{type.label}</option>)}
          </select>
          <button type="button" onClick={() => onChange([...layers, newLayer(adding)])} className="rounded-lg bg-white/[0.06] px-3 text-[12px] font-semibold text-white/70 hover:text-[#d4ff64]">+ Layer</button>
        </div>
      )}
    </div>
  );
}

// Switching a scene between kinds carries its words across.
function switchKind(scene, kind) {
  if (kind === scene.kind) return scene;
  if (kind === 'layers') {
    const layers = scene.layers?.length ? scene.layers : [
      scene.title && newLayer('heading'), scene.subtitle && newLayer('text'), scene.cta && newLayer('button'),
    ].filter(Boolean).map((layer) => ({ ...layer, text: layer.type === 'heading' ? scene.title : layer.type === 'text' ? scene.subtitle : scene.cta }));
    return { ...scene, kind, layers: layers.length ? layers : [newLayer('heading')] };
  }
  const heading = scene.layers?.find((layer) => layer.type === 'heading')?.text;
  return { ...scene, kind, title: scene.title || heading || sceneLabel(scene) || 'Judul' };
}

const sceneLabel = (scene) => (scene.kind === 'layers'
  ? (scene.layers?.find((layer) => layer.text || layer.value)?.text || scene.layers?.find((layer) => layer.value)?.value || LAYER_TYPES[scene.layers?.[0]?.type]?.label || '')
  : scene.title);

// A long video (more than COLLAPSE_AFTER scenes) shows one scene's fields at a time; the others are one line each.
const COLLAPSE_AFTER = 12;

function SceneEditor({ scenes, onChange, onFocus }) {
  const [open, setOpen] = useState(0);
  const update = (index, patch) => onChange(scenes.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  const collapse = scenes.length > COLLAPSE_AFTER;
  const pick = (index) => { setOpen(index); onFocus(index); };
  return (
    <div className="flex flex-col gap-3">
      {scenes.map((scene, index) => (collapse && index !== open ? (
        <button key={index} type="button" onClick={() => pick(index)}
          className="flex items-center gap-2 rounded-xl bg-white/[0.025] px-3 py-2 text-left text-[12px] text-white/60 ring-1 ring-white/[0.06] transition hover:bg-white/[0.05] hover:text-white">
          <span className="w-6 font-mono text-white/35">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{sceneLabel(scene)}</span>
          <span className="font-mono text-white/35">{scene.seconds}s</span>
        </button>
      ) : (
        <div key={index} className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]" onFocusCapture={() => onFocus(index)}>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => onFocus(index)} className="text-[12px] font-bold text-white/70 hover:text-[#d4ff64]">Adegan {index + 1}</button>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Kurangi durasi" onClick={() => update(index, { seconds: Math.max(LIMITS.minSeconds, scene.seconds - 1) })} className="h-6 w-6 rounded-md bg-white/[0.05] text-white/60 hover:text-white">−</button>
              <span className="w-10 text-center font-mono text-[12px] text-white/70">{scene.seconds}s</span>
              <button type="button" aria-label="Tambah durasi" onClick={() => update(index, { seconds: Math.min(LIMITS.maxSeconds, scene.seconds + 1) })} className="h-6 w-6 rounded-md bg-white/[0.05] text-white/60 hover:text-white">+</button>
              {scenes.length > 1 && (
                <button type="button" aria-label={`Hapus adegan ${index + 1}`} onClick={() => onChange(scenes.filter((_, i) => i !== index))} className="ml-1 h-6 w-6 rounded-md text-white/35 hover:bg-red-500/15 hover:text-red-300">×</button>
              )}
            </div>
          </div>
          <Segmented label={`Jenis adegan ${index + 1}`} value={scene.kind === 'layers' ? 'layers' : 'text'} options={KINDS} onChange={(kind) => update(index, switchKind(scene, kind))} />
          <div className="flex gap-1.5">
            {index > 0 && <Select label="Transisi masuk" value={scene.transition || 'fade'} options={TRANSITIONS} onChange={(transition) => update(index, { transition: transition || 'fade' })} />}
            <Select label="Kamera" value={scene.camera || 'push'} options={CAMERAS} onChange={(camera) => update(index, { camera: camera || 'push' })} />
            {scene.kind === 'layers' && <Select label="Tata letak" value={scene.layout || 'center'} options={LAYOUTS} onChange={(layout) => update(index, { layout: layout || 'center' })} />}
          </div>
          {scene.kind === 'layers' ? (
            <LayerEditor layers={scene.layers || []} onChange={(layers) => update(index, { layers })} />
          ) : (
            <>
              <Field label="Judul" value={scene.title} max={LIMITS.title} multiline onChange={(title) => update(index, { title })} />
              <Field label="Subjudul" value={scene.subtitle} max={LIMITS.subtitle} onChange={(subtitle) => update(index, { subtitle })} />
              <Field label="Tombol ajakan" value={scene.cta} max={LIMITS.cta} onChange={(cta) => update(index, { cta })} />
            </>
          )}
        </div>
      )))}
      {scenes.length < LIMITS.scenes && (
        <button type="button" onClick={() => onChange([...scenes, { kind: 'text', title: 'Adegan baru', subtitle: '', cta: '', vo: '', transition: 'fade', seconds: 4 }])}
          className="rounded-2xl border border-dashed border-white/15 py-2.5 text-[13px] font-semibold text-white/55 transition hover:border-[#d4ff64]/50 hover:text-[#d4ff64]">
          + Tambah adegan
        </button>
      )}
    </div>
  );
}

const COLOR_LABELS = { bg: 'Latar', fg: 'Teks', accent: 'Aksen', muted: 'Pendukung' };
const NEW_PROJECT_NAME = 'Project baru';
const LAST_PROJECT_KEY = 'motion_last_project';

// The parts of the draft a project stores.
const docOf = (draft) => ({ styleId: draft.styleId, format: draft.format, scenes: draft.scenes, custom: draft.custom, audio: draft.audio, chat: draft.chat });

async function projectApi(path = '', options = {}, base = '/api/motion/projects') {
  const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id') || '';
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId, ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Project tidak bisa dibuka.');
  return data;
}

const projectUrl = (projectId) => {
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set('project', projectId);
  else url.searchParams.delete('project');
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
};

const SAVE_LABELS = { saving: 'Menyimpan…', saved: 'Tersimpan', error: 'Gagal menyimpan', local: 'Draft di browser ini' };

// Open, create, rename, duplicate or delete a project (as the AI Director's switcher).
function ProjectSwitcher({ projects, current, saveState, onSelect, onNew, onRename, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const act = async (run) => {
    setWorking(true);
    try { await run(); setOpen(false); } catch (error) { window.alert(error.message); } finally { setWorking(false); }
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Ganti project"
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left transition hover:border-white/15">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#d4ff64]/10 text-[11px] font-bold text-[#d4ff64]">{(current?.name || 'P').slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[13px] font-semibold text-white/90">{current?.name || NEW_PROJECT_NAME}</strong>
          <small className={`block text-[11px] ${saveState === 'error' ? 'text-red-300/80' : 'text-white/40'}`}>{SAVE_LABELS[saveState] || `${projects.length} project`}</small>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[55vh] overflow-y-auto rounded-xl border border-white/10 bg-[#11130f] p-1 shadow-[0_18px_50px_#0009]">
          <button type="button" disabled={working} onClick={() => act(onNew)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-[#d4ff64] hover:bg-white/[0.05] disabled:opacity-40">
            + Project baru
          </button>
          {current && (
            <div className="mb-1 flex gap-1 border-b border-white/[0.06] px-1.5 pb-1.5">
              {[['Ganti nama', onRename], ['Duplikat', onDuplicate], ['Hapus', onDelete]].map(([label, run]) => (
                <button key={label} type="button" disabled={working} onClick={() => act(run)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] hover:bg-white/[0.06] disabled:opacity-40 ${label === 'Hapus' ? 'text-red-300/80' : 'text-white/60'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {!projects.length && <p className="px-2.5 py-3 text-[12px] text-white/40">Belum ada project.</p>}
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => { setOpen(false); onSelect(project.id); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.05] ${project.id === current?.id ? 'bg-white/[0.04]' : ''}`}>
              <span aria-hidden="true" className="h-7 w-7 flex-none rounded-md ring-1 ring-white/10" style={{ background: resolveStyle(project.styleId).palette.bg, boxShadow: `inset 0 -8px 0 ${resolveStyle(project.styleId).palette.accent}` }} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12px] ${project.id === current?.id ? 'font-semibold text-white' : 'text-white/70'}`}>{project.name}</span>
                <span className="block truncate text-[10.5px] text-white/35">{resolveStyle(project.styleId).name} · {project.sceneCount} adegan · {new Date(project.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MotionStudio({ authenticated = false, beforeGenerate = () => true, onCreditsUsed }) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [family, setFamily] = useState('all');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState('ai');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setCustom = (patch) => setDraft((current) => ({ ...current, custom: { ...current.custom, ...patch, palette: { ...current.custom.palette, ...patch.palette } } }));

  useEffect(() => { setDraft(loadDraft()); setLoaded(true); }, []);
  // Guests keep one draft in this browser; signed-in users work in saved projects.
  useEffect(() => {
    if (!loaded || authenticated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
  }, [draft, loaded, authenticated]);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [saveState, setSaveState] = useState(authenticated ? 'saved' : 'local');
  const savedDoc = useRef(null); // JSON of the document as last saved or opened
  const saveChain = useRef(Promise.resolve());
  const projectIdRef = useRef(null);
  const jobRef = useRef(null); // the AI job being followed
  const [jobId, setJobId] = useState(null);
  const renameAfterJob = useRef(false);
  const currentProject = projects.find((project) => project.id === projectId) || null;

  const rememberProject = (id) => {
    projectIdRef.current = id;
    setProjectId(id);
    projectUrl(id);
    try { if (id) window.localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* storage unavailable */ }
  };
  const upsertSummary = (project) => setProjects((list) => [project, ...list.filter((item) => item.id !== project.id)]);

  const openProject = async (id) => {
    const { project, job } = await projectApi(`/${id}`);
    const doc = { ...DEFAULT_DRAFT, ...project.doc, scenes: project.doc.scenes.map((scene) => ({ vo: '', ...scene })), audio: cleanAudio(project.doc.audio, { loose: true }), custom: { ...DEFAULT_CUSTOM, ...project.doc.custom, palette: { ...DEFAULT_CUSTOM.palette, ...project.doc.custom?.palette } } };
    savedDoc.current = JSON.stringify(docOf(doc));
    setDraft(doc);
    rememberProject(project.id);
    setSaveState('saved');
    if (job && !jobRef.current) followJob(job);
    if (!job && renameAfterJob.current && sceneLabel(doc.scenes[0] || {})) {
      renameAfterJob.current = false;
      projectApi(`/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: sceneLabel(doc.scenes[0]) }) }).then(({ project: renamed }) => upsertSummary(renamed)).catch(() => {});
    }
  };

  // Signed in: list the projects and open the one in the URL, the last one, or the newest.
  useEffect(() => {
    if (!authenticated || !loaded) return;
    let cancelled = false;
    setSaveState('saved');
    (async () => {
      try {
        const { projects: list } = await projectApi();
        if (cancelled) return;
        setProjects(list);
        let last = null;
        try { last = window.localStorage.getItem(LAST_PROJECT_KEY); } catch { /* storage unavailable */ }
        const wanted = [new URLSearchParams(window.location.search).get('project'), last].find((id) => id && list.some((project) => project.id === id));
        const id = wanted || list[0]?.id;
        if (id) await openProject(id);
        else savedDoc.current = JSON.stringify(docOf(DEFAULT_DRAFT)); // the first project is made on the first change
      } catch {
        if (!cancelled) setSaveState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave: every change is written shortly after, one save at a time.
  useEffect(() => {
    if (!authenticated || !loaded || savedDoc.current === null || jobRef.current) return undefined;
    const json = JSON.stringify(docOf(draft));
    if (json === savedDoc.current) return undefined;
    setSaveState('saving');
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current.then(async () => {
        if (json === savedDoc.current) return;
        try {
          const id = projectIdRef.current;
          const { project } = id
            ? await projectApi(`/${id}`, { method: 'PATCH', body: `{"doc":${json}}` })
            : await projectApi('', { method: 'POST', body: JSON.stringify({ name: sceneLabel(draft.scenes[0] || {}) || NEW_PROJECT_NAME, doc: docOf(draft) }) });
          savedDoc.current = json;
          if (!id) rememberProject(project.id);
          upsertSummary(project);
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, authenticated, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const newProject = async () => {
    await saveChain.current;
    const { project } = await projectApi('', { method: 'POST', body: JSON.stringify({ name: NEW_PROJECT_NAME, doc: docOf(DEFAULT_DRAFT) }) });
    upsertSummary(project);
    savedDoc.current = JSON.stringify(docOf(DEFAULT_DRAFT));
    setDraft(DEFAULT_DRAFT);
    rememberProject(project.id);
    setSaveState('saved');
  };
  const renameProject = async () => {
    const name = window.prompt('Nama project', currentProject?.name || '');
    if (!name?.trim() || name.trim() === currentProject?.name) return;
    const { project } = await projectApi(`/${projectId}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
    upsertSummary(project);
  };
  const duplicateProject = async () => {
    await saveChain.current;
    const { project } = await projectApi('', { method: 'POST', body: JSON.stringify({ name: `${currentProject?.name || NEW_PROJECT_NAME} (salinan)`.slice(0, 80), doc: docOf(draft) }) });
    upsertSummary(project);
    savedDoc.current = JSON.stringify(docOf(draft));
    rememberProject(project.id);
  };
  const deleteProject = async () => {
    if (!window.confirm(`Hapus project "${currentProject?.name}"? Adegan dan chat-nya hilang.`)) return;
    await saveChain.current;
    await projectApi(`/${projectId}`, { method: 'DELETE' });
    const rest = projects.filter((project) => project.id !== projectId);
    setProjects(rest);
    if (rest[0]) await openProject(rest[0].id);
    else {
      savedDoc.current = JSON.stringify(docOf(DEFAULT_DRAFT));
      setDraft(DEFAULT_DRAFT);
      rememberProject(null);
    }
  };
  const selectProject = async (id) => {
    if (id === projectId) return;
    await saveChain.current;
    try { await openProject(id); } catch (error) { window.alert(error.message); }
  };

  const format = FORMATS.find((item) => item.id === draft.format) || FORMATS[0];
  const style = useMemo(() => resolveStyle(draft.styleId, draft.custom), [draft.styleId, draft.custom]);
  const inputProps = useMemo(() => ({ style, scenes: draft.scenes, audio: draft.audio }), [style, draft.scenes, draft.audio]);
  const totalSeconds = draft.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const [stageRef, stage] = useFit(format.w / format.h);
  const playerRef = useRef(null);
  const chatWidth = useChatWidth();

  // Frame 0 is an empty background; if the browser blocks autoplay, show a frame with the text.
  useEffect(() => {
    const timer = setTimeout(() => {
      const player = playerRef.current;
      if (player && !player.isPlaying() && player.getCurrentFrame() === 0) player.seekTo(Math.min(FPS * 3, FPS * draft.scenes[0].seconds - 1));
    }, 800);
    return () => clearTimeout(timer);
  }, [format.id, stage.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekToScene = (index) => {
    const start = draft.scenes.slice(0, index).reduce((sum, scene) => sum + scene.seconds, 0);
    playerRef.current?.seekTo(Math.round((start + Math.min(2.5, draft.scenes[index].seconds - 0.5)) * FPS));
  };

  // The AI runs as a job on the motion worker (src/services/motionJobs.js), writing its plan, voiceover and music
  // straight into the project; the studio follows it and reloads the project when it is done, also after a refresh.
  const followJob = (job) => {
    jobRef.current = job;
    setJobId(job.id);
    setBusy(true);
    setBusyLabel(job.progress || 'Menyusun adegan…');
  };
  useEffect(() => {
    if (!jobId) return undefined;
    let live = true;
    const tick = async () => {
      const current = jobRef.current;
      if (!live || !current) return;
      try {
        const { job } = await projectApi(`/${current.id}`, {}, '/api/motion/jobs');
        if (!live) return;
        if (job.status === 'done' || job.status === 'failed') {
          jobRef.current = null;
          setJobId(null);
          if (projectIdRef.current) await openProject(projectIdRef.current).catch(() => {});
          if (job.credits > 0) onCreditsUsed?.();
          setBusy(false);
          setBusyLabel('');
          return;
        }
        setBusyLabel(job.progress || 'Menyusun adegan…');
      } catch { /* try again on the next tick */ }
      if (live) timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 1200);
    return () => { live = false; clearTimeout(timer); };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Writes the editor's document now (the job builds on what is saved), creating the project if there is none.
  const saveNow = async () => {
    const json = JSON.stringify(docOf(draft));
    const id = projectIdRef.current;
    if (id && json === savedDoc.current) return id;
    const { project } = id
      ? await projectApi(`/${id}`, { method: 'PATCH', body: `{"doc":${json}}` })
      : await projectApi('', { method: 'POST', body: JSON.stringify({ name: sceneLabel(draft.scenes[0] || {}) || NEW_PROJECT_NAME, doc: docOf(draft) }) });
    savedDoc.current = json;
    if (!id) rememberProject(project.id);
    upsertSummary(project);
    setSaveState('saved');
    return project.id;
  };

  // The Audio tab's buttons: sound for the document as it is, made by the motion worker.
  const makeAudio = async (request) => {
    const projectId = await saveNow();
    const { job } = await projectApi('', { method: 'POST', body: JSON.stringify({ projectId, ...request }) }, '/api/motion/jobs');
    followJob(job);
  };

  const askDirector = async (brief) => {
    if (!beforeGenerate()) return;
    const history = draft.chat.filter((message) => !message.error).map((message) => ({ role: message.role, content: message.content }));
    const current = draft.chat.some((message) => message.plan) ? {
      styleId: draft.styleId, format: draft.format, voiceId: draft.audio.voiceId, musicPrompt: draft.audio.musicPrompt,
      scenes: draft.scenes.map(({ voAudio, ...scene }) => scene),
    } : null;
    setBusy(true);
    setBusyLabel('Mengirim…');
    try {
      const projectId = await saveNow();
      const { job } = await projectApi('', {
        method: 'POST', body: JSON.stringify({ projectId, brief, messages: history, current, format: draft.format }),
      }, '/api/motion/plan');
      // The worker wrote the message into the project; show it here too until the project is reloaded.
      savedDoc.current = JSON.stringify(docOf({ ...draft, chat: [...draft.chat, { role: 'user', content: brief }] }));
      setDraft((d) => ({ ...d, chat: [...d.chat, { role: 'user', content: brief }] }));
      followJob(job);
      // A project still called "Project baru" is renamed after the plan, from the reloaded scenes.
      renameAfterJob.current = projects.find((project) => project.id === projectId)?.name === NEW_PROJECT_NAME || !projects.some((project) => project.id === projectId);
    } catch (error) {
      setDraft((d) => ({ ...d, chat: [...d.chat, { role: 'user', content: brief }, { role: 'assistant', content: error.message, error: true }] }));
      setBusy(false);
      setBusyLabel('');
    }
  };

  const visible = STYLES.filter((item) => (family === 'all' || item.family === family)
    && (!query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase())));
  const isCustom = draft.styleId === CUSTOM_ID;

  return (
    <div style={{ '--chat-width': `${chatWidth.width}px` }} className="flex h-full w-full flex-col overflow-y-auto bg-[#0b0c0a] text-[#f2eee5] lg:flex-row lg:overflow-hidden">
      {/* Styles */}
      <aside className="order-3 flex shrink-0 flex-col border-white/[0.06] lg:min-h-0 lg:w-[300px] lg:border-l xl:w-[340px]">
        <div className="flex flex-col gap-3 px-4 pb-3 pt-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Gaya</h2>
            <span className="font-mono text-[11px] text-white/35">{STYLES.length + 1} gaya</span>
          </div>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari gaya…"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] outline-none placeholder:text-white/30 focus:border-[#d4ff64]/60" />
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {[{ id: 'all', label: 'Semua' }, ...FAMILIES].map((item) => (
              <button key={item.id} type="button" onClick={() => setFamily(item.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition ${family === item.id ? 'bg-[#f2eee5] text-black' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:overflow-y-auto lg:overflow-x-hidden lg:pb-6">
          {visible.map((item) => <StyleCard key={item.id} item={item} active={draft.styleId === item.id} onSelect={(styleId) => set({ styleId })} />)}
          {family === 'all' && !query.trim() && <CustomCard active={isCustom} onSelect={(styleId) => set({ styleId })} />}
          {!visible.length && <p className="col-span-full w-full py-8 text-center text-[13px] text-white/40">Tidak ada gaya dengan nama itu.</p>}
        </div>
      </aside>

      {/* Preview */}
      <section className="order-1 flex min-w-0 shrink-0 flex-col lg:order-2 lg:min-h-0 lg:flex-1 lg:shrink">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Pratinjau · {draft.scenes.length} adegan · {totalSeconds} dtk</div>
            <div className="truncate font-display text-[20px] font-semibold tracking-tight">{style.name}</div>
          </div>
          <div className="w-[200px]"><Segmented label="Format" options={FORMATS} value={draft.format} onChange={(id) => set({ format: id })} /></div>
        </div>
        <div className="relative m-4 flex h-[62vh] min-h-[320px] items-center justify-center rounded-3xl bg-[#111310] ring-1 ring-white/[0.05] lg:h-auto lg:flex-1"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          <div ref={stageRef} className="absolute inset-5 flex items-center justify-center">
            {stage.width > 0 && (
              <Player ref={playerRef} key={format.id} component={MotionScene} inputProps={inputProps}
                durationInFrames={FPS * totalSeconds} fps={FPS} compositionWidth={format.w} compositionHeight={format.h}
                controls loop autoPlay clickToPlay
                style={{ width: stage.width, height: stage.height, borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }} />
            )}
          </div>
          {busy && <div className="pointer-events-none absolute inset-0 animate-pulse rounded-3xl ring-2 ring-[#d4ff64]/40" />}
        </div>
        {draft.scenes.length > 1 && (
          <div className="-mt-1 flex min-w-0 max-w-full gap-1.5 overflow-x-auto px-5 pb-4 [scrollbar-width:thin]">
            {draft.scenes.map((scene, index) => (
              <button key={index} type="button" onClick={() => seekToScene(index)} style={{ flexGrow: scene.seconds }}
                className="min-w-[72px] basis-0 truncate rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-left text-[11px] text-white/60 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white">
                <span className="font-mono text-white/35">{index + 1}</span> {sceneLabel(scene)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* AI director and scene editor */}
      <aside className="order-2 flex shrink-0 flex-col gap-4 border-white/[0.06] px-4 pb-6 pt-4 lg:order-1 lg:min-h-0 lg:w-[var(--chat-width)]">
        {authenticated ? (
          <ProjectSwitcher projects={projects} current={currentProject} saveState={saveState}
            onSelect={selectProject} onNew={newProject} onRename={renameProject} onDuplicate={duplicateProject} onDelete={deleteProject} />
        ) : (
          <button type="button" onClick={() => beforeGenerate()}
            className="flex items-center justify-between rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-left text-[12px] text-white/55 transition hover:border-[#d4ff64]/50 hover:text-white">
            <span><strong className="block text-[13px] text-white/85">Draft di browser ini</strong>Masuk untuk menyimpan sebagai project</span>
            <span aria-hidden="true" className="text-[#d4ff64]">→</span>
          </button>
        )}
        <div role="tablist" aria-label="Panel" className="flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
          {[{ id: 'ai', label: 'AI' }, { id: 'scenes', label: `Adegan (${draft.scenes.length})` }, { id: 'audio', label: 'Audio' }, { id: 'look', label: 'Tampilan' }].map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={panel === tab.id} onClick={() => setPanel(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${panel === tab.id ? 'bg-[#f2eee5] text-black' : 'text-white/55 hover:text-white'}`}>
              {tab.id === 'ai' && <SparkIcon size={12} />}{tab.label}
            </button>
          ))}
        </div>

        {panel === 'ai' && <DirectorChat chat={draft.chat} busy={busy} busyLabel={busyLabel} onSend={askDirector} />}

        {panel === 'scenes' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
            <SceneEditor scenes={draft.scenes} onChange={(scenes) => set({ scenes })} onFocus={seekToScene} />
          </div>
        )}

        {panel === 'audio' && (
          <AudioPanel scenes={draft.scenes} audio={draft.audio} totalSeconds={totalSeconds} authenticated={authenticated} beforeGenerate={beforeGenerate}
            onScenes={(scenes) => set({ scenes })} onAudio={(patch) => setDraft((d) => ({ ...d, audio: { ...d.audio, ...patch } }))}
            onGenerate={makeAudio} jobRunning={Boolean(jobId)} jobLabel={busyLabel} />
        )}

        {panel === 'look' && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {!isCustom && (
              <p className="rounded-2xl bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/50 ring-1 ring-white/[0.06]">
                Gaya <strong className="text-white/80">{style.name}</strong> punya warna dan huruf sendiri. Pilih <button type="button" className="font-semibold text-[#d4ff64] underline-offset-2 hover:underline" onClick={() => set({ styleId: CUSTOM_ID })}>Buat gaya sendiri</button> untuk mengatur gerakan, huruf, dan warnanya.
              </p>
            )}
            {isCustom && <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-white/50">Gerakan</span>
                <select value={draft.custom.family} onChange={(event) => setCustom({ family: event.target.value })}
                  className="rounded-xl border border-white/[0.08] bg-[#161915] px-3 py-2.5 text-[14px] outline-none focus:border-[#d4ff64]/60">
                  {FAMILIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-white/50">Huruf</span>
                <select value={FONTS.find((item) => item.value === draft.custom.font)?.id || 'display'} onChange={(event) => setCustom({ font: FONTS.find((item) => item.id === event.target.value).value })}
                  className="rounded-xl border border-white/[0.08] bg-[#161915] px-3 py-2.5 text-[14px] outline-none focus:border-[#d4ff64]/60">
                  {FONTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(COLOR_LABELS).map((key) => (
                  <label key={key} className="flex flex-col items-center gap-1.5">
                    <span className="relative h-11 w-full overflow-hidden rounded-xl ring-1 ring-white/10" style={{ background: draft.custom.palette[key] }}>
                      <input type="color" value={draft.custom.palette[key]} onChange={(event) => setCustom({ palette: { [key]: event.target.value } })}
                        aria-label={`Warna ${COLOR_LABELS[key]}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </span>
                    <span className="text-[11px] text-white/45">{COLOR_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </>}
          </div>
        )}

        <section className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.06]">
          <div className="flex items-center justify-between text-[12px] text-white/50">
            <span>{format.w}×{format.h} · {FPS} fps</span>
            <span className="font-mono">{totalSeconds} dtk</span>
          </div>
          <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-[#d4ff64]/30 py-2.5 text-[14px] font-bold text-black/60">
            Render MP4
          </button>
          <p className="text-center text-[11px] text-white/35">Render segera hadir. Pratinjau sudah bisa dicoba.</p>
        </section>
      </aside>
      <div role="separator" aria-orientation="vertical" aria-label="Ubah lebar chat" title="Seret untuk mengubah lebar chat"
        onPointerDown={chatWidth.startDrag} onDoubleClick={chatWidth.reset}
        className="hidden w-1.5 flex-none cursor-col-resize border-l border-white/[0.06] transition-colors hover:bg-[#d4ff64]/30 lg:order-1 lg:block" />
    </div>
  );
}
