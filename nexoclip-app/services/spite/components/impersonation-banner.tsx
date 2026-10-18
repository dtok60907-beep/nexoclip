'use client';
import { useEffect, useState } from 'react';

// The main app's impersonation banner, for the canvas: the cookie and the endpoint
// belong to the main app on the same domain. Customers never get the cookie.
export default function ImpersonationBanner() {
  const [state, setState] = useState<{ impersonating?: boolean; active?: boolean; email?: string; readOnly?: boolean } | null>(null);
  useEffect(() => {
    if (!document.cookie.split('; ').some((c) => c.startsWith('nexoclip_impersonation='))) return;
    fetch('/api/admin/impersonate', { credentials: 'same-origin' }).then((r) => r.json()).then(setState).catch(() => {});
  }, []);
  if (!state?.impersonating) return null;
  const leave = async () => {
    const response = await fetch('/api/admin/impersonate', { method: 'DELETE', credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    window.location.href = body.redirectTo || '/admin/accounts';
  };
  return (
    <div role="status" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483000, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', padding: '6px 12px', background: '#7c2d12', color: '#fff7ed', fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <span>{state.active
        ? <>Kamu sedang sebagai <b>{state.email}</b> · {state.readOnly ? 'lihat saja' : 'boleh beraksi'}</>
        : 'Sesi impersonate sudah berakhir.'}</span>
      <button type="button" onClick={leave} style={{ border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 10px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Kembali ke admin</button>
    </div>
  );
}
