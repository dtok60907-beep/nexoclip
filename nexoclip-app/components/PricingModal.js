'use client';

import { useEffect, useRef } from 'react';
import BillingContent from './BillingContent';

export default function PricingModal({ workspaceId, balance, onCompleted, onRequireAuth, onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => previous?.focus?.();
  }, []);

  return <dialog
    ref={dialog}
    className="suite-pricing-dialog"
    aria-label="Pricing and credit top-up"
    onCancel={onClose}
    onClick={event => { if (event.target === dialog.current) onClose(); }}
  >
    <div className="suite-pricing-modal-head">
      <div><p className="suite-eyebrow">NEXOCLIP STUDIO</p><h2>Pricing</h2></div>
      <button type="button" className="studio-auth-close" onClick={onClose} aria-label="Close pricing">×</button>
    </div>
    <BillingContent
      workspaceId={workspaceId}
      balance={balance}
      onCompleted={onCompleted}
      onRequireAuth={onRequireAuth}
      embedded
    />
  </dialog>;
}
