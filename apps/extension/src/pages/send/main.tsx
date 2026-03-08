import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { SendTransferResponse, TokenHolding, WalletAssetsResponse, WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { mountPage } from '../lib';

type AssetOption =
  | { id: 'sol'; label: 'SOL'; balance: string; asset: { kind: 'sol' } }
  | {
      id: string;
      label: string;
      balance: string;
      asset: { kind: 'spl-token'; mint: string; decimals: number; programId: string };
    };

function formatLamports(lamports: number | null): string {
  if (lamports === null) {
    return 'Unavailable';
  }
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  })} SOL`;
}

function formatTokenAmount(token: TokenHolding): string {
  const numeric = Number(token.amount);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.min(Math.max(token.decimals, 0), 6)
    });
  }
  return token.amount;
}

function formatAddress(address: string | undefined): string {
  if (!address) {
    return 'Unknown';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function SendPage() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [assets, setAssets] = useState<WalletAssetsResponse>({
    lamports: null,
    tokens: []
  });
  const [assetId, setAssetId] = useState('sol');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendTransferResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
      setState(nextState);
      if (nextState.wallet.setup === 'ready') {
        const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({ type: 'wallet_get_assets' });
        setAssets(nextAssets);
      }
    })();
  }, []);

  const assetOptions = useMemo<AssetOption[]>(() => {
    const tokenOptions = assets.tokens.map((token) => ({
      id: `${token.mint}:${token.programId}`,
      label: token.symbol ? `${token.symbol} token` : `${formatAddress(token.mint)} token`,
      balance: formatTokenAmount(token),
      asset: {
        kind: 'spl-token' as const,
        mint: token.mint,
        decimals: token.decimals,
        programId: token.programId
      }
    }));

    return [
      {
        id: 'sol',
        label: 'SOL',
        balance: formatLamports(assets.lamports),
        asset: { kind: 'sol' as const }
      },
      ...tokenOptions
    ];
  }, [assets]);

  const selectedAsset = assetOptions.find((option) => option.id === assetId) ?? assetOptions[0];

  useEffect(() => {
    const requestedAsset = searchParams.get('asset');
    const requestedMint = searchParams.get('mint');
    const requestedProgramId = searchParams.get('programId');

    if (requestedAsset === 'sol') {
      setAssetId('sol');
      return;
    }

    if (!requestedMint || !requestedProgramId || assetOptions.length === 0) {
      return;
    }

    const matched = assetOptions.find((option) => {
      return (
        option.asset.kind === 'spl-token' &&
        option.asset.mint === requestedMint &&
        option.asset.programId === requestedProgramId
      );
    });

    if (matched) {
      setAssetId(matched.id);
    }
  }, [assetOptions, searchParams]);

  if (!state) {
    return null;
  }

  if (state.wallet.setup !== 'ready') {
    return <PageShell title="Wallet not ready" subtitle="Create or import a wallet before sending assets." />;
  }

  const canUseUnlockedSigner = state.canUseUnlockedSigner;

  return (
    <PageShell
      title="Send"
      subtitle="Choose an asset, enter a recipient, and confirm."
      actions={<StatusPill tone={state.wallet.selectedNetwork === 'devnet' ? 'warning' : 'success'}>{state.wallet.selectedNetwork}</StatusPill>}
    >
      <Card title="From">
        <KeyValueRow label="Wallet" value={<span className="mono">{formatAddress(state.activeAccount?.publicKey)}</span>} />
        <KeyValueRow label="Available" value={selectedAsset?.balance ?? 'Unavailable'} />
      </Card>

      <Card title="Transfer details">
        <label className="stack">
          <span className="muted">Asset</span>
          <select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
            {assetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span className="muted">To</span>
          <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient public key" />
        </label>
        <label className="stack">
          <span className="muted">Amount</span>
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" inputMode="decimal" />
        </label>
      </Card>

      <Card title="Confirm">
        {canUseUnlockedSigner ? (
          <p className="muted">Wallet is already unlocked. You can send without re-entering your password.</p>
        ) : (
          <label className="stack">
            <span className="muted">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password to sign and send"
            />
          </label>
        )}
        <p className="muted">If the recipient token account does not exist, Grape creates it automatically for token transfers.</p>
      </Card>

      {result ? (
        <Card title="Sent">
          <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{result.signature}</span>} />
          <KeyValueRow label="Recipient" value={<span className="mono">{formatAddress(result.recipient)}</span>} />
          <KeyValueRow
            label="Amount"
            value={`${result.amount} ${result.asset.kind === 'sol' ? 'SOL' : formatAddress(result.asset.mint)}`}
          />
        </Card>
      ) : null}

      {error ? <p className="danger-box">{error}</p> : null}

      <div className="inline wrap-actions">
        <Button
          className="button-block"
          disabled={submitting || !selectedAsset}
          onClick={async () => {
            if (!selectedAsset) {
              return;
            }

            try {
              setSubmitting(true);
              setError(null);
              const nextResult = await sendRuntimeMessage<SendTransferResponse>({
                type: 'wallet_send_transfer',
                recipient,
                amount,
                password: password || undefined,
                asset: selectedAsset.asset
              });
              setResult(nextResult);
              const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({ type: 'wallet_get_assets' });
              setAssets(nextAssets);
              setRecipient('');
              setAmount('');
              setPassword('');
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : 'Unable to send transfer.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? 'Sending...' : 'Send now'}
        </Button>
      </div>
    </PageShell>
  );
}

mountPage(<SendPage />);
