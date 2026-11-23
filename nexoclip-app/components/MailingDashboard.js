'use client';

import { useState } from 'react';

export default function MailingDashboard() {
  const [form, setForm] = useState({ subject: '', html: '', text: '', scheduledAt: '' });
  const [state, setState] = useState({ busy: false, error: '', success: '' });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, error: '', success: '' });
    try {
      const response = await fetch('/api/admin/mailing/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create broadcast.');
      setState({ busy: false, error: '', success: `Draft created${result.broadcast?.id ? ` (${result.broadcast.id})` : ''}. Review and send from Resend.` });
    } catch (error) {
      setState({ busy: false, error: error.message, success: '' });
    }
  }

  return <main className="mx-auto max-w-4xl p-5"><h1 className="text-xl font-semibold">Mailing & Broadcasts</h1><p className="mt-1 text-sm text-white/50">Create a campaign draft for your Resend audience. Drafts are not sent automatically.</p>
    {state.error && <p role="alert" className="mt-4 rounded-lg border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{state.error}</p>}
    {state.success && <p role="status" className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">{state.success}</p>}
    <form onSubmit={submit} className="mt-5 space-y-4 rounded-xl border border-white/10 bg-white/[.03] p-5">
      <label className="block text-sm text-white/70">Subject<input required maxLength={200} value={form.subject} onChange={set('subject')} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white" /></label>
      <label className="block text-sm text-white/70">HTML email<textarea required maxLength={500000} rows={12} value={form.html} onChange={set('html')} placeholder="<h1>NexoClip Update</h1><p>...</p>" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white" /></label>
      <label className="block text-sm text-white/70">Plain text (optional)<textarea rows={4} value={form.text} onChange={set('text')} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white" /></label>
      <label className="block text-sm text-white/70">Schedule (optional)<input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} className="mt-2 block rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white" /></label>
      <button disabled={state.busy} className="rounded-lg bg-[#d4ff64] px-4 py-2 font-semibold text-black disabled:opacity-50">{state.busy ? 'Creating draft…' : 'Create broadcast draft'}</button>
    </form>
  </main>;
}
