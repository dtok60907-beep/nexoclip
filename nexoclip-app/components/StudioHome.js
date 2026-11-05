'use client';

import { useState } from 'react';

export default function StudioHome({ onNavigate }) {
  const [mode, setMode] = useState('director');
  const [prompt, setPrompt] = useState('');
  const destination = mode === 'image' ? 'image' : mode === 'director' ? 'director' : 'video';
  const submitPrompt = () => onNavigate(destination, prompt.trim());

  return <main id="studio-home" className="suite-home suite-home-reference">
    <div className="suite-home-inner">
      <section className="suite-composer-hero" aria-labelledby="suite-home-title">
        <p className="suite-hero-kicker"><span /> YOUR CREATIVE STUDIO</p>
        <h1 id="suite-home-title">What will you create today?</h1>
        <p className="nx-home-subtitle">A scene. A story. Your next big idea.</p>
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

      <section className="nx-home-starters" aria-labelledby="nx-starter-title">
        <div><h2 id="nx-starter-title">A little inspiration to get started</h2><p>Pick a starting point. Make it your own in the studio.</p></div>
        <div className="nx-home-starter-grid">{[
          ['Product Ad', 'director', 'Create a cinematic product ad in soft morning light. Start with a close-up, reveal the product, and finish with a clean hero shot.'],
          ['UGC Video', 'director', 'Create a natural UGC-style product video with an engaging opening, a simple demonstration, and a friendly closing.'],
          ['Cinematic Shot', 'video', 'A cinematic tracking shot through a quiet city at blue hour, warm windows, subtle reflections, slow natural camera movement.'],
          ['Product Photo', 'image', 'An editorial product photograph on a warm stone pedestal, soft side lighting, subtle shadows, a clean neutral background.'],
        ].map(([label, tab, idea], index) => <button key={label} onClick={() => onNavigate(tab, idea)}><span className="nx-starter-number">0{index + 1}</span><span>{label}</span><span aria-hidden="true">↗</span></button>)}</div>
      </section>

      <footer className="suite-footer"><span>nexoclip <span>— A home for your imagination.</span></span><span>Explore first. Create when you’re ready.</span></footer>
    </div>
  </main>;
}
