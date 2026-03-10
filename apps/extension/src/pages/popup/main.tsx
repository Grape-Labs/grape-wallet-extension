import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Fingerprint,
  Flame,
  Home,
  Landmark,
  Menu,
  PanelRightOpen,
  Pencil,
  Plus,
  QrCode,
  RefreshCcw,
  SendHorizontal,
  Settings,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import QRCode from 'qrcode';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';
import { STORAGE_KEYS } from '@grape/core';

import type {
  ApprovalRecord,
  WalletActivityItem,
  WalletActivityResponse,
  CollectibleItem,
  CollectionHolding,
  IncidentResponseResponse,
  StakeAccountRow,
  TokenActionResponse,
  TokenDetailsResponse,
  SendTransferResponse,
  TokenHolding,
  WalletSecurityReportResponse,
  WalletAssetsResponse,
  WalletStakeAccountsResponse,
  WalletStakeActionResponse,
  WalletStateResponse,
  WalletSwapExecuteResponse,
  WalletSwapQuoteResponse
} from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { createBiometricUnlock, isBiometricUnlockSupported, unlockWithBiometric } from '../../shared/biometric';
import { JUPITER_SOL_MINT } from '../../shared/jupiter';
import { applyDocumentTheme, THEMES } from '../../shared/theme';
import { openExtensionPage, openExtensionSidePanel } from '../../shared/window';
import { ApprovalView } from '../approval/ApprovalView';
import { mountPage } from '../lib';
import { OnboardingView } from '../onboarding/OnboardingView';

type PopupView = 'home' | 'send' | 'receive' | 'swap' | 'settings' | 'asset' | 'security' | 'approval';
type HomeTab = 'tokens' | 'collectibles' | 'activity' | 'staking';
type AssetOption =
  | {
      id: 'sol';
      label: 'SOL';
      name: 'Solana';
      symbol: 'SOL';
      balance: string;
      logoUri?: string;
      asset: { kind: 'sol' };
    }
  | {
      id: string;
      label: string;
      name: string;
      symbol: string;
      balance: string;
      logoUri?: string;
      asset: { kind: 'spl-token'; mint: string; decimals: number; programId: string; accountAddress?: string };
    };

type AssetPickerDisplayOption = {
  id: string;
  name: string;
  symbol: string;
  balance: string;
  logoUri?: string;
  sol?: boolean;
};

const COMMON_SWAP_TOKENS = [
  { mint: JUPITER_SOL_MINT, symbol: 'SOL' },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD1NVr7Di5urN6byN1Nsx3', symbol: 'USDT' },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP' },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' }
] as const;

type SwapOutputOption = {
  mint: string;
  symbol: string;
};
const SOLANA_LOGO_URL =
  'https://media.solana-cdn.com/image/width=100/https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png';
const GRAPE_LOGO_URL = chrome.runtime.getURL('icons/grape_logo_white.png');
const ASSET_CACHE_STORAGE_KEY = 'grape:asset-cache';

function parseInitialView(): PopupView {
  const nextView = new URLSearchParams(window.location.search).get('view');
  if (nextView === 'send' || nextView === 'receive' || nextView === 'settings' || nextView === 'security') {
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

function buildAssetCacheKey(state: WalletStateResponse | null): string | null {
  if (!state?.activeWallet?.id || !state.activeAccount?.publicKey) {
    return null;
  }

  return `${state.activeWallet.id}:${state.wallet.selectedNetwork}:${state.activeAccount.publicKey}`;
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

function maskSensitiveValue(value: string | null | undefined, privacyMode: boolean, masked = '***'): string {
  if (privacyMode) {
    return masked;
  }

  return value ?? masked;
}

function formatUnitPrice(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const maximumFractionDigits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1 ? 2 : 0,
    maximumFractionDigits
  }).format(value);
}

function formatAddress(address: string | undefined): string {
  if (!address) {
    return 'Unknown';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatWalletSourceLabel(
  source: WalletStateResponse['activeWallet'] extends { source?: infer T } ? T : string,
  signerKind?: 'software' | 'watch-only' | 'ledger'
): string {
  if (signerKind === 'watch-only' || source === 'watch-only') {
    return 'Watch-only wallet';
  }
  if (signerKind === 'ledger' || source === 'ledger') {
    return 'Ledger hardware wallet';
  }

  switch (source) {
    case 'imported-mnemonic':
      return 'Imported recovery phrase';
    case 'imported-private-key':
      return 'Imported private key';
    case 'created':
    default:
      return 'Created in Grape';
  }
}

function getWalletSourceBadge(
  source: WalletStateResponse['activeWallet'] extends { source?: infer T } ? T : string,
  signerKind?: 'software' | 'watch-only' | 'ledger'
): { label: string; tone: 'created' | 'imported' | 'watch' | 'hardware'; icon: ReactNode } {
  if (signerKind === 'watch-only' || source === 'watch-only') {
    return {
      label: 'Watch-only wallet',
      tone: 'watch',
      icon: <Eye size={11} />
    };
  }
  if (signerKind === 'ledger' || source === 'ledger') {
    return {
      label: 'Ledger hardware wallet',
      tone: 'hardware',
      icon: <Fingerprint size={11} />
    };
  }

  if (source === 'imported-mnemonic' || source === 'imported-private-key') {
    return {
      label: formatWalletSourceLabel(source, signerKind),
      tone: 'imported',
      icon: <ArrowLeft size={11} />
    };
  }

  return {
    label: 'Created in Grape',
    tone: 'created',
    icon: <Check size={11} />
  };
}

function buildExplorerUrl(address: string, network: 'mainnet-beta' | 'devnet'): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/address/${address}${cluster}`;
}

function buildTransactionExplorerUrl(signature: string, network: 'mainnet-beta' | 'devnet'): string {
  const cluster = network === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value == null) {
    return 'Unavailable';
  }
  return value ? 'Yes' : 'No';
}

function formatTokenAmount(token: TokenHolding): string {
  const numeric = Number(token.amount);
  if (Number.isFinite(numeric)) {
    const absolute = Math.abs(numeric);
    if (absolute >= 1_000_000_000) {
      return `${(numeric / 1_000_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      })}B`;
    }
    if (absolute >= 1_000_000) {
      return `${(numeric / 1_000_000).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      })}M`;
    }
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.min(Math.max(token.decimals, 0), 2)
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

function formatSolAmountFromLamports(lamports: number): string {
  return (lamports / 1_000_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function formatActivityType(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatActivityFee(value: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0.001) {
    return `${value.toFixed(6)} SOL`;
  }

  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} SOL`;
}

function formatActivityTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp);
}

function formatActivityDayLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((today - target) / 86_400_000);

  if (dayDiff === 0) {
    return 'Today';
  }

  if (dayDiff === 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(timestamp);
}

function groupActivityByDay(items: WalletActivityItem[]) {
  const groups: Array<{ label: string; items: WalletActivityItem[] }> = [];
  const grouped = new Map<string, WalletActivityItem[]>();

  items.forEach((item) => {
    const label = formatActivityDayLabel(item.timestamp);
    const existing = grouped.get(label);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(label, [item]);
    }
  });

  for (const [label, groupItems] of grouped.entries()) {
    groups.push({ label, items: groupItems });
  }

  return groups;
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

function XBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="brand-icon">
      <path
        fill="currentColor"
        d="M17.9 3H21l-6.77 7.74L22 21h-6.1l-4.77-6.23L5.67 21H2.56l7.23-8.27L2.37 3h6.25l4.31 5.69zM16.8 19.1h1.72L7.7 4.8H5.86z"
      />
    </svg>
  );
}

function DiscordBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="brand-icon">
      <path
        fill="currentColor"
        d="M18.6 5.4A14.5 14.5 0 0 0 15 4.3l-.4.8a13 13 0 0 0-5.2 0l-.4-.8A14.5 14.5 0 0 0 5.4 5.4C3.2 8.5 2.6 11.5 2.9 14.5a14.1 14.1 0 0 0 4.4 2.2l1.1-1.4c-.6-.2-1.1-.5-1.6-.8l.4-.3a10.4 10.4 0 0 0 9.6 0l.4.3c-.5.3-1 .6-1.6.8l1.1 1.4a14.1 14.1 0 0 0 4.4-2.2c.4-3.5-.5-6.5-2.5-9.1M9.5 12.9c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6m5 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6"
      />
    </svg>
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

function TokenRow(props: { token: TokenHolding; onSelect: () => void; privacyMode?: boolean }) {
  const changeLabel = formatPercent(props.token.priceChange24h);
  const valueLabel = formatUsd(props.token.valueUsd);
  const quantityLabel = `${formatTokenAmount(props.token)}${props.token.symbol ? ` ${props.token.symbol}` : ''}`;
  const primaryLabel = props.token.name ?? props.token.symbol ?? formatAddress(props.token.mint);
  const unitPriceLabel = formatUnitPrice(props.token.priceUsd);
  const secondaryLabel = unitPriceLabel ?? props.token.symbol ?? formatAddress(props.token.mint);
  const addressLabel = formatAddress(props.token.mint);
  const shouldShowAddressFallback = !changeLabel && !unitPriceLabel && secondaryLabel !== addressLabel;

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
              <span className={`token-subtitle ${unitPriceLabel ? '' : 'mono'}`.trim()}>{secondaryLabel}</span>
              {changeLabel ? (
                <span className={`token-change ${props.token.priceChange24h && props.token.priceChange24h < 0 ? 'negative' : 'positive'}`.trim()}>
                  {changeLabel}
                </span>
              ) : shouldShowAddressFallback ? <span className="token-subtitle mono">{addressLabel}</span> : null}
            </div>
          </div>
        </div>
          <div className="token-amount-group">
          <div className="token-amount">{maskSensitiveValue(valueLabel ?? quantityLabel, !!props.privacyMode)}</div>
          {valueLabel ? <div className="token-subtitle token-amount-subtitle">{maskSensitiveValue(quantityLabel, !!props.privacyMode)}</div> : null}
        </div>
      </div>
    </button>
  );
}

function AssetSkeletonRow() {
  return (
    <div className="token-item token-item-skeleton">
      <div className="token-leading">
        <div className="token-avatar skeleton-block skeleton-avatar" />
        <div className="token-copy">
          <div className="skeleton-block skeleton-line skeleton-line-title" />
          <div className="token-subline">
            <div className="skeleton-block skeleton-line skeleton-line-subtitle" />
          </div>
        </div>
      </div>
      <div className="token-amount-group">
        <div className="skeleton-block skeleton-line skeleton-line-value" />
        <div className="skeleton-block skeleton-line skeleton-line-subvalue" />
      </div>
    </div>
  );
}

function AssetPickerOptionRow(props: { option: AssetPickerDisplayOption; active?: boolean; onSelect?: () => void; privacyMode?: boolean }) {
  const content = (
    <>
      <div className="token-leading">
        <TokenAvatar
          token={{ symbol: props.option.symbol, logoUri: props.option.logoUri }}
          fallbackLabel={props.option.symbol.slice(0, 1)}
          sol={props.option.sol}
        />
        <div className="token-copy">
          <strong className="token-name">{props.option.name}</strong>
          <div className="token-subline">
            <span className="token-subtitle">{props.option.symbol}</span>
          </div>
        </div>
      </div>
      <div className="token-amount-group">
        <div className="token-amount">{maskSensitiveValue(props.option.balance, !!props.privacyMode)}</div>
      </div>
    </>
  );

  if (!props.onSelect) {
    return <div className="token-item send-asset-option-summary">{content}</div>;
  }

  return (
    <button
      type="button"
      className={`send-asset-option-button ${props.active ? 'active' : ''}`.trim()}
      onClick={props.onSelect}
    >
      <div className="token-item send-asset-option-row">{content}</div>
    </button>
  );
}

function CollectibleCard(props: { item: CollectibleItem; onSelect: () => void }) {
  const title = props.item.name ?? props.item.collectionName ?? 'Collectible';

  return (
    <button type="button" className="collectible-card collectible-card-button" onClick={props.onSelect}>
      <div className="collectible-cover">
        {props.item.imageUri ? (
          <img
            className="collectible-cover-image"
            src={props.item.imageUri}
            alt={title}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="collectible-cover-fallback">{title.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      <div className="collectible-copy">
        <strong className="collectible-name" title={title}>
          {title}
        </strong>
        <div className="collectible-meta">
          {props.item.collectionName ? <span>{props.item.collectionName}</span> : null}
          {props.item.collectionSymbol ?? props.item.symbol ? <span className="mono">{props.item.collectionSymbol ?? props.item.symbol}</span> : null}
        </div>
      </div>
    </button>
  );
}

function ActivityTypeIcon(props: { item: WalletActivityItem }) {
  const type = props.item.type.toLowerCase();

  if (type.includes('swap')) {
    return <ArrowLeftRight size={15} />;
  }

  if (type.includes('transfer') || type.includes('send')) {
    return props.item.actions.some((action) => action.type.toLowerCase().includes('receive')) ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />;
  }

  if (type.includes('stake') || type.includes('vote') || type.includes('governance')) {
    return <Landmark size={15} />;
  }

  if (type.includes('burn')) {
    return <Flame size={15} />;
  }

  return <Clock3 size={15} />;
}

function ActivityRow(props: {
  item: WalletActivityItem;
  expanded: boolean;
  network: 'mainnet-beta' | 'devnet';
  onToggle: () => void;
}) {
  const statusLabel =
    props.item.status === 'success'
      ? 'Success'
      : props.item.status === 'failed'
        ? 'Failed'
        : 'Unknown';
  const feeLabel = formatActivityFee(props.item.feeSol);

  return (
    <div
      className={`activity-row ${props.expanded ? 'expanded' : ''}`.trim()}
      onClick={props.onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onToggle();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="activity-row-summary">
        <div className="activity-leading">
          <span className={`activity-icon activity-status-${props.item.status}`.trim()} aria-hidden="true">
            <ActivityTypeIcon item={props.item} />
          </span>
          <div className="activity-copy">
            <strong className="activity-title">{formatActivityType(props.item.type)}</strong>
            <span className="activity-description">{props.item.description}</span>
          </div>
        </div>
        <div className="activity-meta">
          <span className={`activity-status-pill activity-status-${props.item.status}`.trim()}>{statusLabel}</span>
          <span className="activity-time">{formatActivityTime(props.item.timestamp)}</span>
        </div>
      </div>

      {props.expanded ? (
        <div className="activity-details">
          <div className="activity-detail-grid">
            <div className="activity-detail-item">
              <span className="muted">Signature</span>
              <span className="mono">{formatAddress(props.item.signature)}</span>
            </div>
            <div className="activity-detail-item">
              <span className="muted">Fee</span>
              <span>{feeLabel ?? 'Unavailable'}</span>
            </div>
            <div className="activity-detail-item">
              <span className="muted">Protocol</span>
              <span>{props.item.protocolName ?? 'Direct'}</span>
            </div>
            <div className="activity-detail-item">
              <span className="muted">Signers</span>
              <span>{props.item.signers.length || 0}</span>
            </div>
          </div>

          {props.item.actions.length > 0 ? (
            <div className="activity-action-list">
              {props.item.actions.map((action, index) => (
                <div key={`${props.item.signature}:${index}:${action.type}`} className="activity-action-item">
                  <span className="activity-action-label">{action.label}</span>
                  <span className="activity-action-copy">
                    {[action.amount, action.asset, action.address ? formatAddress(action.address) : null].filter(Boolean).join(' • ') || 'No parsed fields'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="activity-actions">
            <Button
              tone="secondary"
              onClick={(event) => {
                event.stopPropagation();
                window.open(buildTransactionExplorerUrl(props.item.signature, props.network), '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink size={14} />
              View on Explorer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionStatusCard(props: {
  tone: 'warning' | 'success';
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <Card className={`action-status-card ${props.tone === 'success' ? 'action-status-card-success' : ''}`.trim()}>
      <div className="action-status-body">
        {props.tone === 'success' ? (
          <div className="action-status-check" aria-hidden="true">
            <span />
          </div>
        ) : (
          <div className="action-status-spinner" aria-hidden="true" />
        )}
        <StatusPill tone={props.tone}>{props.tone === 'success' ? 'Success' : 'Working'}</StatusPill>
        <div className="action-status-copy">
          <h2>{props.title}</h2>
          <p className="muted">{props.message}</p>
        </div>
        {props.children}
      </div>
    </Card>
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
  const [sendAssetPickerOpen, setSendAssetPickerOpen] = useState(false);
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
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricUnlocking, setBiometricUnlocking] = useState(false);
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [biometricSettingsPassword, setBiometricSettingsPassword] = useState('');
  const [biometricSettingsError, setBiometricSettingsError] = useState<string | null>(null);
  const [biometricSettingsBusy, setBiometricSettingsBusy] = useState(false);
  const [customRpcEnabled, setCustomRpcEnabled] = useState(false);
  const [customRpcInput, setCustomRpcInput] = useState('');
  const [customRpcBusy, setCustomRpcBusy] = useState(false);
  const [customRpcError, setCustomRpcError] = useState<string | null>(null);
  const [swapInputAssetId, setSwapInputAssetId] = useState('sol');
  const [swapOutputMint, setSwapOutputMint] = useState<string>(COMMON_SWAP_TOKENS[1].mint);
  const [swapInputPickerOpen, setSwapInputPickerOpen] = useState(false);
  const [swapOutputPickerOpen, setSwapOutputPickerOpen] = useState(false);
  const [swapUseCustomOutputMint, setSwapUseCustomOutputMint] = useState(false);
  const [swapCustomOutputMint, setSwapCustomOutputMint] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapSlippageBps, setSwapSlippageBps] = useState('50');
  const [swapPassword, setSwapPassword] = useState('');
  const [swapQuote, setSwapQuote] = useState<WalletSwapQuoteResponse | null>(null);
  const [swapResult, setSwapResult] = useState<WalletSwapExecuteResponse | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [quotingSwap, setQuotingSwap] = useState(false);
  const [submittingSwap, setSubmittingSwap] = useState(false);
  const swapQuoteRequestRef = useRef(0);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [activity, setActivity] = useState<WalletActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [expandedActivitySignature, setExpandedActivitySignature] = useState<string | null>(null);
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccountRow[]>([]);
  const [stakeSource, setStakeSource] = useState<'shyft' | 'rpc' | 'none'>('none');
  const [stakeLoading, setStakeLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeVoteAccount, setStakeVoteAccount] = useState('');
  const [stakeDeactivateAccount, setStakeDeactivateAccount] = useState('');
  const [stakeWithdrawAccount, setStakeWithdrawAccount] = useState('');
  const [stakeWithdrawAmount, setStakeWithdrawAmount] = useState('');
  const [stakePassword, setStakePassword] = useState('');
  const [stakeSubmitting, setStakeSubmitting] = useState<'stake' | 'deactivate' | 'withdraw' | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [stakeResult, setStakeResult] = useState<WalletStakeActionResponse | null>(null);
  const [assetDetails, setAssetDetails] = useState<TokenDetailsResponse | null>(null);
  const [selectedCollectible, setSelectedCollectible] = useState<CollectibleItem | null>(null);
  const [assetDetailsLoading, setAssetDetailsLoading] = useState(false);
  const [assetDetailsError, setAssetDetailsError] = useState<string | null>(null);
  const [assetJsonMetadata, setAssetJsonMetadata] = useState<{
    name?: string;
    symbol?: string;
    description?: string;
    imageUri?: string;
    externalUrl?: string;
  } | null>(null);
  const [assetJsonLoading, setAssetJsonLoading] = useState(false);
  const [assetActionMode, setAssetActionMode] = useState<'burn' | 'close' | null>(null);
  const [tokenActionError, setTokenActionError] = useState<string | null>(null);
  const [tokenActionResult, setTokenActionResult] = useState<TokenActionResponse | null>(null);
  const [burnAmount, setBurnAmount] = useState('');
  const [burnPassword, setBurnPassword] = useState('');
  const [tokenActionSubmitting, setTokenActionSubmitting] = useState<'burn' | 'close' | null>(null);
  const [securityReport, setSecurityReport] = useState<WalletSecurityReportResponse | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [incidentSafeWallet, setIncidentSafeWallet] = useState('');
  const [incidentReserveSol, setIncidentReserveSol] = useState('0.02');
  const [incidentPassword, setIncidentPassword] = useState('');
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);
  const [incidentResult, setIncidentResult] = useState<IncidentResponseResponse | null>(null);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [unlockWelcomeMenuOpen, setUnlockWelcomeMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [incidentOptions, setIncidentOptions] = useState({
    revokeDelegates: true,
    sweepSplTokens: true,
    sweepSol: true,
    rotateCloseAuthorities: true,
    rotateMintAuthorities: true
  });
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);
  const assetActionCardRef = useRef<HTMLDivElement | null>(null);

  const surface = document.body.dataset.surface ?? 'page';
  const surfaceId = document.body.dataset.surfaceId ?? '';
  const isPopupSurface = surface === 'popup';

  const refresh = async () => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
    setState(nextState);
    if (nextState.wallet.setup === 'ready' && !nextState.session.locked) {
      setAssetsLoading(true);
      try {
        const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({
          type: 'wallet_get_assets',
          staleWhileRevalidate: true
        });
        setAssets(nextAssets);
      } finally {
        setAssetsLoading(false);
      }
    } else {
      setAssets({
        lamports: null,
        tokens: [],
        collections: []
      });
      setAssetsLoading(false);
    }
  };

  const refreshStakeAccounts = async () => {
    if (!state || state.wallet.setup !== 'ready') {
      setStakeAccounts([]);
      setStakeSource('none');
      return;
    }

    setStakeLoading(true);
    try {
      const nextStakeState = await sendRuntimeMessage<WalletStakeAccountsResponse>({ type: 'wallet_get_stake_accounts' });
      setStakeAccounts(nextStakeState.accounts);
      setStakeSource(nextStakeState.source);
      setStakeError(null);
    } catch (error) {
      setStakeError(error instanceof Error ? error.message : 'Unable to load stake accounts.');
    } finally {
      setStakeLoading(false);
    }
  };

  const refreshActivity = async () => {
    if (!state || state.wallet.setup !== 'ready') {
      setActivity([]);
      return;
    }

    setActivityLoading(true);
    try {
      const nextActivity = await sendRuntimeMessage<WalletActivityResponse>({ type: 'wallet_get_activity', limit: 30 });
      setActivity(nextActivity.items);
      setActivityError(null);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Unable to load activity.');
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const refreshActiveApproval = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.approvals);
    const approvals = (stored[STORAGE_KEYS.approvals] as Record<string, ApprovalRecord> | undefined) ?? {};
    const latestApproval =
      Object.values(approvals)
        .filter((approval) => approval.hostSurfaceId === surfaceId)
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
    if (latestApproval) {
      setActiveApproval(latestApproval);
      setView('approval');
    } else {
      setActiveApproval(null);
      setView((current) => (current === 'approval' ? 'home' : current));
    }
  };

  useEffect(() => {
    void refresh();
    void refreshActiveApproval();
  }, []);

  useEffect(() => {
    void isBiometricUnlockSupported().then(setBiometricSupported).catch(() => setBiometricSupported(false));
  }, []);

  useEffect(() => {
    applyDocumentTheme(state?.wallet.selectedTheme);
  }, [state?.wallet.selectedTheme]);

  useEffect(() => {
    if (view === 'security' && state?.wallet.setup === 'ready' && !state.session.locked) {
      void refreshSecurityReport();
    }
  }, [view, state?.wallet.setup, state?.session.locked]);

  useEffect(() => {
    if (!state?.canUseUnlockedSigner) {
      return;
    }

    setPassword('');
    setSwapPassword('');
    setStakePassword('');
    setBurnPassword('');
    setIncidentPassword('');
  }, [state?.canUseUnlockedSigner]);

  useEffect(() => {
    if (!state) {
      setCustomRpcEnabled(false);
      setCustomRpcInput('');
      setCustomRpcError(null);
      return;
    }

    const nextCustomRpc = state.wallet.customRpcUrls[state.wallet.selectedNetwork] ?? '';
    setCustomRpcEnabled(!!nextCustomRpc);
    setCustomRpcInput(nextCustomRpc);
    setCustomRpcError(null);
  }, [state?.wallet.customRpcUrls, state?.wallet.selectedNetwork]);

  useEffect(() => {
    if (homeTab !== 'staking' || state?.wallet.setup !== 'ready' || view !== 'home') {
      return;
    }

    if (state.session.locked && state.activeWallet?.signerKind !== 'watch-only') {
      return;
    }

    void refreshStakeAccounts();
  }, [homeTab, view, state?.wallet.setup, state?.session.locked, state?.activeWallet?.signerKind, state?.wallet.selectedWalletId]);

  useEffect(() => {
    if (homeTab !== 'activity' || state?.wallet.setup !== 'ready' || view !== 'home') {
      return;
    }

    if (state.session.locked && state.activeWallet?.signerKind !== 'watch-only') {
      return;
    }

    void refreshActivity();
  }, [homeTab, view, state?.wallet.setup, state?.session.locked, state?.activeWallet?.signerKind, state?.wallet.selectedWalletId, state?.wallet.selectedNetwork]);

  useEffect(() => {
    const cacheKey = buildAssetCacheKey(state);
    if (!cacheKey) {
      return;
    }

    const handleStorageChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName !== 'session') {
        return;
      }

      const assetCacheChange = changes[ASSET_CACHE_STORAGE_KEY];
      if (!assetCacheChange?.newValue || typeof assetCacheChange.newValue !== 'object') {
        return;
      }

      const nextCache = assetCacheChange.newValue as Record<string, { data?: WalletAssetsResponse }>;
      const nextEntry = nextCache[cacheKey];
      if (!nextEntry?.data) {
        return;
      }

      setAssets(nextEntry.data);
      setAssetsLoading(false);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [state]);

  useEffect(() => {
    if (view === 'asset') {
      window.scrollTo(0, 0);
    }
  }, [view, assetId]);

  useEffect(() => {
    if (view !== 'asset' || !assetActionMode) {
      return;
    }

    window.requestAnimationFrame(() => {
      assetActionCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }, [view, assetActionMode]);

  useEffect(() => {
    if (view !== 'asset' || !assetDetails?.metadataUri) {
      setAssetJsonMetadata(null);
      setAssetJsonLoading(false);
      return;
    }

    const controller = new AbortController();
    setAssetJsonLoading(true);
    setAssetJsonMetadata(null);

    void fetch(assetDetails.metadataUri, {
      signal: controller.signal,
      headers: {
        accept: 'application/json'
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Metadata JSON request failed.');
        }
        const payload = (await response.json()) as Record<string, unknown>;
        setAssetJsonMetadata({
          name: typeof payload.name === 'string' ? payload.name : undefined,
          symbol: typeof payload.symbol === 'string' ? payload.symbol : undefined,
          description: typeof payload.description === 'string' ? payload.description : undefined,
          externalUrl:
            typeof payload.external_url === 'string'
              ? payload.external_url
              : typeof payload.externalUrl === 'string'
                ? payload.externalUrl
                : typeof payload.website === 'string'
                  ? payload.website
                  : undefined,
          imageUri:
            typeof payload.image === 'string'
              ? payload.image
              : typeof payload.image_url === 'string'
                ? payload.image_url
                : undefined
        });
      })
      .catch(() => {
        setAssetJsonMetadata(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAssetJsonLoading(false);
        }
      });

    return () => controller.abort();
  }, [view, assetDetails?.metadataUri]);

  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.approvals]) {
        void refreshActiveApproval();
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const activePublicKey = state?.activeAccount?.publicKey;
  const privacyModeEnabled = state?.wallet.privacyMode ?? false;

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
  const solUnitPrice = useMemo(() => formatUnitPrice(assets.nativePriceUsd), [assets.nativePriceUsd]);
  const collectibleItems = useMemo(
    () =>
      (assets.collections ?? []).flatMap((collection) =>
        collection.items.map((item) => ({
          ...item,
          collectionId: item.collectionId ?? collection.id,
          collectionName: item.collectionName ?? collection.name,
          collectionSymbol: item.collectionSymbol ?? collection.symbol,
          imageUri: item.imageUri ?? collection.imageUri
        }))
      ),
    [assets.collections]
  );
  const assetOptions = useMemo<AssetOption[]>(() => {
    const tokenOptions = assets.tokens.map((token) => ({
      id: `${token.mint}:${token.programId}`,
      label: token.symbol ? `${token.symbol} token` : `${formatAddress(token.mint)} token`,
      name: token.name ?? token.symbol ?? formatAddress(token.mint),
      symbol: token.symbol ?? formatAddress(token.mint),
        balance: privacyModeEnabled ? '***' : formatTokenAmount(token),
      logoUri: token.logoUri,
      asset: {
        kind: 'spl-token' as const,
        mint: token.mint,
        decimals: token.decimals,
        programId: token.programId,
        accountAddress: token.accountAddress
      }
    }));

    return [
      {
        id: 'sol',
        label: 'SOL',
        name: 'Solana',
        symbol: 'SOL',
        balance: privacyModeEnabled ? '***' : homeBalance,
        logoUri: SOLANA_LOGO_URL,
        sol: true,
        asset: { kind: 'sol' as const }
      },
      ...tokenOptions
    ];
  }, [assets, homeBalance, privacyModeEnabled]);
  const sendAssetOptions = useMemo<AssetOption[]>(() => {
    const collectibleOptions = collectibleItems
      .filter((item) => item.accountAddress && item.programId)
      .map((item) => ({
        id: `collectible:${item.mint}:${item.programId}:${item.accountAddress}`,
        label: item.symbol ? `${item.symbol} collectible` : `${formatAddress(item.mint)} collectible`,
        name: item.name ?? item.symbol ?? formatAddress(item.mint),
        symbol: item.symbol ?? 'NFT',
        balance: '1 NFT',
        logoUri: item.imageUri,
        asset: {
          kind: 'spl-token' as const,
          mint: item.mint,
          decimals: 0,
          programId: item.programId!,
          accountAddress: item.accountAddress!
        }
      }));

    return [...assetOptions, ...collectibleOptions];
  }, [assetOptions, collectibleItems]);

  const selectedAsset = sendAssetOptions.find((option) => option.id === assetId) ?? sendAssetOptions[0];
  const selectedTokenHolding =
    assetId === 'sol' ? null : assets.tokens.find((token) => `${token.mint}:${token.programId}` === assetId) ?? null;
  const selectedSendCollectible =
    assetId === 'sol'
      ? null
      : collectibleItems.find(
          (item) => `collectible:${item.mint}:${item.programId}:${item.accountAddress}` === assetId
        ) ?? null;
  const selectedSwapInputAsset = assetOptions.find((option) => option.id === swapInputAssetId) ?? assetOptions[0];
  const selectedSwapInputHolding =
    swapInputAssetId === 'sol'
      ? null
      : assets.tokens.find((token) => `${token.mint}:${token.programId}` === swapInputAssetId) ?? null;
  const swapOutputOptions = useMemo<SwapOutputOption[]>(() => {
    const ownedTokens: SwapOutputOption[] = assets.tokens.map((token) => ({
      mint: token.mint,
      symbol: token.symbol ?? formatAddress(token.mint)
    }));
    return [...COMMON_SWAP_TOKENS, ...ownedTokens].filter(
      (token, index, allTokens) => allTokens.findIndex((candidate) => candidate.mint === token.mint) === index
    );
  }, [assets.tokens]);
  const effectiveSwapOutputMint = swapUseCustomOutputMint ? swapCustomOutputMint.trim() : swapOutputMint;
  const selectedSwapOutputToken = assets.tokens.find((token) => token.mint === effectiveSwapOutputMint) ?? null;
  const selectedSwapOutputOption = swapOutputOptions.find((option) => option.mint === effectiveSwapOutputMint) ?? null;
  const swapOutputPickerOptions = useMemo<AssetPickerDisplayOption[]>(
    () =>
      swapOutputOptions.map((option) => {
        const ownedToken = assets.tokens.find((token) => token.mint === option.mint);
        return {
          id: option.mint,
          name:
            option.mint === JUPITER_SOL_MINT
              ? 'Solana'
              : ownedToken?.name ?? option.symbol ?? formatAddress(option.mint),
          symbol: option.symbol ?? ownedToken?.symbol ?? formatAddress(option.mint),
          balance:
            option.mint === JUPITER_SOL_MINT
              ? privacyModeEnabled
                ? '***'
                : homeBalance
              : ownedToken
                ? privacyModeEnabled
                  ? '***'
                  : formatTokenAmount(ownedToken)
                : 'Not owned yet',
          logoUri: option.mint === JUPITER_SOL_MINT ? SOLANA_LOGO_URL : ownedToken?.logoUri,
          sol: option.mint === JUPITER_SOL_MINT
        };
      }),
    [assets.tokens, homeBalance, privacyModeEnabled, swapOutputOptions]
  );

  async function handleOpenInTab() {
    openExtensionPage(buildWalletPagePath(view, assetId));
    if (isPopupSurface) {
      window.close();
    }
  }

  async function handleGetSwapQuote(requestId = Date.now()) {
    if (!selectedSwapInputAsset || !effectiveSwapOutputMint) {
      return;
    }

    try {
      swapQuoteRequestRef.current = requestId;
      setQuotingSwap(true);
      setSwapError(null);
      setSwapResult(null);
      const quote = await sendRuntimeMessage<WalletSwapQuoteResponse>({
        type: 'wallet_get_swap_quote',
        amount: swapAmount,
        slippageBps: Number(swapSlippageBps),
        inputAsset: selectedSwapInputAsset.asset,
        outputMint: effectiveSwapOutputMint
      });
      if (swapQuoteRequestRef.current === requestId) {
        setSwapQuote(quote);
      }
    } catch (error) {
      if (swapQuoteRequestRef.current === requestId) {
        setSwapQuote(null);
        setSwapError(error instanceof Error ? error.message : 'Unable to fetch swap quote.');
      }
    } finally {
      if (swapQuoteRequestRef.current === requestId) {
        setQuotingSwap(false);
      }
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
        password: canUseUnlockedSigner ? undefined : swapPassword || undefined
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

  useEffect(() => {
    if (view !== 'swap' || submittingSwap || Boolean(swapResult)) {
      return;
    }

    const slippage = Number(swapSlippageBps);
    if (
      state?.wallet.selectedNetwork !== 'mainnet-beta' ||
      !selectedSwapInputAsset ||
      !swapAmount.trim() ||
      !effectiveSwapOutputMint ||
      effectiveSwapOutputMint.length < 32 ||
      !Number.isFinite(slippage)
    ) {
      swapQuoteRequestRef.current = 0;
      setQuotingSwap(false);
      return;
    }

    const requestId = Date.now();
    swapQuoteRequestRef.current = requestId;
    const timeoutId = window.setTimeout(() => {
      void handleGetSwapQuote(requestId);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    effectiveSwapOutputMint,
    selectedSwapInputAsset,
    swapAmount,
    swapInputAssetId,
    swapOutputMint,
    swapSlippageBps,
    swapUseCustomOutputMint,
    submittingSwap,
    swapResult,
    view,
    state?.wallet.selectedNetwork
  ]);

  async function handleCreateStake() {
    try {
      setStakeSubmitting('stake');
      setStakeError(null);
      const result = await sendRuntimeMessage<WalletStakeActionResponse>({
        type: 'wallet_stake_create',
        amount: stakeAmount,
        voteAccount: stakeVoteAccount,
        password: canUseUnlockedSigner ? undefined : stakePassword || undefined
      });
      setStakeResult(result);
      setStakeAmount('');
      setStakeVoteAccount('');
      setStakePassword('');
      await refreshStakeAccounts();
      void refresh().catch(() => undefined);
    } catch (error) {
      setStakeError(error instanceof Error ? error.message : 'Unable to create stake account.');
    } finally {
      setStakeSubmitting(null);
    }
  }

  async function handleDeactivateStake() {
    try {
      setStakeSubmitting('deactivate');
      setStakeError(null);
      const result = await sendRuntimeMessage<WalletStakeActionResponse>({
        type: 'wallet_stake_deactivate',
        stakeAccount: stakeDeactivateAccount,
        password: canUseUnlockedSigner ? undefined : stakePassword || undefined
      });
      setStakeResult(result);
      setStakePassword('');
      await refreshStakeAccounts();
    } catch (error) {
      setStakeError(error instanceof Error ? error.message : 'Unable to deactivate stake account.');
    } finally {
      setStakeSubmitting(null);
    }
  }

  async function handleWithdrawStake() {
    try {
      setStakeSubmitting('withdraw');
      setStakeError(null);
      const result = await sendRuntimeMessage<WalletStakeActionResponse>({
        type: 'wallet_stake_withdraw',
        stakeAccount: stakeWithdrawAccount,
        amount: stakeWithdrawAmount,
        password: canUseUnlockedSigner ? undefined : stakePassword || undefined
      });
      setStakeResult(result);
      setStakeWithdrawAmount('');
      setStakePassword('');
      await refreshStakeAccounts();
      void refresh().catch(() => undefined);
    } catch (error) {
      setStakeError(error instanceof Error ? error.message : 'Unable to withdraw stake.');
    } finally {
      setStakeSubmitting(null);
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

  async function refreshAssetDetails(nextToken: Pick<TokenHolding, 'mint' | 'accountAddress' | 'programId'>) {
    try {
      setAssetDetailsLoading(true);
      setAssetDetailsError(null);
      const nextDetails = await sendRuntimeMessage<TokenDetailsResponse>({
        type: 'wallet_get_token_details',
        mint: nextToken.mint,
        accountAddress: nextToken.accountAddress,
        programId: nextToken.programId
      });
      setAssetDetails(nextDetails);
    } catch (error) {
      setAssetDetailsError(error instanceof Error ? error.message : 'Unable to load token details.');
      setAssetDetails(null);
    } finally {
      setAssetDetailsLoading(false);
    }
  }

  function openAssetDetails(nextToken: TokenHolding) {
    setAssetId(`${nextToken.mint}:${nextToken.programId}`);
    setSelectedCollectible(null);
    setAssetDetails(null);
    setAssetDetailsError(null);
    setAssetJsonMetadata(null);
    setAssetActionMode(null);
    setTokenActionError(null);
    setTokenActionResult(null);
    setBurnAmount('');
    setBurnPassword('');
    setView('asset');
    void refreshAssetDetails(nextToken);
  }

  function openCollectibleDetails(item: CollectibleItem) {
    setSelectedCollectible(item);
    setAssetJsonMetadata(null);
    setAssetActionMode(null);
    setTokenActionError(null);
    setTokenActionResult(null);
    setBurnAmount('');
    setBurnPassword('');
    setView('asset');

    if (!item.accountAddress || !item.programId) {
      setAssetDetails(null);
      setAssetDetailsError('This collectible is missing token account metadata, so Grape cannot inspect it yet.');
      return;
    }

    setAssetId(`${item.mint}:${item.programId}`);
    setAssetDetails(null);
    setAssetDetailsError(null);
    void refreshAssetDetails({
      mint: item.mint,
      accountAddress: item.accountAddress,
      programId: item.programId
    });
  }

  function openSend(nextAssetId = 'sol') {
    setAssetId(nextAssetId);
    setSendAssetPickerOpen(false);
    setSendError(null);
    setSendResult(null);
    setView('send');
  }

  function openSendForCollectible(item: CollectibleItem) {
    if (!item.accountAddress || !item.programId) {
      setSurfaceError('This collectible is missing token account metadata, so it cannot be sent yet.');
      return;
    }

    setAssetId(`collectible:${item.mint}:${item.programId}:${item.accountAddress}`);
    setAmount('1');
    setRecipient('');
    setPassword('');
    setSendAssetPickerOpen(false);
    setSendError(null);
    setSendResult(null);
    setView('send');
  }

  function openSwapForAsset(nextAssetId: string) {
    const nextAsset =
      assetOptions.find((option) => option.id === nextAssetId) ??
      assetOptions.find((option) => option.id === 'sol') ??
      assetOptions[0];
    if (!nextAsset) {
      return;
    }

    const inputMint = nextAsset.asset.kind === 'sol' ? JUPITER_SOL_MINT : nextAsset.asset.mint;
    const defaultOutputMint =
      inputMint === COMMON_SWAP_TOKENS[1].mint
        ? JUPITER_SOL_MINT
        : COMMON_SWAP_TOKENS[1].mint;

    setSwapInputAssetId(nextAsset.id);
    setSwapOutputMint(defaultOutputMint);
    setSwapUseCustomOutputMint(false);
    setSwapCustomOutputMint('');
    setSwapInputPickerOpen(false);
    setSwapOutputPickerOpen(false);
    setSwapAmount('');
    setSwapQuote(null);
    setSwapResult(null);
    setSwapError(null);
    setView('swap');
  }

  async function refreshSecurityReport() {
    try {
      setSecurityLoading(true);
      setSecurityError(null);
      const nextReport = await sendRuntimeMessage<WalletSecurityReportResponse>({
        type: 'wallet_get_security_report'
      });
      setSecurityReport(nextReport);
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Unable to load the security report.');
    } finally {
      setSecurityLoading(false);
    }
  }

  async function handleBurnToken() {
    if (!assetDetails) {
      return;
    }

    try {
      setTokenActionSubmitting('burn');
      setTokenActionError(null);
      const result = await sendRuntimeMessage<TokenActionResponse>({
        type: 'wallet_burn_token',
        mint: assetDetails.mint,
        accountAddress: assetDetails.accountAddress,
        amount: burnAmount,
        decimals: assetDetails.decimals,
        programId: assetDetails.programId,
        password: burnPassword || undefined
      });
      setTokenActionResult(result);
      setBurnAmount('');
      setBurnPassword('');
      await refresh();
      await refreshAssetDetails(assetDetails);
      setAssetActionMode(null);
      if (view === 'security') {
        await refreshSecurityReport();
      }
    } catch (error) {
      setTokenActionError(error instanceof Error ? error.message : 'Unable to burn the token.');
    } finally {
      setTokenActionSubmitting(null);
    }
  }

  async function handleCloseTokenAccount() {
    if (!assetDetails) {
      return;
    }

    try {
      setTokenActionSubmitting('close');
      setTokenActionError(null);
      const result = await sendRuntimeMessage<TokenActionResponse>({
        type: 'wallet_close_token_account',
        mint: assetDetails.mint,
        accountAddress: assetDetails.accountAddress,
        programId: assetDetails.programId,
        password: burnPassword || undefined
      });
      setTokenActionResult(result);
      setBurnPassword('');
      await refresh();
      setAssetActionMode(null);
      setView('home');
    } catch (error) {
      setTokenActionError(error instanceof Error ? error.message : 'Unable to close the token account.');
    } finally {
      setTokenActionSubmitting(null);
    }
  }

  async function handleRunIncidentResponse() {
    try {
      setIncidentSubmitting(true);
      setIncidentError(null);
      const result = await sendRuntimeMessage<IncidentResponseResponse>({
        type: 'wallet_run_incident_response',
        safeWallet: incidentSafeWallet,
        reserveSol: incidentReserveSol,
        password: incidentPassword || undefined,
        ...incidentOptions
      });
      setIncidentResult(result);
      setIncidentPassword('');
      await refresh();
      await refreshSecurityReport();
    } catch (error) {
      setIncidentError(error instanceof Error ? error.message : 'Unable to run incident response.');
    } finally {
      setIncidentSubmitting(false);
    }
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
        password: canUseUnlockedSigner ? undefined : password || undefined,
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
  const isWatchOnlyWallet = activeWallet?.signerKind === 'watch-only';
  const recentRecipients = state.recentRecipients;
  const privacyMode = wallet.privacyMode;
  const selectedNetworkCustomRpc = wallet.customRpcUrls[wallet.selectedNetwork] ?? '';

  if (session.locked && !isWatchOnlyWallet) {
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

  async function handleWalletRename(walletId: string, currentName: string) {
    const nextName = window.prompt('Set a wallet label.', currentName)?.trim();
    if (!nextName || nextName === currentName.trim()) {
      return;
    }

    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_set_label',
      walletId,
      name: nextName
    });
    await refresh();
  }

  async function handleWalletRemove(walletId: string, walletName: string) {
    const warning =
      wallet.wallets.length === 1
        ? `Remove ${walletName}? This will remove your final wallet from Grape and return you to setup. Make sure you have backed up the recovery phrase or private key and moved any assets first.`
        : `Remove ${walletName}? Make sure you have backed up the recovery phrase or private key and moved any assets first.`;

    const confirmed = window.confirm(warning);
    if (!confirmed) {
      return;
    }

    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_remove',
      walletId
    });

    setUnlockError(null);
    setReceiveQr('');
    setAssetDetails(null);
    setSelectedCollectible(null);
    setAssetJsonMetadata(null);
    setAssetActionMode(null);
    setSendResult(null);
    setSwapQuote(null);
    setSwapResult(null);
    setIncidentResult(null);
    setView('home');
    setWalletMenuOpen(false);
    await refresh();
  }

  async function handleSaveCustomRpc() {
    try {
      setCustomRpcBusy(true);
      setCustomRpcError(null);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_set_custom_rpc',
        network: wallet.selectedNetwork,
        rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
      });
      await refresh();
    } catch (error) {
      setCustomRpcError(error instanceof Error ? error.message : 'Unable to update custom RPC.');
    } finally {
      setCustomRpcBusy(false);
    }
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

  async function handleBiometricUnlockInline() {
    if (!wallet.wallets.length) {
      return;
    }

    const selectedWallet = wallet.wallets.find((entry) => entry.id === wallet.selectedWalletId) ?? wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setUnlockError(null);
      const password = await unlockWithBiometric(selectedWallet.biometricUnlock);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password
      });
      setUnlockPassword('');
      await refresh();
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'Unable to unlock with device.');
    } finally {
      setBiometricUnlocking(false);
    }
  }

  async function handleBiometricUnlockForSigning() {
    if (!wallet.wallets.length) {
      return;
    }

    const selectedWallet = wallet.wallets.find((entry) => entry.id === wallet.selectedWalletId) ?? wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setSendError(null);
      setSwapError(null);
      setTokenActionError(null);
      setIncidentError(null);
      const password = await unlockWithBiometric(selectedWallet.biometricUnlock);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password
      });
      setSwapPassword('');
      setBurnPassword('');
      setIncidentPassword('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to unlock with device.';
      setSendError(message);
      setSwapError(message);
      setTokenActionError(message);
      setIncidentError(message);
    } finally {
      setBiometricUnlocking(false);
    }
  }

  async function handleEnableBiometricFromSettings() {
    if (!activeWallet?.id || !biometricSettingsPassword.trim()) {
      return;
    }

    try {
      setBiometricSettingsBusy(true);
      setBiometricSettingsError(null);
      const config = await createBiometricUnlock(activeWallet.id, biometricSettingsPassword);
      await sendRuntimeMessage({
        type: 'wallet_set_biometric_unlock',
        config
      });
      setBiometricSettingsPassword('');
      await refresh();
    } catch (error) {
      setBiometricSettingsError(error instanceof Error ? error.message : 'Unable to enable biometric unlock.');
    } finally {
      setBiometricSettingsBusy(false);
    }
  }

  async function handleDisableBiometricFromSettings() {
    try {
      setBiometricSettingsBusy(true);
      setBiometricSettingsError(null);
      await sendRuntimeMessage({
        type: 'wallet_set_biometric_unlock',
        config: null
      });
      await refresh();
    } catch (error) {
      setBiometricSettingsError(error instanceof Error ? error.message : 'Unable to disable biometric unlock.');
    } finally {
      setBiometricSettingsBusy(false);
    }
  }

  function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleResetWallet() {
    const confirmed = window.confirm('This will remove all wallets, approvals, and site connections from this browser. Continue?');
    if (!confirmed) {
      return;
    }

    setUnlockError(null);
    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_reset'
    });
    setUnlockPassword('');
    setShowUnlockPassword(false);
    setReceiveQr('');
    setAssetDetails(null);
    setSelectedCollectible(null);
    setAssetJsonMetadata(null);
    setAssetActionMode(null);
    setSendResult(null);
    setSwapQuote(null);
    setSwapResult(null);
    setView('home');
    await refresh();
  }

  function renderUnlockWelcomeMenu() {
    return (
      <DropdownMenu.Root open={unlockWelcomeMenuOpen} onOpenChange={setUnlockWelcomeMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`menu-button unlock-welcome-menu-button ${unlockWelcomeMenuOpen ? 'open' : ''}`.trim()}
            aria-label={unlockWelcomeMenuOpen ? 'Close Grape links' : 'Grape links'}
          >
            {unlockWelcomeMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={8} align="end" className="popup-menu-content">
            <div className="popup-menu-section">Grape</div>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExternal('https://x.com/grapeprotocol');
              }}
            >
              <span className="wallet-menu-action-copy">
                <XBrandIcon />
                <span>@grapeprotocol</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExternal('https://discord.gg/tVFUvAQT');
              }}
            >
              <span className="wallet-menu-action-copy">
                <DiscordBrandIcon />
                <span>Discord</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action wallet-menu-action-danger"
              onSelect={() => {
                void handleResetWallet();
              }}
            >
              Reset wallet
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  function renderWalletMenu() {
    return (
      <DropdownMenu.Root open={walletMenuOpen} onOpenChange={setWalletMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`menu-button ${walletMenuOpen ? 'open' : ''}`.trim()}
            aria-label={walletMenuOpen ? 'Close wallet menu' : 'Wallet menu'}
          >
            {walletMenuOpen ? <X size={18} /> : <Menu size={18} />}
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
                const isActiveWallet = wallet.selectedWalletId === walletEntry.id;
                const sourceBadge = getWalletSourceBadge(walletEntry.source, walletEntry.signer.kind);

                return (
                  <div key={walletEntry.id} className="wallet-menu-row">
                    <DropdownMenu.Item
                      className={`wallet-menu-item ${isActiveWallet ? 'active' : ''}`.trim()}
                      onSelect={() => {
                        void handleWalletSelect(walletEntry.id);
                      }}
                    >
                      <div>
                        <div className="wallet-menu-heading">
                          <strong>{walletEntry.name}</strong>
                          <span
                            className={`wallet-source-badge ${sourceBadge.tone}`.trim()}
                            title={sourceBadge.label}
                            aria-label={sourceBadge.label}
                          >
                            {sourceBadge.icon}
                          </span>
                        </div>
                        <div className="muted mono">{formatAddress(walletPublicKey)}</div>
                      </div>
                      {isActiveWallet ? <StatusPill tone="success">Active</StatusPill> : null}
                    </DropdownMenu.Item>
                    <button
                      type="button"
                      className="wallet-menu-edit-button"
                      aria-label={`Rename ${walletEntry.name}`}
                      title={`Rename ${walletEntry.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleWalletRename(walletEntry.id, walletEntry.name);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="wallet-menu-remove-button"
                      aria-label={`Remove ${walletEntry.name}`}
                      title={`Remove ${walletEntry.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleWalletRemove(walletEntry.id, walletEntry.name);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                setView('security');
              }}
            >
              <span className="wallet-menu-action-copy">
                <ShieldAlert size={15} className="wallet-menu-action-icon" />
                <span>Security</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                void handleOpenInTab();
              }}
            >
              <span className="wallet-menu-action-copy">
                <ExternalLink size={15} className="wallet-menu-action-icon" />
                <span>Open expanded view</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                void handleOpenInSidePanel();
              }}
            >
              <span className="wallet-menu-action-copy">
                <PanelRightOpen size={15} className="wallet-menu-action-icon" />
                <span>Open side panel</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExtensionPage('onboarding.html?append=1&mode=create');
              }}
            >
              <span className="wallet-menu-action-copy">
                <Plus size={15} className="wallet-menu-action-icon" />
                <span>Create wallet</span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="wallet-menu-action"
              onSelect={() => {
                openExtensionPage('onboarding.html?append=1&mode=import');
              }}
            >
              <span className="wallet-menu-action-copy">
                <ArrowDownLeft size={15} className="wallet-menu-action-icon" />
                <span>Import wallet</span>
              </span>
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
          {renderUnlockWelcomeMenu()}
          <div className="unlock-welcome-brand">
            <img className="unlock-welcome-logo" src={GRAPE_LOGO_URL} alt="Grape" />
            <h2 className="unlock-welcome-title">Grape Wallet</h2>
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
              {biometricSupported && activeWallet?.biometricEnabled ? (
                <button
                  type="button"
                  className="biometric-inline-button"
                  aria-label="Unlock with device"
                  title="Unlock with device"
                  onClick={() => void handleBiometricUnlockInline()}
                  disabled={biometricUnlocking}
                >
                  <Fingerprint size={16} />
                </button>
              ) : null}
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
                {isWatchOnlyWallet ? 'Watch-only' : session.locked ? 'Locked' : 'Ready'}
              </span>
              {renderWalletMenu()}
            </div>
          </div>

          <div className="portfolio-copy">
            <div className="portfolio-label">Total Balance</div>
            {assetsLoading ? (
              <div className="skeleton-block skeleton-line skeleton-hero-balance" />
            ) : (
              <div className="hero-balance">{maskSensitiveValue(portfolioValue, privacyMode)}</div>
            )}
          </div>

          <div className="wallet-home-header compact wallet-home-header-compact">
            <div className="wallet-address-inline">
              <button
                type="button"
                className="wallet-address-row wallet-address-copy-trigger"
                onClick={handleCopyAddress}
                title={activePublicKey ?? 'Unknown'}
                aria-label="Copy wallet address"
              >
                <div className="mono account-primary" title={activePublicKey ?? 'Unknown'}>
                  {formatAddress(activePublicKey)}
                </div>
              </button>
              <button
                type="button"
                className={`mini-icon-button subtle ${copiedAddress ? 'copied' : ''}`.trim()}
                onClick={handleCopyAddress}
                aria-label={copiedAddress ? 'Address copied' : 'Copy wallet address'}
                title={copiedAddress ? 'Copied' : 'Copy address'}
              >
                {copiedAddress ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div className="quick-actions compact">
            <button type="button" className="quick-action-card" onClick={() => openSend('sol')} aria-label="Send" title="Send" disabled={isWatchOnlyWallet}>
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
              disabled={isWatchOnlyWallet}
            >
              <span className="quick-action-icon"><ArrowLeftRight size={18} /></span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => setView('receive')} aria-label="Receive" title="Receive">
              <span className="quick-action-icon"><QrCode size={18} /></span>
            </button>
          </div>
        </Card>

        {isWatchOnlyWallet ? (
          <p className="warning-box">This is a watch-only wallet. You can view assets, receive funds, and connect to dApps, but signing is disabled.</p>
        ) : null}

        <Tabs.Root value={homeTab} onValueChange={(value) => setHomeTab(value as HomeTab)}>
          <Tabs.List className="content-tabs" aria-label="Wallet content">
            <Tabs.Trigger className="content-tab" value="tokens">
              <span className="content-tab-copy">Tokens</span>
            </Tabs.Trigger>
            <Tabs.Trigger className="content-tab" value="collectibles">
              <span className="content-tab-copy">Collectibles</span>
            </Tabs.Trigger>
            <Tabs.Trigger className="content-tab" value="activity">
              <span className="content-tab-copy">Activity</span>
            </Tabs.Trigger>
            <Tabs.Trigger className="content-tab" value="staking">
              <span className="content-tab-copy">Staking</span>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="tokens">
            <Card className="asset-panel-card">
              {assetsLoading ? (
                <div className="token-list">
                  <AssetSkeletonRow />
                  <AssetSkeletonRow />
                  <AssetSkeletonRow />
                </div>
              ) : (
                <>
                  <button type="button" className="token-row-button" onClick={() => openSend('sol')}>
                    <div className="token-item token-item-interactive">
                      <div className="token-leading">
                        <TokenAvatar token={{ symbol: 'SOL' }} fallbackLabel="S" sol />
                        <div className="token-copy">
                          <strong className="token-name">Solana</strong>
                          <div className="token-subline">
                            <span className="token-subtitle">{solUnitPrice ?? 'SOL'}</span>
                            {solChange ? (
                              <span className={`token-change ${assets.nativePriceChange24h && assets.nativePriceChange24h < 0 ? 'negative' : 'positive'}`.trim()}>
                                {solChange}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="token-amount-group">
                        <div className="token-amount">{maskSensitiveValue(solValue ?? homeBalance, privacyMode)}</div>
                        {solValue ? <div className="token-subtitle token-amount-subtitle">{maskSensitiveValue(homeBalance, privacyMode)}</div> : null}
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
                          privacyMode={privacyMode}
                          onSelect={() => openAssetDetails(token)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="collectibles">
            <Card className="asset-panel-card">
              {collectibleItems.length > 0 ? (
                <div className="collectible-grid">
                  {collectibleItems.map((item) => (
                    <CollectibleCard
                      key={`${item.collectionId ?? 'collectible'}:${item.mint}`}
                      item={item}
                      onSelect={() => openCollectibleDetails(item)}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">No NFT collections found for this wallet on {wallet.selectedNetwork}.</p>
              )}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="activity">
            <Card className="asset-panel-card activity-panel-card">
              {activityError ? <p className="danger-box">{activityError}</p> : null}
              {!activityError && activityLoading ? <p className="muted">Loading recent activity...</p> : null}
              {!activityError && !activityLoading && activity.length === 0 ? (
                <p className="muted">
                  {state?.wallet.setup === 'ready'
                    ? 'No recent activity found for the past few days.'
                    : 'Set up a wallet to load activity.'}
                </p>
              ) : null}
              {!activityError && activity.length > 0 ? (
                <div className="activity-groups">
                  {groupActivityByDay(activity).map((group) => (
                    <section key={group.label} className="activity-group">
                      <div className="activity-group-header">
                        <span className="activity-group-label">{group.label}</span>
                      </div>
                      <div className="activity-list">
                        {group.items.map((item) => (
                          <ActivityRow
                            key={item.signature}
                            item={item}
                            expanded={expandedActivitySignature === item.signature}
                            network={wallet.selectedNetwork}
                            onToggle={() =>
                              setExpandedActivitySignature((current) => (current === item.signature ? null : item.signature))
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="staking">
            <Card className="asset-panel-card staking-panel-card">
              {isWatchOnlyWallet ? (
                <p className="warning-box">Watch-only wallets can view stake accounts but cannot submit stake, harvest, or withdraw transactions.</p>
              ) : null}

              <div className="staking-header">
                <div>
                  <strong>Native staking</strong>
                  <p className="muted">Stake SOL, harvest by deactivating, and withdraw directly in Grape.</p>
                </div>
                <div className="staking-header-actions">
                  <span className="staking-source-chip">Source: {stakeSource === 'none' ? '--' : stakeSource.toUpperCase()}</span>
                  <button type="button" className="mini-icon-button subtle" onClick={() => void refreshStakeAccounts()} aria-label="Refresh staking" title="Refresh staking" disabled={stakeLoading}>
                    <RefreshCcw size={13} />
                  </button>
                </div>
              </div>

              {stakeError ? <p className="danger-box">{stakeError}</p> : null}
              {stakeResult ? (
                <div className="success-box staking-status-box">
                  <strong>{stakeResult.action === 'stake' ? 'Stake submitted' : stakeResult.action === 'deactivate' ? 'Harvest started' : 'Withdraw submitted'}</strong>
                  <span className="mono">{formatAddress(stakeResult.stakeAccount)}</span>
                </div>
              ) : null}

              <div className="staking-summary-grid">
                <div className="staking-summary-card">
                  <span className="muted">Stake accounts</span>
                  <strong>{stakeLoading ? '...' : stakeAccounts.length}</strong>
                </div>
                <div className="staking-summary-card">
                  <span className="muted">Delegated</span>
                  <strong>
                    {stakeLoading
                      ? '...'
                      : `${formatSolAmountFromLamports(
                          stakeAccounts.reduce((sum, account) => sum + account.delegatedLamports, 0)
                        )} SOL`}
                  </strong>
                </div>
              </div>

              {stakeAccounts.length > 0 ? (
                <div className="staking-list">
                  {stakeAccounts.map((account) => (
                    <div key={account.address} className="staking-row">
                      <div className="staking-row-copy">
                        <strong>{formatAddress(account.address)}</strong>
                        <span className="muted">
                          {formatSolAmountFromLamports(account.lamports)} SOL
                          {account.delegatedLamports > 0 ? ` • ${formatSolAmountFromLamports(account.delegatedLamports)} delegated` : ''}
                        </span>
                        {account.voter ? <span className="staking-voter mono">{formatAddress(account.voter)}</span> : null}
                      </div>
                      <span className="staking-state-chip">{account.state}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{stakeLoading ? 'Loading stake accounts...' : 'No native stake accounts found yet.'}</p>
              )}

              <div className="staking-form-grid">
                <div className="staking-form-card">
                  <h3>Stake</h3>
                  <Input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} placeholder="Amount (SOL)" />
                  <Input value={stakeVoteAccount} onChange={(event) => setStakeVoteAccount(event.target.value)} placeholder="Validator vote account" />
                  <Button className="button-block" onClick={handleCreateStake} disabled={isWatchOnlyWallet || stakeSubmitting !== null || !stakeAmount.trim() || !stakeVoteAccount.trim()}>
                    {stakeSubmitting === 'stake' ? 'Submitting...' : 'Stake SOL'}
                  </Button>
                </div>

                <div className="staking-form-card">
                  <h3>Harvest</h3>
                  <select className="staking-select" value={stakeDeactivateAccount} onChange={(event) => setStakeDeactivateAccount(event.target.value)}>
                    <option value="">Select stake account</option>
                    {stakeAccounts.map((account) => (
                      <option key={account.address} value={account.address}>
                        {formatAddress(account.address)} ({account.state})
                      </option>
                    ))}
                  </select>
                  <Button className="button-block" tone="secondary" onClick={handleDeactivateStake} disabled={isWatchOnlyWallet || stakeSubmitting !== null || !stakeDeactivateAccount}>
                    {stakeSubmitting === 'deactivate' ? 'Submitting...' : 'Harvest'}
                  </Button>
                </div>

                <div className="staking-form-card">
                  <h3>Withdraw</h3>
                  <select className="staking-select" value={stakeWithdrawAccount} onChange={(event) => setStakeWithdrawAccount(event.target.value)}>
                    <option value="">Select stake account</option>
                    {stakeAccounts.map((account) => (
                      <option key={account.address} value={account.address}>
                        {formatAddress(account.address)} ({account.state})
                      </option>
                    ))}
                  </select>
                  <Input value={stakeWithdrawAmount} onChange={(event) => setStakeWithdrawAmount(event.target.value)} placeholder="Amount (SOL)" />
                  <Button className="button-block" tone="secondary" onClick={handleWithdrawStake} disabled={isWatchOnlyWallet || stakeSubmitting !== null || !stakeWithdrawAccount || !stakeWithdrawAmount.trim()}>
                    {stakeSubmitting === 'withdraw' ? 'Submitting...' : 'Withdraw'}
                  </Button>
                </div>
              </div>

              {!isWatchOnlyWallet && !state?.canUseUnlockedSigner ? (
                <div className="staking-password-shell">
                  <Input
                    type={showUnlockPassword ? 'text' : 'password'}
                    value={stakePassword}
                    onChange={(event) => setStakePassword(event.target.value)}
                    placeholder="Password to sign"
                  />
                  <button
                    type="button"
                    className="unlock-password-toggle"
                    aria-label={showUnlockPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowUnlockPassword((value) => !value)}
                  >
                    {showUnlockPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  {biometricSupported && activeWallet?.biometricEnabled ? (
                    <button
                      type="button"
                      className="biometric-inline-button"
                      aria-label="Unlock with device"
                      title="Unlock with device"
                      onClick={() => void handleBiometricUnlockInline()}
                      disabled={biometricUnlocking}
                    >
                      <Fingerprint size={16} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </Tabs.Content>
        </Tabs.Root>
      </>
    );
  }

  function renderSend() {
    if (isWatchOnlyWallet) {
      return (
        <Card title="Watch-only wallet">
          <p className="warning-box">This wallet can track assets and connect to dApps, but it cannot send or sign transactions.</p>
          <Button tone="secondary" onClick={() => setView('home')}>
            Back to wallet
          </Button>
        </Card>
      );
    }

    const isCollectibleSend = !!selectedSendCollectible;
    const selectedAssetName =
      assetId === 'sol'
        ? 'Solana'
        : selectedSendCollectible?.name ?? selectedTokenHolding?.name ?? selectedTokenHolding?.symbol ?? selectedAsset?.label ?? 'Token';
    const selectedAssetSymbol =
      assetId === 'sol'
        ? 'SOL'
        : selectedSendCollectible?.symbol ?? selectedTokenHolding?.symbol ?? selectedAsset?.label.replace(/ token$/i, '') ?? 'Token';
    const selectedAmountNumber = Number(amount || '0');
    const selectedUnitPrice = assetId === 'sol' ? assets.nativePriceUsd ?? null : selectedTokenHolding?.priceUsd ?? null;
    const selectedFiatValue =
      isCollectibleSend
        ? null
        : Number.isFinite(selectedAmountNumber) && typeof selectedUnitPrice === 'number'
          ? formatUsd(selectedAmountNumber * selectedUnitPrice)
          : '$0.00';
    const availableBalanceLabel = isCollectibleSend ? '1 NFT available' : selectedAsset?.balance ?? 'Unavailable';

    function handleMaxAmount() {
      if (isCollectibleSend) {
        setAmount('1');
        return;
      }

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

    if (submitting) {
      return (
        <>
          <ActionStatusCard
            tone="warning"
            title="Sending transfer"
            message="Grape is signing and submitting the transfer. Keep this window open until it completes."
          />
          {sendError ? <p className="danger-box">{sendError}</p> : null}
        </>
      );
    }

    if (sendResult) {
      return (
        <>
          <ActionStatusCard tone="success" title="Transfer sent" message="Your transfer was submitted successfully.">
            <div className="action-status-details">
              <KeyValueRow
                label="Signature"
                value={<span className="mono transfer-signature">{sendResult.signature}</span>}
              />
              <KeyValueRow label="Recipient" value={<span className="mono">{formatAddress(sendResult.recipient)}</span>} />
            </div>
            <div className="inline wrap-actions action-status-actions">
              <Button tone="secondary" onClick={() => setSendResult(null)}>
                Send another
              </Button>
              <Button onClick={() => setView('home')}>Done</Button>
            </div>
          </ActionStatusCard>
          {surfaceError ? <p className="danger-box">{surfaceError}</p> : null}
        </>
      );
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
                readOnly={isCollectibleSend}
              />
              <button type="button" className="send-max-button" onClick={handleMaxAmount} disabled={isCollectibleSend && amount === '1'}>
                {isCollectibleSend ? 'NFT' : 'Max'}
              </button>
            </div>
            <div className="send-flow-amount-meta">
              <span>{selectedFiatValue ?? 'Collectible transfer'}</span>
              <span>{availableBalanceLabel}</span>
            </div>
          </div>

          <div className="send-field-stack">
            <div className="send-field-group">
              <label className="send-field-label">Token</label>
              <div className="send-asset-picker">
                <button
                  type="button"
                  className={`send-select-shell send-select-button ${sendAssetPickerOpen ? 'open' : ''}`.trim()}
                  aria-label="Select token"
                  aria-expanded={sendAssetPickerOpen}
                  onClick={() => setSendAssetPickerOpen((value) => !value)}
                >
                  <AssetPickerOptionRow option={selectedAsset} privacyMode={privacyMode} />
                  <ChevronDown className="send-select-chevron" size={18} />
                </button>
                {sendAssetPickerOpen ? (
                  <div className="send-asset-menu">
                    <div className="popup-menu-section">Assets</div>
                    <div className="send-asset-menu-list">
                      {sendAssetOptions.map((option) => (
                        <AssetPickerOptionRow
                          key={option.id}
                          option={option}
                          privacyMode={privacyMode}
                          active={option.id === assetId}
                          onSelect={() => {
                            setAssetId(option.id);
                            if (option.id.startsWith('collectible:')) {
                              setAmount('1');
                            }
                            setSendAssetPickerOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
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
                <div className="send-input-shell send-input-shell-sign">
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password required to sign"
                    className="send-recipient-input"
                  />
                  {biometricSupported && activeWallet?.biometricEnabled ? (
                    <button
                      type="button"
                      className="biometric-inline-button"
                      onClick={() => void handleBiometricUnlockForSigning()}
                      aria-label="Unlock with device"
                      title="Unlock with device"
                      disabled={biometricUnlocking}
                    >
                      <Fingerprint size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="muted send-flow-helper">Wallet is already unlocked. You can send without re-entering your password.</p>
            )}
          </div>
        </Card>

        {sendError ? <p className="danger-box">{sendError}</p> : null}
        {surfaceError ? <p className="danger-box">{surfaceError}</p> : null}

        <div className="inline wrap-actions send-flow-actions">
          <Button className="button-block" disabled={!selectedAsset || !recipient.trim() || !amount.trim()} onClick={handleSend}>
            Send now
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
              <Button tone="secondary" className="button-block" onClick={handleCopyAddress}>&nbsp;
                {copiedAddress ? 'Copied address' : 'Copy address'}
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  function renderAsset() {
    const isCollectibleView = !!selectedCollectible;
    const showMetadataCards = isCollectibleView || !assetActionMode;

    if (assetDetailsLoading) {
      return (
        <Card title={isCollectibleView ? 'NFT Details' : 'Token'}>
          <p className="muted">Loading {isCollectibleView ? 'NFT' : 'token'} details...</p>
        </Card>
      );
    }

    if (assetDetailsError) {
      return (
        <Card title={isCollectibleView ? 'NFT Details' : 'Token'}>
          <p className="danger-box">{assetDetailsError}</p>
        </Card>
      );
    }

    if (!assetDetails) {
      return (
        <Card title={isCollectibleView ? 'NFT Details' : 'Token'}>
          <p className="muted">{isCollectibleView ? 'Select an NFT from Collectibles to inspect it.' : 'Select a token from the Tokens tab to manage it.'}</p>
        </Card>
      );
    }

    const tokenValue =
      selectedTokenHolding && typeof selectedTokenHolding.valueUsd === 'number'
        ? formatUsd(selectedTokenHolding.valueUsd)
        : null;
    const canCloseAccount = !isWatchOnlyWallet && Number(assetDetails.amount) === 0 && !assetDetails.delegate;
    const canBurn = !isWatchOnlyWallet && Number(assetDetails.amount) > 0;
    const detailActionTitle = canBurn ? 'Burn token' : canCloseAccount ? 'Close account' : 'Close account after burning all tokens';
    const detailActionIcon = canBurn ? <Flame size={18} /> : <Trash2 size={18} />;
    const explorerNetwork = wallet.selectedNetwork;
    const tokenImage = assetJsonMetadata?.imageUri ?? selectedCollectible?.imageUri ?? assetDetails.logoUri;

    return (
      <>
        <Card className="asset-detail-card">
          <div className="send-flow-header">
            <button type="button" className="send-back-button" onClick={() => setView('home')} aria-label="Back to wallet">
              <ArrowLeft size={20} />
            </button>
            <h2>{isCollectibleView ? 'NFT Details' : assetDetails.name ?? assetDetails.symbol ?? 'Token'}</h2>
          </div>

          <div className="asset-detail-hero">
            <TokenAvatar
              token={{ symbol: assetDetails.symbol, logoUri: tokenImage }}
              fallbackLabel={assetDetails.symbol?.slice(0, 1) ?? 'T'}
            />
            <div className="asset-detail-copy">
              <div className="hero-balance asset-detail-balance">
                {isCollectibleView
                  ? assetDetails.name ?? selectedCollectible?.name ?? 'NFT'
                  : maskSensitiveValue(assetDetails.amount, privacyMode)}
              </div>
              <div className="muted">
                {isCollectibleView
                  ? selectedCollectible?.collectionSymbol ?? assetDetails.symbol ?? formatAddress(assetDetails.mint)
                  : `${assetDetails.symbol ?? formatAddress(assetDetails.mint)}${tokenValue ? ` · ${maskSensitiveValue(tokenValue, privacyMode)}` : ''}`}
              </div>
            </div>
          </div>

          {!isCollectibleView ? (
            <div className="quick-actions compact asset-detail-actions">
              <button type="button" className="quick-action-card" onClick={() => openSend(assetId)} aria-label="Send token" title="Send" disabled={isWatchOnlyWallet}>
                <span className="quick-action-icon"><SendHorizontal size={18} /></span>
              </button>
              <button type="button" className="quick-action-card" onClick={() => openSwapForAsset(assetId)} aria-label="Swap token" title="Swap" disabled={isWatchOnlyWallet}>
                <span className="quick-action-icon"><ArrowLeftRight size={18} /></span>
              </button>
              <button
                type="button"
                className="quick-action-card"
                onClick={() => {
                  setTokenActionError(null);
                  setTokenActionResult(null);
                  setAssetActionMode(canBurn ? 'burn' : 'close');
                  if (canBurn) {
                    setBurnAmount(assetDetails.amount);
                  }
                }}
                aria-label={detailActionTitle}
                title={detailActionTitle}
                disabled={isWatchOnlyWallet || (canBurn ? !canBurn : !canCloseAccount)}
              >
                <span className="quick-action-icon">{detailActionIcon}</span>
              </button>
            </div>
          ) : (
            <div className="quick-actions compact asset-detail-actions">
              <button
                type="button"
                className="quick-action-card"
                onClick={() => selectedCollectible && openSendForCollectible(selectedCollectible)}
                aria-label="Send collectible"
                title="Send"
                disabled={isWatchOnlyWallet || !selectedCollectible?.accountAddress || !selectedCollectible?.programId}
              >
                <span className="quick-action-icon"><SendHorizontal size={18} /></span>
              </button>
            </div>
          )}
        </Card>

        <Card title={isCollectibleView ? 'NFT Details' : 'Token details'}>
          <div className="stack asset-detail-info">
            {isCollectibleView && selectedCollectible?.collectionId ? (
              <KeyValueRow
                label="Verified Collection Address"
                value={<span className="mono asset-detail-mono">{selectedCollectible.collectionId}</span>}
              />
            ) : null}
            <KeyValueRow label="Mint" value={<span className="mono asset-detail-mono">{assetDetails.mint}</span>} />
            <KeyValueRow label="Token account" value={<span className="mono asset-detail-mono">{assetDetails.accountAddress}</span>} />
            <div className="inline wrap-actions asset-detail-links">
              <Button tone="secondary" onClick={() => window.open(buildExplorerUrl(assetDetails.mint, explorerNetwork), '_blank', 'noopener,noreferrer')}>
                Mint on Explorer
              </Button>
              <Button tone="secondary" onClick={() => window.open(buildExplorerUrl(assetDetails.accountAddress, explorerNetwork), '_blank', 'noopener,noreferrer')}>
                Token Account on Explorer
              </Button>
            </div>
            <KeyValueRow
              label="Balance"
              value={
                <span>
                  {assetDetails.amount} <span className="muted">({assetDetails.rawAmount} raw)</span>
                </span>
              }
            />
            <KeyValueRow
              label="Decimals / Supply"
              value={
                <span>
                  {assetDetails.decimals} / {assetDetails.supply ?? 'Unavailable'}
                </span>
              }
            />
            <KeyValueRow label="Mint initialized" value={formatBoolean(assetDetails.mintInitialized)} />
            <KeyValueRow label="Mint authority" value={<span className="mono asset-detail-mono">{assetDetails.mintAuthority ?? 'None'}</span>} />
            <KeyValueRow label="Freeze authority" value={<span className="mono asset-detail-mono">{assetDetails.freezeAuthority ?? 'None'}</span>} />
            {!isCollectibleView ? (
              <>
                <KeyValueRow label="Delegate" value={<span className="mono asset-detail-mono">{assetDetails.delegate ?? 'None'}</span>} />
                <KeyValueRow label="Close authority" value={<span className="mono asset-detail-mono">{assetDetails.closeAuthority ?? 'None'}</span>} />
                <KeyValueRow label="Account state" value={assetDetails.accountState ?? 'Unavailable'} />
              </>
            ) : null}
          </div>
        </Card>

        {showMetadataCards ? (
          <>
            <Card title="On-chain Metaplex metadata">
              <div className="stack asset-detail-info">
                <KeyValueRow label="Metadata PDA" value={<span className="mono asset-detail-mono">{assetDetails.metadataPda}</span>} />
                <div className="inline wrap-actions asset-detail-links">
                  <Button tone="secondary" onClick={() => window.open(buildExplorerUrl(assetDetails.metadataPda, explorerNetwork), '_blank', 'noopener,noreferrer')}>
                    Metadata Account on Explorer
                  </Button>
                </div>
                <KeyValueRow
                  label="On-chain Name / Symbol"
                  value={`${assetDetails.metadataName ?? assetDetails.name ?? 'Unavailable'} / ${assetDetails.metadataSymbol ?? assetDetails.symbol ?? 'Unavailable'}`}
                />
                <KeyValueRow label="Royalty" value={assetDetails.sellerFeeBasisPoints == null ? 'Unavailable' : `${assetDetails.sellerFeeBasisPoints} bps`} />
                <KeyValueRow label="Update authority" value={<span className="mono asset-detail-mono">{assetDetails.updateAuthority ?? 'Unavailable'}</span>} />
                <KeyValueRow label="Metadata URI" value={<span className="mono asset-detail-mono">{assetDetails.metadataUri ?? 'Unavailable'}</span>} />
              </div>
            </Card>

            {assetDetails.metadataUri || tokenImage || assetJsonMetadata?.description ? (
              <Card title="Off-chain metadata">
                <div className="stack asset-detail-info">
                  {tokenImage ? <img className="asset-detail-preview" src={tokenImage} alt={assetDetails.name ?? assetDetails.symbol ?? 'Token'} /> : null}
                  {assetJsonLoading ? <p className="muted">Loading metadata JSON...</p> : null}
                  {!assetJsonLoading && assetJsonMetadata ? (
                    <>
                      <KeyValueRow
                        label="JSON Name / Symbol"
                        value={`${assetJsonMetadata.name ?? assetDetails.name ?? 'Unavailable'} / ${assetJsonMetadata.symbol ?? assetDetails.symbol ?? 'Unavailable'}`}
                      />
                      {assetJsonMetadata.description ? <p className="muted">{assetJsonMetadata.description}</p> : null}
                      {assetJsonMetadata.externalUrl ? (
                        <Button tone="secondary" onClick={() => window.open(assetJsonMetadata.externalUrl, '_blank', 'noopener,noreferrer')}>
                          Visit website
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {!isCollectibleView && assetActionMode === 'burn' ? (
          <div ref={assetActionCardRef}>
          <Card title="Burn tokens">
            <div className="stack">
              <label className="stack">
                <span className="muted">Amount</span>
                <Input value={burnAmount} onChange={(event) => setBurnAmount(event.target.value)} placeholder="0" inputMode="decimal" />
              </label>
              {!canUseUnlockedSigner ? (
                <label className="stack">
                  <span className="muted">Password</span>
                  <div className="send-input-shell send-input-shell-sign">
                    <Input
                      type="password"
                      value={burnPassword}
                      onChange={(event) => setBurnPassword(event.target.value)}
                      placeholder="Password required to sign"
                    />
                    {biometricSupported && activeWallet?.biometricEnabled ? (
                      <button
                        type="button"
                        className="biometric-inline-button"
                        onClick={() => void handleBiometricUnlockForSigning()}
                        aria-label="Unlock with device"
                        title="Unlock with device"
                        disabled={biometricUnlocking}
                      >
                        <Fingerprint size={16} />
                      </button>
                    ) : null}
                  </div>
                </label>
              ) : (
                <p className="muted">Wallet is already unlocked. Burn and close actions can sign without re-entering your password.</p>
              )}
              <Button
                className="button-block"
                disabled={tokenActionSubmitting === 'burn' || !burnAmount.trim() || (!canUseUnlockedSigner && !burnPassword.trim())}
                onClick={() => void handleBurnToken()}
              >
                {tokenActionSubmitting === 'burn' ? 'Burning...' : 'Burn'}
              </Button>
            </div>
          </Card>
          </div>
        ) : null}

        {!isCollectibleView && assetActionMode === 'close' ? (
          <div ref={assetActionCardRef}>
          <Card title="Close account">
            <div className="stack">
              <p className="muted">
                Closing reclaims the SOL rent from this token account. The balance must be zero and no delegate can remain.
              </p>
              <KeyValueRow label="Delegate" value={<span className="mono">{assetDetails.delegate ? formatAddress(assetDetails.delegate) : 'None'}</span>} />
              <KeyValueRow
                label="Close authority"
                value={<span className="mono">{assetDetails.closeAuthority ? formatAddress(assetDetails.closeAuthority) : 'None'}</span>}
              />
              <Button
                tone="secondary"
                className="button-block"
                disabled={tokenActionSubmitting === 'close' || !canCloseAccount || (!canUseUnlockedSigner && !burnPassword.trim())}
                onClick={() => void handleCloseTokenAccount()}
              >
                {tokenActionSubmitting === 'close' ? 'Closing...' : 'Close token account'}
              </Button>
              {!canCloseAccount ? (
                <p className="warning-box">Revoke any delegate before closing this account.</p>
              ) : null}
            </div>
          </Card>
          </div>
        ) : null}

        {tokenActionResult ? (
          <Card title="Completed">
            <div className="stack">
              <KeyValueRow label="Action" value={tokenActionResult.action} />
              <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{tokenActionResult.signature}</span>} />
            </div>
          </Card>
        ) : null}

        {tokenActionError ? <p className="danger-box">{tokenActionError}</p> : null}
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
            <div className="stack">
              <label className="incident-toggle compact-settings-toggle">
                <input
                  type="checkbox"
                  checked={customRpcEnabled}
                  onChange={(event) => {
                    setCustomRpcEnabled(event.target.checked);
                    if (!event.target.checked) {
                      setCustomRpcError(null);
                    }
                  }}
                />
                <span>
                  <strong>Custom RPC</strong>
                  <small className="muted">Use a custom endpoint for {wallet.selectedNetwork}.</small>
                </span>
              </label>
              {customRpcEnabled ? (
                <>
                  <Input
                    type="url"
                    value={customRpcInput}
                    onChange={(event) => setCustomRpcInput(event.target.value)}
                    placeholder={`Custom ${wallet.selectedNetwork} RPC URL`}
                  />
                  <div className="inline wrap-actions">
                    <Button onClick={() => void handleSaveCustomRpc()} disabled={customRpcBusy || !customRpcInput.trim()}>
                      {customRpcBusy ? 'Saving...' : 'Save RPC'}
                    </Button>
                    {selectedNetworkCustomRpc ? (
                      <Button
                        tone="secondary"
                        onClick={async () => {
                          setCustomRpcBusy(true);
                          setCustomRpcError(null);
                          try {
                            await sendRuntimeMessage({
                              type: 'wallet_set_custom_rpc',
                              network: wallet.selectedNetwork,
                              rpcUrl: null
                            });
                            await refresh();
                          } catch (error) {
                            setCustomRpcError(error instanceof Error ? error.message : 'Unable to update custom RPC.');
                          } finally {
                            setCustomRpcBusy(false);
                          }
                        }}
                        disabled={customRpcBusy}
                      >
                        Reset to default
                      </Button>
                    ) : null}
                  </div>
                  {customRpcError ? <p className="danger-box">{customRpcError}</p> : null}
                </>
              ) : selectedNetworkCustomRpc ? (
                <div className="inline wrap-actions">
                  <span className="muted mono settings-inline-value">{selectedNetworkCustomRpc}</span>
                  <Button
                    tone="secondary"
                    onClick={async () => {
                      await sendRuntimeMessage({
                        type: 'wallet_set_custom_rpc',
                        network: wallet.selectedNetwork,
                        rpcUrl: null
                      });
                      await refresh();
                    }}
                    disabled={customRpcBusy}
                  >
                    Reset to default
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="settings-row">
              <span className="muted">Connected sites</span>
              <strong>{permissions.length}</strong>
            </div>
            <label className="incident-toggle compact-settings-toggle">
              <input
                type="checkbox"
                checked={wallet.privacyMode}
                onChange={async (event) => {
                  await sendRuntimeMessage({
                    type: 'wallet_set_privacy_mode',
                    enabled: event.target.checked
                  });
                  await refresh();
                }}
              />
              <span>
                <strong>Privacy mode</strong>
                <small className="muted">Hide portfolio values and token balances with ***</small>
              </span>
            </label>
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
            <div className="stack">
              <div className="settings-row">
                <span className="muted">Biometric unlock</span>
                <strong>
                  {biometricSupported
                    ? activeWallet?.biometricEnabled
                      ? 'On'
                      : 'Off'
                    : 'Unavailable'}
                </strong>
              </div>
              {biometricSupported ? (
                activeWallet?.biometricEnabled ? (
                  <Button tone="secondary" onClick={() => void handleDisableBiometricFromSettings()} disabled={biometricSettingsBusy}>
                    {biometricSettingsBusy ? 'Updating...' : 'Disable biometric unlock'}
                  </Button>
                ) : (
                  <>
                    <Input
                      type="password"
                      value={biometricSettingsPassword}
                      onChange={(event) => setBiometricSettingsPassword(event.target.value)}
                      placeholder="Confirm password to enable"
                    />
                    <Button onClick={() => void handleEnableBiometricFromSettings()} disabled={biometricSettingsBusy || !biometricSettingsPassword.trim()}>
                      {biometricSettingsBusy ? 'Enabling...' : 'Enable biometric unlock'}
                    </Button>
                  </>
                )
              ) : (
                <p className="muted">Platform authenticator unavailable on this device.</p>
              )}
              {biometricSettingsError ? <p className="danger-box">{biometricSettingsError}</p> : null}
            </div>
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
              <Button tone="secondary" onClick={() => setView('security')}>
                Security
              </Button>
              <Button tone="secondary" onClick={() => openExtensionPage('options.html')}>
                Full settings
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  function renderApproval() {
    if (!activeApproval) {
      return (
        <Card title="Waiting for request">
          <p className="muted">No pending approval is available right now.</p>
        </Card>
      );
    }

    return (
      <ApprovalView
        approvalId={activeApproval.id}
        approval={activeApproval}
        inline
        onResolved={() => {
          setActiveApproval(null);
          setView('home');
          void refresh();
        }}
      />
    );
  }

  function renderSecurity() {
    return (
      <>
        <Card title="Delegation & authority scan">
          <div className="stack">
            <div className="inline security-actions">
              <Button tone="secondary" onClick={() => void refreshSecurityReport()} disabled={securityLoading}>
                <span className="button-icon"><RefreshCcw size={14} /></span>&nbsp;
                {securityLoading ? 'Scanning...' : 'Refresh scan'}
              </Button>
            </div>

            {securityReport?.warnings.length ? (
              <div className="stack">
                {securityReport.warnings.map((warning) => (
                  <p key={warning} className="warning-box">{warning}</p>
                ))}
              </div>
            ) : securityReport ? (
              <p className="success-box">No delegate, close-authority, or mint-authority warnings were found in this scan.</p>
            ) : (
              <p className="muted">Run a scan to inspect token delegates, close authorities, and mint/freeze authorities.</p>
            )}

            {securityReport?.delegatedTokenAccounts.length ? (
              <div className="stack">
                <strong>Delegated token accounts</strong>
                {securityReport.delegatedTokenAccounts.map((item) => (
                  <div key={item.accountAddress} className="security-list-item">
                    <div>
                      <strong>{item.name ?? item.symbol ?? formatAddress(item.mint)}</strong>
                      <div className="muted mono">{formatAddress(item.delegate)}</div>
                    </div>
                    <span className="muted">{item.delegatedAmount ?? 'Delegated'}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {securityReport?.externalCloseAuthorities.length ? (
              <div className="stack">
                <strong>External close authorities</strong>
                {securityReport.externalCloseAuthorities.map((item) => (
                  <div key={item.accountAddress} className="security-list-item">
                    <div>
                      <strong>{item.name ?? item.symbol ?? formatAddress(item.mint)}</strong>
                      <div className="muted mono">{formatAddress(item.closeAuthority)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {securityReport?.controlledMints.length ? (
              <div className="stack">
                <strong>Controlled mints</strong>
                {securityReport.controlledMints.map((mint) => (
                  <div key={mint.mint} className="security-list-item">
                    <div>
                      <strong>{mint.name ?? mint.symbol ?? formatAddress(mint.mint)}</strong>
                      <div className="muted mono">
                        {mint.controlsMintAuthority ? 'Mint authority' : ''}
                        {mint.controlsMintAuthority && mint.controlsFreezeAuthority ? ' · ' : ''}
                        {mint.controlsFreezeAuthority ? 'Freeze authority' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Incident response">
          <div className="stack">
            <p className="muted">
              One action flow to contain compromise: revoke delegates, sweep assets to a safe wallet, and rotate authorities where this wallet still has control.
            </p>
            <label className="stack">
              <span className="muted">Safe wallet destination</span>
              <Input
                value={incidentSafeWallet}
                onChange={(event) => setIncidentSafeWallet(event.target.value)}
                placeholder="Safe wallet public key"
              />
            </label>
            {recentRecipients.length > 0 ? (
              <div className="recipient-list">
                {recentRecipients.map((entry) => (
                  <button
                    key={entry.address}
                    type="button"
                    className={`recipient-chip ${incidentSafeWallet === entry.address ? 'active' : ''}`.trim()}
                    onClick={() => setIncidentSafeWallet(entry.address)}
                    title={entry.address}
                  >
                    <span className="mono">{formatAddress(entry.address)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <label className="stack">
              <span className="muted">Reserve SOL for fees</span>
              <Input
                value={incidentReserveSol}
                onChange={(event) => setIncidentReserveSol(event.target.value)}
                placeholder="0.02"
                inputMode="decimal"
              />
            </label>
            <div className="incident-toggle-list">
              {[
                ['revokeDelegates', 'Revoke all token delegates'],
                ['sweepSplTokens', 'Sweep SPL token balances'],
                ['sweepSol', 'Sweep SOL balance (minus reserve)'],
                ['rotateCloseAuthorities', 'Rotate token account close authorities'],
                ['rotateMintAuthorities', 'Rotate mint / freeze authorities on discovered mints']
              ].map(([key, label]) => (
                <label key={key} className="incident-toggle">
                  <input
                    type="checkbox"
                    checked={incidentOptions[key as keyof typeof incidentOptions]}
                    onChange={(event) =>
                      setIncidentOptions((current) => ({
                        ...current,
                        [key]: event.target.checked
                      }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {!canUseUnlockedSigner ? (
              <label className="stack">
                <span className="muted">Password</span>
                <div className="send-input-shell send-input-shell-sign">
                  <Input
                    type="password"
                    value={incidentPassword}
                    onChange={(event) => setIncidentPassword(event.target.value)}
                    placeholder="Password required to sign"
                  />
                  {biometricSupported && activeWallet?.biometricEnabled ? (
                    <button
                      type="button"
                      className="biometric-inline-button"
                      onClick={() => void handleBiometricUnlockForSigning()}
                      aria-label="Unlock with device"
                      title="Unlock with device"
                      disabled={biometricUnlocking}
                    >
                      <Fingerprint size={16} />
                    </button>
                  ) : null}
                </div>
              </label>
            ) : null}
            <Button
              className="button-block"
              disabled={isWatchOnlyWallet || incidentSubmitting || !incidentSafeWallet.trim() || (!canUseUnlockedSigner && !incidentPassword.trim())}
              onClick={() => void handleRunIncidentResponse()}
            >
              <span className="button-icon"><ShieldAlert size={16} /></span>
              {incidentSubmitting ? 'Containing...' : 'Contain compromise'}
            </Button>
            {isWatchOnlyWallet ? <p className="warning-box">Incident response actions require a signing wallet. Watch-only wallets cannot execute them.</p> : null}
            {incidentError ? <p className="danger-box">{incidentError}</p> : null}
            {incidentResult?.warnings.length ? (
              <div className="stack">
                {incidentResult.warnings.map((warning) => (
                  <p key={warning} className="warning-box">{warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        {incidentResult ? (
          <Card title="Incident response result">
            <div className="stack">
              <KeyValueRow label="Safe wallet" value={<span className="mono">{formatAddress(incidentResult.safeWallet)}</span>} />
              {incidentResult.actions.map((action) => (
                <div key={action.kind} className="security-list-item">
                  <div>
                    <strong>{action.kind}</strong>
                    <div className="muted">{action.itemCount} item{action.itemCount === 1 ? '' : 's'}</div>
                  </div>
                  <span className="muted">{action.signatures.length} tx</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {securityError ? <p className="danger-box">{securityError}</p> : null}
      </>
    );
  }

  function renderSwap() {
    if (isWatchOnlyWallet) {
      return (
        <Card title="Watch-only wallet">
          <p className="warning-box">This wallet can view assets and connect to dApps, but it cannot swap or sign transactions.</p>
          <Button tone="secondary" onClick={() => setView('home')}>
            Back to wallet
          </Button>
        </Card>
      );
    }

    const inputAssetSymbol =
      swapInputAssetId === 'sol'
        ? 'SOL'
        : selectedSwapInputHolding?.symbol ?? selectedSwapInputAsset?.label.replace(/ token$/i, '') ?? 'Token';
    const inputAssetBalance = selectedSwapInputAsset?.balance ?? '0';
    const isNativeSwapOutput = effectiveSwapOutputMint === JUPITER_SOL_MINT;
    const outputAssetSymbol = swapUseCustomOutputMint
      ? effectiveSwapOutputMint
        ? formatAddress(effectiveSwapOutputMint)
        : 'Custom mint'
      : selectedSwapOutputToken?.symbol ?? selectedSwapOutputOption?.symbol ?? formatAddress(effectiveSwapOutputMint || swapOutputMint);
    const outputAssetBalance =
      isNativeSwapOutput
        ? privacyMode
          ? '***'
          : homeBalance
        : selectedSwapOutputToken
        ? privacyMode
          ? '***'
          : formatTokenAmount(selectedSwapOutputToken)
        : selectedSwapOutputOption?.symbol
          ? 'Not owned yet'
          : 'Unknown';
    const quoteOutputValue = swapQuote ? `${swapQuote.outputAmountUi} ${outputAssetSymbol}` : '0';

    if (submittingSwap) {
      return (
        <>
          <ActionStatusCard
            tone="warning"
            title="Submitting swap"
            message="Grape is signing and broadcasting the swap transaction. Keep this window open until it completes."
          />
          {swapError ? <p className="danger-box">{swapError}</p> : null}
        </>
      );
    }

    if (swapResult) {
      return (
        <>
          <ActionStatusCard tone="success" title="Swap submitted" message="Your swap transaction was submitted successfully.">
            <div className="action-status-details">
              <KeyValueRow
                label="Signature"
                value={<span className="mono transfer-signature">{swapResult.signature}</span>}
              />
              <KeyValueRow label="From" value={swapResult.inputAmountUi} />
              <KeyValueRow label="To" value={swapResult.outputAmountUi} />
            </div>
            <div className="inline wrap-actions action-status-actions">
              <Button
                tone="secondary"
                onClick={() => {
                  setSwapResult(null);
                  setSwapQuote(null);
                }}
              >
                Swap again
              </Button>
              <Button onClick={() => setView('home')}>Done</Button>
            </div>
          </ActionStatusCard>
          {swapError ? <p className="danger-box">{swapError}</p> : null}
        </>
      );
    }

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
      const nextOutputMint = effectiveSwapOutputMint;
      const nextInputId =
        nextOutputMint === JUPITER_SOL_MINT
          ? 'sol'
          : assets.tokens.find((token) => token.mint === nextOutputMint)
            ? `${nextOutputMint}:${assets.tokens.find((token) => token.mint === nextOutputMint)?.programId}`
            : null;
      const currentInputMint =
        selectedSwapInputAsset?.asset.kind === 'sol' ? JUPITER_SOL_MINT : selectedSwapInputAsset?.asset.kind === 'spl-token' ? selectedSwapInputAsset.asset.mint : null;

      if (!nextInputId || !currentInputMint) {
        return;
      }

      setSwapInputAssetId(nextInputId);
      setSwapOutputMint(currentInputMint);
      setSwapUseCustomOutputMint(false);
      setSwapCustomOutputMint('');
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
                <div className="send-asset-picker">
                  <button
                    type="button"
                    className={`send-select-shell send-select-button swap-select-shell ${swapInputPickerOpen ? 'open' : ''}`.trim()}
                    aria-label="Select input asset"
                    aria-expanded={swapInputPickerOpen}
                    onClick={() => setSwapInputPickerOpen((value) => !value)}
                  >
                    <AssetPickerOptionRow option={selectedSwapInputAsset} privacyMode={privacyMode} />
                    <ChevronDown className="send-select-chevron" size={18} />
                  </button>
                  {swapInputPickerOpen ? (
                    <div className="send-asset-menu">
                      <div className="popup-menu-section">Sell asset</div>
                      <div className="send-asset-menu-list">
                        {assetOptions.map((option) => (
                          <AssetPickerOptionRow
                            key={option.id}
                            option={option}
                            privacyMode={privacyMode}
                            active={option.id === swapInputAssetId}
                            onSelect={() => {
                              setSwapInputAssetId(option.id);
                              setSwapInputPickerOpen(false);
                              setSwapQuote(null);
                              setSwapResult(null);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="swap-leg-value-row">
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
                <div className="send-asset-picker">
                  <button
                    type="button"
                    className={`send-select-shell send-select-button swap-select-shell ${swapOutputPickerOpen ? 'open' : ''}`.trim()}
                    aria-label="Select output asset"
                    aria-expanded={swapOutputPickerOpen}
                    onClick={() => setSwapOutputPickerOpen((value) => !value)}
                  >
                    <AssetPickerOptionRow
                      option={{
                        id: swapUseCustomOutputMint ? `custom:${effectiveSwapOutputMint}` : effectiveSwapOutputMint,
                        name: swapUseCustomOutputMint ? 'Custom mint' : selectedSwapOutputToken?.name ?? selectedSwapOutputOption?.symbol ?? outputAssetSymbol,
                        symbol: outputAssetSymbol,
                        balance: outputAssetBalance,
                        logoUri:
                          swapUseCustomOutputMint
                            ? selectedSwapOutputToken?.logoUri
                            : isNativeSwapOutput
                              ? SOLANA_LOGO_URL
                              : selectedSwapOutputToken?.logoUri,
                        sol: !swapUseCustomOutputMint && isNativeSwapOutput
                      }}
                      privacyMode={privacyMode}
                    />
                    <ChevronDown className="send-select-chevron" size={18} />
                  </button>
                  {swapOutputPickerOpen ? (
                    <div className="send-asset-menu">
                      <div className="popup-menu-section">Buy asset</div>
                      <div className="send-asset-menu-list">
                        {swapOutputPickerOptions.map((option) => (
                          <AssetPickerOptionRow
                            key={option.id}
                            option={option}
                            privacyMode={privacyMode}
                            active={!swapUseCustomOutputMint && option.id === swapOutputMint}
                            onSelect={() => {
                              setSwapUseCustomOutputMint(false);
                              setSwapOutputMint(option.id);
                              setSwapOutputPickerOpen(false);
                              setSwapQuote(null);
                              setSwapResult(null);
                            }}
                          />
                        ))}
                        <button
                          type="button"
                          className={`send-asset-option-button ${swapUseCustomOutputMint ? 'active' : ''}`.trim()}
                          onClick={() => setSwapUseCustomOutputMint(true)}
                        >
                          <div className="token-item send-asset-option-row">
                            <div className="token-leading">
                              <div className="token-avatar">+</div>
                              <div className="token-copy">
                                <strong className="token-name">Custom mint</strong>
                                <div className="token-subline">
                                  <span className="token-subtitle">Paste any SPL mint address</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                      {swapUseCustomOutputMint ? (
                        <div className="swap-custom-mint-shell">
                          <Input
                            value={swapCustomOutputMint}
                            onChange={(event) => {
                              setSwapCustomOutputMint(event.target.value);
                              setSwapQuote(null);
                              setSwapResult(null);
                            }}
                            placeholder="Paste custom mint address"
                            className="swap-custom-mint-input"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="swap-leg-value-row">
                  <div className="swap-leg-quote">{quoteOutputValue}</div>
                </div>
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
                  <div className="send-input-shell send-input-shell-sign">
                    <Input
                      type="password"
                      value={swapPassword}
                      onChange={(event) => setSwapPassword(event.target.value)}
                      placeholder="Password required to sign"
                    />
                    {biometricSupported && activeWallet?.biometricEnabled ? (
                      <button
                        type="button"
                        className="biometric-inline-button"
                        onClick={() => void handleBiometricUnlockForSigning()}
                        aria-label="Unlock with device"
                        title="Unlock with device"
                        disabled={biometricUnlocking}
                      >
                        <Fingerprint size={16} />
                      </button>
                    ) : null}
                  </div>
                </label>
              ) : (
                <p className="muted">Wallet is already unlocked. You can sign the swap without re-entering your password.</p>
              )}
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
              Swap now
            </Button>
          ) : swapError ? (
            <Button
              className="button-block"
              disabled={
                quotingSwap ||
                wallet.selectedNetwork !== 'mainnet-beta' ||
                !selectedSwapInputAsset ||
                !swapAmount.trim() ||
                !effectiveSwapOutputMint ||
                effectiveSwapOutputMint.length < 32 ||
                !Number.isFinite(Number(swapSlippageBps))
              }
              onClick={() => void handleGetSwapQuote(Date.now())}
            >
              {quotingSwap ? 'Updating quote...' : 'Retry quote'}
            </Button>
          ) : (
            <Button
              className="button-block"
              disabled
            >
              {quotingSwap ? 'Updating quote...' : 'Quote updates automatically'}
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <PageShell
      eyebrow={view === 'home' ? null : undefined}
      title={
        view === 'home'
          ? ''
          : view === 'send'
            ? 'Send'
            : view === 'receive'
              ? 'Receive'
              : view === 'swap'
                ? 'Swap'
                : view === 'asset'
                  ? 'Token'
                  : view === 'approval'
                    ? 'Review request'
                  : view === 'security'
                    ? 'Security'
                    : 'Settings'
      }
      subtitle={
        view === 'home'
          ? undefined
          : view === 'send'
            ? 'Send directly from the popup.'
            : view === 'receive'
              ? 'Share your wallet address safely.'
              : view === 'swap'
                ? 'Get a Jupiter quote and swap from your wallet.'
                : view === 'asset'
                  ? 'Burn or close token accounts safely.'
                  : view === 'approval'
                    ? 'Approve or reject this request from the currently open wallet surface.'
                  : view === 'security'
                    ? 'Check delegates and run containment actions.'
                    : 'Manage your wallet and connections.'
      }
      actions={view === 'home' ? undefined : <div className="inline popup-actions">{renderWalletMenu()}</div>}
    >
      {view === 'home' ? renderHome() : null}
      {view === 'send' ? renderSend() : null}
      {view === 'receive' ? renderReceive() : null}
      {view === 'asset' ? renderAsset() : null}
      {view === 'approval' ? renderApproval() : null}
      {view === 'security' ? renderSecurity() : null}
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
