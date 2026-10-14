'use client';

// The right-hand panel for the selected shot, with its building blocks in tabs (like OpenArt Director's
// assets panel): every image and video made for it, the music bed, its voiceover line and its caption.

import { useEffect, useState } from 'react';
import { SmallButton, assetUrl, inputClass, mediaStatus } from './BoardViews.js';

export const SHOT_TABS = [['media', 'Media'], ['music', 'Musik'], ['voiceover', 'Voiceover'], ['caption', 'Caption']];
const CHARS_PER_SECOND = 13; // roughly how fast an Indonesian voiceover reads

let voiceCache = null;
export function useVoices() {
  const [voices, setVoices] = useState(voiceCache || []);
  useEffect(() => {
    if (voiceCache) return;
    fetch('/api/director/voices').then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((d) => { voiceCache = d.voices || []; setVoices(voiceCache); }).catch(() => {});
  }, []);
  return voices;
}

export const download = (assetId, workspaceId) => `${assetUrl(assetId, workspaceId)}&download=1`;

function Player({ media, workspaceId }) {
  const src = assetUrl(media?.asset_id, workspaceId);
  if (!src) return null;
  return <audio key={src} src={src} controls className="h-8 w-full" />;
}

// Every frame and video made for the shot; the one in use is marked, any other can be put back.
// The user's own image (as the shot's frame) or video (as its clip), uploaded to their workspace.
function UploadMedia({ shot, workspaceId, onEdit, busy, hasFrame }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file) => {
    if (!file || !workspaceId) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'frame' : null;
    if (!kind) { setError('Pilih gambar atau video.'); return; }
    if (kind === 'frame' && !hasFrame) { setError('Shot lanjutan hanya punya video.'); return; }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-workspace-id': workspaceId }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || 'Upload gagal');
      await onEdit('set_shot_media', { id: shot.id, kind, asset_id: data.id });
    } catch (err) {
      setError(err.message || 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-[11px] text-white/70 hover:border-white/40 hover:text-white ${busy || uploading ? 'pointer-events-none opacity-50' : ''}`}>
        {uploading ? 'Mengupload…' : '↑ Upload gambar / video sendiri'}
        <input type="file" accept="image/*,video/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <p className="mt-1 text-[10px] text-white/30">Gambar jadi frame shot, video jadi klipnya. Tidak di-generate ulang.</p>
      {error && <p className="mt-1 text-[10px] text-red-300/80">{error}</p>}
    </div>
  );
}

function MediaTab({ board, shot, workspaceId, onEdit, onRequest, onSelect, busy, startAdding }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(startAdding); // 'before' | 'after'
  const [text, setText] = useState('');
  useEffect(() => { setAdding(startAdding); }, [startAdding, shot.id]);
  const items = [];
  for (const kind of ['frame', 'video']) {
    const key = `${kind}:${shot.id}`;
    const media = board.media[key];
    const takes = media?.takes?.length ? media.takes : media?.asset_id ? [{ asset_id: media.asset_id }] : [];
    takes.forEach((take, i) => items.push({ key, kind, take, n: takes.length - i, active: take.asset_id === media?.asset_id }));
  }
  const shown = items.filter((it) => filter === 'all' || (filter === 'image' ? it.kind === 'frame' : it.kind === 'video'));
  const add = async () => {
    if (!text.trim()) return;
    const before = new Set(board.shots.map((s) => s.id));
    if (await onEdit('add_shot', { [adding]: shot.id, description: text.trim(), element_ids: shot.element_ids })) {
      let n = board.shots.length + 1;
      while (before.has(`shot_${n}`)) n += 1;
      setAdding(null); setText('');
      onSelect(`shot_${n}`);
    }
  };
  const video = board.media[`video:${shot.id}`];
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[['all', 'Semua'], ['image', 'Gambar'], ['video', 'Video']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={`rounded-md px-2 py-0.5 text-[10.5px] ${filter === id ? 'bg-white/[0.1] text-white' : 'text-white/45 hover:text-white'}`}>{label}</button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid grid-cols-2 gap-1.5">
          {shown.map((it) => {
            const src = assetUrl(it.take.asset_id, workspaceId, it.kind === 'frame');
            return (
              <div key={`${it.key}:${it.take.asset_id}`} className={`group relative overflow-hidden rounded-md border ${it.active ? 'border-amber-300' : 'border-white/10'}`}>
                <button type="button" disabled={busy || it.active} onClick={() => onEdit('use_take', { key: it.key, asset_id: it.take.asset_id })}
                  title={it.active ? 'Sedang dipakai' : 'Pakai yang ini'} className="block aspect-video w-full bg-black/50">
                  {it.kind === 'video'
                    ? <video src={`${assetUrl(it.take.asset_id, workspaceId)}#t=0.5`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={src} alt="" loading="lazy" className="pointer-events-none h-full w-full object-cover" />}
                </button>
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white/85">
                  {it.kind === 'video' ? '▶ video' : 'gambar'} {it.n}{it.take.uploaded ? ' · upload' : ''}{it.take.from_scene ? ' · dari video scene' : ''}{it.take.outdated ? ' · lama' : ''}{it.active ? ' · dipakai' : ''}
                </span>
                <a href={download(it.take.asset_id, workspaceId)} download title="Download"
                  className="absolute bottom-1 right-1 hidden rounded bg-black/70 px-1.5 text-[10px] text-white group-hover:block">↓</a>
              </div>
            );
          })}
        </div>
      ) : <p className="text-[11px] text-white/35">Belum ada gambar atau video untuk shot ini.</p>}
      <UploadMedia shot={shot} workspaceId={workspaceId} onEdit={onEdit} busy={busy} hasFrame={!!board.media[`frame:${shot.id}`]} />
      <label className="flex items-center justify-between gap-2 text-[11px] text-white/55">
        <span title="Cara shot ini masuk setelah shot sebelumnya di video final (0,5 detik)">Transisi masuk</span>
        <select value={shot.transition || 'cut'} disabled={busy || shot.locked}
          onChange={(e) => onEdit('update_shot', { id: shot.id, transition: e.target.value })}
          className="rounded-md border border-white/10 bg-[#0b0e13] px-1.5 py-1 text-[11px] text-white/80">
          <option value="cut">Potong (cut)</option>
          <option value="fade">Fade lewat hitam</option>
          <option value="dissolve">Dissolve</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {!shot.extends && <SmallButton disabled={busy} onClick={() => onRequest([`frame:${shot.id}`], !!board.media[`frame:${shot.id}`]?.asset_id)}>Recreate gambar</SmallButton>}
        <SmallButton disabled={busy} onClick={() => onRequest([`video:${shot.id}`], !!video?.asset_id)}>Recreate video</SmallButton>
        <SmallButton disabled={busy} onClick={() => onEdit('duplicate_shot', { id: shot.id })}>Duplicate</SmallButton>
        <SmallButton disabled={busy} onClick={() => setAdding(adding === 'before' ? null : 'before')}>+ Sebelum</SmallButton>
        <SmallButton disabled={busy} onClick={() => setAdding(adding === 'after' ? null : 'after')}>+ Sesudah</SmallButton>
        <SmallButton disabled={busy || shot.locked} onClick={() => {
          if (window.confirm(`Hapus shot "${shot.title}"? Bisa dikembalikan dari Riwayat versi.`)) onEdit('remove_shot', { id: shot.id });
        }}>Hapus</SmallButton>
      </div>
      {adding && (
        <div className="space-y-1.5">
          <input autoFocus className={inputClass} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={`Shot baru ${adding === 'before' ? 'sebelum' : 'sesudah'} ini, mis. "close up gelas es teh"`} />
          <SmallButton tone="accent" disabled={busy || !text.trim()} onClick={add}>Tambah shot</SmallButton>
        </div>
      )}
    </div>
  );
}

function MusicTab({ board, workspaceId, onEdit, onRequest, busy }) {
  const music = board.audio?.music || {};
  const media = board.media['audio:music'];
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft(null); }, [music.prompt, music.duration_seconds, music.instrumental]);
  const value = draft || { prompt: music.prompt || '', seconds: music.duration_seconds || '', instrumental: music.instrumental !== false };
  const save = async () => {
    if (await onEdit('set_audio', { music_prompt: value.prompt, instrumental: value.instrumental, ...(value.seconds ? { music_seconds: Number(value.seconds) } : {}) })) setDraft(null);
  };
  return (
    <div className="space-y-2.5">
      <p className="text-[10.5px] text-white/40">Satu musik latar untuk seluruh video, di bawah VO dan suara klip.</p>
      <textarea rows={3} className={inputClass} placeholder="Genre, mood, tempo, instrumen… mis. lo-fi hangat, gitar akustik, 85 BPM"
        value={value.prompt} onChange={(e) => setDraft({ ...value, prompt: e.target.value })} />
      <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-white/45">
        <label className="flex items-center gap-1">Durasi
          <input type="number" min={3} max={300} className={`${inputClass} w-16 py-1`} value={value.seconds}
            onChange={(e) => setDraft({ ...value, seconds: e.target.value })} /> dtk</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={value.instrumental}
          onChange={(e) => setDraft({ ...value, instrumental: e.target.checked })} /> Instrumental</label>
      </div>
      {draft ? (
        <div className="flex gap-1.5"><SmallButton tone="accent" disabled={busy} onClick={save}>Simpan</SmallButton><SmallButton onClick={() => setDraft(null)}>Batal</SmallButton></div>
      ) : music.prompt ? (
        <SmallButton tone="accent" disabled={busy} onClick={() => onRequest(['audio:music'], !!media?.asset_id && !media.stale)}>
          {media?.asset_id ? 'Generate ulang musik' : 'Generate musik'}
        </SmallButton>
      ) : null}
      {media && <p className="text-[10px] text-white/35">{mediaStatus(media).label}</p>}
      <Player media={media} workspaceId={workspaceId} />
      {media?.error && <p className="text-[11px] text-red-300/80">{media.error}</p>}
    </div>
  );
}

function VoiceoverTab({ board, shot, workspaceId, onEdit, onRequest, busy }) {
  const voices = useVoices();
  const voiceId = board.audio?.voiceover?.voice_id || '';
  const media = board.media[`vo:${shot.id}`];
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft(null); }, [shot.id, shot.vo_text, shot.vo_offset, voiceId]);
  const value = draft || { text: shot.vo_text || '', offset: shot.vo_offset ?? 0.3, voice: voiceId };
  const read = Math.round((value.text.length / CHARS_PER_SECOND) * 10) / 10;
  const room = Math.max(0, shot.duration_seconds - (shot.trim_start || 0) - (shot.trim_end || 0) - (Number(value.offset) || 0));
  const save = async () => {
    // Lines are saved as a whole set: this shot's line replaces its old one, the others stay.
    const lines = board.shots.map((s) => (s.id === shot.id
      ? { shot_id: s.id, text: value.text.trim(), offset: Number(value.offset) || 0 }
      : { shot_id: s.id, text: s.vo_text || '', offset: s.vo_offset ?? 0.3 })).filter((l) => l.text);
    if (await onEdit('set_audio', { voice_id: value.voice, lines })) setDraft(null);
  };
  return (
    <div className="space-y-2.5">
      <select className={inputClass} value={value.voice} onChange={(e) => setDraft({ ...value, voice: e.target.value })}>
        <option value="">Pilih suara (untuk semua baris)…</option>
        {voices.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.gender === 'female' ? 'perempuan' : 'laki-laki'} · {v.description}</option>)}
      </select>
      <textarea rows={3} className={inputClass} placeholder="Kalimat VO yang dibacakan di shot ini (kosongkan kalau tanpa VO)"
        value={value.text} onChange={(e) => setDraft({ ...value, text: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-white/45">
        <label className="flex items-center gap-1">mulai di detik
          <input type="number" min={0} step={0.1} className={`${inputClass} w-16 py-1`} value={value.offset}
            onChange={(e) => setDraft({ ...value, offset: e.target.value })} /></label>
        {value.text && <span className={read > room ? 'text-amber-300/80' : ''}>±{read} dtk dibaca · ruang {Math.round(room * 10) / 10} dtk</span>}
      </div>
      {draft ? (
        <div className="flex items-center gap-1.5">
          <SmallButton tone="accent" disabled={busy || (!!value.text.trim() && !value.voice)} onClick={save}>Simpan</SmallButton>
          <SmallButton onClick={() => setDraft(null)}>Batal</SmallButton>
          {value.text.trim() && !value.voice && <span className="text-[10.5px] text-amber-300/80">Pilih suara dulu.</span>}
        </div>
      ) : shot.vo_text && media ? (
        <SmallButton tone="accent" disabled={busy} onClick={() => onRequest([`vo:${shot.id}`], !!media.asset_id && !media.stale)}>
          {media.asset_id ? 'Generate ulang VO' : 'Generate VO'}
        </SmallButton>
      ) : null}
      {media && <p className="text-[10px] text-white/35">{mediaStatus(media).label}</p>}
      <Player media={media} workspaceId={workspaceId} />
      {media?.error && <p className="text-[11px] text-red-300/80">{media.error}</p>}
    </div>
  );
}

function CaptionTab({ shot, onEdit, busy }) {
  const [text, setText] = useState(shot.caption || '');
  useEffect(() => { setText(shot.caption || ''); }, [shot.id, shot.caption]);
  const dirty = text.trim() !== (shot.caption || '');
  return (
    <div className="space-y-2.5">
      <p className="text-[10.5px] text-white/40">Teks di bagian bawah layar selama shot ini (subtitle, tagline, atau CTA). Gratis, ditempel saat Export.</p>
      <textarea rows={2} maxLength={140} className={inputClass} placeholder='mis. "Order di GoFood sekarang"' value={text} onChange={(e) => setText(e.target.value)} />
      {dirty && <SmallButton tone="accent" disabled={busy} onClick={() => onEdit('update_shot', { id: shot.id, caption: text.trim() })}>Simpan caption</SmallButton>}
    </div>
  );
}

export default function ShotPanel({ board, shot, label, workspaceId, onEdit, onRequest, onSelect, busy, tab: requested, onTab }) {
  if (!shot) return null;
  const tab = requested === 'add' ? 'media' : requested; // 'add': the Media tab with its "new shot after" form open
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="mb-2 truncate text-[12px] font-semibold text-white/85">Shot {label} <span className="font-normal text-white/50">· {shot.title}</span></div>
      <div className="mb-3 flex gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
        {SHOT_TABS.map(([id, name]) => (
          <button key={id} type="button" onClick={() => onTab(id)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[11px] ${tab === id ? 'bg-white/[0.1] text-white' : 'text-white/50 hover:text-white'}`}>{name}</button>
        ))}
      </div>
      {tab === 'media' && <MediaTab board={board} shot={shot} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} onSelect={onSelect} busy={busy}
        startAdding={requested === 'add' ? 'after' : null} />}
      {tab === 'music' && <MusicTab board={board} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />}
      {tab === 'voiceover' && <VoiceoverTab board={board} shot={shot} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />}
      {tab === 'caption' && <CaptionTab shot={shot} onEdit={onEdit} busy={busy} />}
    </div>
  );
}
