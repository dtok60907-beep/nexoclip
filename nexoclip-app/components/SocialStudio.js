'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';

export default function SocialStudio({ workspaceId }) {
  const [data, setData] = useState(null);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [content, setContent] = useState('');
  const [assetId, setAssetId] = useState('');
  const [date, setDate] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const requestId = useRef(null);
  const sending = useRef(false);

  const api = useCallback((body) => saasFetch('/api/social', { headers: { 'x-workspace-id': workspaceId,
    ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }), [workspaceId]);
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const result = await api();
    setData(result);
    setChannelId(current => result.channels.some(c => c.id === current && !c.disabled) ? current : result.channels.find(c => c.identifier === 'linkedin' && !c.disabled)?.id || '');
  }, [api, workspaceId]);

  useEffect(() => {
    let active = true;
    setData(null); setAssets([]); setError(''); setUncertain(false); requestId.current = null;
    if (!workspaceId) return;
    Promise.all([api(), saasFetch('/api/assets', { headers: { 'x-workspace-id': workspaceId } })])
      .then(([status, media]) => {
        if (!active) return;
        setData(status);
        setChannelId(status.channels.find(c => c.identifier === 'linkedin' && !c.disabled)?.id || '');
        setAssets((media.assets || []).filter(a => /^(image|video)\//.test(a.content_type)));
      }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [api, workspaceId]);

  async function action(body) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); setNotice('');
    let submitted = false;
    try {
      const result = await api(body);
      if (body.action === 'connect') { window.location.assign(result.url); return; }
      if (body.action === 'submit') {
        submitted = true;
        setNotice(body.type === 'draft' ? 'Draft saved.' : 'Post scheduled.');
        setContent(''); setAssetId(''); setDate(''); requestId.current = null;
      }
      if (body.action === 'cancel') setNotice('Post removed from your publishing timeline.');
      await refresh();
    } catch (e) {
      setError(e.message);
      if (body.action === 'submit' && !submitted && (e.status >= 500 || !e.status || e.code === 'SOCIAL_SUBMISSION_PENDING')) {
        setUncertain(true);
      }
    } finally { sending.current = false; setBusy(false); }
  }
  function submit(type) {
    if (busy || uncertain) return;
    requestId.current ||= crypto.randomUUID();
    void action({ action: 'submit', type, content, channelId, assetId,
      date: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null, idempotencyKey: requestId.current });
  }
  const selected = assets.find(a => a.id === assetId);
  const canCompose = data?.canManage && channelId && !busy && !uncertain;
  const inputClass = 'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-lime-300/60 disabled:opacity-50';
  const primaryClass = 'rounded-xl bg-lime-300 px-5 py-3 text-sm font-semibold text-black hover:bg-lime-200 disabled:opacity-40';
  return <div className="h-full overflow-y-auto bg-[#0b0c0b] px-5 py-8 sm:px-9">
    <div className="mx-auto max-w-6xl space-y-7 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">NexoClip Social</p>
          <h2 className="text-3xl font-semibold tracking-tight">Create here. Share everywhere.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">Bring your work to LinkedIn. Connect an account, write your story, and choose when it goes live.</p></div>
        <button disabled={busy} onClick={() => refresh().catch(e => setError(e.message))} className="rounded-xl border border-white/15 px-4 py-2 text-sm disabled:opacity-40">Refresh</button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-lime-300/20 bg-lime-300/5 p-4 text-sm text-lime-200">{notice}</p>}
      {!workspaceId && <p className="text-white/60">Select a workspace to continue.</p>}
      {!data && workspaceId && !error && <p role="status" className="text-white/50">Loading your social workspace…</p>}
      {data?.status === 'unavailable' && <section className="rounded-2xl border border-white/10 p-8"><h3 className="text-xl font-medium">Social publishing is being prepared</h3><p className="mt-2 text-sm text-white/50">Your workspace is ready. Account connections will appear once the service is configured.</p></section>}
      {data?.status === 'inactive' && <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
        <h3 className="text-xl font-medium">Your own publishing space</h3><p className="mb-6 mt-2 text-sm text-white/50">Keep your connected accounts and posts together in this NexoClip workspace.</p>
        <button className={primaryClass} disabled={busy || !data.canManage} onClick={() => action({ action: 'activate' })}>{busy ? 'Setting up…' : 'Activate Social'}</button>
        {!data.canManage && <p className="mt-3 text-sm text-white/50">Ask your workspace owner or admin to activate Social.</p>}
      </section>}
      {['provisioning', 'needs_review'].includes(data?.status) && <p role="status" className="rounded-xl border border-amber-300/20 p-5 text-sm text-amber-100">Workspace setup is awaiting confirmation. Refresh shortly; contact support if this persists.</p>}
      {data?.status === 'ready' && <>
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-medium">Connected accounts</h3><p className="mt-1 text-xs text-white/40">Only available to this workspace.</p></div>
            <button disabled={busy || !data.canManage || !data.linkedinEnabled} className={primaryClass} onClick={() => action({ action: 'connect' })}>Connect LinkedIn</button></div>
          {!data.linkedinEnabled && <p className="mt-4 text-sm text-white/50">LinkedIn connections are being prepared. Your existing accounts and posts remain here.</p>}
          <div className="mt-5 flex flex-wrap gap-3">{data.channels.length ? data.channels.map(channel => <div key={channel.id} className="rounded-xl border border-white/10 px-4 py-3 text-sm"><span className="font-medium">{channel.name}</span><span className="ml-3 text-white/40">{channel.identifier}{channel.disabled ? ' · Reconnect needed' : ' · Connected'}</span></div>) : <p className="text-sm text-white/40">Connect your first account to start publishing.</p>}</div>
        </section>
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <section className="space-y-5 rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-medium">New post</h3>
            <label className="block space-y-2 text-xs text-white/50"><span>Publish to</span><select className={inputClass} value={channelId} disabled={busy || uncertain} onChange={e => { setChannelId(e.target.value); requestId.current = null; }}><option value="">Choose an account</option>{data.channels.filter(c => c.identifier === 'linkedin' && !c.disabled).map(c => <option key={c.id} value={c.id}>{c.name} · LinkedIn</option>)}</select></label>
            <label className="block space-y-2 text-xs text-white/50"><span>Caption</span><textarea rows={7} maxLength={3000} className={inputClass} value={content} disabled={busy || uncertain} onChange={e => { setContent(e.target.value); requestId.current = null; }} placeholder="What’s the story behind your creation?" /><span className="block text-right">{content.length}/3,000</span></label>
            <label className="block space-y-2 text-xs text-white/50"><span>Image or video from your workspace (optional)</span><select className={inputClass} value={assetId} disabled={busy || uncertain} onChange={e => { setAssetId(e.target.value); requestId.current = null; }}><option value="">Text only</option>{assets.map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>
            {selected && (selected.content_type.startsWith('video/') ? <video controls preload="metadata" src={selected.url} className="max-h-64 w-full rounded-xl bg-black" /> : <img alt={selected.filename} src={selected.url} className="max-h-64 w-full rounded-xl object-contain" />)}
            <label className="block space-y-2 text-xs text-white/50"><span>Publish time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><input type="datetime-local" className={inputClass} value={date} disabled={busy || uncertain} onChange={e => { setDate(e.target.value); requestId.current = null; }} /></label>
            {uncertain && <p role="alert" className="text-sm text-amber-200">The previous submission could not be confirmed. Refresh the list and contact support before resubmitting, to avoid duplicate posts.</p>}
            {!data.canManage && <p className="text-sm text-white/50">A workspace owner or admin can connect accounts and schedule posts.</p>}
            <div className="flex flex-wrap gap-3"><button disabled={!canCompose || !content.trim()} onClick={() => submit('draft')} className="rounded-xl border border-white/15 px-5 py-3 text-sm disabled:opacity-40">Save draft</button><button disabled={!canCompose || !content.trim() || !date} onClick={() => submit('schedule')} className={primaryClass}>{busy ? 'Saving…' : 'Schedule post'}</button></div>
          </section>
          <section className="rounded-2xl border border-white/10 p-6"><h3 className="text-lg font-medium">Your publishing timeline</h3><p className="mb-5 mt-2 text-xs text-white/40">Last 30 days and the next 90 days · displayed in your local time</p>
            {data.posts.length ? <ul className="space-y-3">{data.posts.map(post => (
              <li key={post.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex justify-between gap-3 text-xs"><span className="text-white/50">{post.channelName || 'LinkedIn'}</span><span className="text-lime-200">{post.state}</span></div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-white/80">{post.content || 'Media post'}</p>
                {post.publishDate && <p className="mt-3 text-xs text-white/40">{new Date(post.publishDate).toLocaleString()}</p>}
                {data.canManage && ['DRAFT', 'QUEUE', 'ERROR'].includes(post.state) && <button
                  className="mt-4 text-xs text-red-200 disabled:opacity-40" disabled={busy}
                  onClick={() => { if (window.confirm('Remove this post from the publishing timeline? A post already being published may still go live.')) action({ action: 'cancel', postId: post.id }); }}>
                  {post.state === 'QUEUE' ? 'Cancel scheduled post' : 'Delete draft'}
                </button>}
              </li>
            ))}</ul> : <div className="py-14 text-center"><p className="text-sm text-white/50">Your next story starts here.</p><p className="mt-2 text-xs text-white/30">Drafts and scheduled posts will appear in this timeline.</p></div>}
          </section>
        </div>
      </>}
    </div>
  </div>;
}
