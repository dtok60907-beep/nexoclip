'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NxIcon } from './ui/nx-icon';
import ModelSelect from './ui/model-select';
import { openRouterT2IModels, openRouterT2VModels } from '../packages/studio/src/models';

const catalogs = { video: openRouterT2VModels, image: openRouterT2IModels };

const DEFAULT_TYPING_PROMPTS = [
  'Create a natural UGC product ad with a strong 3-second hook and handheld demo...',
  'Turn our product photo into a studio-lit 9:16 commercial launch reveal...',
  'Direct a cinematic micro-drama confrontation in a rain-lit hallway with 50mm lens...',
  'Generate an editorial stone-plinth campaign keyframe with soft morning shadows...',
];

// Isolated leaf component so typewriter ticks never re-render HomeComposer or ModelSelect.
const TypewriterOverlay = memo(function TypewriterOverlay({ phrases, placeholder }) {
  const [typedPlaceholder, setTypedPlaceholder] = useState('');

  useEffect(() => {
    setTypedPlaceholder('');
  }, [phrases]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTypedPlaceholder(phrases[0] || placeholder || '');
      return undefined;
    }

    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timerId = null;

    const tick = () => {
      const currentPhrase = phrases[phraseIndex % phrases.length] || '';
      if (!deleting) {
        charIndex = Math.min(charIndex + 1, currentPhrase.length);
        setTypedPlaceholder(currentPhrase.slice(0, charIndex));
        if (charIndex >= currentPhrase.length) {
          deleting = true;
          timerId = window.setTimeout(tick, 2000);
          return;
        }
        timerId = window.setTimeout(tick, 42);
      } else {
        charIndex = Math.max(charIndex - 1, 0);
        setTypedPlaceholder(currentPhrase.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timerId = window.setTimeout(tick, 360);
          return;
        }
        timerId = window.setTimeout(tick, 22);
      }
    };

    timerId = window.setTimeout(tick, 320);
    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [phrases, placeholder]);

  return (
    <div className="nx-composer-typewriter" aria-hidden="true">
      <span>{typedPlaceholder}</span>
      <i className="nx-composer-caret" />
    </div>
  );
});

export default function HomeComposer({ mode, setMode, prompt, setPrompt, promptRef, onCreate, placeholder, typingPrompts }) {
  const prefersReducedMotion = useReducedMotion();
  const [choices, setChoices] = useState({ video: 'seedance-2.5-text-to-video', image: openRouterT2IModels[0].id });
  const [focused, setFocused] = useState(false);
  const phrases = useMemo(
    () => (Array.isArray(typingPrompts) && typingPrompts.length > 0 ? typingPrompts : DEFAULT_TYPING_PROMPTS),
    [typingPrompts]
  );
  const modelOptions = useMemo(() => {
    const videoItems = openRouterT2VModels.map((model) => ({
      id: `video-${model.id}`,
      label: model.name,
      value: model.id,
      kind: 'video',
      description: `${model.provider_name || 'Video'} • Video generation`,
      icon: <NxIcon name="video" size={15} />,
    }));
    const imageItems = openRouterT2IModels.map((model) => ({
      id: `image-${model.id}`,
      label: model.name,
      value: model.id,
      kind: 'image',
      description: `${model.provider_name || 'Image'} • Image generation`,
      icon: <NxIcon name="image" size={15} />,
    }));
    return [...videoItems, ...imageItems];
  }, []);
  const picker = useRef(null);
  const attachmentRef = useRef(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => { sequence.current++; if (attachmentRef.current) URL.revokeObjectURL(attachmentRef.current.url); }, []);

  const removeAttachment = () => {
    sequence.current++;
    if (attachmentRef.current) URL.revokeObjectURL(attachmentRef.current.url);
    attachmentRef.current = null;
    setAttachment(null);
    setError('');
  };
  const selectFiles = async (files) => {
    if (busyRef.current) return;
    setError('');
    if (files.length !== 1) { setError('Choose one reference at a time. Remove it to choose another.'); return; }
    const file = files[0];
    const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const video = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!image && !video) { setError('Use a JPG, PNG, WebP image or an MP4, WebM, MOV video. Documents are not supported by these studios.'); return; }
    if (!file.size || file.size > (image ? 10 : 50) * 1024 * 1024) { setError(image ? 'Choose an image between 1 byte and 10 MB.' : 'Choose a video between 1 byte and 50 MB.'); return; }
    if (mode === 'image' && video) { setError('Switch to Video Studio before attaching a video.'); return; }
    const ticket = ++sequence.current;
    const url = URL.createObjectURL(file);
    busyRef.current = true;
    setBusy('Preparing reference');
    try {
      await new Promise((resolve, reject) => {
        const media = image ? new Image() : document.createElement('video');
        const cleanup = () => { clearTimeout(timeout); media.onload = media.onerror = media.onloadedmetadata = null; if (!image) { media.removeAttribute('src'); media.load(); } };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('Preview timed out. Try a smaller or different file.')); }, 15000);
        const done = () => { cleanup(); resolve(); };
        media.onerror = () => { cleanup(); reject(new Error('This file could not be read. Choose another reference.')); };
        if (image) media.onload = done; else { media.preload = 'metadata'; media.onloadedmetadata = done; }
        media.src = url;
      });
      if (ticket !== sequence.current) { URL.revokeObjectURL(url); return; }
      if (attachmentRef.current) URL.revokeObjectURL(attachmentRef.current.url);
      const item = { file, url, image };
      attachmentRef.current = item;
      setAttachment(item);
      if (mode === 'director') setMode(image ? 'image' : 'video');
    } catch (err) { URL.revokeObjectURL(url); if (ticket === sequence.current) setError(err.message); }
    finally { busyRef.current = false; if (ticket === sequence.current) setBusy(''); }
  };
  const submit = async () => {
    if (busyRef.current || (!prompt.trim() && !attachment)) return;
    if (attachment && mode === 'director') { setError('AI Director accepts text here. Select Image or Video Studio to use your reference.'); return; }
    if (attachment && mode === 'image' && !attachment.image) { setError('This video needs Video Studio.'); return; }
    busyRef.current = true; setBusy('Opening studio'); setError('');
    try {
      const opened = await onCreate(mode, prompt.trim(), attachment ? [attachment.file] : [], choices[mode]);
      if (opened === false) setError('Sign in to continue. Your draft is still here.');
    } catch { setError('Could not open the studio. Your reference is still here; please try again.'); }
    finally { busyRef.current = false; setBusy(''); }
  };

  return <div className={`nx-composer-wrap${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; }}
    onDragLeave={(event) => { event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }}>
    <div className={`nx-composer-status${busy || dragging || attachment ? ' is-visible' : ''}`}><span>NexoClip <span className="nx-composer-divider">/</span> Creative workspace</span><span role="status" aria-live="polite">{busy && <i className="nx-composer-spinner" />}{busy || (dragging ? 'Drop your reference here' : attachment ? 'Reference ready' : 'Ready when you are')}</span></div>
    <div data-tour="home-composer" className="nx-composer" aria-busy={Boolean(busy)}>
      <AnimatePresence initial={false}>
        {attachment && (
          <motion.div
            key="composer-attachment"
            className="nx-composer-files"
            initial={prefersReducedMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <div className="nx-composer-file">
              {attachment.image ? <img src={attachment.url} alt={`Reference: ${attachment.file.name}`} /> : <span className="nx-composer-file-icon"><NxIcon name="file" size={20} /></span>}
              <span className="nx-composer-file-info"><strong title={attachment.file.name}>{attachment.file.name}</strong><small>{(attachment.file.size / 1024 / 1024).toFixed(1)} MB / Ready</small></span>
              <motion.button
                type="button"
                disabled={Boolean(busy)}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                onClick={removeAttachment}
                aria-label={`Remove ${attachment.file.name}`}
              >
                <NxIcon name="close" size={18} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="nx-composer-input-area">
        <textarea
          ref={promptRef}
          value={prompt}
          disabled={Boolean(busy)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={focused ? (placeholder || 'Describe what you want to create...') : ' '}
          aria-label="Creative brief"
          aria-describedby="nx-composer-help"
        />
        {!prompt && !focused && (
          <TypewriterOverlay phrases={phrases} placeholder={placeholder} />
        )}
      </div>
      <div className="nx-composer-controls">
        <input ref={picker} type="file" hidden accept={mode === 'image' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'} onChange={(event) => { selectFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <motion.button
          type="button"
          className="nx-composer-attach"
          disabled={Boolean(busy)}
          aria-label="Attach a reference"
          title="Attach image or video"
          whileHover={busy || prefersReducedMotion ? undefined : { scale: 1.07 }}
          whileTap={busy || prefersReducedMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
          onClick={() => picker.current?.click()}
        >
          <NxIcon name="plus" size={18} />
        </motion.button>
        <div className="nx-composer-model-slot">
          <ModelSelect
            data={modelOptions}
            value={choices[mode] || choices.video}
            defaultValue="seedance-2.5-text-to-video"
            disabled={Boolean(busy)}
            onChange={(id, item) => {
              const kind = item?.kind || (openRouterT2IModels.some((m) => m.id === id) ? 'image' : 'video');
              setChoices((previous) => ({ ...previous, [kind]: id }));
              setMode(kind);
              setError('');
            }}
          />
        </div>
        <motion.button
          type="button"
          className="nx-composer-send"
          disabled={Boolean(busy) || (!prompt.trim() && !attachment)}
          whileHover={busy || (!prompt.trim() && !attachment) || prefersReducedMotion ? undefined : { scale: 1.07 }}
          whileTap={busy || (!prompt.trim() && !attachment) || prefersReducedMotion ? undefined : { scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
          onClick={submit}
          aria-label="Open studio with this brief"
          title="Open studio"
        >
          {busy ? <i className="nx-composer-spinner" /> : <NxIcon name="send" size={18} />}
        </motion.button>
      </div>
    </div>
    <p id="nx-composer-help" className="nx-composer-help nx-reference-sr">One reference. Images up to 10 MB; videos up to 50 MB. Upload continues in the studio.</p>
    {error && <p className="nx-composer-error" role="alert">{error}</p>}
  </div>;
}
