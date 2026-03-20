import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { SendTransferResponse, TokenHolding, WalletAssetsResponse, WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { isBiometricUnlockSupported, unlockWithBiometric } from '../../shared/biometric';
import { mountPage } from '../lib';

type AssetOption =
  | { id: string; label: string; balance: string; asset: { kind: 'sol' } }
  | { id: string; label: string; balance: string; asset: { kind: 'sui' } }
  | { id: string; label: string; balance: string; asset: { kind: 'mon' } }
  | { id: string; label: string; balance: string; asset: { kind: 'eth' } }
  | {
      id: string;
      label: string;
      balance: string;
      asset: { kind: 'spl-token'; mint: string; decimals: number; programId: string };
    };

const SOLANA_SEND_FEE_RESERVE_SOL = 0.00001;
const SOLANA_TOKEN_SEND_RESERVE_SOL = 0.0021;

function formatNativeBalance(amount: number | null, decimals: number, symbol: string): string {
  if (amount === null) {
    return 'Unavailable';
  }
  return `${(amount / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  })} ${symbol}`;
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

function normalizeScannedRecipientInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const compact = trimmed.replace(/\s+/g, '');
  const schemeMatch = compact.match(/^([a-z0-9+.-]+):(.*)$/i);
  if (!schemeMatch) {
    return compact;
  }

  const [, scheme, remainder] = schemeMatch;
  const normalizedScheme = scheme.toLowerCase();
  if (!['solana', 'ethereum', 'evm', 'monad', 'sui'].includes(normalizedScheme)) {
    return compact;
  }

  const withoutSlashes = remainder.replace(/^\/\//, '').replace(/^\/+/, '');
  const address = withoutSlashes.split(/[/?#]/)[0]?.trim();
  return address || compact;
}

function SendPage() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const shouldAutoScan = searchParams.get('scan') === '1';
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
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricUnlocking, setBiometricUnlocking] = useState(false);
  const [recipientScannerVisible, setRecipientScannerVisible] = useState(false);
  const [recipientScannerLoading, setRecipientScannerLoading] = useState(false);
  const [recipientScannerError, setRecipientScannerError] = useState<string | null>(null);
  const recipientScannerVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void (async () => {
      const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
      setState(nextState);
      if (nextState.wallet.setup === 'ready') {
        const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({ type: 'wallet_get_assets' });
        setAssets(nextAssets);
      }
      try {
        setBiometricSupported(await isBiometricUnlockSupported());
      } catch {
        setBiometricSupported(false);
      }
    })();
  }, []);

  const assetOptions = useMemo<AssetOption[]>(() => {
    const selectedChain = state?.wallet.selectedChain ?? 'solana';
    const nativeSymbol =
      assets.nativeSymbol ?? (selectedChain === 'sui' ? 'SUI' : selectedChain === 'monad' ? 'MON' : selectedChain === 'ethereum' ? 'ETH' : 'SOL');
    const nativeDecimals = assets.nativeDecimals ?? (selectedChain === 'monad' || selectedChain === 'ethereum' ? 18 : 9);
    const nativeOption: AssetOption =
      selectedChain === 'sui'
        ? {
            id: 'sui',
            label: nativeSymbol,
            balance: formatNativeBalance(assets.lamports, nativeDecimals, nativeSymbol),
            asset: { kind: 'sui' }
          }
        : selectedChain === 'monad'
          ? {
              id: 'mon',
              label: nativeSymbol,
              balance: formatNativeBalance(assets.lamports, nativeDecimals, nativeSymbol),
              asset: { kind: 'mon' }
            }
          : selectedChain === 'ethereum'
            ? {
                id: 'eth',
                label: nativeSymbol,
                balance: formatNativeBalance(assets.lamports, nativeDecimals, nativeSymbol),
                asset: { kind: 'eth' }
              }
          : {
              id: 'sol',
              label: nativeSymbol,
              balance: formatNativeBalance(assets.lamports, nativeDecimals, nativeSymbol),
              asset: { kind: 'sol' }
            };
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
      nativeOption,
      ...tokenOptions
    ];
  }, [assets, state?.wallet.selectedChain]);

  const selectedAsset = assetOptions.find((option) => option.id === assetId) ?? assetOptions[0];
  const selectedAmountNumber = Number(amount || '0');
  const nativeSolBalance = typeof assets.lamports === 'number' ? assets.lamports / 1_000_000_000 : 0;
  const solanaGasWarning =
    state?.wallet.selectedChain !== 'solana' || !selectedAsset
      ? null
      : selectedAsset.asset.kind === 'spl-token'
        ? nativeSolBalance < SOLANA_TOKEN_SEND_RESERVE_SOL
          ? 'This wallet may not have enough SOL for network fees and recipient token account creation.'
          : null
        : selectedAsset.asset.kind === 'sol' && Number.isFinite(selectedAmountNumber) && selectedAmountNumber > 0
          ? nativeSolBalance <= selectedAmountNumber + SOLANA_SEND_FEE_RESERVE_SOL
            ? 'Leave some SOL in the wallet for network fees.'
            : null
          : null;

  useEffect(() => {
    const requestedAsset = searchParams.get('asset');
    const requestedMint = searchParams.get('mint');
    const requestedProgramId = searchParams.get('programId');

    if (requestedAsset === 'sol' || requestedAsset === 'sui' || requestedAsset === 'mon' || requestedAsset === 'eth') {
      setAssetId(requestedAsset);
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

  useEffect(() => {
    if (shouldAutoScan) {
      setRecipientScannerVisible(true);
      setError(null);
    }
  }, [shouldAutoScan]);

  async function handleBiometricUnlockForSigning() {
    if (!state?.wallet.wallets.length) {
      return;
    }

    const selectedWallet =
      state.wallet.wallets.find((entry) => entry.id === state.wallet.selectedWalletIdByChain?.[state.wallet.selectedChain]) ??
      state.wallet.wallets.find((entry) => entry.chain === state.wallet.selectedChain) ??
      state.wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setError(null);
      const unlockedPassword = await unlockWithBiometric(selectedWallet.biometricUnlock);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password: unlockedPassword
      });
      setPassword('');
      const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
      setState(nextState);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to unlock with device.');
    } finally {
      setBiometricUnlocking(false);
    }
  }

  useEffect(() => {
    if (!recipientScannerVisible) {
      return;
    }

    let active = true;
    let frameId = 0;
    let stream: MediaStream | null = null;

    const startScanner = async () => {
      const video = recipientScannerVideoRef.current;
      if (!video) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera scanning is not available in this browser.');
      }

      const detectorCtor = (
        window as Window & {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;
      if (!detectorCtor) {
        throw new Error('QR scanning is not available in this browser.');
      }

      setRecipientScannerError(null);
      setRecipientScannerLoading(true);
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment'
        },
        audio: false
      });

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      const detector = new detectorCtor({ formats: ['qr_code'] });

      const scanFrame = async () => {
        if (!active) {
          return;
        }

        if (video.readyState >= 2) {
          const codes = await detector.detect(video).catch(() => []);
          const match = codes.find((entry) => typeof entry.rawValue === 'string' && entry.rawValue.trim().length > 0);
          if (match?.rawValue) {
            const normalized = normalizeScannedRecipientInput(match.rawValue);
            if (normalized) {
              setRecipient(normalized);
              setRecipientScannerVisible(false);
              setRecipientScannerError(null);
              return;
            }
          }
        }

        frameId = window.requestAnimationFrame(() => {
          void scanFrame();
        });
      };

      setRecipientScannerLoading(false);
      void scanFrame();
    };

    void startScanner().catch((nextError) => {
      if (active) {
        setRecipientScannerLoading(false);
        setRecipientScannerVisible(false);
        const message = nextError instanceof Error ? nextError.message : 'Unable to start QR scanning.';
        setRecipientScannerError(message);
        setError(message);
      }
    });

    return () => {
      active = false;
      setRecipientScannerLoading(false);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const video = recipientScannerVideoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [recipientScannerVisible]);

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
          <div className="send-inline-actions">
            <Button tone="secondary" onClick={() => setRecipientScannerVisible((current) => !current)}>
              {recipientScannerVisible ? 'Close scanner' : 'Scan QR'}
            </Button>
          </div>
          {recipientScannerVisible ? (
            <div className="device-link-scanner">
              <video ref={recipientScannerVideoRef} className="device-link-scanner-video" muted />
              <p className="device-link-scanner-copy">
                {recipientScannerLoading ? 'Opening camera...' : 'Point the camera at a wallet QR to fill the recipient.'}
              </p>
              {recipientScannerError ? <p className="danger-box">{recipientScannerError}</p> : null}
            </div>
          ) : null}
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
          <div className="stack">
            <label className="stack">
              <span className="muted">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password to sign and send"
              />
            </label>
            {biometricSupported && state.activeWallet?.biometricEnabled ? (
              <div className="send-inline-actions">
                <Button tone="secondary" onClick={() => void handleBiometricUnlockForSigning()} disabled={biometricUnlocking}>
                  {biometricUnlocking ? 'Unlocking...' : 'Use device'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
        <p className="muted">If the recipient token account does not exist, Grape creates it automatically for token transfers.</p>
        {solanaGasWarning ? <p className="warning-box">{solanaGasWarning}</p> : null}
      </Card>

      {result ? (
        <Card title="Sent">
          <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{result.signature}</span>} />
          <KeyValueRow label="Recipient" value={<span className="mono">{formatAddress(result.recipient)}</span>} />
          <KeyValueRow
            label="Amount"
            value={`${result.amount} ${
              result.asset.kind === 'sol'
                ? 'SOL'
                : result.asset.kind === 'sui'
                  ? 'SUI'
                  : result.asset.kind === 'mon'
                    ? 'MON'
                    : result.asset.kind === 'eth'
                      ? 'ETH'
                      : result.asset.kind === 'sui-coin'
                        ? 'SUI TOKEN'
                        : result.asset.kind === 'evm-token'
                          ? result.asset.symbol ?? 'TOKEN'
                          : formatAddress(result.asset.mint)
            }`}
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
              setRecipientScannerVisible(false);
              setRecipientScannerError(null);
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
