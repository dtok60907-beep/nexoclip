'use client';
import { useEffect, useState } from 'react';

// Shown only to an operator signed in as a customer: who they are viewing, whether
// they may act, and the way back to their own session. Customers never get the cookie.
export default function ImpersonationBanner() {
  const [state, setState] = useState(null);
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
