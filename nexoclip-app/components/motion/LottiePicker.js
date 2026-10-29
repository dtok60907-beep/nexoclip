'use client';

// Picks the animation of a Lottie layer: the built-in animated emoji (searched by name, previewed as the emoji
// itself), a LottieFiles link, or a .json the user uploads (app/api/motion/lottie).

import { useState } from 'react';
import { MAX_LOTTIE_BYTES, cleanLottieSrc, emojiChar, searchNoto } from './lottieLibrary';

async function uploadLottie(file) {
  if (file.size > MAX_LOTTIE_BYTES) throw new Error('File Lottie maksimal 1,5 MB.');
  const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id') || '';
  const response = await fetch('/api/motion/lottie', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId }, body: await file.text(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Masuk dulu untuk upload Lottie.' : data.error || 'Upload gagal.');
  return data.src;
}

export default function LottiePicker({ src, onChange }) {
  const [query, setQuery] = useState('');
  const [link, setLink] = useState(src?.startsWith('https://') ? src : '');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const current = src?.startsWith('noto:') ? src.slice(5) : null;
  const results = searchNoto(query, 48);

  const useLink = () => {
    const clean = cleanLottieSrc(link);
    if (!clean.startsWith('https://')) { setError('Tempel link file .json dari LottieFiles (assets…lottiefiles.com atau lottie.host).'); return; }
    setError(''); onChange(clean);
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try { onChange(await uploadLottie(file)); } catch (failure) { setError(failure.message); } finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12px] text-white/60">
        <span className="text-[26px] leading-none">{current ? emojiChar(current) : '🎞️'}</span>
        <span className="min-w-0 truncate">{current ? current.replace(/-/g, ' ') : src?.startsWith('/api/') ? 'File Lottie yang kamu upload' : src ? 'Animasi dari LottieFiles' : 'Belum dipilih'}</span>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari animasi: coffee, rocket, money, fire…" aria-label="Cari animasi"
        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-[#f2eee5] outline-none placeholder:text-white/25 focus:border-[#d4ff64]/60" />
      <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto pr-1">
        {results.map((name) => (
          <button key={name} type="button" title={name.replace(/-/g, ' ')} aria-label={name.replace(/-/g, ' ')} onClick={() => onChange(`noto:${name}`)}
            className={`flex aspect-square items-center justify-center rounded-md text-[20px] transition ${current === name ? 'bg-[#d4ff64]/25 ring-1 ring-[#d4ff64]' : 'bg-white/[0.03] hover:bg-white/[0.08]'}`}>
            {emojiChar(name)}
          </button>
        ))}
        {!results.length && <span className="col-span-8 py-2 text-center text-[11px] text-white/35">Tidak ketemu. Coba kata bahasa Inggris.</span>}
      </div>
      <div className="flex gap-1.5">
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="Link .json LottieFiles" aria-label="Link LottieFiles"
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[#f2eee5] outline-none placeholder:text-white/25 focus:border-[#d4ff64]/60" />
        <button type="button" onClick={useLink} className="rounded-lg bg-white/[0.06] px-2.5 text-[12px] font-semibold text-white/70 hover:text-[#d4ff64]">Pakai</button>
      </div>
      <label className="cursor-pointer self-start text-[12px] font-semibold text-white/55 hover:text-[#d4ff64]">
        {uploading ? 'Mengupload…' : '+ Upload file .json'}
        <input type="file" accept="application/json,.json" className="hidden" onChange={upload} disabled={uploading} />
      </label>
      {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
      <p className="text-[10px] leading-snug text-white/30">Emoji animasi: Google Noto Emoji Animation, CC BY 4.0.</p>
    </div>
  );
}
