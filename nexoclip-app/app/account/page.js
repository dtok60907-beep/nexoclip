'use client';

import { useCallback, useState } from 'react';
import SettingsContent from '../../components/SettingsContent';
import PricingModal from '../../components/PricingModal';

export default function AccountPage() {
  const [balance, setBalance] = useState(null);
  const [pricingTab, setPricingTab] = useState(null);
  const [workspaceTick, setWorkspaceTick] = useState(0);

  const refreshBalance = useCallback(async () => {
    const workspaceId =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem('nexoclip_workspace_id')
        : null;
    if (!workspaceId) return;
    try {
      const res = await fetch('/api/usage?scope=me&page=1&pageSize=1', {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'x-workspace-id': workspaceId },
      });
      if (res.ok) {
        const payload = await res.json().catch(() => ({}));
        setBalance(payload?.balance ?? null);
      }
    } catch {
      /* ignore transient errors */
    }
  }, []);

  const currentWorkspaceId =
    typeof window !== 'undefined'
      ? window.sessionStorage.getItem('nexoclip_workspace_id')
      : null;

  return (
    <>
      <SettingsContent
        standalone
        balance={balance}
        onBalanceChange={setBalance}
        onWorkspaceChanged={() => setWorkspaceTick((v) => v + 1)}
        onOpenPlans={() => setPricingTab('plans')}
        onOpenTopUp={() => setPricingTab('topup')}
      />
      <PricingModal
        key={workspaceTick}
        open={pricingTab !== null}
        initialTab={pricingTab || 'plans'}
        workspaceId={currentWorkspaceId}
        balance={balance}
        onCompleted={refreshBalance}
        onClose={() => setPricingTab(null)}
      />
    </>
  );
}
