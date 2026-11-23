'use client';

// The shot inspector building blocks: Media takes, Music bed, Voiceover line, and Caption.
// Supports both standalone card mode (Timeline drawer) and embedded mode (unified Shot Inspector).

import { useEffect, useState } from 'react';
import { Download, Play, Upload, X } from 'lucide-react';
import { Badge, SmallButton, assetUrl, inputClass, mediaStatus } from './BoardViews.js';

export const SHOT_TABS = [
  ['media', 'Media'],
  ['music', 'Music'],
  ['voiceover', 'Voiceover'],
  ['caption', 'Caption'],
];
const CHARS_PER_SECOND = 13; // roughly how fast an Indonesian voiceover reads

let voiceCache = null;
export function useVoices() {
  const [voices, setVoices] = useState(voiceCache || []);
  useEffect(() => {
    if (voiceCache) return;
    fetch('/api/director/voices')
      .then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((d) => {
        voiceCache = d.voices || [];
        setVoices(voiceCache);
      })
      .catch(() => {});
  }, []);
  return voices;
}

export const download = (assetId, workspaceId) => `${assetUrl(assetId, workspaceId)}&download=1`;

function Player({ media, workspaceId }) {
  const src = assetUrl(media?.asset_id, workspaceId);
  if (!src) return null;
  return <audio key={src} src={src} controls className="h-9 w-full" />;
}

// The user's own image (as the shot's frame) or video (as its clip), uploaded to their workspace.
function UploadMedia({ shot, workspaceId, onEdit, busy, hasFrame }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file) => {
    if (!file || !workspaceId) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'frame' : null;
    if (!kind) {
      setError('Please select an image or video.');
      return;
    }
    if (kind === 'frame' && !hasFrame) {
      setError('Continuation shots only support video.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', headers: { 'x-workspace-id': workspaceId }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error || 'Upload failed');
      await onEdit('set_shot_media', { id: shot.id, kind, asset_id: data.id });
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <label
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#D5D7E4] bg-[#FAFAFD] px-3 py-2.5 text-[12px] font-medium text-[#4C4D61] transition hover:border-[#5B45F2] hover:bg-[#F2F0FF] hover:text-[#4C38D6] ${
          busy || uploading ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <Upload size={13.5} strokeWidth={2} aria-hidden="true" />
        <span>{uploading ? 'Uploading…' : 'Upload your own image / video'}</span>
        <input
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      <p className="mt-1.5 text-[11px] leading-snug text-[#8A8B9C]">
        Images become the shot frame; videos become its clip (not regenerated).
      </p>
      {error && <p className="mt-1.5 text-[12px] text-[#C01048]">{error}</p>}
    </div>
  );
}

export function MediaTab({ board, shot, workspaceId, onEdit, onRequest, onSelect, busy, startAdding }) {
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(startAdding); // 'before' | 'after'
  const [text, setText] = useState('');
  useEffect(() => {
    setAdding(startAdding);
  }, [startAdding, shot.id]);
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
      setAdding(null);
      setText('');
      onSelect(`shot_${n}`);
    }
  };
  const video = board.media[`video:${shot.id}`];
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-lg bg-[#F4F5F9] p-0.5">
          {[
            ['all', 'All'],
            ['image', 'Image'],
            ['video', 'Video'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition ${
                filter === id ? 'bg-white text-[#14141F] shadow-xs' : 'text-[#6E6F82] hover:text-[#14141F]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[#8A8B9C]">{shown.length} {shown.length === 1 ? 'take' : 'takes'}</span>
      </div>

      {shown.length ? (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((it) => {
            const src = assetUrl(it.take.asset_id, workspaceId, it.kind === 'frame');
            return (
              <div
                key={`${it.key}:${it.take.asset_id}`}
                className={`group relative overflow-hidden rounded-xl border transition ${
                  it.active
                    ? 'border-[#5B45F2] ring-2 ring-[#5B45F2]/20'
                    : 'border-[#E6E7F0] hover:border-[#C5C7D8]'
                }`}
              >
                <button
                  type="button"
                  disabled={busy || it.active}
                  onClick={() => onEdit('use_take', { key: it.key, asset_id: it.take.asset_id })}
                  title={it.active ? 'Currently in use' : 'Use this take'}
                  className="block aspect-video w-full bg-[#11141C]"
                >
                  {it.kind === 'video' ? (
                    <video
                      src={`${assetUrl(it.take.asset_id, workspaceId)}#t=0.5`}
                      muted
                      playsInline
                      preload="metadata"
                      className="pointer-events-none h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" loading="lazy" className="pointer-events-none h-full w-full object-cover" />
                  )}
                </button>
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {it.kind === 'video' && <Play size={9} fill="currentColor" aria-hidden="true" />}
                  {it.kind === 'video' ? 'video' : 'image'} {it.n}
                  {it.take.uploaded ? ' · upload' : ''}
                  {it.take.from_scene ? ' · scene' : ''}
                  {it.take.outdated ? ' · outdated' : ''}
                  {it.active ? ' · active' : ''}
                </span>
                <a
                  href={download(it.take.asset_id, workspaceId)}
                  download
                  title="Download"
                  aria-label="Download media"
                  className="absolute bottom-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-md bg-black/75 text-white transition hover:bg-black group-hover:flex"
                >
                  <Download size={12} />
                </a>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#DCDDE8] bg-[#FAFAFD] px-3 py-4 text-center text-[12px] text-[#7A7B90]">
          No image or video for this shot yet.
        </p>
      )}

      <UploadMedia shot={shot} workspaceId={workspaceId} onEdit={onEdit} busy={busy} hasFrame={!!board.media[`frame:${shot.id}`]} />

      <label className="flex items-center justify-between gap-2 rounded-xl border border-[#ECECF4] bg-[#FAFAFD] px-3 py-2 text-[12px] text-[#4C4D61]">
        <span title="How this shot transitions in after the previous shot in the final video (0.5s)" className="font-medium">
          Transition in
        </span>
        <select
          value={shot.transition || 'cut'}
          disabled={busy || shot.locked}
          onChange={(e) => onEdit('update_shot', { id: shot.id, transition: e.target.value })}
          className="rounded-lg border border-[#D8DAE6] bg-white px-2.5 py-1 text-[12px] font-medium text-[#14141F] outline-none focus:border-[#5B45F2]"
        >
          <option value="cut">Cut</option>
          <option value="fade">Fade through black</option>
          <option value="dissolve">Dissolve</option>
        </select>
      </label>

      <div className="space-y-2 border-t border-[#F0F0F6] pt-3">
        <div className="flex flex-wrap gap-1.5">
          {!shot.extends && board.media[`frame:${shot.id}`] && (
            <SmallButton
              disabled={busy || board.media[`frame:${shot.id}`]?.in_request}
              onClick={() => onRequest([`frame:${shot.id}`], !!board.media[`frame:${shot.id}`]?.asset_id)}
            >
              Regenerate image
            </SmallButton>
          )}
          <SmallButton disabled={busy || video?.in_request} onClick={() => onRequest([`video:${shot.id}`], !!video?.asset_id)}>
            Regenerate video
          </SmallButton>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <SmallButton disabled={busy} onClick={() => onEdit('duplicate_shot', { id: shot.id })}>
            Duplicate
          </SmallButton>
          <SmallButton disabled={busy} onClick={() => setAdding(adding === 'before' ? null : 'before')}>
            + Before
          </SmallButton>
          <SmallButton disabled={busy} onClick={() => setAdding(adding === 'after' ? null : 'after')}>
            + After
          </SmallButton>
          <SmallButton
            tone="danger"
            disabled={busy || shot.locked}
            onClick={() => {
              if (window.confirm(`Delete shot "${shot.title}"? You can restore it from Version History.`)) {
                onEdit('remove_shot', { id: shot.id });
              }
            }}
          >
            Delete
          </SmallButton>
        </div>
      </div>

      {adding && (
        <div className="space-y-2 rounded-xl border border-[#E5E6F0] bg-[#FAFAFD] p-3">
          <input
            autoFocus
            className={inputClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder={`New shot ${adding === 'before' ? 'before' : 'after'} this, e.g. "close-up of iced tea glass"`}
          />
          <div className="flex gap-2">
            <SmallButton tone="accent" disabled={busy || !text.trim()} onClick={add}>
              Add shot
            </SmallButton>
            <SmallButton onClick={() => setAdding(null)}>Cancel</SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function MusicTab({ board, workspaceId, onEdit, onRequest, busy }) {
  const music = board.audio?.music || {};
  const media = board.media['audio:music'];
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(null);
  }, [music.prompt, music.duration_seconds, music.instrumental]);
  const value = draft || {
    prompt: music.prompt || '',
    seconds: music.duration_seconds || '',
    instrumental: music.instrumental !== false,
  };
  const save = async () => {
    if (
      await onEdit('set_audio', {
        music_prompt: value.prompt,
        instrumental: value.instrumental,
        ...(value.seconds ? { music_seconds: Number(value.seconds) } : {}),
      })
    ) {
      setDraft(null);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-[#5E5E72]">
        One background music track for the whole video, automatically ducked during VO.
      </p>
      <textarea
        rows={3}
        className={inputClass}
        placeholder="Genre, mood, tempo, instruments… e.g. warm lo-fi, acoustic guitar, 85 BPM"
        value={value.prompt}
        onChange={(e) => setDraft({ ...value, prompt: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#4C4D61]">
        <label className="flex items-center gap-1.5">
          <span>Duration</span>
          <input
            type="number"
            min={3}
            max={300}
            className={`${inputClass} w-20 py-1.5`}
            value={value.seconds}
            onChange={(e) => setDraft({ ...value, seconds: e.target.value })}
          />
          <span>sec</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-[#5B45F2]"
            checked={value.instrumental}
            onChange={(e) => setDraft({ ...value, instrumental: e.target.checked })}
          />
          <span>Instrumental</span>
        </label>
      </div>
      {draft ? (
        <div className="flex gap-2">
          <SmallButton tone="accent" disabled={busy} onClick={save}>
            Save
          </SmallButton>
          <SmallButton onClick={() => setDraft(null)}>Cancel</SmallButton>
        </div>
      ) : music.prompt ? (
        <SmallButton
          tone="accent"
          disabled={busy || media?.in_request}
          onClick={() => onRequest(['audio:music'], !!media?.asset_id && !media.stale)}
        >
          {media?.asset_id ? 'Regenerate music' : 'Generate music'}
        </SmallButton>
      ) : null}
      {media && (
        <div>
          <Badge tone={mediaStatus(media).tone}>{mediaStatus(media).label}</Badge>
        </div>
      )}
      <Player media={media} workspaceId={workspaceId} />
      {media?.error && <p className="text-[12px] text-[#C01048]">{media.error}</p>}
    </div>
  );
}

export function VoiceoverTab({ board, shot, workspaceId, onEdit, onRequest, busy }) {
  const voices = useVoices();
  const voiceId = board.audio?.voiceover?.voice_id || '';
  const media = board.media[`vo:${shot.id}`];
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(null);
  }, [shot.id, shot.vo_text, shot.vo_offset, voiceId]);
  const value = draft || { text: shot.vo_text || '', offset: shot.vo_offset ?? 0.3, voice: voiceId };
  const read = Math.round((value.text.length / CHARS_PER_SECOND) * 10) / 10;
  const room = Math.max(
    0,
    shot.duration_seconds - (shot.trim_start || 0) - (shot.trim_end || 0) - (Number(value.offset) || 0)
  );
  const save = async () => {
    // Lines are saved as a whole set: this shot's line replaces its old one, the others stay.
    const lines = board.shots
      .map((s) =>
        s.id === shot.id
          ? { shot_id: s.id, text: value.text.trim(), offset: Number(value.offset) || 0 }
          : { shot_id: s.id, text: s.vo_text || '', offset: s.vo_offset ?? 0.3 }
      )
      .filter((l) => l.text);
    if (await onEdit('set_audio', { voice_id: value.voice, lines })) setDraft(null);
  };
  return (
    <div className="space-y-3">
      <select className={inputClass} value={value.voice} onChange={(e) => setDraft({ ...value, voice: e.target.value })}>
        <option value="">Select a voice (for all lines)…</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} · {v.gender === 'female' ? 'female' : 'male'} · {v.description}
          </option>
        ))}
      </select>
      <textarea
        rows={3}
        className={inputClass}
        placeholder="VO line spoken in this shot (leave blank for no VO)"
        value={value.text}
        onChange={(e) => setDraft({ ...value, text: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-[#4C4D61]">
        <label className="flex items-center gap-1.5">
          <span>starts at</span>
          <input
            type="number"
            min={0}
            step={0.1}
            className={`${inputClass} w-20 py-1.5`}
            value={value.offset}
            onChange={(e) => setDraft({ ...value, offset: e.target.value })}
          />
          <span>sec</span>
        </label>
        {value.text && (
          <span className={read > room ? 'font-medium text-[#A05C07]' : 'text-[#5E5E72]'}>
            ~{read}s read · {Math.round(room * 10) / 10}s available
          </span>
        )}
      </div>
      {draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <SmallButton tone="accent" disabled={busy || (!!value.text.trim() && !value.voice)} onClick={save}>
            Save
          </SmallButton>
          <SmallButton onClick={() => setDraft(null)}>Cancel</SmallButton>
          {value.text.trim() && !value.voice && <span className="text-[12px] font-medium text-[#A05C07]">Select a voice first.</span>}
        </div>
      ) : shot.vo_text && media ? (
        <SmallButton
          tone="accent"
          disabled={busy || media.in_request}
          onClick={() => onRequest([`vo:${shot.id}`], !!media.asset_id && !media.stale)}
        >
          {media.asset_id ? 'Regenerate VO' : 'Generate VO'}
        </SmallButton>
      ) : null}
      {media && (
        <div>
          <Badge tone={mediaStatus(media).tone}>{mediaStatus(media).label}</Badge>
        </div>
      )}
      <Player media={media} workspaceId={workspaceId} />
      {media?.error && <p className="text-[12px] text-[#C01048]">{media.error}</p>}
    </div>
  );
}

export function CaptionTab({ shot, onEdit, busy }) {
  const [text, setText] = useState(shot.caption || '');
  useEffect(() => {
    setText(shot.caption || '');
  }, [shot.id, shot.caption]);
  const dirty = text.trim() !== (shot.caption || '');
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-[#5E5E72]">
        Text shown at the bottom of the screen during this shot (subtitle, tagline, or CTA). Free, burned in on Export.
      </p>
      <textarea
        rows={2}
        maxLength={140}
        className={inputClass}
        placeholder='e.g. "Order now on our app"'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {dirty && (
        <SmallButton tone="accent" disabled={busy} onClick={() => onEdit('update_shot', { id: shot.id, caption: text.trim() })}>
          Save caption
        </SmallButton>
      )}
    </div>
  );
}

export default function ShotPanel({
  board,
  shot,
  label,
  workspaceId,
  onEdit,
  onRequest,
  onSelect,
  busy,
  tab: requested,
  onTab,
  onClose = null,
}) {
  if (!shot) return null;
  const tab = requested === 'add' ? 'media' : requested; // 'add': the Media tab with its "new shot after" form open
  return (
    <div className="rounded-2xl border border-[#E8E9F0] bg-white p-4 shadow-[0_1px_3px_rgba(20,20,31,0.03)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[13.5px] font-semibold text-[#14141F]">
          Shot {label} <span className="font-normal text-[#5E5E72]">· {shot.title}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shot inspector"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[#7A7B90] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <div className="mb-3.5 grid grid-cols-4 gap-1 rounded-xl border border-[#ECECF4] bg-[#F4F5F9] p-1">
        {SHOT_TABS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={`rounded-lg px-1.5 py-1.5 text-[11.5px] font-medium transition ${
              tab === id
                ? 'bg-white text-[#4C38D6] shadow-[0_1px_2px_rgba(20,20,31,0.06)]'
                : 'text-[#5E5E72] hover:text-[#14141F]'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === 'media' && (
        <MediaTab
          board={board}
          shot={shot}
          workspaceId={workspaceId}
          onEdit={onEdit}
          onRequest={onRequest}
          onSelect={onSelect}
          busy={busy}
          startAdding={requested === 'add' ? 'after' : null}
        />
      )}
      {tab === 'music' && <MusicTab board={board} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />}
      {tab === 'voiceover' && (
        <VoiceoverTab board={board} shot={shot} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />
      )}
      {tab === 'caption' && <CaptionTab shot={shot} onEdit={onEdit} busy={busy} />}
    </div>
  );
}
