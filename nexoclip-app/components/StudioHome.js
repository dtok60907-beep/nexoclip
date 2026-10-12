'use client';

import { useEffect, useRef, useState } from 'react';
import { HOME_VIDEO_SECTIONS } from './homeShowcaseVideos';

function VideoPreview({ item, onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => previous?.focus?.();
  }, []);

  return <dialog ref={dialog} className="suite-preview suite-video-preview" aria-label={item.title} onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="suite-preview-inner">
      <button className="studio-auth-close" onClick={onClose} aria-label="Close preview">×</button>
      <video src={item.url} controls autoPlay playsInline preload="metadata" />
      <div><span className="suite-video-modal-kicker">NEXOCLIP SHOWCASE</span><h2>{item.title}</h2><button className="suite-primary" onClick={onClose}>Back to showcase <span aria-hidden="true">↗</span></button></div>
    </div>
  </dialog>;
}

const CARD_VARIANTS = ['framed', 'overlay', 'poster', 'spotlight'];

function ShowcaseVideo({ item, sectionId, variant, index, onSelect }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const startPreview = () => {
      if (!video.dataset.loaded) {
        video.src = item.url;
        video.dataset.loaded = 'true';
        video.load();
      }
      video.play().catch(() => {});
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) startPreview();
      else video.pause();
    }, { rootMargin: '100px 0px', threshold: 0.15 });

    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [item.url]);

  const number = String(index + 1).padStart(2, '0');
  return <button type="button"
    className={`suite-card suite-card--${variant} suite-showcase-video`}
    onClick={() => onSelect(item)} aria-label={`Play ${item.title}`}>
    <span className="suite-showcase-video-frame suite-card-media">
      <video ref={videoRef} muted loop playsInline preload="none" aria-hidden="true" />
    </span>
    <span className={`suite-card-caption suite-card-caption--${variant}`}>
      {variant === 'poster' && <span className="suite-card-number" aria-hidden="true">{number}</span>}
      <span className="suite-card-caption-text"><span className="suite-card-title">{item.title}</span><span className="suite-card-kicker">{sectionId}</span></span>
      <span className="suite-card-arrow" aria-hidden="true">↗</span>
    </span>
  </button>;
}

export default function StudioHome({ onNavigate }) {
  const [mode, setMode] = useState('director');
  const [prompt, setPrompt] = useState('');
  const [preview, setPreview] = useState(null);
  const destination = mode === 'image' ? 'image' : mode === 'director' ? 'director' : 'video';
  const submitPrompt = () => onNavigate(destination, prompt.trim());

  return <main id="studio-home" className="suite-home suite-home-reference">
    <div className="suite-home-inner">
      <section className="suite-composer-hero" aria-labelledby="suite-home-title">
        <p className="suite-hero-kicker"><span /> YOUR CREATIVE STUDIO</p>
        <h1 id="suite-home-title">What are we making today?</h1>
        <div className="suite-mode-switch" role="tablist" aria-label="Choose a creation mode">
          {[['director', '✳', 'Director'], ['video', '▷', 'Video'], ['image', '✧', 'Image']].map(([id, icon, label]) => <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'is-selected' : ''} onClick={() => setMode(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
        </div>
        <div className="suite-prompt-box">
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitPrompt(); }} placeholder={mode === 'image' ? 'Describe the image you have in mind…' : 'Describe a scene, a feeling, or the story you want to tell…'} aria-label="Describe what you want to create" />
          <div className="suite-prompt-controls">
            <button className="suite-attach-button" type="button" title="Add a reference in the studio" onClick={() => onNavigate(destination, prompt.trim())}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Add reference</span></button>
            <span className="suite-prompt-hint">{mode === 'director' ? 'AI Director' : mode === 'image' ? 'Image Studio' : 'Video Studio'} <span aria-hidden="true">⌄</span></span>
            <button className="suite-generate-button" onClick={submitPrompt}>Create <span aria-hidden="true">↗</span></button>
          </div>
        </div>
        <div className="suite-prompt-ideas"><span>Try</span>{['A dreamy short film about summer', 'A product ad in soft morning light', 'A portrait from another world'].map(idea => <button key={idea} onClick={() => setPrompt(idea)}>{idea}</button>)}</div>
      </section>

      <div className="suite-video-library-intro"><span className="suite-showcase-live-dot" /><p>Made with Nexoclip</p><span>Real videos · Real ideas · All motion</span></div>
      <div className="suite-video-sections">
        {HOME_VIDEO_SECTIONS.map((section, index) => <section className={`suite-video-section suite-video-section-${section.layout}`} key={section.id} aria-labelledby={`showcase-${section.id}`}>
          <div className="suite-section-heading suite-reference-heading">
            <div><h2 id={`showcase-${section.id}`}>{section.title}</h2><p className="suite-video-section-description">{section.description}</p></div>
            <button className="suite-video-section-action" onClick={() => onNavigate('video')}>Explore videos <span aria-hidden="true">↗</span></button>
          </div>
          <div className={`suite-video-row suite-video-row--${section.variant || CARD_VARIANTS[index % CARD_VARIANTS.length]}`}>
            {section.videos.map((item, i) => <ShowcaseVideo key={item.id} item={item} index={i} sectionId={section.title}
              variant={section.variant || CARD_VARIANTS[index % CARD_VARIANTS.length]} onSelect={setPreview} />)}
          </div>
        </section>)}
      </div>
      <footer className="suite-footer"><span>nexoclip <span>— A home for your imagination.</span></span><span>Explore first. Create when you’re ready.</span></footer>
    </div>
    {preview && <VideoPreview item={preview} onClose={() => setPreview(null)} />}
  </main>;
}
