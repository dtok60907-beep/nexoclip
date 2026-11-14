'use client';

import { useRef, useState } from 'react';

const WORKFLOWS = [
  { title: 'UGC Ads', kind: 'video', image: '/showcase/workflow-ugc.webp', prompt: 'Create a natural UGC-style product ad with a strong opening, a quick demo, and a friendly close.' },
  { title: 'Product Video', kind: 'video', image: '/showcase/workflow-product.webp', prompt: 'Create a polished product video with soft daylight, close-up details, and a clean hero shot.' },
  { title: 'Short Film', kind: 'cinema', image: '/showcase/workflow-film.webp', prompt: 'Create a cinematic short film with an atmospheric establishing shot and a quiet emotional reveal.' },
  { title: 'Storytelling', kind: 'director', image: '/showcase/workflow-story.webp', prompt: 'Tell a simple, memorable story around a morning coffee ritual.' },
  { title: 'Social Post', kind: 'image', image: '/showcase/workflow-social.webp', prompt: 'Create a polished vertical social post with a clear subject and natural light.' },
];

function editedLabel(date) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently updated';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  return `Edited ${Math.floor(hours / 24)}d ago`;
}

export default function StudioHome({ onNavigate, authStatus, data }) {
  const [mode, setMode] = useState('director');
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef(null);
  const workflowRef = useRef(null);
  const recent = [...data.projects].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);
  const channels = data.accounts;
  const destination = mode === 'image' ? 'image' : mode === 'director' ? 'director' : 'video';
  const explore = () => { workflowRef.current?.scrollIntoView({ block: 'nearest' }); workflowRef.current?.focus({ preventScroll: true }); };

  return <main id="studio-home" className="nx-dashboard">
    <section className="nx-cinematic" aria-labelledby="nx-cinematic-title">
      <img src="/showcase/airy-hero-1600.webp" srcSet="/showcase/airy-hero-800.webp 800w, /showcase/airy-hero-1600.webp 1600w" sizes="(max-width: 767px) 100vw, calc(100vw - 320px)" width="1600" height="533" alt="" fetchPriority="high" />
      <div className="nx-cinematic-copy"><span className="nx-cinematic-eyebrow">NEXOCLIP AI STUDIO</span><h2 id="nx-cinematic-title">Turn ideas into<br />video, with AI.</h2><p>Create UGC, product ads, or cinematic stories — in one studio.</p><div><button type="button" onClick={() => promptRef.current?.focus()}>＋ Create project</button><button type="button" className="nx-cinematic-secondary" onClick={explore}>Explore examples</button></div></div>
    </section>
    <section className="nx-dashboard-hero" aria-labelledby="suite-home-title">
      <h1 id="suite-home-title">What will you create today?</h1>
      <p>Turn ideas into scroll-stopping videos and marketing content with AI.</p>
      <div className="suite-mode-switch" role="group" aria-label="Choose a creation mode">
        {[
          ['director', '✳', 'Director'],
          ['video', '▷', 'Video'],
          ['image', '▧', 'Image'],
        ].map(([id, icon, label]) => <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? 'is-selected' : ''} onClick={() => setMode(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
      </div>
      <div className="suite-prompt-box">
        <textarea ref={promptRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onNavigate(destination, prompt.trim()); }} placeholder={mode === 'image' ? 'Describe the image you have in mind…' : 'Describe a video idea, campaign, or story you want to create…'} aria-label="Describe what you want to create" />
        <div className="suite-prompt-controls">
          <button className="suite-attach-button" type="button" title="Add a reference in the studio" onClick={() => onNavigate(destination, prompt.trim())}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Add reference</span></button>
          <select className="suite-prompt-hint" aria-label="Creation tool" value={mode} onChange={(event) => setMode(event.target.value)}><option value="director">AI Director</option><option value="video">Video Studio</option><option value="image">Image Studio</option></select>
          <button type="button" className="suite-generate-button" onClick={() => onNavigate(destination, prompt.trim())}>Create <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>

    <section ref={workflowRef} tabIndex={-1} className="nx-dashboard-section" aria-labelledby="nx-workflows-title">
      <div className="nx-dashboard-section-head"><h2 id="nx-workflows-title">Get started with popular workflows</h2><button type="button" onClick={explore}>Explore all <span aria-hidden="true">→</span></button></div>
      <div className="nx-workflow-grid">{WORKFLOWS.map((workflow) => <button type="button" key={workflow.title} className="nx-workflow-card" onClick={() => onNavigate(workflow.kind, workflow.prompt)}>
        <img src={workflow.image} alt="" width="400" height="260" loading="lazy" />
        <span className="nx-workflow-title"><span aria-hidden="true">✧</span>{workflow.title}</span>
      </button>)}</div>
    </section>

    <div className="nx-dashboard-lower nx-dashboard-gallery-layout">
      <section className="nx-dashboard-panel nx-projects-panel" aria-labelledby="nx-recent-title">
        <div className="nx-dashboard-section-head"><h2 id="nx-recent-title">Recent projects</h2><button type="button" onClick={() => onNavigate('projects')}>View all <span aria-hidden="true">→</span></button></div>
        {data.loading ? <div className="nx-dashboard-empty" role="status">Loading projects…</div> : data.errors.projects ? <div className="nx-dashboard-empty" role="alert"><p>Unable to load projects.</p><button type="button" onClick={data.retry}>Try again</button></div> : recent.length ? <div className="nx-project-grid">{recent.map((project) => <button type="button" key={project.id} className={`nx-project-tile${project.thumbnailUrl ? ' has-image' : ''}`} onClick={() => onNavigate('projects', project.id)}>
          {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" /> : <span className="nx-project-placeholder" aria-hidden="true">▱</span>}
          <span className="nx-project-caption"><strong>{project.name}</strong><small>{editedLabel(project.updated_at || project.created_at)}</small></span><span className="nx-project-arrow" aria-hidden="true">↗</span>
        </button>)}</div> : <div className="nx-dashboard-empty"><p>{authStatus === 'authenticated' ? 'Your saved projects will show up here.' : 'Sign in to keep your recent work in one place.'}</p><button type="button" onClick={() => onNavigate(authStatus === 'authenticated' ? 'director' : 'usage')}>{authStatus === 'authenticated' ? 'Start creating' : 'Sign in'} <span aria-hidden="true">→</span></button></div>}
      </section>

      <section className="nx-dashboard-panel nx-channels-panel" aria-labelledby="nx-channels-title">
        <div className="nx-dashboard-section-head"><h2 id="nx-channels-title">Connected channels</h2><button type="button" onClick={() => onNavigate('accounts')}>Manage <span aria-hidden="true">→</span></button></div>
        <p>Publish and run campaigns across your favorite platforms.</p>
        {data.errors.accounts && <p role="alert">Unable to check connections. <button type="button" onClick={data.retry}>Try again</button></p>}
        <div className="nx-channel-grid">
          <button type="button" className="nx-channel-card" onClick={() => onNavigate('accounts')}><span className="nx-channel-logo nx-tiktok-logo">♪</span><strong>TikTok</strong><small className={channels.some((channel) => channel.status === 'connected') ? 'is-connected' : ''}>{data.loading ? 'Checking…' : data.errors.accounts ? 'Unavailable' : channels.some((channel) => channel.status === 'connected') ? 'Connected' : authStatus === 'authenticated' ? 'Connect' : 'Sign in'}</small></button>
          <div className="nx-channel-card"><span className="nx-channel-logo nx-instagram-logo">◎</span><strong>Instagram</strong><small>Coming soon</small></div>
          <div className="nx-channel-card"><span className="nx-channel-logo nx-meta-logo">∞</span><strong>Meta Ads</strong><small>Coming soon</small></div>
        </div>
      </section>
    </div>
  </main>;
}
