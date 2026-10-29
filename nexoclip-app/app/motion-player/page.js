'use client';

// The drawn-story player. The Motion studio frames this page with sandbox="allow-scripts" (an opaque origin, no
// cookies or storage, and the page's CSP forbids network requests), because each scene is drawing code an AI wrote.
// The studio posts the video in ({ type: 'nexoclip-story', props, audio, assets }); this page posts back that it is
// ready and which scenes failed to draw. { type: 'nexoclip-render' } renders the video to an MP4 here, in the
// viewer's browser (Remotion's web renderer), and posts the file's bytes back.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import DrawVideo, { DRAW_FPS, drawFrames } from '../../components/motion/draw/DrawVideo';
import { layoutOf } from '../../components/motion/draw/layout';

const toParent = (message) => window.parent.postMessage(message, '*');
// The preview draws at half the MP4's size (a quarter of the pixels, so it plays smoothly).

// The sandbox has no storage and reading it throws; the web renderer reads it, so hand it an in-memory one.
function memoryStorage() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.getItem('x'); return; } catch { /* sandboxed: replace below */ }
  const make = () => {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), clear: () => data.clear(), key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; } };
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    try { Object.defineProperty(window, name, { value: make(), configurable: true }); } catch { /* leave it */ }
  }
}

export default function MotionPlayerPage() {
  const [video, setVideo] = useState(null);
  const urls = useRef([]);
  const reported = useRef(new Set());

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window.parent || event.data?.type !== 'nexoclip-story') return;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
      // Audio comes as a URL the frame can play, or as bytes (a file only the signed-in page can read).
      const audio = (item) => {
        if (!item) return null;
        if (item.bytes) {
          const url = URL.createObjectURL(new Blob([item.bytes], { type: item.type || 'audio/mpeg' }));
          urls.current.push(url);
          return url;
        }
        return typeof item.url === 'string' ? item.url : null;
      };
      reported.current = new Set();
      // Pictures come the same way; Lottie animations come as their (already cleaned) JSON.
      const assets = Object.fromEntries(Object.entries(event.data.assets || {}).map(([key, asset]) => (
        asset?.type === 'lottie' ? [key, { type: 'lottie', data: asset.data }] : [key, { type: 'image', url: audio(asset?.file) }]
      )).filter(([, asset]) => asset.data || asset.url));
      setVideo({ ...event.data.props, voice: audio(event.data.audio?.voice), music: audio(event.data.audio?.music), assets });
    };
    window.addEventListener('message', onMessage);
    toParent({ type: 'nexoclip-player-ready' });
    return () => {
      window.removeEventListener('message', onMessage);
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Rendering: the same composition, encoded frame by frame in this browser.
  const videoRef = useRef(null);
  videoRef.current = video;
  useEffect(() => {
    let rendering = false;
    const onMessage = async (event) => {
      if (event.source !== window.parent || event.data?.type !== 'nexoclip-render' || rendering || !videoRef.current) return;
      rendering = true;
      try {
        memoryStorage();
        const { renderMediaOnWeb } = await import('@remotion/web-renderer');
        const props = { ...videoRef.current, onError: null };
        const result = await renderMediaOnWeb({
          composition: { component: DrawVideo, id: 'drawn-video', width: layoutOf(props.format).out[0], height: layoutOf(props.format).out[1], fps: DRAW_FPS, durationInFrames: Math.max(1, drawFrames(props.scenes || [], DRAW_FPS)), defaultProps: props },
          inputProps: props,
          container: 'mp4',
          videoBitrate: 'high',
          onProgress: (p) => toParent({ type: 'nexoclip-render-progress', progress: p.progress }),
        });
        const bytes = await (await result.getBlob()).arrayBuffer();
        window.parent.postMessage({ type: 'nexoclip-render-done', bytes }, '*', [bytes]);
      } catch (error) {
        toParent({ type: 'nexoclip-render-failed', message: String(error?.message || error).slice(0, 300) });
      } finally {
        rendering = false;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // { type: 'nexoclip-seek', seconds }: the studio's timeline jumps to a scene.
  const playerRef = useRef(null);
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window.parent || event.data?.type !== 'nexoclip-seek') return;
      playerRef.current?.seekTo(Math.max(0, Math.round(Number(event.data.seconds) * DRAW_FPS)));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onError = useMemo(() => (scene, message) => {
    if (reported.current.has(scene)) return;
    reported.current.add(scene);
    toParent({ type: 'nexoclip-player-error', scene, message: String(message).slice(0, 300) });
  }, []);

  const frames = video ? drawFrames(video.scenes || [], DRAW_FPS) : 1;
  return (
    <main style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b0b0f' }}>
      {video ? (
        <Player
          ref={playerRef}
          component={DrawVideo}
          inputProps={{ ...video, onError }}
          durationInFrames={Math.max(1, frames)}
          fps={DRAW_FPS}
          compositionWidth={layoutOf(video.format).out[0] / 2}
          compositionHeight={layoutOf(video.format).out[1] / 2}
          controls
          clickToPlay
          numberOfSharedAudioTags={32}
          style={{ width: '100%', height: '100%', maxHeight: '100vh', maxWidth: '100vw' }}
        />
      ) : <p style={{ color: '#888', font: '14px system-ui' }}>Memuat pratinjau…</p>}
    </main>
  );
}
