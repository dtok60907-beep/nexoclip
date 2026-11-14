'use client';

import { useState } from 'react';

function VideoThumbnail({ url, filename }) {
  const [failed, setFailed] = useState(false);
  return <span className="nx-video-thumbnail">
    {failed ? <span className="nx-video-fallback">Video preview unavailable</span> : <video
      src={`${url.split('#')[0]}#t=0.1`} muted playsInline preload="metadata"
      aria-label={`Preview of ${filename}`} onError={() => setFailed(true)}
    />}
    <span className="nx-video-play" aria-hidden="true">▶</span>
  </span>;
}

const MEDIA_TYPES = [['image', 'Images'], ['video', 'Videos'], ['audio', 'Audio']];

export default function WorkspaceLibrary({ kind, data, authStatus, onSignIn, selection }) {
  const [mediaType, setMediaType] = useState('image');
  const projects = kind === 'projects';
  const items = projects ? data[kind] : data[kind].filter((item) => item.type === mediaType);
  return <main className="nx-library nx-content-page">
    <h1>{projects ? 'Projects' : 'Media Library'}</h1>
    <p>{projects ? 'Your workspace projects, all in one place.' : 'Images, videos, and audio saved to your workspace.'}</p>
    {!projects && <div className="nx-library-filters" role="group" aria-label="Media type">{MEDIA_TYPES.map(([type, label]) => <button key={type} type="button" aria-pressed={mediaType === type} onClick={() => setMediaType(type)}>{label}</button>)}</div>}
    {data.loading ? <p role="status">Loading…</p> : authStatus !== 'authenticated' ? <button onClick={onSignIn}>Sign in to view your workspace</button> : data.errors[kind] ? <div role="alert">Unable to load your {kind}. <button onClick={data.retry}>Try again</button></div> : !items.length ? <p role="status">No {projects ? 'projects' : MEDIA_TYPES.find(([type]) => type === mediaType)[1].toLowerCase()} yet. Your saved work will appear here.</p> : <div className="nx-library-grid">{items.map((item) => projects
      ? <details key={item.id} open={selection === item.id || undefined} className="nx-library-item"><summary>{item.name}</summary><p>{item.description || 'No description yet.'}</p><small>Updated {new Date(item.updated_at || item.created_at).toLocaleDateString()}</small></details>
      : <a className="nx-library-item" key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">{item.type === 'image' ? <img src={item.url} alt="" loading="lazy" /> : item.type === 'video' ? <VideoThumbnail key={item.url} url={item.url} filename={item.filename} /> : <span className="nx-media-kind">♫ Audio</span>}<strong>{item.filename}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></a>
    )}</div>}
  </main>;
}
