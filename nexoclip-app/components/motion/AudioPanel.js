'use client';

// The Motion studio's sound: one music track under the whole video and a voiceover line per scene, both made by
// ElevenLabs through /api/motion/audio. The AI director writes the music prompt, the lines and picks the voice;
// nothing is generated (or charged) until the user presses a button that shows the price first.

import { useEffect, useState } from 'react';
import { ELEVENLABS_VOICES } from '../../src/services/elevenlabsAudio';
import { CAPTION_STYLES, SCENE_LIMITS } from './sceneKinds';

const MIN_MUSIC = 3;
export const requestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function audioApi(body) {
  const response = await fetch('/api/motion/audio', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Audio tidak bisa dibuat sekarang.');
  return data;
}

// The price of a request, asked again when it changes (debounced); null while unknown.
function useEstimate(audio, enabled) {
  const [credits, setCredits] = useState(null);
  const key = JSON.stringify(audio);
  useEffect(() => {
    if (!enabled || !audio) { setCredits(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      audioApi({ estimate: true, audio }).then((data) => live && setCredits(data.credits)).catch(() => live && setCredits(null));
    }, 500);
    return () => { live = false; clearTimeout(timer); };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return credits;
}

const fmt = (credits) => (credits === null ? '' : ` · ≈ ${Number(credits).toLocaleString('id-ID', { maximumFractionDigits: 1 })} kredit`);
const voiceReady = (scene, voiceId) => scene.voAudio && scene.voAudio.text === scene.vo && scene.voAudio.voiceId === voiceId;

function Status({ tone, children }) {
  const colors = { ok: 'bg-[#d4ff64]/15 text-[#d4ff64]', warn: 'bg-amber-400/15 text-amber-300', none: 'bg-white/[0.06] text-white/45' };
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${colors[tone]}`}>{children}</span>;
}

export default function AudioPanel({ scenes, audio, totalSeconds, authenticated, beforeGenerate, onScenes, onAudio, onGenerate, jobRunning, jobLabel }) {
  const [working, setWorking] = useState(null); // 'music' | scene index | 'all'
  const [error, setError] = useState('');
  const voiceId = audio.voiceId || ELEVENLABS_VOICES[0].id;
  const musicSeconds = Math.min(300, Math.max(MIN_MUSIC, Math.round(totalSeconds)));
  const musicRequest = audio.musicPrompt.trim() ? { type: 'music', text: audio.musicPrompt.trim(), durationSeconds: musicSeconds } : null;
  const pending = scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => scene.vo.trim() && !voiceReady(scene, voiceId));
  const voText = pending.map(({ scene }) => scene.vo.trim()).join(' ').slice(0, 5000);
  const musicCredits = useEstimate(musicRequest, authenticated);
  const voCredits = useEstimate(voText ? { type: 'voiceover', text: voText, voiceId } : null, authenticated);
  const musicStale = audio.music && (audio.music.text !== audio.musicPrompt.trim() || Math.abs(audio.music.seconds - totalSeconds) > 1.5);

  // Both run as a job on the motion worker (onGenerate), which writes the files into the project; a refresh does
  // not stop them, and the studio reloads the project when they are done.
  const generate = async (request, mark) => {
    if (!beforeGenerate()) return;
    setWorking(mark); setError('');
    try {
      await onGenerate(request);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setWorking(null);
    }
  };
  const makeMusic = () => musicRequest && generate({ music: true }, 'music');
  const makeVoices = (targets, mark) => targets.length && generate({ voiceover: true, scenes: targets.map(({ index }) => index) }, mark);
  const busy = working !== null || jobRunning;

  const setLine = (index, vo) => onScenes(scenes.map((scene, i) => (i === index ? { ...scene, vo } : scene)));
  const removeLineAudio = (index) => onScenes(scenes.map((scene, i) => {
    if (i !== index) return scene;
    const { voAudio, ...rest } = scene;
    return rest;
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      {!authenticated && (
        <p className="rounded-2xl bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/50 ring-1 ring-white/[0.06]">
          Musik dan suara dibuat dengan ElevenLabs dan memakai kredit. Masuk dulu untuk membuatnya.
        </p>
      )}

      <section className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-white/85">Musik latar</h3>
          {audio.music ? <Status tone={musicStale ? 'warn' : 'ok'}>{musicStale ? 'Perlu dibuat ulang' : `Siap · ${Math.round(audio.music.seconds)} dtk`}</Status> : <Status tone="none">Belum ada</Status>}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[12px] font-medium text-white/50">Gaya musik <span className="font-mono text-[11px] text-white/30">{audio.musicPrompt.length}/{SCENE_LIMITS.musicPrompt}</span></span>
          <textarea value={audio.musicPrompt} maxLength={SCENE_LIMITS.musicPrompt} rows={3} placeholder="upbeat lo-fi, 90 BPM, warm piano, cozy, no vocals"
            onChange={(event) => onAudio({ musicPrompt: event.target.value })}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-[#f2eee5] outline-none placeholder:text-white/25 focus:border-[#d4ff64]/60" />
        </label>
        {audio.music && (
          <label className="flex items-center gap-2 text-[12px] text-white/50">
            Volume
            <input type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => onAudio({ musicVolume: Number(event.target.value) })} className="flex-1 accent-[#d4ff64]" aria-label="Volume musik" />
            <button type="button" onClick={() => onAudio({ music: null })} className="text-white/40 hover:text-red-300">Hapus</button>
          </label>
        )}
        <button type="button" disabled={!musicRequest || busy} onClick={makeMusic}
          className="rounded-xl bg-[#d4ff64] px-3 py-2 text-[13px] font-bold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
          {working === 'music' || (jobRunning && /musik/i.test(jobLabel || '')) ? (jobLabel || 'Membuat musik…') : `${audio.music ? 'Buat ulang' : 'Buat'} musik ${musicSeconds} dtk${fmt(musicCredits)}`}
        </button>
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
        <h3 className="text-[13px] font-bold text-white/85">Voiceover</h3>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-white/50">Suara</span>
          <select value={voiceId} onChange={(event) => onAudio({ voiceId: event.target.value })}
            className="rounded-xl border border-white/[0.08] bg-[#161915] px-3 py-2 text-[13px] outline-none focus:border-[#d4ff64]/60">
            {ELEVENLABS_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender === 'male' ? 'pria' : 'wanita'} · {voice.description}</option>)}
          </select>
        </label>
        {scenes.map((scene, index) => {
          const ready = voiceReady(scene, voiceId);
          return (
            <div key={index} className="flex flex-col gap-1.5 rounded-xl bg-black/20 p-2.5 ring-1 ring-white/[0.05]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-white/70">Adegan {index + 1}</span>
                <span className="flex items-center gap-1.5">
                  {scene.voAudio ? <Status tone={ready ? 'ok' : 'warn'}>{ready ? `Siap · ${scene.voAudio.seconds.toFixed(1)} dtk` : 'Perlu dibuat ulang'}</Status> : scene.vo.trim() ? <Status tone="none">Belum dibuat</Status> : null}
                  {scene.voAudio && <button type="button" aria-label={`Hapus suara adegan ${index + 1}`} onClick={() => removeLineAudio(index)} className="text-[11px] text-white/35 hover:text-red-300">×</button>}
                </span>
              </div>
              <textarea value={scene.vo} maxLength={SCENE_LIMITS.vo} rows={2} placeholder="Kalimat yang diucapkan di adegan ini (kosongkan kalau tanpa suara)"
                onChange={(event) => setLine(index, event.target.value)} aria-label={`Voiceover adegan ${index + 1}`}
                className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-[#f2eee5] outline-none placeholder:text-white/25 focus:border-[#d4ff64]/60" />
              {scene.vo.trim() && !ready && (
                <button type="button" disabled={busy} onClick={() => makeVoices([{ index }], index)}
                  className="self-end text-[12px] font-semibold text-white/55 hover:text-[#d4ff64] disabled:opacity-40">
                  {working === index ? 'Membuat suara…' : 'Buat suara adegan ini'}
                </button>
              )}
            </div>
          );
        })}
        <button type="button" disabled={!pending.length || busy} onClick={() => makeVoices(pending, 'all')}
          className="rounded-xl bg-[#d4ff64] px-3 py-2 text-[13px] font-bold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
          {working === 'all' || (jobRunning && /suara/i.test(jobLabel || '')) ? (jobLabel || 'Membuat suara…') : pending.length ? `Buat suara ${pending.length} adegan${fmt(voCredits)}` : 'Semua suara sudah siap'}
        </button>
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
        <h3 className="text-[13px] font-bold text-white/85">Caption & efek suara</h3>
        <label className="flex items-center justify-between gap-2 text-[12px] text-white/60">
          <span>Caption karaoke dari voiceover<span className="block text-[11px] text-white/35">Kata yang diucapkan menyala; butuh suara yang dibuat setelah fitur ini ada.</span></span>
          <input type="checkbox" checked={audio.captions !== false} onChange={(event) => onAudio({ captions: event.target.checked })} className="h-4 w-4 accent-[#d4ff64]" />
        </label>
        {audio.captions !== false && (
          <div role="radiogroup" aria-label="Gaya caption" className="grid grid-cols-3 gap-1.5">
            {Object.entries(CAPTION_STYLES).map(([id, style]) => (
              <button key={id} type="button" role="radio" aria-checked={(audio.captionStyle || 'karaoke') === id} title={style.hint} onClick={() => onAudio({ captionStyle: id })}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${(audio.captionStyle || 'karaoke') === id ? 'bg-[#d4ff64] text-black' : 'bg-white/[0.05] text-white/60 hover:text-white'}`}>
                {style.label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center justify-between gap-2 text-[12px] text-white/60">
          <span>Efek suara otomatis<span className="block text-[11px] text-white/35">Whoosh di transisi, pop dan ping saat layer muncul. Gratis.</span></span>
          <input type="checkbox" checked={audio.sfx !== false} onChange={(event) => onAudio({ sfx: event.target.checked })} className="h-4 w-4 accent-[#d4ff64]" />
        </label>
        {audio.sfx !== false && (
          <label className="flex items-center gap-2 text-[12px] text-white/50">
            Volume efek
            <input type="range" min="0.05" max="1" step="0.05" value={audio.sfxVolume ?? 0.5} onChange={(event) => onAudio({ sfxVolume: Number(event.target.value) })} className="flex-1 accent-[#d4ff64]" aria-label="Volume efek suara" />
          </label>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</p>}
      <p className="text-[11px] leading-relaxed text-white/35">Musik dan suara dibuat oleh ElevenLabs. Volume musik otomatis turun saat ada suara.</p>
    </div>
  );
}
