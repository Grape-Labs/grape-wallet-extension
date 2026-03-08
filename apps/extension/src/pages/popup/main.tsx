import { useEffect, useMemo, useState } from 'react';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ArrowLeftRight, ChevronDown, Copy, Eye, EyeOff, Home, Menu, QrCode, SendHorizontal, Settings } from 'lucide-react';
import QRCode from 'qrcode';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type {
  CollectionHolding,
  SendTransferResponse,
  TokenHolding,
  WalletAssetsResponse,
  WalletStateResponse,
  WalletSwapExecuteResponse,
  WalletSwapQuoteResponse
} from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { JUPITER_SOL_MINT } from '../../shared/jupiter';
import { applyDocumentTheme, THEMES } from '../../shared/theme';
import { openExtensionPage, openExtensionSidePanel } from '../../shared/window';
import { mountPage } from '../lib';
import { OnboardingView } from '../onboarding/OnboardingView';

type PopupView = 'home' | 'send' | 'receive' | 'swap' | 'settings';
type HomeTab = 'tokens' | 'collectibles';
type AssetOption =
  | { id: 'sol'; label: 'SOL'; balance: string; asset: { kind: 'sol' } }
  | {
      id: string;
      label: string;
      balance: string;
      asset: { kind: 'spl-token'; mint: string; decimals: number; programId: string };
    };

const COMMON_SWAP_TOKENS = [
  { mint: JUPITER_SOL_MINT, symbol: 'SOL' },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD1NVr7Di5urN6byN1Nsx3', symbol: 'USDT' },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP' },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6uA9Rh5o1kxU4hA', symbol: 'BONK' }
] as const;
const SOLANA_LOGO_URL =
  'https://media.solana-cdn.com/image/width=100/https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png';
const GRAPE_LOGO_URL = chrome.runtime.getURL('icons/grape-avatar.png');

function parseInitialView(): PopupView {
  const nextView = new URLSearchParams(window.location.search).get('view');
  if (nextView === 'send' || nextView === 'receive' || nextView === 'settings') {
    return nextView;
  }
  if (nextView === 'swap') {
    return nextView;
  }
  return 'home';
}

function parseInitialAssetId(): string {
  const asset = new URLSearchParams(window.location.search).get('asset');
  return asset?.trim() ? asset : 'sol';
}

function buildWalletPagePath(view: PopupView, selectedAssetId: string): string {
  const params = new URLSearchParams();
  if (view !== 'home') {
    params.set('view', view);
  }
  if (view === 'send' && selectedAssetId && selectedAssetId !== 'sol') {
    params.set('asset', selectedAssetId);
  }
  const query = params.toString();
  return `wallet.html${query ? `?${query}` : ''}`;
}

function formatLamports(lamports: number | null): string {
  if (lamports === null) {
    return 'Unavailable';
  }
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} SOL`;
}

function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
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

function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function SolanaMark() {
  return (
    <span className="solana-mark" aria-hidden="true">
      <span className="solana-mark-bar solana-mark-bar-top" />
      <span className="solana-mark-bar solana-mark-bar-middle" />
      <span className="solana-mark-bar solana-mark-bar-bottom" />
    </span>
  );
}

function TokenAvatar(props: { token: Pick<TokenHolding, 'symbol' | 'logoUri'>; fallbackLabel?: string; sol?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (props.sol && !imageFailed) {
    return (
      <div className="token-avatar token-avatar-sol">
        <img
          className="token-avatar-image"
          src={SOLANA_LOGO_URL}
          alt="Solana"
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  if (props.sol) {
    return (
      <div className="token-avatar token-avatar-sol">
        <SolanaMark />
      </div>
    );
  }

  if (props.token.logoUri && !imageFailed) {
    return (
      <div className={`token-avatar ${props.sol ? 'token-avatar-sol' : ''}`.trim()}>
        <img
          className="token-avatar-image"
          src={props.token.logoUri}
          alt={props.token.symbol ?? props.fallbackLabel ?? 'Token'}
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return <div className="token-avatar">{props.fallbackLabel ?? props.token.symbol?.slice(0, 1) ?? 'T'}</div>;
}

function TokenRow(props: { token: TokenHolding; onSelect: () => void }) {
  const changeLabel = formatPercent(props.token.priceChange24h);
  const valueLabel = formatUsd(props.token.valueUsd);
  const quantityLabel = `${formatTokenAmount(props.token)}${props.token.symbol ? ` ${props.token.symbol}` : ''}`;
  const primaryLabel = props.token.name ?? props.token.symbol ?? formatAddress(props.token.mint);
  const secondaryLabel = props.token.symbol ?? formatAddress(props.token.mint);
  const addressLabel = formatAddress(props.token.mint);
  const shouldShowAddressFallback = !changeLabel && secondaryLabel !== addressLabel;

  return (
    <button type="button" className="token-row-button" onClick={props.onSelect}>
      <div className="token-item token-item-interactive">
        <div className="token-leading">
          <TokenAvatar token={props.token} fallbackLabel={props.token.symbol?.slice(0, 1) ?? 'T'} />
          <div className="token-copy">
            <strong className="token-name" title={props.token.name ?? props.token.symbol ?? props.token.mint}>
              {primaryLabel}
            </strong>
            <div className="token-subline">
              <span className="token-subtitle mono">{secondaryLabel}</span>
              {changeLabel ? (
                <span className={`token-change ${props.token.priceChange24h && props.token.priceChange24h < 0 ? 'negative' : 'positive'}`.trim()}>
                  {changeLabel}
                </span>
              ) : shouldShowAddressFallback ? <span className="token-subtitle mono">{addressLabel}</span> : null}
            </div>
          </div>
        </div>
        <div className="token-amount-group">
          <div className="token-amount">{valueLabel ?? quantityLabel}</div>
          {valueLabel ? <div className="token-subtitle token-amount-subtitle">{quantityLabel}</div> : null}
        </div>
      </div>
    </button>
  );
}

function CollectibleCard(props: { collection: CollectionHolding }) {
  const previewItems = props.collection.items.slice(0, 3);
  const coverImage = props.collection.imageUri ?? previewItems[0]?.imageUri;

  return (
    <div className="collectible-card">
      <div className="collectible-cover">
        {coverImage ? (
          <img
            className="collectible-cover-image"
            src={coverImage}
            alt={props.collection.name}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="collectible-cover-fallback">{props.collection.name.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      <div className="collectible-copy">
        <strong className="collectible-name" title={props.collection.name}>
          {props.collection.name}
        </strong>
        <div className="collectible-meta">
          <span>{props.collection.itemCount} item{props.collection.itemCount === 1 ? '' : 's'}</span>
          {props.collection.symbol ? <span className="mono">{props.collection.symbol}</span> : null}
        </div>
        {previewItems.length > 0 ? (
          <div className="collectible-preview-strip">
            {previewItems.map((item) => (
              <div key={item.mint} className="collectible-preview">
                {item.imageUri ? (
                  <img
                    className="collectible-preview-image"
                    src={item.imageUri}
                    alt={item.name ?? item.mint}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="collectible-preview-fallback">{(item.name ?? item.mint).slice(0, 1).toUpperCase()}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PopupPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [assets, setAssets] = useState<WalletAssetsResponse>({
    lamports: null,
    tokens: []
  });
  const [view, setView] = useState<PopupView>(() => parseInitialView());
  const [homeTab, setHomeTab] = useState<HomeTab>('tokens');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [receiveQr, setReceiveQr] = useState('');
  const [assetId, setAssetId] = useState(() => parseInitialAssetId());
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendTransferResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [swapInputAssetId, setSwapInputAssetId] = useState('sol');
  const [swapOutputMint, setSwapOutputMint] = useState<string>(COMMON_SWAP_TOKENS[1].mint);
  const [swapAmount, setSwapAmount] = useState('');
  const [swapSlippageBps, setSwapSlippageBps] = useState('50');
  const [swapPassword, setSwapPassword] = useState('');
  const [swapQuote, setSwapQuote] = useState<WalletSwapQuoteResponse | null>(null);
  const [swapResult, setSwapResult] = useState<WalletSwapExecuteResponse | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [quotingSwap, setQuotingSwap] = useState(false);
  const [submittingSwap, setSubmittingSwap] = useState(false);

  const surface = document.body.dataset.surface ?? 'page';
  const isPopupSurface = surface === 'popup';

  const refresh = async () => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
    setState(nextState);
    if (nextState.wallet.setup === 'ready' && !nextState.session.locked) {
      const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({ type: 'wallet_get_assets' });
      setAssets(nextAssets);
    } else {
      setAssets({
        lamports: null,
        tokens: [],
        collections: []
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    applyDocumentTheme(state?.wallet.selectedTheme);
  }, [state?.wallet.selectedTheme]);

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
  const portfolioValue = useMemo(() => formatUsd(assets.totalUsdValue) ?? homeBalance, [assets.totalUsdValue, homeBalance]);
  const solValue = useMemo(() => formatUsd(assets.nativeValueUsd), [assets.nativeValueUsd]);
  const solChange = useMemo(() => formatPercent(assets.nativePriceChange24h), [assets.nativePriceChange24h]);
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
  const selectedTokenHolding =
    assetId === 'sol' ? null : assets.tokens.find((token) => `${token.mint}:${token.programId}` === assetId) ?? null;
  const selectedSwapInputAsset = assetOptions.find((option) => option.id === swapInputAssetId) ?? assetOptions[0];
  const selectedSwapInputHolding =
    swapInputAssetId === 'sol'
      ? null
      : assets.tokens.find((token) => `${token.mint}:${token.programId}` === swapInputAssetId) ?? null;
  const swapOutputOptions = useMemo(() => {
    const ownedTokens = assets.tokens.map((token) => ({
      mint: token.mint,
      symbol: token.symbol ?? formatAddress(token.mint)
    }));
    return [...COMMON_SWAP_TOKENS, ...ownedTokens].filter(
      (token, index, allTokens) => allTokens.findIndex((candidate) => candidate.mint === token.mint) === index
    );
  }, [assets.tokens]);
  const selectedSwapOutputToken = assets.tokens.find((token) => token.mint === swapOutputMint) ?? null;
  const selectedSwapOutputOption = swapOutputOptions.find((option) => option.mint === swapOutputMint) ?? null;

  async function handleOpenInTab() {
    openExtensionPage(buildWalletPagePath(view, assetId));
    if (isPopupSurface) {
      window.close();
    }
  }

  async function handleGetSwapQuote() {
    if (!selectedSwapInputAsset) {
      return;
    }

    try {
      setQuotingSwap(true);
      setSwapError(null);
      setSwapResult(null);
      const quote = await sendRuntimeMessage<WalletSwapQuoteResponse>({
        type: 'wallet_get_swap_quote',
        amount: swapAmount,
        slippageBps: Number(swapSlippageBps),
        inputAsset: selectedSwapInputAsset.asset,
        outputMint: swapOutputMint
      });
      setSwapQuote(quote);
    } catch (error) {
      setSwapQuote(null);
      setSwapError(error instanceof Error ? error.message : 'Unable to fetch swap quote.');
    } finally {
      setQuotingSwap(false);
    }
  }

  async function handleExecuteSwap() {
    if (!swapQuote) {
      return;
    }

    try {
      setSubmittingSwap(true);
      setSwapError(null);
      const result = await sendRuntimeMessage<WalletSwapExecuteResponse>({
        type: 'wallet_execute_swap',
        quoteResponse: swapQuote.quoteResponse,
        password: swapPassword || undefined
      });
      setSwapResult(result);
      setSwapPassword('');
      void refresh().catch(() => {
        // Ignore refresh failures after a successful swap.
      });
    } catch (error) {
      setSwapError(error instanceof Error ? error.message : 'Unable to execute swap.');
    } finally {
      setSubmittingSwap(false);
    }
  }

  async function handleOpenInSidePanel() {
    try {
      setSurfaceError(null);
      await openExtensionSidePanel();
      if (isPopupSurface) {
        window.close();
      }
    } catch (nextError) {
      setSurfaceError(nextError instanceof Error ? nextError.message : 'Unable to open the side panel.');
    }
  }

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
      setSendError(null);
      setRecipient('');
      setAmount('');
      setPassword('');
    } catch (nextError) {
      setSendError(nextError instanceof Error ? nextError.message : 'Unable to send transfer.');
    } finally {
      setSubmitting(false);
    }

    void refresh().catch(() => {
      // Do not convert a successful send into a failed one because a follow-up refresh was flaky.
    });
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

  if (session.locked) {
    return (
      <PageShell eyebrow={null} title="" subtitle="">
        {renderLockedWelcome()}
      </PageShell>
    );
  }

  async function handleWalletSelect(walletId: string) {
    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_select',
      walletId
    });
    setView('home');
    await refresh();
  }

  async function handleUnlockInline() {
    try {
      setUnlocking(true);
      setUnlockError(null);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password: unlockPassword
      });
      setUnlockPassword('');
      await refresh();
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'Unable to unlock wallet.');
    } finally {
      setUnlocking(false);
    }
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
                setView('swap');
              }}
            >
              Swap
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                void handleOpenInTab();
              }}
            >
              Open expanded view
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                void handleOpenInSidePanel();
              }}
            >
              Open side panel
            </DropdownMenu.Item>
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

  function renderLockedWelcome() {
    return (
      <div className="unlock-welcome-shell">
        <Card className="unlock-welcome-card">
          <div className="unlock-welcome-brand">
            <img className="unlock-welcome-logo" src={GRAPE_LOGO_URL} alt="Grape Wallet" />
            <h2>Grape Wallet</h2>
          </div>

          <div className="unlock-welcome-form">
            <div className="unlock-password-shell">
              <Input
                type={showUnlockPassword ? 'text' : 'password'}
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                placeholder="Password"
                className="unlock-password-input"
              />
              <button
                type="button"
                className="unlock-password-toggle"
                aria-label={showUnlockPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowUnlockPassword((value) => !value)}
              >
                {showUnlockPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {unlockError ? <p className="danger-box">{unlockError}</p> : null}

            <Button
              className="button-block unlock-submit-button"
              disabled={unlocking || !unlockPassword.trim()}
              onClick={() => void handleUnlockInline()}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </Button>

            <p className="muted unlock-welcome-helper">
              Unlock once per session. Grape will ask again only after you lock it or the idle timeout expires.
            </p>
          </div>
        </Card>
      </div>
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
              <span className={`wallet-session-state ${session.locked ? 'locked' : 'ready'}`.trim()}>
                {session.locked ? 'Locked' : 'Ready'}
              </span>
              {renderWalletMenu()}
            </div>
          </div>

          <div className="portfolio-copy">
            <div className="portfolio-label">Total Balance</div>
            <div className="hero-balance">{portfolioValue}</div>
          </div>

          <div className="wallet-home-header compact wallet-home-header-compact">
            <div className="wallet-address-row portfolio-address-block">
              <div className="portfolio-address-label">Wallet address</div>
              <div className="mono account-primary" title={activePublicKey ?? 'Unknown'}>
                {formatAddress(activePublicKey)}
              </div>
            </div>
            <Button tone="secondary" className="mini-button" onClick={handleCopyAddress}>
              <span className="button-icon"><Copy size={14} /></span>
              {copiedAddress ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="quick-actions compact">
            <button type="button" className="quick-action-card" onClick={() => openSend('sol')} aria-label="Send" title="Send">
              <span className="quick-action-icon"><SendHorizontal size={18} /></span>
            </button>
            <button
              type="button"
              className="quick-action-card"
              onClick={() => {
                setSwapQuote(null);
                setSwapResult(null);
                setSwapError(null);
                setView('swap');
              }}
              aria-label="Swap"
              title="Swap"
            >
              <span className="quick-action-icon"><ArrowLeftRight size={18} /></span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => setView('receive')} aria-label="Receive" title="Receive">
              <span className="quick-action-icon"><QrCode size={18} /></span>
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
            <Card className="asset-panel-card">
              <button type="button" className="token-row-button" onClick={() => openSend('sol')}>
                <div className="token-item token-item-interactive">
                  <div className="token-leading">
                    <TokenAvatar token={{ symbol: 'SOL' }} fallbackLabel="S" sol />
                    <div className="token-copy">
                      <strong className="token-name">Solana</strong>
                      <div className="token-subline">
                        <span className="token-subtitle">{homeBalance}</span>
                        {solChange ? (
                          <span className={`token-change ${assets.nativePriceChange24h && assets.nativePriceChange24h < 0 ? 'negative' : 'positive'}`.trim()}>
                            {solChange}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="token-amount-group">
                    <div className="token-amount">{solValue ?? homeBalance}</div>
                    {solValue ? <div className="token-subtitle token-amount-subtitle">{homeBalance}</div> : null}
                  </div>
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
            <Card className="asset-panel-card">
              {assets.collections && assets.collections.length > 0 ? (
                <div className="collectible-grid">
                  {assets.collections.map((collection) => (
                    <CollectibleCard key={collection.id} collection={collection} />
                  ))}
                </div>
              ) : (
                <p className="muted">No NFT collections found for this wallet on {wallet.selectedNetwork}.</p>
              )}
            </Card>
          </Tabs.Content>
        </Tabs.Root>
      </>
    );
  }

  function renderSend() {
    const selectedAssetName =
      assetId === 'sol' ? 'Solana' : selectedTokenHolding?.name ?? selectedTokenHolding?.symbol ?? selectedAsset?.label ?? 'Token';
    const selectedAssetSymbol =
      assetId === 'sol' ? 'SOL' : selectedTokenHolding?.symbol ?? selectedAsset?.label.replace(/ token$/i, '') ?? 'Token';
    const selectedAmountNumber = Number(amount || '0');
    const selectedUnitPrice = assetId === 'sol' ? assets.nativePriceUsd ?? null : selectedTokenHolding?.priceUsd ?? null;
    const selectedFiatValue =
      Number.isFinite(selectedAmountNumber) && typeof selectedUnitPrice === 'number' ? formatUsd(selectedAmountNumber * selectedUnitPrice) : '$0.00';
    const availableBalanceLabel = selectedAsset?.balance ?? 'Unavailable';

    function handleMaxAmount() {
      if (assetId === 'sol') {
        const lamports = typeof assets.lamports === 'number' ? assets.lamports : 0;
        const reservedLamports = 10_000;
        const sendableLamports = Math.max(lamports - reservedLamports, 0);
        setAmount((sendableLamports / 1_000_000_000).toFixed(9).replace(/\.?0+$/, ''));
        return;
      }

      if (selectedTokenHolding) {
        setAmount(selectedTokenHolding.amount);
      }
    }

    return (
      <>
        <Card className="send-flow-card">
          <div className="send-flow-header">
            <button type="button" className="send-back-button" onClick={() => setView('home')} aria-label="Back to wallet">
              <ArrowLeft size={20} />
            </button>
            <h2>Send</h2>
          </div>

          <div className="send-flow-hero">
            <div className="send-flow-amount-row">
              <input
                className="send-flow-amount-input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                inputMode="decimal"
                aria-label="Amount"
              />
              <button type="button" className="send-max-button" onClick={handleMaxAmount}>
                Max
              </button>
            </div>
            <div className="send-flow-amount-meta">
              <span>{selectedFiatValue}</span>
              <span>{availableBalanceLabel}</span>
            </div>
          </div>

          <div className="send-field-stack">
            <div className="send-field-group">
              <label className="send-field-label">Token</label>
              <div className="send-select-shell">
                <div className="send-select-leading">
                  <TokenAvatar
                    token={assetId === 'sol' ? { symbol: 'SOL' } : selectedTokenHolding ?? { symbol: selectedAssetSymbol }}
                    fallbackLabel={selectedAssetSymbol.slice(0, 1)}
                    sol={assetId === 'sol'}
                  />
                  <div className="send-select-copy">
                    <strong>{selectedAssetName}</strong>
                    <span className="muted">{availableBalanceLabel}</span>
                  </div>
                </div>
                <select
                  className="send-select-input"
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  aria-label="Select token"
                >
                  {assetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="send-select-chevron" size={18} />
              </div>
            </div>

            <div className="send-field-group">
              <label className="send-field-label">Recipient</label>
              <div className="send-input-shell">
                <Input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Search or paste"
                  className="send-recipient-input"
                />
              </div>
            </div>

            {recentRecipients.length > 0 ? (
              <div className="send-field-group">
                <label className="send-field-label">Recent</label>
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

            {!canUseUnlockedSigner ? (
              <div className="send-field-group">
                <label className="send-field-label">Password</label>
                <div className="send-input-shell">
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password required to sign"
                    className="send-recipient-input"
                  />
                </div>
              </div>
            ) : (
              <p className="muted send-flow-helper">Wallet is already unlocked. You can send without re-entering your password.</p>
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
        {surfaceError ? <p className="danger-box">{surfaceError}</p> : null}

        <div className="inline wrap-actions send-flow-actions">
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
            <label className="stack">
              <span className="muted">Theme</span>
              <select
                value={wallet.selectedTheme}
                onChange={async (event) => {
                  await sendRuntimeMessage({
                    type: 'wallet_set_theme',
                    theme: event.target.value as typeof wallet.selectedTheme
                  });
                  await refresh();
                }}
              >
                {THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="inline">
              {session.locked ? (
                <Button onClick={() => openExtensionPage('unlock.html?redirect=wallet.html')}>Unlock</Button>
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

  function renderSwap() {
    const inputAssetSymbol =
      swapInputAssetId === 'sol'
        ? 'SOL'
        : selectedSwapInputHolding?.symbol ?? selectedSwapInputAsset?.label.replace(/ token$/i, '') ?? 'Token';
    const inputAssetBalance = selectedSwapInputAsset?.balance ?? '0';
    const outputAssetSymbol = selectedSwapOutputToken?.symbol ?? selectedSwapOutputOption?.symbol ?? formatAddress(swapOutputMint);
    const outputAssetBalance =
      selectedSwapOutputToken ? formatTokenAmount(selectedSwapOutputToken) : selectedSwapOutputOption?.symbol ? 'Not owned yet' : 'Unknown';
    const quoteOutputValue = swapQuote ? `${swapQuote.outputAmountUi} ${outputAssetSymbol}` : '0';

    function setSwapAmountByRatio(ratio: number) {
      if (!selectedSwapInputAsset) {
        return;
      }
      const sourceAmount =
        swapInputAssetId === 'sol'
          ? Math.max((assets.lamports ?? 0) / 1_000_000_000 - 0.00001, 0)
          : Number(selectedSwapInputHolding?.amount ?? '0');
      const nextAmount = Math.max(sourceAmount * ratio, 0);
      setSwapAmount(nextAmount.toFixed(6).replace(/\.?0+$/, ''));
      setSwapQuote(null);
      setSwapResult(null);
    }

    function handleFlipSwapDirection() {
      const nextInputId =
        swapOutputMint === JUPITER_SOL_MINT
          ? 'sol'
          : assets.tokens.find((token) => token.mint === swapOutputMint)
            ? `${swapOutputMint}:${assets.tokens.find((token) => token.mint === swapOutputMint)?.programId}`
            : null;
      const currentInputMint =
        selectedSwapInputAsset?.asset.kind === 'sol' ? JUPITER_SOL_MINT : selectedSwapInputAsset?.asset.kind === 'spl-token' ? selectedSwapInputAsset.asset.mint : null;

      if (!nextInputId || !currentInputMint) {
        return;
      }

      setSwapInputAssetId(nextInputId);
      setSwapOutputMint(currentInputMint);
      setSwapQuote(null);
      setSwapResult(null);
    }

    return (
      <>
        <Card className="swap-flow-card">
          <div className="send-flow-header">
            <button type="button" className="send-back-button" onClick={() => setView('home')} aria-label="Back to wallet">
              <ArrowLeft size={20} />
            </button>
            <h2>Swap</h2>
          </div>

          <div className="swap-flow-shell">
            <section className="swap-leg">
              <div className="swap-leg-header">
                <span className="send-field-label">Sell</span>
                <div className="swap-quick-ratios">
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className="swap-ratio-chip"
                      onClick={() => setSwapAmountByRatio(ratio)}
                    >
                      {ratio === 1 ? 'Max' : `${Math.round(ratio * 100)}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="swap-leg-main">
                <div className="send-select-shell swap-select-shell">
                  <div className="send-select-leading">
                    <TokenAvatar
                      token={swapInputAssetId === 'sol' ? { symbol: 'SOL' } : selectedSwapInputHolding ?? { symbol: inputAssetSymbol }}
                      fallbackLabel={inputAssetSymbol.slice(0, 1)}
                      sol={swapInputAssetId === 'sol'}
                    />
                    <div className="send-select-copy">
                      <strong>{inputAssetSymbol}</strong>
                      <span className="muted">Balance: {inputAssetBalance}</span>
                    </div>
                  </div>
                  <select
                    className="send-select-input"
                    value={swapInputAssetId}
                    onChange={(event) => {
                      setSwapInputAssetId(event.target.value);
                      setSwapQuote(null);
                      setSwapResult(null);
                    }}
                    aria-label="Select input asset"
                  >
                    {assetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="send-select-chevron" size={18} />
                </div>

                <input
                  className="swap-leg-amount"
                  value={swapAmount}
                  onChange={(event) => {
                    setSwapAmount(event.target.value);
                    setSwapQuote(null);
                    setSwapResult(null);
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Swap amount"
                />
              </div>
            </section>

            <button type="button" className="swap-flip-button" onClick={handleFlipSwapDirection} aria-label="Flip swap direction">
              <ArrowLeftRight size={18} />
            </button>

            <section className="swap-leg">
              <div className="swap-leg-header">
                <span className="send-field-label">Buy</span>
              </div>

              <div className="swap-leg-main">
                <div className="send-select-shell swap-select-shell">
                  <div className="send-select-leading">
                    <TokenAvatar
                      token={
                        swapOutputMint === JUPITER_SOL_MINT
                          ? { symbol: 'SOL' }
                          : selectedSwapOutputToken ?? { symbol: outputAssetSymbol }
                      }
                      fallbackLabel={outputAssetSymbol.slice(0, 1)}
                      sol={swapOutputMint === JUPITER_SOL_MINT}
                    />
                    <div className="send-select-copy">
                      <strong>{outputAssetSymbol}</strong>
                      <span className="muted">Balance: {outputAssetBalance}</span>
                    </div>
                  </div>
                  <select
                    className="send-select-input"
                    value={swapOutputMint}
                    onChange={(event) => {
                      setSwapOutputMint(event.target.value);
                      setSwapQuote(null);
                      setSwapResult(null);
                    }}
                    aria-label="Select output asset"
                  >
                    {swapOutputOptions.map((option) => (
                      <option key={option.mint} value={option.mint}>
                        {option.symbol}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="send-select-chevron" size={18} />
                </div>

                <div className="swap-leg-quote">{quoteOutputValue}</div>
              </div>
            </section>
          </div>

          <div className="swap-settings-row">
            <label className="swap-slippage-chip">
              <span>Slippage</span>
              <input
                value={swapSlippageBps}
                onChange={(event) => {
                  setSwapSlippageBps(event.target.value);
                  setSwapQuote(null);
                }}
                inputMode="numeric"
                aria-label="Slippage in basis points"
              />
              <span>bps</span>
            </label>
          </div>

          {wallet.selectedNetwork !== 'mainnet-beta' ? (
            <p className="warning-box">Native swaps are available only on mainnet-beta.</p>
          ) : null}
        </Card>

        {swapQuote ? (
          <Card title="Quote">
            <div className="stack">
              <KeyValueRow label="Estimated output" value={`${swapQuote.outputAmountUi} ${outputAssetSymbol}`} />
              <KeyValueRow label="Slippage" value={`${swapQuote.slippageBps} bps`} />
              <KeyValueRow label="Price impact" value={swapQuote.priceImpactPct ?? 'Unavailable'} />
              <KeyValueRow label="Route" value={swapQuote.routeLabels.length > 0 ? swapQuote.routeLabels.join(' -> ') : 'Jupiter route'} />
              {!canUseUnlockedSigner ? (
                <label className="stack">
                  <span className="muted">Password</span>
                  <Input
                    type="password"
                    value={swapPassword}
                    onChange={(event) => setSwapPassword(event.target.value)}
                    placeholder="Password required to sign"
                  />
                </label>
              ) : (
                <p className="muted">Wallet is already unlocked. You can sign the swap without re-entering your password.</p>
              )}
            </div>
          </Card>
        ) : null}

        {swapResult ? (
          <Card title="Swap submitted">
            <div className="stack">
              <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{swapResult.signature}</span>} />
              <KeyValueRow label="From" value={swapResult.inputAmountUi} />
              <KeyValueRow label="To" value={swapResult.outputAmountUi} />
            </div>
          </Card>
        ) : null}

        {swapError ? <p className="danger-box">{swapError}</p> : null}

        <div className="inline wrap-actions send-flow-actions">
          {swapQuote ? (
            <Button
              className="button-block"
              disabled={
                submittingSwap ||
                wallet.selectedNetwork !== 'mainnet-beta' ||
                (!canUseUnlockedSigner && !swapPassword.trim())
              }
              onClick={() => void handleExecuteSwap()}
            >
              {submittingSwap ? 'Swapping...' : 'Swap now'}
            </Button>
          ) : (
            <Button
              className="button-block"
              disabled={
                quotingSwap ||
                wallet.selectedNetwork !== 'mainnet-beta' ||
                !selectedSwapInputAsset ||
                !swapAmount.trim() ||
                !swapOutputMint ||
                !Number.isFinite(Number(swapSlippageBps))
              }
              onClick={() => void handleGetSwapQuote()}
            >
              {quotingSwap ? 'Quoting...' : 'Get quote'}
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <PageShell
      eyebrow={view === 'home' ? null : undefined}
      title={view === 'home' ? '' : view === 'send' ? 'Send' : view === 'receive' ? 'Receive' : view === 'swap' ? 'Swap' : 'Settings'}
      subtitle={
        view === 'home'
          ? undefined
          : view === 'send'
            ? 'Send directly from the popup.'
            : view === 'receive'
              ? 'Share your wallet address safely.'
              : view === 'swap'
                ? 'Get a Jupiter quote and swap from your wallet.'
              : 'Manage your wallet and connections.'
      }
      actions={view === 'home' ? undefined : <div className="inline popup-actions">{renderWalletMenu()}</div>}
    >
      {view === 'home' ? renderHome() : null}
      {view === 'send' ? renderSend() : null}
      {view === 'receive' ? renderReceive() : null}
      {view === 'swap' ? renderSwap() : null}
      {view === 'settings' ? renderSettings() : null}
      {surfaceError && view !== 'send' ? <p className="danger-box">{surfaceError}</p> : null}

      <nav className="bottom-nav" aria-label="Wallet navigation">
        <button
          type="button"
          className={`bottom-nav-item ${view === 'home' ? 'active' : ''}`.trim()}
          onClick={() => setView('home')}
          aria-label="Home"
          title="Home"
        >
          <Home size={20} />
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${view === 'receive' ? 'active' : ''}`.trim()}
          onClick={() => setView('receive')}
          aria-label="Receive"
          title="Receive"
        >
          <QrCode size={20} />
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${view === 'settings' ? 'active' : ''}`.trim()}
          onClick={() => setView('settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </nav>
    </PageShell>
  );
}

mountPage(<PopupPage />);
