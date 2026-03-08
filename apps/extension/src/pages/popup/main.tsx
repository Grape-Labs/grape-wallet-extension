import { useEffect, useState } from 'react';

import { Button, Card, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { TokenHolding, WalletAssetsResponse, WalletStateResponse } from '../../shared/models';

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

function formatAddress(address: string | undefined): string {
  if (!address) {
    return 'Unknown';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatTokenAmount(token: TokenHolding): string {
  const numeric = Number(token.amount);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString(undefined, {
      maximumFractionDigits: Math.min(Math.max(token.decimals, 0), 6)
    });
  }
  return token.amount;
}

function PopupPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [assets, setAssets] = useState<WalletAssetsResponse>({
    lamports: null,
    tokens: []
  });

  const refresh = async () => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
    setState(nextState);
    if (nextState.wallet.setup === 'ready') {
      const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({ type: 'wallet_get_assets' });
      setAssets(nextAssets);
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
        <KeyValueRow
          label="Public key"
          value={
            <div className="account-address">
              <span className="mono">{formatAddress(state.activeAccount?.publicKey)}</span>
              {state.activeAccount?.publicKey ? (
                <Button
                  tone="secondary"
                  className="mini-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(state.activeAccount!.publicKey);
                  }}
                >
                  Copy
                </Button>
              ) : null}
            </div>
          }
        />
        <KeyValueRow label="SOL balance" value={formatLamports(assets.lamports)} />
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

      <Card title="Token holdings">
        {assets.tokens.length === 0 ? (
          <p className="muted">No SPL token balances found for this account on the selected network.</p>
        ) : (
          <div className="token-list">
            {assets.tokens.map((token) => (
              <div key={token.mint} className="token-item">
                <div>
                  <strong>{token.symbol ?? 'SPL Token'}</strong>
                  <div className="muted mono token-mint">{formatAddress(token.mint)}</div>
                </div>
                <div className="token-amount">{formatTokenAmount(token)}</div>
              </div>
            ))}
          </div>
        )}
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
