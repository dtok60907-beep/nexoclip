'use client'
import { useEffect } from 'react';

const PROPERTY = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
const WIDGET = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || 'default';

// The Tawk.to support chat. Off until NEXT_PUBLIC_TAWK_PROPERTY_ID is set; never on admin
// pages or while an operator impersonates a customer. Signed-in visitors are identified
// (secure mode) with their workspace and balance, so the team sees who is asking.
// The main app's support chat, for the canvas: the identity endpoint lives on the main
// app, on the same domain.
export default function SupportChat({ identityUrl = '/api/support/identity' }: { identityUrl?: string }) {
  useEffect(() => {
    if (!PROPERTY || (window as unknown as { Tawk_API?: unknown }).Tawk_API) return;
    if (/^\/admin(\/|$)/.test(window.location.pathname)) return;
    if (document.cookie.split('; ').some((c) => c.startsWith('nexoclip_impersonation='))) return;
    const w = window as unknown as { Tawk_API?: Record<string, unknown>; Tawk_LoadStart?: Date }
    const api = (w.Tawk_API = w.Tawk_API || {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    w.Tawk_LoadStart = new Date();
    fetch(identityUrl, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      const id = data?.identity;
      if (!id) return;
      // Applied once the widget has loaded.
      api.visitor = { name: id.name, email: id.email, ...(id.hash ? { hash: id.hash } : {}) };
      api.onLoad = () => { try { api.setAttributes?.({ ...id.attributes, ...(id.hash ? { hash: id.hash } : {}) }, () => {}); } catch { /* attributes are optional */ } };
    }).catch(() => {}).finally(() => {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://embed.tawk.to/${PROPERTY}/${WIDGET}`;
      script.charset = 'UTF-8';
      script.setAttribute('crossorigin', '*');
      document.body.appendChild(script);
    });
  }, [identityUrl]);
  return null;
}
