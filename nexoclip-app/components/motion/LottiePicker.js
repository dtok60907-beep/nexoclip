'use client';

// Picks the animation of a Lottie layer: the built-in animated emoji (searched by name, previewed as the emoji
// itself), a LottieFiles link, or a .json the user uploads (app/api/motion/lottie).

import { useState } from 'react';
import { MAX_LOTTIE_BYTES, cleanLottieSrc, emojiChar, searchNoto } from './lottieLibrary';

async function uploadLottie(file) {
  if (file.size > MAX_LOTTIE_BYTES) throw new Error('Lottie file must be 1.5 MB or smaller.');
  const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id') || '';
  const response = await fetch('/api/motion/lottie', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId }, body: await file.text(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to upload a Lottie file.' : data.error || 'Upload failed.');
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
    if (!clean.startsWith('https://')) { setError('Paste a .json link from LottieFiles (assets…lottiefiles.com or lottie.host).'); return; }
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
      <div className="flex items-center gap-2.5 rounded-xl border border-[#e6e7f0] bg-[#fafafd] px-3 py-2 text-[12.5px] text-[#2d2e3f]">
        {current ? (
          <span className="text-[24px] leading-none">{emojiChar(current)}</span>
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f2f0ff] text-[#5b45f2]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
            </svg>
          </span>
        )}
        <span className="min-w-0 truncate font-medium">{current ? current.replace(/-/g, ' ') : src?.startsWith('/api/') ? 'Uploaded Lottie file' : src ? 'LottieFiles animation' : 'None selected'}</span>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search animations: coffee, rocket, money, fire…" aria-label="Search animations"
        className="rounded-xl border border-[#e6e7f0] bg-[#fafafd] px-3 py-1.5 text-[13px] text-[#14141f] outline-none placeholder:text-[#8a8b9e] focus:border-[#5b45f2] focus:bg-white" />
      <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto custom-scrollbar pr-1">
        {results.map((name) => (
          <button key={name} type="button" title={name.replace(/-/g, ' ')} aria-label={name.replace(/-/g, ' ')} onClick={() => onChange(`noto:${name}`)}
            className={`flex aspect-square items-center justify-center rounded-lg text-[20px] transition ${current === name ? 'bg-[#f2f0ff] ring-2 ring-[#5b45f2]' : 'bg-[#f6f6fa] hover:bg-[#efeff6]'}`}>
            {emojiChar(name)}
          </button>
        ))}
        {!results.length && <span className="col-span-8 py-2 text-center text-[11.5px] text-[#7a7b90]">No matches found. Try another keyword.</span>}
      </div>
      <div className="flex gap-1.5">
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="LottieFiles .json link" aria-label="LottieFiles link"
          className="min-w-0 flex-1 rounded-xl border border-[#e6e7f0] bg-[#fafafd] px-3 py-1.5 text-[12px] text-[#14141f] outline-none placeholder:text-[#8a8b9e] focus:border-[#5b45f2] focus:bg-white" />
        <button type="button" onClick={useLink} className="rounded-xl bg-[#f2f0ff] border border-[#ddd7fe] px-3 text-[12px] font-semibold text-[#4c38d6] hover:bg-[#e7e3ff]">Use</button>
      </div>
      <label className="cursor-pointer self-start text-[12px] font-semibold text-[#5b45f2] hover:text-[#4731d8]">
        {uploading ? 'Uploading…' : '+ Upload .json file'}
        <input type="file" accept="application/json,.json" className="hidden" onChange={upload} disabled={uploading} />
      </label>
      {error && <p role="alert" className="text-[11.5px] text-[#c01048]">{error}</p>}
      <p className="text-[10.5px] leading-snug text-[#7a7b90]">Animated emoji: Google Noto Emoji Animation, CC BY 4.0.</p>
    </div>
  );
}
