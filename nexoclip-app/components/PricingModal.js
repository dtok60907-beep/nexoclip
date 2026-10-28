'use client';

import { useEffect, useRef, useState } from 'react';
import BillingContent from './BillingContent';
import CreditCalculator from './CreditCalculator';

const TABS = [['plans', 'Plans'], ['calculator', 'Calculator']];

export default function PricingModal({ workspaceId, balance, onCompleted, onRequireAuth, onClose }) {
  const dialog = useRef(null);
  const [tab, setTab] = useState('plans');

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
      <div className="suite-pricing-tabs" role="tablist" aria-label="Pricing view">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <button type="button" className="studio-auth-close" onClick={onClose} aria-label="Close pricing">×</button>
    </div>
    {tab === 'plans'
      ? <BillingContent
        workspaceId={workspaceId}
        balance={balance}
        onCompleted={onCompleted}
        onRequireAuth={onRequireAuth}
        embedded
      />
      : <main className="h-full overflow-auto p-4 text-white sm:p-6">
        <div className="mx-auto max-w-[1280px]">
          <h2 className="text-2xl font-bold">Credit calculator</h2>
          <p className="mb-5 mt-1 text-sm text-white/45">Pick a model, resolution, duration and how many. Combine videos and images to see which plan covers a month.</p>
          <CreditCalculator onChoosePlan={() => setTab('plans')} />
        </div>
      </main>}
  </dialog>;
}
