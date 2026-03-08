import { useEffect, useState } from 'react';

import { Button, Card, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { openExtensionPage } from '../../shared/window';
import { mountPage } from '../lib';
import { OnboardingView } from '../onboarding/OnboardingView';

function formatLamports(lamports: number | null): string {
  if (lamports === null) {
    return 'Unavailable';
  }
  return `${(lamports / 1_000_000_000).toFixed(4)} SOL`;
}

function PopupPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = async () => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
    setState(nextState);
    if (nextState.wallet.setup === 'ready') {
      const nextBalance = await sendRuntimeMessage<{ lamports: number | null }>({ type: 'wallet_get_balance' });
      setBalance(nextBalance.lamports);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!state) {
    return null;
  }

  if (state.wallet.setup !== 'ready') {
    return (
      <PageShell title="Set up wallet" subtitle="Create or import your Solana wallet directly in the popup.">
        <Card title="First run">
          <p className="muted">
            The setup flow is available here now. If you want more room, open the full-page version.
          </p>
          <Button tone="secondary" className="button-block" onClick={() => openExtensionPage('onboarding.html')}>
            Open full-page setup
          </Button>
        </Card>
        <OnboardingView compact onComplete={refresh} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Wallet overview"
      subtitle="Chromium-first Solana wallet with explicit signing approvals."
      actions={
        <StatusPill tone={state.session.locked ? 'warning' : 'success'}>
          {state.session.locked ? 'Locked' : 'Unlocked'}
        </StatusPill>
      }
    >
      <Card title="Account">
        <KeyValueRow label="Public key" value={<span className="mono">{state.activeAccount?.publicKey ?? 'Unknown'}</span>} />
        <KeyValueRow label="Balance" value={formatLamports(balance)} />
        <KeyValueRow label="Connected sites" value={state.permissions.length} />
        <label className="stack">
          <span className="muted">Network</span>
          <select
            value={state.wallet.selectedNetwork}
            onChange={async (event) => {
              await sendRuntimeMessage({
                type: 'wallet_set_network',
                network: event.target.value as 'mainnet-beta' | 'devnet'
              });
              await refresh();
            }}
          >
            <option value="devnet">Devnet</option>
            <option value="mainnet-beta">Mainnet Beta</option>
          </select>
        </label>
      </Card>

      <Card title="Actions">
        <div className="inline">
          {state.session.locked ? (
            <Button onClick={() => openExtensionPage('unlock.html')}>Unlock</Button>
          ) : (
            <Button
              tone="secondary"
              onClick={async () => {
                await sendRuntimeMessage({ type: 'wallet_lock' });
                await refresh();
              }}
            >
              Lock now
            </Button>
          )}
          <Button tone="secondary" onClick={() => openExtensionPage('options.html')}>
            Settings
          </Button>
        </div>
        <p className="muted">
          Signing approvals remain explicit and require password confirmation in the approval window.
        </p>
      </Card>
    </PageShell>
  );
}

mountPage(<PopupPage />);
