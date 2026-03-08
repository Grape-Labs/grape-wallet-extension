import { useEffect, useMemo, useState } from 'react';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { Copy, Menu, QrCode, SendHorizontal } from 'lucide-react';
import QRCode from 'qrcode';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { SendTransferResponse, TokenHolding, WalletAssetsResponse, WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { openExtensionPage } from '../../shared/window';
import { mountPage } from '../lib';
import { OnboardingView } from '../onboarding/OnboardingView';

type PopupView = 'home' | 'send' | 'receive' | 'settings';
type HomeTab = 'tokens' | 'collectibles';
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
    maximumFractionDigits: 4
  })} SOL`;
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

function TokenRow(props: { token: TokenHolding; onSelect: () => void }) {
  return (
    <button type="button" className="token-row-button" onClick={props.onSelect}>
      <div className="token-item token-item-interactive">
        <div className="token-leading">
          <div className="token-avatar">{props.token.symbol?.slice(0, 1) ?? 'T'}</div>
          <div>
            <strong>{props.token.symbol ?? 'SPL Token'}</strong>
            <div className="muted mono token-mint">{formatAddress(props.token.mint)}</div>
          </div>
        </div>
        <div className="token-amount">{formatTokenAmount(props.token)}</div>
      </div>
    </button>
  );
}

function PopupPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [assets, setAssets] = useState<WalletAssetsResponse>({
    lamports: null,
    tokens: []
  });
  const [view, setView] = useState<PopupView>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('tokens');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [receiveQr, setReceiveQr] = useState('');
  const [assetId, setAssetId] = useState('sol');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendTransferResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const activePublicKey = state?.activeAccount?.publicKey;

  useEffect(() => {
    if (!activePublicKey) {
      setReceiveQr('');
      return;
    }

    void QRCode.toDataURL(activePublicKey, {
      margin: 1,
      width: 220,
      color: {
        dark: '#f5f1ea',
        light: '#10101a'
      }
    }).then(setReceiveQr);
  }, [activePublicKey]);

  const homeBalance = useMemo(() => formatLamports(assets.lamports), [assets.lamports]);
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
        balance: homeBalance,
        asset: { kind: 'sol' as const }
      },
      ...tokenOptions
    ];
  }, [assets, homeBalance]);

  const selectedAsset = assetOptions.find((option) => option.id === assetId) ?? assetOptions[0];

  async function handleCopyAddress() {
    if (!activePublicKey) {
      return;
    }
    await navigator.clipboard.writeText(activePublicKey);
    setCopiedAddress(true);
    window.setTimeout(() => setCopiedAddress(false), 1200);
  }

  function openSend(nextAssetId = 'sol') {
    setAssetId(nextAssetId);
    setSendError(null);
    setSendResult(null);
    setView('send');
  }

  async function handleSend() {
    if (!selectedAsset) {
      return;
    }

    try {
      setSubmitting(true);
      setSendError(null);
      const nextResult = await sendRuntimeMessage<SendTransferResponse>({
        type: 'wallet_send_transfer',
        recipient,
        amount,
        password: password || undefined,
        asset: selectedAsset.asset
      });
      setSendResult(nextResult);
      setRecipient('');
      setAmount('');
      setPassword('');
      await refresh();
    } catch (nextError) {
      setSendError(nextError instanceof Error ? nextError.message : 'Unable to send transfer.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!state) {
    return null;
  }

  if (state.wallet.setup !== 'ready') {
    return (
      <PageShell title="Set up wallet" subtitle="Create or import your Solana wallet directly in the popup.">
        <Card title="First run">
          <p className="muted">The setup flow is available here. Open the full page only if you want more room.</p>
          <Button tone="secondary" className="button-block" onClick={() => openExtensionPage('onboarding.html')}>
            Open full-page setup
          </Button>
        </Card>
        <OnboardingView compact onComplete={refresh} />
      </PageShell>
    );
  }

  const wallet = state.wallet;
  const session = state.session;
  const permissions = state.permissions;
  const canUseUnlockedSigner = state.canUseUnlockedSigner;
  const activeWallet = state.activeWallet;
  const recentRecipients = state.recentRecipients;

  async function handleWalletSelect(walletId: string) {
    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_select',
      walletId
    });
    setView('home');
    await refresh();
  }

  function renderWalletMenu() {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="menu-button" aria-label="Wallet menu">
            <Menu size={18} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={8} align="end" className="popup-menu-content">
            <div className="popup-menu-section">Wallets</div>
            <div className="wallet-menu-list">
              {wallet.wallets.map((walletEntry) => {
                const walletPublicKey =
                  walletEntry.accounts.find((account) => account.id === walletEntry.selectedAccountId)?.publicKey ??
                  walletEntry.accounts[0]?.publicKey;

                return (
                  <DropdownMenu.Item
                    key={walletEntry.id}
                    className={`wallet-menu-item ${wallet.selectedWalletId === walletEntry.id ? 'active' : ''}`.trim()}
                    onSelect={() => {
                      void handleWalletSelect(walletEntry.id);
                    }}
                  >
                    <div>
                      <strong>{walletEntry.name}</strong>
                      <div className="muted mono">{formatAddress(walletPublicKey)}</div>
                    </div>
                    {wallet.selectedWalletId === walletEntry.id ? <StatusPill tone="success">Active</StatusPill> : null}
                  </DropdownMenu.Item>
                );
              })}
            </div>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExtensionPage('onboarding.html?append=1&mode=create');
              }}
            >
              Create wallet
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExtensionPage('onboarding.html?append=1&mode=import');
              }}
            >
              Import wallet
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  function renderHome() {
    return (
      <>
        <Card className="wallet-home-card">
          <div className="wallet-home-topbar">
            <div className="wallet-home-network">
              <StatusPill tone={wallet.selectedNetwork === 'devnet' ? 'warning' : 'success'}>{wallet.selectedNetwork}</StatusPill>
            </div>
            <div className="wallet-home-controls">
              <StatusPill tone={session.locked ? 'warning' : 'success'}>{session.locked ? 'Locked' : 'Ready'}</StatusPill>
              {renderWalletMenu()}
            </div>
          </div>

          <div className="wallet-home-header compact">
            <div className="wallet-address-row">
              <div className="mono account-primary" title={activePublicKey ?? 'Unknown'}>
                {formatAddress(activePublicKey)}
              </div>
            </div>
            <Button tone="secondary" className="mini-button" onClick={handleCopyAddress}>
              <span className="button-icon"><Copy size={14} /></span>
              {copiedAddress ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="wallet-home-balance">
            <div className="hero-balance">{homeBalance}</div>
          </div>

          <div className="quick-actions compact">
            <button type="button" className="quick-action-card" onClick={() => openSend('sol')}>
              <span className="quick-action-icon"><SendHorizontal size={18} /></span>
              <strong>Send</strong>
            </button>
            <button type="button" className="quick-action-card" onClick={() => setView('receive')}>
              <span className="quick-action-icon"><QrCode size={18} /></span>
              <strong>Receive</strong>
            </button>
          </div>
        </Card>

        <Tabs.Root value={homeTab} onValueChange={(value) => setHomeTab(value as HomeTab)}>
          <Tabs.List className="content-tabs" aria-label="Wallet content">
            <Tabs.Trigger className="content-tab" value="tokens">
              Tokens
            </Tabs.Trigger>
            <Tabs.Trigger className="content-tab" value="collectibles">
              Collectibles
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="tokens">
            <Card>
              <button type="button" className="token-row-button" onClick={() => openSend('sol')}>
                <div className="token-item token-item-interactive">
                  <div className="token-leading">
                    <div className="token-avatar token-avatar-sol">S</div>
                    <div>
                      <strong>Solana</strong>
                      <div className="muted">Native balance</div>
                    </div>
                  </div>
                  <div className="token-amount">{homeBalance}</div>
                </div>
              </button>

              {assets.tokens.length === 0 ? (
                <p className="muted">No SPL token balances found yet.</p>
              ) : (
                <div className="token-list">
                  {assets.tokens.map((token) => (
                    <TokenRow
                      key={`${token.mint}:${token.programId}`}
                      token={token}
                      onSelect={() => openSend(`${token.mint}:${token.programId}`)}
                    />
                  ))}
                </div>
              )}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="collectibles">
            <Card>
              <p className="muted">Collectibles are not in the MVP yet. Tokens stay first-class in this version.</p>
            </Card>
          </Tabs.Content>
        </Tabs.Root>
      </>
    );
  }

  function renderSend() {
    return (
      <>
        <Card title="Send">
          <div className="stack">
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
            <KeyValueRow label="Available" value={selectedAsset?.balance ?? 'Unavailable'} />
            <label className="stack">
              <span className="muted">To</span>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient public key" />
            </label>
            {recentRecipients.length > 0 ? (
              <div className="stack">
                <span className="muted">Recent recipients</span>
                <div className="recipient-list">
                  {recentRecipients.map((entry) => (
                    <button
                      key={entry.address}
                      type="button"
                      className={`recipient-chip ${recipient === entry.address ? 'active' : ''}`.trim()}
                      onClick={() => setRecipient(entry.address)}
                      title={entry.address}
                    >
                      <span className="mono">{formatAddress(entry.address)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="stack">
              <span className="muted">Amount</span>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" inputMode="decimal" />
            </label>
            {!canUseUnlockedSigner ? (
              <label className="stack">
                <span className="muted">Password</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password required to sign"
                />
              </label>
            ) : (
              <p className="muted">Wallet is already unlocked. You can send without re-entering your password.</p>
            )}
          </div>
        </Card>

        {sendResult ? (
          <Card title="Sent">
            <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{sendResult.signature}</span>} />
            <KeyValueRow label="Recipient" value={<span className="mono">{formatAddress(sendResult.recipient)}</span>} />
          </Card>
        ) : null}

        {sendError ? <p className="danger-box">{sendError}</p> : null}

        <div className="inline wrap-actions">
          <Button tone="secondary" onClick={() => setView('home')}>
            Back
          </Button>
          <Button className="button-block" disabled={submitting || !selectedAsset} onClick={handleSend}>
            {submitting ? 'Sending...' : 'Send now'}
          </Button>
        </div>
      </>
    );
  }

  function renderReceive() {
    return (
      <>
        <Card title="Receive">
          <div className="receive-card">
            {receiveQr ? <img className="receive-qr" src={receiveQr} alt="Wallet address QR code" /> : null}
            <div className="receive-address">
              <div className="mono receive-address-value">{activePublicKey}</div>
              <Button tone="secondary" className="button-block" onClick={handleCopyAddress}>
                {copiedAddress ? 'Copied address' : 'Copy address'}
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <Card title="Wallet">
          <div className="stack">
            <label className="stack">
              <span className="muted">Network</span>
              <select
                value={wallet.selectedNetwork}
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
            <div className="settings-row">
              <span className="muted">Connected sites</span>
              <strong>{permissions.length}</strong>
            </div>
            <div className="inline">
              {session.locked ? (
                <Button onClick={() => openExtensionPage('unlock.html')}>Unlock</Button>
              ) : (
                <Button
                  tone="secondary"
                  onClick={async () => {
                    await sendRuntimeMessage({ type: 'wallet_lock' });
                    await refresh();
                  }}
                >
                  Lock
                </Button>
              )}
              <Button tone="secondary" onClick={() => openExtensionPage('options.html')}>
                Full settings
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <PageShell
      eyebrow={view === 'home' ? null : undefined}
      title={view === 'home' ? '' : view === 'send' ? 'Send' : view === 'receive' ? 'Receive' : 'Settings'}
      subtitle={
        view === 'home'
          ? undefined
          : view === 'send'
            ? 'Send directly from the popup.'
            : view === 'receive'
              ? 'Share your wallet address safely.'
              : 'Manage your wallet and connections.'
      }
      actions={view === 'home' ? undefined : <div className="inline popup-actions">{renderWalletMenu()}</div>}
    >
      {view === 'home' ? renderHome() : null}
      {view === 'send' ? renderSend() : null}
      {view === 'receive' ? renderReceive() : null}
      {view === 'settings' ? renderSettings() : null}

      <nav className="bottom-nav" aria-label="Wallet navigation">
        <button type="button" className={`bottom-nav-item ${view === 'home' ? 'active' : ''}`.trim()} onClick={() => setView('home')}>
          Home
        </button>
        <button type="button" className={`bottom-nav-item ${view === 'receive' ? 'active' : ''}`.trim()} onClick={() => setView('receive')}>
          Receive
        </button>
        <button type="button" className={`bottom-nav-item ${view === 'settings' ? 'active' : ''}`.trim()} onClick={() => setView('settings')}>
          Settings
        </button>
      </nav>
    </PageShell>
  );
}

mountPage(<PopupPage />);
