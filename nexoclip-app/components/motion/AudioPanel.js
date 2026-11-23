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
  if (!response.ok) throw new Error(data.error || 'Unable to generate audio right now.');
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

const fmt = (credits) => (credits === null ? '' : ` · ≈ ${Number(credits).toLocaleString('en-US', { maximumFractionDigits: 1 })} credits`);
const voiceReady = (scene, voiceId) => scene.voAudio && scene.voAudio.text === scene.vo && scene.voAudio.voiceId === voiceId;

function Status({ tone, children }) {
  const colors = {
    ok: 'bg-[#ecfdf3] text-[#147a49] border border-[#c5f0d6]',
    warn: 'bg-[#fff8eb] text-[#a05c07] border border-[#fce0b0]',
    none: 'bg-[#f3f4f8] text-[#5e5e72] border border-[#e6e7f0]',
  };
  return <span className={`rounded-lg px-2 py-0.5 text-[10.5px] font-semibold ${colors[tone]}`}>{children}</span>;
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
      {!authenticated && (
        <p className="rounded-2xl bg-[#fafafd] p-3.5 text-[12.5px] leading-relaxed text-[#5e5e72] ring-1 ring-[#e6e7f0]">
          Music and voiceover are powered by ElevenLabs and use credits. Sign in to generate audio.
        </p>
      )}

      <section className="flex flex-col gap-2.5 rounded-2xl bg-[#fafafd] p-3.5 ring-1 ring-[#e6e7f0]">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[#14141f]">Background music</h3>
          {audio.music ? <Status tone={musicStale ? 'warn' : 'ok'}>{musicStale ? 'Needs regeneration' : `Ready · ${Math.round(audio.music.seconds)}s`}</Status> : <Status tone="none">Not generated</Status>}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[12px] font-medium text-[#5e5e72]">Music style <span className="font-mono text-[11px] text-[#7a7b90]">{audio.musicPrompt.length}/{SCENE_LIMITS.musicPrompt}</span></span>
          <textarea value={audio.musicPrompt} maxLength={SCENE_LIMITS.musicPrompt} rows={3} placeholder="upbeat lo-fi, 90 BPM, warm piano, cozy, no vocals"
            onChange={(event) => onAudio({ musicPrompt: event.target.value })}
            className="w-full resize-none rounded-xl border border-[#e6e7f0] bg-white px-3 py-2 text-[13px] text-[#14141f] outline-none placeholder:text-[#8a8b9e] focus:border-[#5b45f2] focus:ring-2 focus:ring-[#5b45f2]/12" />
        </label>
        {audio.music && (
          <label className="flex items-center gap-2 text-[12px] text-[#5e5e72]">
            Volume
            <input type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => onAudio({ musicVolume: Number(event.target.value) })} className="flex-1 accent-[#5b45f2]" aria-label="Music volume" />
            <button type="button" onClick={() => onAudio({ music: null })} className="font-medium text-[#c01048] hover:underline">Remove</button>
          </label>
        )}
        <button type="button" disabled={!musicRequest || busy} onClick={makeMusic}
          className="rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] px-3 py-2 text-[13px] font-semibold text-white shadow-xs transition disabled:cursor-not-allowed disabled:opacity-45">
          {working === 'music' || (jobRunning && /music|musik/i.test(jobLabel || '')) ? (jobLabel || 'Generating music…') : `${audio.music ? 'Regenerate' : 'Generate'} ${musicSeconds}s music${fmt(musicCredits)}`}
        </button>
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl bg-[#fafafd] p-3.5 ring-1 ring-[#e6e7f0]">
        <h3 className="text-[13px] font-semibold text-[#14141f]">Voiceover</h3>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#5e5e72]">Voice</span>
          <select value={voiceId} onChange={(event) => onAudio({ voiceId: event.target.value })}
            className="rounded-xl border border-[#e6e7f0] bg-white px-3 py-2 text-[13px] text-[#14141f] outline-none focus:border-[#5b45f2]">
            {ELEVENLABS_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender === 'male' ? 'male' : 'female'} · {voice.description}</option>)}
          </select>
        </label>
        {scenes.map((scene, index) => {
          const ready = voiceReady(scene, voiceId);
          return (
            <div key={index} className="flex flex-col gap-1.5 rounded-xl bg-white p-2.5 ring-1 ring-[#e6e7f0]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-[#14141f]">Scene {index + 1}</span>
                <span className="flex items-center gap-1.5">
                  {scene.voAudio ? <Status tone={ready ? 'ok' : 'warn'}>{ready ? `Ready · ${scene.voAudio.seconds.toFixed(1)}s` : 'Needs regeneration'}</Status> : scene.vo.trim() ? <Status tone="none">Not generated</Status> : null}
                  {scene.voAudio && <button type="button" aria-label={`Remove voiceover for scene ${index + 1}`} onClick={() => removeLineAudio(index)} className="text-[12px] text-[#7a7b90] hover:text-[#c01048]">×</button>}
                </span>
              </div>
              <textarea value={scene.vo} maxLength={SCENE_LIMITS.vo} rows={2} placeholder="Spoken line for this scene (leave blank for no voiceover)"
                onChange={(event) => setLine(index, event.target.value)} aria-label={`Scene ${index + 1} voiceover`}
                className="w-full resize-none rounded-lg border border-[#e6e7f0] bg-[#fafafd] px-2.5 py-1.5 text-[13px] text-[#14141f] outline-none placeholder:text-[#8a8b9e] focus:border-[#5b45f2] focus:bg-white" />
              {scene.vo.trim() && !ready && (
                <button type="button" disabled={busy} onClick={() => makeVoices([{ index }], index)}
                  className="self-end text-[12px] font-semibold text-[#5b45f2] hover:text-[#4731d8] disabled:opacity-40">
                  {working === index ? 'Generating voiceover…' : 'Generate voiceover'}
                </button>
              )}
            </div>
          );
        })}
        <button type="button" disabled={!pending.length || busy} onClick={() => makeVoices(pending, 'all')}
          className="rounded-xl bg-[#5b45f2] hover:bg-[#4731d8] px-3 py-2 text-[13px] font-semibold text-white shadow-xs transition disabled:cursor-not-allowed disabled:opacity-45">
          {working === 'all' || (jobRunning && /voice|suara/i.test(jobLabel || '')) ? (jobLabel || 'Generating voiceover…') : pending.length ? `Generate voiceover (${pending.length} ${pending.length === 1 ? 'scene' : 'scenes'})${fmt(voCredits)}` : 'All voiceovers ready'}
        </button>
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl bg-[#fafafd] p-3.5 ring-1 ring-[#e6e7f0]">
        <h3 className="text-[13px] font-semibold text-[#14141f]">Captions &amp; sound effects</h3>
        <label className="flex items-center justify-between gap-2 text-[12.5px] text-[#2d2e3f]">
          <span>Karaoke captions from voiceover<span className="block text-[11px] text-[#7a7b90]">Spoken words highlight as they play; requires voiceover generated with word timings.</span></span>
          <input type="checkbox" checked={audio.captions !== false} onChange={(event) => onAudio({ captions: event.target.checked })} className="h-4 w-4 accent-[#5b45f2]" />
        </label>
        {audio.captions !== false && (
          <div role="radiogroup" aria-label="Caption style" className="grid grid-cols-3 gap-1.5">
            {Object.entries(CAPTION_STYLES).map(([id, style]) => (
              <button key={id} type="button" role="radio" aria-checked={(audio.captionStyle || 'karaoke') === id} title={style.hint} onClick={() => onAudio({ captionStyle: id })}
                className={`rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition ${(audio.captionStyle || 'karaoke') === id ? 'bg-[#5b45f2] text-white' : 'bg-white border border-[#e6e7f0] text-[#5e5e72] hover:text-[#14141f]'}`}>
                {style.label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center justify-between gap-2 text-[12.5px] text-[#2d2e3f]">
          <span>Automatic sound effects<span className="block text-[11px] text-[#7a7b90]">Whooshes on transitions, pops and pings as layers appear. Free.</span></span>
          <input type="checkbox" checked={audio.sfx !== false} onChange={(event) => onAudio({ sfx: event.target.checked })} className="h-4 w-4 accent-[#5b45f2]" />
        </label>
        {audio.sfx !== false && (
          <label className="flex items-center gap-2 text-[12px] text-[#5e5e72]">
            SFX volume
            <input type="range" min="0.05" max="1" step="0.05" value={audio.sfxVolume ?? 0.5} onChange={(event) => onAudio({ sfxVolume: Number(event.target.value) })} className="flex-1 accent-[#5b45f2]" aria-label="Sound effects volume" />
          </label>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl border border-[#fccdd6] bg-[#fff1f3] px-3 py-2 text-[12px] text-[#c01048]">{error}</p>}
      <p className="text-[11px] leading-relaxed text-[#7a7b90]">Music and voiceover are powered by ElevenLabs. Music volume automatically ducks during voiceover.</p>
    </div>
  );
}
