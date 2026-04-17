import type { FormEvent, ReactNode } from 'react';
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
  ChevronRight,
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
import extensionPackage from '../../../package.json';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';
import { GRAPE_VERIFICATION_REQUIRED_DAO_ID, STORAGE_KEYS } from '@grape/core';

import type {
  ApprovalRecord,
  ChainTokenPreviewResponse,
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
  WalletBridgeExecuteResponse,
  WalletBridgeQuoteResponse,
  GovernanceDaoSummary,
  GovernanceEligibleDao,
  WalletGovernanceResponse,
  WalletGovernanceVoteResponse,
  WalletReputationResponse,
  WalletVerificationResponse,
  WalletStakeAccountsResponse,
  WalletStakeValidatorsResponse,
  WalletStakeActionResponse,
  WalletStateResponse,
  StakeValidatorRow,
  WalletSwapExecuteResponse,
  WalletSwapQuoteResponse
} from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { createBiometricUnlock, isBiometricUnlockSupported, unlockWithBiometric } from '../../shared/biometric';
import { JUPITER_SOL_MINT } from '../../shared/jupiter';
import { getSupportedBridgeDestinations, LIFI_NATIVE_SYMBOL } from '../../shared/lifi';
import { applyDocumentTheme, THEMES } from '../../shared/theme';
import { openExtensionPage, openExtensionSidePanel } from '../../shared/window';
import { ApprovalView } from '../approval/ApprovalView';
import { mountPage } from '../lib';

const APP_VERSION = extensionPackage.version?.trim() || 'unknown';
import { OnboardingView } from '../onboarding/OnboardingView';

type PopupView = 'home' | 'send' | 'receive' | 'swap' | 'bridge' | 'settings' | 'asset' | 'security' | 'approval';
type HomeTab = 'tokens' | 'community' | 'governance' | 'collectibles' | 'activity' | 'staking';
type AssetOption =
  | {
      id: string;
      label: string;
      name: string;
      symbol: string;
      balance: string;
      logoUri?: string;
      asset:
        | { kind: 'sol' }
        | { kind: 'sui' }
        | { kind: 'mon' }
        | { kind: 'eth' }
        | { kind: 'sui-coin'; coinType: string; decimals: number }
        | { kind: 'evm-token'; tokenAddress: string; decimals: number; symbol?: string };
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
const SOLANA_SEND_FEE_RESERVE_SOL = 0.00001;
const SOLANA_TOKEN_SEND_RESERVE_SOL = 0.0021;

type SwapOutputOption = {
  mint: string;
  symbol: string;
};
const SOLANA_LOGO_URL =
  'https://media.solana-cdn.com/image/width=100/https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png';
const GRAPE_LOGO_URL = chrome.runtime.getURL('icons/grape_logo_white.png');
const ASSET_CACHE_STORAGE_KEY = 'grape:asset-cache';
const CHAIN_OPTIONS = [
  { id: 'solana', label: 'Solana', shortLabel: 'SOL', glyph: 'S', enabled: true },
  { id: 'sui', label: 'Sui', shortLabel: 'SUI', glyph: 'S', enabled: true },
  { id: 'monad', label: 'Monad', shortLabel: 'MON', glyph: 'M', enabled: true },
  { id: 'ethereum', label: 'Ethereum', shortLabel: 'ETH', glyph: 'E', enabled: true }
] as const;
const VISIBLE_CHAIN_OPTIONS = CHAIN_OPTIONS.filter((chain) => chain.enabled);

function getSelectedWalletIdForChain(
  wallet: WalletStateResponse['wallet'],
  chain: WalletStateResponse['wallet']['selectedChain']
): string | undefined {
  return wallet.selectedWalletIds[chain] ?? (chain === 'solana' ? wallet.selectedWalletId : undefined);
}

function parseInitialView(): PopupView {
  const nextView = new URLSearchParams(window.location.search).get('view');
  if (nextView === 'send' || nextView === 'receive' || nextView === 'settings' || nextView === 'security') {
    return nextView;
  }
  if (nextView === 'swap' || nextView === 'bridge') {
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

  return `${state.wallet.selectedChain}:${state.activeWallet.id}:${state.wallet.selectedNetwork}:${state.activeAccount.publicKey}`;
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

function sanitizeDecimalInput(value: string, maxDecimals: number): string {
  const safeDecimals = Number.isFinite(maxDecimals) ? Math.max(0, Math.floor(maxDecimals)) : 0;
  const digitsAndDots = value.replace(/[^\d.]/g, '');
  if (!digitsAndDots) {
    return '';
  }

  const firstDotIndex = digitsAndDots.indexOf('.');
  const hasDot = firstDotIndex !== -1;
  const normalized = hasDot
    ? `${digitsAndDots.slice(0, firstDotIndex)}.${digitsAndDots.slice(firstDotIndex + 1).replace(/\./g, '')}`
    : digitsAndDots.replace(/\./g, '');
  let [wholePart = '', fractionPart = ''] = normalized.split('.');
  wholePart = wholePart.replace(/^0+(?=\d)/, '');

  if (!hasDot) {
    return wholePart;
  }

  if (safeDecimals === 0) {
    return wholePart || '0';
  }

  fractionPart = fractionPart.slice(0, safeDecimals);
  return `${wholePart || '0'}.${fractionPart}`;
}

function normalizeDecimalInputForSubmit(value: string, maxDecimals: number): string {
  return sanitizeDecimalInput(value, maxDecimals).replace(/\.$/, '');
}

function formatSwapAmountInput(amount: number, maxDecimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }

  const safeDecimals = Number.isFinite(maxDecimals) ? Math.max(0, Math.floor(maxDecimals)) : 0;
  const precision = Math.min(safeDecimals, amount >= 1_000 ? 2 : amount >= 1 ? 6 : 9);
  return amount.toFixed(precision).replace(/\.?0+$/, '');
}

function getSwapAssetDecimals(asset: AssetOption | null | undefined): number {
  if (!asset) {
    return 9;
  }

  return asset.asset.kind === 'spl-token' ? asset.asset.decimals : 9;
}

function formatWholeNumberString(value: string | null | undefined): string {
  if (!value) {
    return '0';
  }
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatGovernanceVotingPowerType(
  type: WalletGovernanceResponse['proposals'][number]['votingPowerType']
): string {
  switch (type) {
    case 'community':
      return 'Community';
    case 'council':
      return 'Council';
    case 'delegated-community':
      return 'Delegated Community';
    case 'delegated-council':
      return 'Delegated Council';
    default:
      return 'Unknown';
  }
}

function buildGovernanceProposalUrl(daoId: string, proposalId: string): string {
  return `https://governance.so/proposal/${daoId}/${proposalId}`;
}

function buildGovernanceDaoUrl(daoId: string): string {
  return `https://www.governance.so/dao/${daoId}`;
}

function formatGovernanceVoteSourceLabel(
  source: WalletGovernanceResponse['proposals'][number]['voteSources'][number]
): string {
  return source.isDelegate
    ? `delegated power from ${formatAddress(source.governingTokenOwner)}`
    : 'your voting power';
}

function formatRelativeTimeFromNow(targetUnixSeconds: number, nowUnixSeconds = Math.floor(Date.now() / 1000)): string {
  const deltaSeconds = Math.trunc(targetUnixSeconds - nowUnixSeconds);
  const absSeconds = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 60) {
    return rtf.format(deltaSeconds, 'second');
  }
  if (absSeconds < 3600) {
    return rtf.format(Math.trunc(deltaSeconds / 60), 'minute');
  }
  if (absSeconds < 86400) {
    return rtf.format(Math.trunc(deltaSeconds / 3600), 'hour');
  }
  if (absSeconds < 604800) {
    return rtf.format(Math.trunc(deltaSeconds / 86400), 'day');
  }
  return rtf.format(Math.trunc(deltaSeconds / 604800), 'week');
}

function getGovernanceProposalTimeMeta(
  proposal: WalletGovernanceResponse['proposals'][number],
  nowUnixSeconds = Math.floor(Date.now() / 1000)
): {
  badgeLabel: string;
  badgeTone: 'neutral' | 'warning' | 'success';
  metaText: string | null;
  noteText: string | null;
  votingWindowOpen: boolean;
} {
  if (!proposal.votingEndsAt) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : proposal.state,
      badgeTone: proposal.canVote || proposal.hasVoted ? 'success' : 'neutral',
      metaText: null,
      noteText: null,
      votingWindowOpen: true
    };
  }

  const votingWindowOpen = proposal.votingEndsAt > nowUnixSeconds;
  const relativeTime = formatRelativeTimeFromNow(proposal.votingEndsAt, nowUnixSeconds);

  if (votingWindowOpen) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : proposal.state,
      badgeTone: proposal.canVote || proposal.hasVoted ? 'success' : 'neutral',
      metaText: `Ending ${relativeTime}`,
      noteText: null,
      votingWindowOpen
    };
  }

  if (proposal.stateCode === 2) {
    return {
      badgeLabel: 'Finalizing',
      badgeTone: 'warning',
      metaText: `Ended ${relativeTime}`,
      noteText: 'Voting has ended. This proposal is awaiting on-chain finalization.',
      votingWindowOpen
    };
  }

  return {
    badgeLabel: proposal.state === 'Completed' || proposal.state === 'Executing' ? proposal.state : 'Ended',
    badgeTone: 'neutral',
    metaText: `Ended ${relativeTime}`,
    noteText: null,
    votingWindowOpen
  };
}

function formatVotingPower(rawAmount: bigint, decimals: number, truncateFraction = false): string {
  if (decimals === 0) return formatWholeNumberString(rawAmount.toString());
  const divisor = BigInt(10 ** decimals);
  const whole = rawAmount / divisor;
  const remainder = rawAmount % divisor;
  if (truncateFraction || remainder === BigInt(0)) return formatWholeNumberString(whole.toString());
  const fracStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4);
  return `${formatWholeNumberString(whole.toString())}.${fracStr}`;
}

function getGovernanceVoteDecimals(
  proposal: WalletGovernanceResponse['proposals'][number],
  daoSummary: WalletGovernanceResponse['daos'][number] | null
): number {
  if (!daoSummary) {
    return 0;
  }

  return proposal.governingTokenMint === daoSummary.communityMint ? daoSummary.communityTokenDecimals : 0;
}

function buildOgReputationSpaceUrl(daoId: string): string {
  return `https://reputation.governance.so/dao/${daoId}`;
}

function buildVerificationSpaceUrl(daoId: string): string {
  return `https://verification.governance.so/?daoId=${encodeURIComponent(daoId)}`;
}

function formatVerificationPlatform(platform: WalletVerificationResponse['identities'][number]['platform']): string {
  switch (platform) {
    case 'discord':
      return 'Discord';
    case 'telegram':
      return 'Telegram';
    case 'twitter':
      return 'Twitter';
    case 'email':
      return 'Email';
    default:
      return 'Unknown';
  }
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

function hasExecutableBridgeTransaction(quoteResponse: Record<string, unknown> | undefined): boolean {
  if (!quoteResponse || typeof quoteResponse !== 'object') {
    return false;
  }

  const directTransactionRequest =
    typeof quoteResponse.transactionRequest === 'object' && quoteResponse.transactionRequest
      ? (quoteResponse.transactionRequest as { to?: string; data?: string })
      : null;
  if (directTransactionRequest?.to && directTransactionRequest.data) {
    return true;
  }

  const candidateCollections = [quoteResponse.includedSteps, quoteResponse.steps];
  for (const collection of candidateCollections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const step of collection) {
      if (typeof step !== 'object' || !step) {
        continue;
      }

      const transactionRequest =
        typeof (step as { transactionRequest?: unknown }).transactionRequest === 'object' &&
        (step as { transactionRequest?: unknown }).transactionRequest
          ? ((step as { transactionRequest: { to?: string; data?: string } }).transactionRequest)
          : null;

      if (transactionRequest?.to && transactionRequest.data) {
        return true;
      }
    }
  }

  return false;
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

function getWalletGroupKey(
  source: WalletStateResponse['activeWallet'] extends { source?: infer T } ? T : string,
  signerKind?: 'software' | 'watch-only' | 'ledger'
): 'hardware' | 'imported' | 'created' | 'watch' {
  if (signerKind === 'ledger' || source === 'ledger') {
    return 'hardware';
  }

  if (signerKind === 'watch-only' || source === 'watch-only') {
    return 'watch';
  }

  if (source === 'imported-mnemonic' || source === 'imported-private-key') {
    return 'imported';
  }

  return 'created';
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

function formatBaseUnitAmount(amount: number | null, decimals = 9, symbol?: string): string {
  if (amount === null || !Number.isFinite(amount)) {
    return 'Unavailable';
  }

  const divisor = 10 ** decimals;
  const normalized = amount / divisor;
  const formatted = normalized.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
  return symbol ? `${formatted} ${symbol}` : formatted;
}

function formatNetworkLabel(chain: 'solana' | 'sui' | 'monad' | 'ethereum', network: 'mainnet-beta' | 'devnet'): string {
  if (chain === 'sui') {
    return network === 'devnet' ? 'devnet' : 'mainnet';
  }
  if (chain === 'monad') {
    return network === 'devnet' ? 'testnet' : 'mainnet';
  }
  if (chain === 'ethereum') {
    return network === 'devnet' ? 'sepolia' : 'mainnet';
  }

  return network;
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

function TokenRow(props: { token: TokenHolding; onSelect?: () => void; privacyMode?: boolean }) {
  const changeLabel = formatPercent(props.token.priceChange24h);
  const valueLabel = formatUsd(props.token.valueUsd);
  const quantityLabel = `${formatTokenAmount(props.token)}${props.token.symbol ? ` ${props.token.symbol}` : ''}`;
  const primaryLabel = props.token.name ?? props.token.symbol ?? formatAddress(props.token.mint);
  const unitPriceLabel = formatUnitPrice(props.token.priceUsd);
  const secondaryLabel = unitPriceLabel ?? props.token.symbol ?? formatAddress(props.token.mint);
  const addressLabel = formatAddress(props.token.mint);
  const shouldShowAddressFallback = !changeLabel && !unitPriceLabel && secondaryLabel !== addressLabel;

  const content = (
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
  );

  if (!props.onSelect) {
    return <div className="token-row-static">{content}</div>;
  }

  return (
    <button type="button" className="token-row-button" onClick={props.onSelect}>
      {content}
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
  const [customEvmTokenAddress, setCustomEvmTokenAddress] = useState('');
  const [customEvmTokenPreview, setCustomEvmTokenPreview] = useState<ChainTokenPreviewResponse | null>(null);
  const [customEvmTokenLoading, setCustomEvmTokenLoading] = useState(false);
  const [customEvmTokenError, setCustomEvmTokenError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendTransferResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recipientScannerVisible, setRecipientScannerVisible] = useState(false);
  const [recipientScannerLoading, setRecipientScannerLoading] = useState(false);
  const [recipientScannerError, setRecipientScannerError] = useState<string | null>(null);
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
  const [reputationSpaceInput, setReputationSpaceInput] = useState('');
  const [reputationSpaceSaving, setReputationSpaceSaving] = useState(false);
  const [reputationSpaceError, setReputationSpaceError] = useState<string | null>(null);
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
  const [swapSelectedRouteId, setSwapSelectedRouteId] = useState<string | null>(null);
  const [swapResult, setSwapResult] = useState<WalletSwapExecuteResponse | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [quotingSwap, setQuotingSwap] = useState(false);
  const [submittingSwap, setSubmittingSwap] = useState(false);
  const swapQuoteRequestRef = useRef(0);
  const recipientScannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bridgeDestinationChain, setBridgeDestinationChain] = useState<WalletStateResponse['wallet']['selectedChain'] | null>(null);
  const [bridgeDestinationWalletId, setBridgeDestinationWalletId] = useState('');
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [bridgePassword, setBridgePassword] = useState('');
  const [bridgeQuote, setBridgeQuote] = useState<WalletBridgeQuoteResponse | null>(null);
  const [bridgeSelectedRouteId, setBridgeSelectedRouteId] = useState<string | null>(null);
  const [bridgeResult, setBridgeResult] = useState<WalletBridgeExecuteResponse | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [quotingBridge, setQuotingBridge] = useState(false);
  const [submittingBridge, setSubmittingBridge] = useState(false);
  const [bridgeChainPickerOpen, setBridgeChainPickerOpen] = useState(false);
  const [bridgeWalletPickerOpen, setBridgeWalletPickerOpen] = useState(false);
  const bridgeQuoteRequestRef = useRef(0);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [reputation, setReputation] = useState<WalletReputationResponse>({
    spaces: [],
    totalPoints: '0',
    source: 'none',
    network: 'mainnet-beta',
    refreshedAt: Date.now()
  });
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState<string | null>(null);
  const [verificationSpaceInput, setVerificationSpaceInput] = useState('');
  const [verificationSpaceSaving, setVerificationSpaceSaving] = useState(false);
  const [verificationSpaceError, setVerificationSpaceError] = useState<string | null>(null);
  const [verification, setVerification] = useState<WalletVerificationResponse>({
    trackedSpaces: [],
    identities: [],
    totalVerified: 0,
    source: 'none',
    network: 'mainnet-beta',
    refreshedAt: Date.now()
  });
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [governanceDaoInput, setGovernanceDaoInput] = useState('');
  const [governanceDaoSaving, setGovernanceDaoSaving] = useState(false);
  const [governanceDaoError, setGovernanceDaoError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<WalletGovernanceResponse>({
    trackedDaos: [],
    discoveredDaos: [],
    delegateDaos: [],
    governedDaos: [],
    memberDaos: 0,
    proposals: [],
    daos: [],
    source: 'none',
    network: 'mainnet-beta',
    refreshedAt: Date.now()
  });
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceEligibility, setGovernanceEligibility] = useState<GovernanceEligibleDao[]>([]);
  const [governanceEligibilityLoading, setGovernanceEligibilityLoading] = useState(false);
  const [governanceEligibilityError, setGovernanceEligibilityError] = useState<string | null>(null);
  const [governanceEligibilityScanned, setGovernanceEligibilityScanned] = useState(false);
  const [expandedDaoIds, setExpandedDaoIds] = useState<Set<string>>(new Set());
  const [governanceVotingProposalId, setGovernanceVotingProposalId] = useState<string | null>(null);
  const [governanceVoteError, setGovernanceVoteError] = useState<string | null>(null);
  const [governanceVoteResult, setGovernanceVoteResult] = useState<WalletGovernanceVoteResponse | null>(null);
  const [governancePassword, setGovernancePassword] = useState('');
  const [governanceShowFinalizing, setGovernanceShowFinalizing] = useState(false);
  const [expandedSettingsSections, setExpandedSettingsSections] = useState<Set<'wallet' | 'reputation' | 'verification' | 'governance'>>(
    new Set(['wallet'])
  );
  const [pendingHomeScrollTarget, setPendingHomeScrollTarget] = useState<'community' | 'verification' | 'governance' | null>(null);
  const [activity, setActivity] = useState<WalletActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [expandedActivitySignature, setExpandedActivitySignature] = useState<string | null>(null);
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccountRow[]>([]);
  const [stakeValidators, setStakeValidators] = useState<StakeValidatorRow[]>([]);
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
  const [walletSwitcherOpen, setWalletSwitcherOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedWalletId, setCopiedWalletId] = useState<string | null>(null);
  const [incidentOptions, setIncidentOptions] = useState({
    revokeDelegates: true,
    sweepSplTokens: true,
    sweepSol: true,
    rotateCloseAuthorities: true,
    rotateMintAuthorities: true
  });
  const [activeApproval, setActiveApproval] = useState<ApprovalRecord | null>(null);
  const [accessRefreshing, setAccessRefreshing] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSettingsBusy, setAccessSettingsBusy] = useState(false);
  const assetActionCardRef = useRef<HTMLDivElement | null>(null);
  const communitySectionRef = useRef<HTMLDivElement | null>(null);
  const verificationSectionRef = useRef<HTMLDivElement | null>(null);
  const governanceSectionRef = useRef<HTMLDivElement | null>(null);
  const assetRevalidateTimerRef = useRef<number | null>(null);
  const assetRevalidateAttemptsRef = useRef(0);

  const surface = document.body.dataset.surface ?? 'page';
  const surfaceId = document.body.dataset.surfaceId ?? '';
  const isPopupSurface = surface === 'popup';
  const selectedChainValue = state?.wallet.selectedChain ?? 'solana';

  const refresh = async () => {
    if (assetRevalidateTimerRef.current !== null) {
      window.clearTimeout(assetRevalidateTimerRef.current);
      assetRevalidateTimerRef.current = null;
    }
    try {
      setSurfaceError(null);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
      setState(nextState);
      if (nextState.wallet.setup === 'ready' && !nextState.session.locked && nextState.access.granted) {
        setAssetsLoading(true);
        try {
          const nextAssets = await sendRuntimeMessage<WalletAssetsResponse>({
            type: 'wallet_get_assets',
            staleWhileRevalidate: true
          });
          setAssets(nextAssets);
          if (nextAssets.stale && assetRevalidateAttemptsRef.current < 6) {
            assetRevalidateAttemptsRef.current += 1;
            assetRevalidateTimerRef.current = window.setTimeout(() => {
              assetRevalidateTimerRef.current = null;
              void refresh();
            }, 900);
          } else if (!nextAssets.stale) {
            assetRevalidateAttemptsRef.current = 0;
          }
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
        assetRevalidateAttemptsRef.current = 0;
      }
    } catch (error) {
      setAssetsLoading(false);
      setSurfaceError(error instanceof Error ? error.message : 'Unable to load wallet state.');
    }
  };

  const applyUnlockedState = (nextState: WalletStateResponse) => {
    setSurfaceError(null);
    setState(nextState);
    setAssetsLoading(true);
    void refresh();
  };

  useEffect(() => {
    return () => {
      if (assetRevalidateTimerRef.current !== null) {
        window.clearTimeout(assetRevalidateTimerRef.current);
      }
    };
  }, []);

  const refreshStakeAccounts = async () => {
    if (!state || state.wallet.setup !== 'ready') {
      setStakeAccounts([]);
      setStakeValidators([]);
      setStakeSource('none');
      return;
    }

    setStakeLoading(true);
    try {
      const [stakeAccountsResult, stakeValidatorsResult] = await Promise.allSettled([
        sendRuntimeMessage<WalletStakeAccountsResponse>({ type: 'wallet_get_stake_accounts' }),
        sendRuntimeMessage<WalletStakeValidatorsResponse>({ type: 'wallet_get_stake_validators' })
      ]);

      if (stakeAccountsResult.status === 'fulfilled') {
        setStakeAccounts(stakeAccountsResult.value.accounts);
        setStakeSource(stakeAccountsResult.value.source);
        setStakeError(null);
      } else {
        setStakeAccounts([]);
        setStakeSource('none');
        setStakeError(stakeAccountsResult.reason instanceof Error ? stakeAccountsResult.reason.message : 'Unable to load stake accounts.');
      }

      if (stakeValidatorsResult.status === 'fulfilled') {
        setStakeValidators(stakeValidatorsResult.value.validators);
      } else {
        setStakeValidators([]);
      }
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
    const handleStorageChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEYS.approvals]) {
        return;
      }

      void refreshActiveApproval();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
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
    setBridgePassword('');
    setStakePassword('');
    setBurnPassword('');
    setIncidentPassword('');
    setGovernancePassword('');
  }, [state?.canUseUnlockedSigner]);

  useEffect(() => {
    if (!state) {
      setCustomRpcEnabled(false);
      setCustomRpcInput('');
      setCustomRpcError(null);
      return;
    }

    const nextCustomRpc =
      state.wallet.selectedChain === 'sui'
        ? state.wallet.chainState.sui.customRpcUrl ?? ''
        : state.wallet.selectedChain === 'monad'
          ? state.wallet.chainState.monad.customRpcUrl ?? ''
        : state.wallet.selectedChain === 'ethereum'
          ? state.wallet.chainState.ethereum.customRpcUrl ?? ''
        : state.wallet.customRpcUrls[state.wallet.selectedNetwork] ?? '';
    setCustomRpcEnabled(!!nextCustomRpc);
    setCustomRpcInput(nextCustomRpc);
    setCustomRpcError(null);
  }, [state?.wallet.chainState.ethereum.customRpcUrl, state?.wallet.chainState.monad.customRpcUrl, state?.wallet.chainState.sui.customRpcUrl, state?.wallet.customRpcUrls, state?.wallet.selectedChain, state?.wallet.selectedNetwork]);

  useEffect(() => {
    if ((selectedChainValue === 'sui' || selectedChainValue === 'monad' || selectedChainValue === 'ethereum') && (homeTab === 'collectibles' || homeTab === 'staking')) {
      setHomeTab('tokens');
    }
  }, [homeTab, selectedChainValue]);

  useEffect(() => {
    if ((selectedChainValue === 'sui' || selectedChainValue === 'monad' || selectedChainValue === 'ethereum') && (homeTab === 'community' || homeTab === 'governance')) {
      setHomeTab('tokens');
    }
  }, [homeTab, selectedChainValue]);

  useEffect(() => {
    if ((selectedChainValue === 'sui' || selectedChainValue === 'monad' || selectedChainValue === 'ethereum') && (view === 'swap' || view === 'security' || view === 'asset')) {
      setView('home');
    }
  }, [selectedChainValue, view]);

  useEffect(() => {
    if (selectedChainValue !== 'ethereum' && selectedChainValue !== 'monad') {
      setCustomEvmTokenAddress('');
      setCustomEvmTokenPreview(null);
      setCustomEvmTokenLoading(false);
      setCustomEvmTokenError(null);
      return;
    }

    if (assetId !== 'custom-evm-token') {
      setCustomEvmTokenPreview(null);
      setCustomEvmTokenLoading(false);
      setCustomEvmTokenError(null);
    }
  }, [assetId, selectedChainValue]);

  useEffect(() => {
    if ((selectedChainValue !== 'ethereum' && selectedChainValue !== 'monad') || assetId !== 'custom-evm-token') {
      return;
    }

    const trimmedAddress = customEvmTokenAddress.trim();
    if (!trimmedAddress) {
      setCustomEvmTokenPreview(null);
      setCustomEvmTokenLoading(false);
      setCustomEvmTokenError(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCustomEvmTokenLoading(true);
      setCustomEvmTokenError(null);
      void sendRuntimeMessage<ChainTokenPreviewResponse>({
        type: 'wallet_preview_chain_token',
        tokenAddress: trimmedAddress
      })
        .then((preview) => {
          setCustomEvmTokenPreview(preview);
          setCustomEvmTokenError(null);
        })
        .catch((error) => {
          setCustomEvmTokenPreview(null);
          setCustomEvmTokenError(error instanceof Error ? error.message : 'Unable to load token contract.');
        })
        .finally(() => {
          setCustomEvmTokenLoading(false);
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [assetId, customEvmTokenAddress, selectedChainValue]);

  useEffect(() => {
    if (homeTab !== 'staking' || state?.wallet.setup !== 'ready' || view !== 'home') {
      return;
    }

    if (state.session.locked && state.activeWallet?.signerKind !== 'watch-only') {
      return;
    }

    void refreshStakeAccounts();
  }, [homeTab, view, state?.wallet.setup, state?.session.locked, state?.activeWallet?.signerKind, state?.wallet.selectedWalletId, state?.wallet.selectedNetwork]);

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
    if (view !== 'home' || !pendingHomeScrollTarget) {
      return;
    }

    const targetRef =
      pendingHomeScrollTarget === 'community'
        ? communitySectionRef
        : pendingHomeScrollTarget === 'verification'
          ? verificationSectionRef
          : governanceSectionRef;
    const frameId = window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      setPendingHomeScrollTarget(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [homeTab, pendingHomeScrollTarget, view]);

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

  useEffect(() => {
    if (!state || state.wallet.setup !== 'ready' || state.session.locked || state.wallet.selectedChain !== 'solana') {
      setReputation({
        spaces: [],
        totalPoints: '0',
        source: 'none',
        network: state?.wallet.selectedNetwork ?? 'mainnet-beta',
        refreshedAt: Date.now()
      });
      setReputationError(null);
      setReputationLoading(false);
      return;
    }

    let cancelled = false;
    setReputationLoading(true);
    void sendRuntimeMessage<WalletReputationResponse>({ type: 'wallet_get_reputation' })
      .then((nextReputation) => {
        if (cancelled) {
          return;
        }
        setReputation(nextReputation);
        setReputationError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setReputation({
          spaces: [],
          totalPoints: '0',
          source: 'none',
          network: state.wallet.selectedNetwork,
          refreshedAt: Date.now()
        });
        setReputationError(error instanceof Error ? error.message : 'Unable to load OG reputation.');
      })
      .finally(() => {
        if (!cancelled) {
          setReputationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    state?.activeWallet?.id,
    state?.activeAccount?.publicKey,
    state?.session.locked,
    state?.wallet.selectedChain,
    state?.wallet.selectedNetwork,
    state?.wallet.trackedReputationSpaceIds,
    state?.wallet.setup
  ]);

  useEffect(() => {
    if (!state || state.wallet.setup !== 'ready' || state.session.locked || state.wallet.selectedChain !== 'solana') {
      setGovernance({
        trackedDaos: state?.wallet.trackedGovernanceDaoIds ?? [],
        discoveredDaos: [],
        delegateDaos: [],
        governedDaos: [],
        memberDaos: 0,
        proposals: [],
        daos: [],
        source: 'none',
        network: state?.wallet.selectedNetwork ?? 'mainnet-beta',
        refreshedAt: Date.now()
      });
      setGovernanceError(null);
      setGovernanceLoading(false);
      return;
    }

    let cancelled = false;
    setGovernanceLoading(true);
    void sendRuntimeMessage<WalletGovernanceResponse>({ type: 'wallet_get_governance' })
      .then((nextGovernance) => {
        if (cancelled) {
          return;
        }
        setGovernance(nextGovernance);
        setGovernanceError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setGovernance({
          trackedDaos: state.wallet.trackedGovernanceDaoIds,
          discoveredDaos: [],
          delegateDaos: [],
          governedDaos: [],
          memberDaos: 0,
          proposals: [],
          daos: [],
          source: 'none',
          network: state.wallet.selectedNetwork,
          refreshedAt: Date.now()
        });
        setGovernanceError(error instanceof Error ? error.message : 'Unable to load governance proposals.');
      })
      .finally(() => {
        if (!cancelled) {
          setGovernanceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    state?.activeWallet?.id,
    state?.activeAccount?.publicKey,
    state?.session.locked,
    state?.wallet.selectedChain,
    state?.wallet.selectedNetwork,
    state?.wallet.trackedGovernanceDaoIds,
    state?.wallet.setup
  ]);

  useEffect(() => {
    setGovernanceEligibility([]);
    setGovernanceEligibilityError(null);
    setGovernanceEligibilityScanned(false);
    setGovernanceEligibilityLoading(false);
  }, [
    state?.activeWallet?.id,
    state?.activeAccount?.publicKey,
    state?.session.locked,
    state?.wallet.selectedChain,
    state?.wallet.selectedNetwork,
    state?.wallet.setup
  ]);

  useEffect(() => {
    if (!state || !state.access.granted || state.wallet.setup !== 'ready' || state.session.locked || state.wallet.selectedChain !== 'solana') {
      setVerification({
        trackedSpaces: state?.wallet.trackedVerificationSpaceIds ?? [],
        identities: [],
        totalVerified: 0,
        source: 'none',
        network: state?.wallet.selectedNetwork ?? 'mainnet-beta',
        refreshedAt: Date.now()
      });
      setVerificationError(null);
      setVerificationLoading(false);
      return;
    }

    let cancelled = false;
    setVerificationLoading(true);
    void sendRuntimeMessage<WalletVerificationResponse>({ type: 'wallet_get_verification' })
      .then((nextVerification) => {
        if (cancelled) {
          return;
        }
        setVerification(nextVerification);
        setVerificationError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setVerification({
          trackedSpaces: state.wallet.trackedVerificationSpaceIds,
          identities: [],
          totalVerified: 0,
          source: 'none',
          network: state.wallet.selectedNetwork,
          refreshedAt: Date.now()
        });
        setVerificationError(error instanceof Error ? error.message : 'Unable to load verification status.');
      })
      .finally(() => {
        if (!cancelled) {
          setVerificationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    state?.activeWallet?.id,
    state?.activeAccount?.publicKey,
    state?.access.granted,
    state?.session.locked,
    state?.wallet.selectedChain,
    state?.wallet.selectedNetwork,
    state?.wallet.trackedVerificationSpaceIds,
    state?.wallet.setup
  ]);

  useEffect(() => {
    if (!state?.access.granted || state.session.locked) {
      return;
    }

    const lastCheckedAt = state.access.lastCheckedAt ?? 0;
    if (Date.now() - lastCheckedAt < 12 * 60 * 60 * 1000) {
      return;
    }

    let cancelled = false;
    void sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_refresh_access' })
      .then((nextState) => {
        if (!cancelled) {
          setState(nextState);
        }
      })
      .catch(() => {
        // Keep the current local grant and avoid interrupting the user.
      });

    return () => {
      cancelled = true;
    };
  }, [state?.access.granted, state?.access.lastCheckedAt, state?.session.locked]);

  const homeBalance = useMemo(
    () => formatBaseUnitAmount(assets.lamports, assets.nativeDecimals ?? 9, assets.nativeSymbol),
    [assets.lamports, assets.nativeDecimals, assets.nativeSymbol]
  );
  const portfolioValue = useMemo(() => formatUsd(assets.totalUsdValue) ?? homeBalance, [assets.totalUsdValue, homeBalance]);
  const nativeAssetValue = useMemo(() => formatUsd(assets.nativeValueUsd), [assets.nativeValueUsd]);
  const nativeAssetChange = useMemo(() => formatPercent(assets.nativePriceChange24h), [assets.nativePriceChange24h]);
  const nativeAssetUnitPrice = useMemo(() => formatUnitPrice(assets.nativePriceUsd), [assets.nativePriceUsd]);
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
    if (selectedChainValue === 'sui' || selectedChainValue === 'monad' || selectedChainValue === 'ethereum') {
      const isMonad = selectedChainValue === 'monad';
      const isEthereum = selectedChainValue === 'ethereum';
      const nativeOption: AssetOption = {
        id: selectedChainValue,
        label: assets.nativeSymbol ?? (isEthereum ? 'ETH' : isMonad ? 'MON' : 'SUI'),
        name: assets.nativeName ?? (isEthereum ? 'Ethereum' : isMonad ? 'Monad' : 'Sui'),
        symbol: assets.nativeSymbol ?? (isEthereum ? 'ETH' : isMonad ? 'MON' : 'SUI'),
        balance: privacyModeEnabled ? '***' : homeBalance,
        logoUri: assets.nativeLogoUri,
        asset: {
          kind: isEthereum ? ('eth' as const) : isMonad ? ('mon' as const) : ('sui' as const)
        }
      };

      const chainTokenOptions: AssetOption[] = assets.tokens.map((token) => ({
        id: `${token.mint}:${token.programId}`,
        label: token.symbol ? `${token.symbol} token` : `${formatAddress(token.mint)} token`,
        name: token.name ?? token.symbol ?? formatAddress(token.mint),
        symbol: token.symbol ?? formatAddress(token.mint),
        balance: privacyModeEnabled ? '***' : formatTokenAmount(token),
        logoUri: token.logoUri,
        asset:
          selectedChainValue === 'sui'
            ? {
                kind: 'sui-coin' as const,
                coinType: token.mint,
                decimals: token.decimals
              }
            : {
                kind: 'evm-token' as const,
                tokenAddress: token.mint,
                decimals: token.decimals,
                symbol: token.symbol ?? undefined
              }
      }));

      const customTokenOption: AssetOption[] =
        isEthereum || isMonad
          ? [
              {
                id: 'custom-evm-token',
                label: 'Custom token',
                name: customEvmTokenPreview?.name ?? 'Custom token',
                symbol: customEvmTokenPreview?.symbol ?? 'TOKEN',
                balance: customEvmTokenPreview
                  ? privacyModeEnabled
                    ? '***'
                    : customEvmTokenPreview.amount
                  : customEvmTokenLoading
                    ? 'Loading...'
                    : customEvmTokenAddress.trim()
                      ? 'Preview token'
                      : 'Enter contract',
                asset: {
                  kind: 'evm-token',
                  tokenAddress: customEvmTokenPreview?.tokenAddress ?? customEvmTokenAddress.trim(),
                  decimals: customEvmTokenPreview?.decimals ?? 18,
                  symbol: customEvmTokenPreview?.symbol
                }
              }
            ]
          : [];

      return [nativeOption, ...chainTokenOptions, ...customTokenOption];
    }

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
        asset: { kind: 'sol' as const }
      },
      ...tokenOptions
    ];
  }, [
    assets,
    customEvmTokenAddress,
    customEvmTokenLoading,
    customEvmTokenPreview,
    homeBalance,
    privacyModeEnabled,
    selectedChainValue
  ]);
  const sendAssetOptions = useMemo<AssetOption[]>(() => {
    if (selectedChainValue === 'sui' || selectedChainValue === 'monad' || selectedChainValue === 'ethereum') {
      return assetOptions;
    }

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
  }, [assetOptions, collectibleItems, selectedChainValue]);

  const selectedAsset = sendAssetOptions.find((option) => option.id === assetId) ?? sendAssetOptions[0];
  const selectedTokenHolding =
    selectedAsset?.asset.kind === 'spl-token' ||
    selectedAsset?.asset.kind === 'sui-coin' ||
    selectedAsset?.asset.kind === 'evm-token'
      ? assets.tokens.find((token) => `${token.mint}:${token.programId}` === assetId) ?? null
      : null;
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
  const selectedSwapInputDecimals = getSwapAssetDecimals(selectedSwapInputAsset);
  const swapOutputOptions = useMemo<SwapOutputOption[]>(() => {
    if (selectedChainValue !== 'solana') {
      return [];
    }

    const ownedTokens: SwapOutputOption[] = assets.tokens.map((token) => ({
      mint: token.mint,
      symbol: token.symbol ?? formatAddress(token.mint)
    }));
    return [...COMMON_SWAP_TOKENS, ...ownedTokens].filter(
      (token, index, allTokens) => allTokens.findIndex((candidate) => candidate.mint === token.mint) === index
    );
  }, [assets.tokens, selectedChainValue]);
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
    const normalizedSwapAmount = normalizeDecimalInputForSubmit(swapAmount, selectedSwapInputDecimals);
    if (!normalizedSwapAmount) {
      return;
    }

    try {
      swapQuoteRequestRef.current = requestId;
      setQuotingSwap(true);
      setSwapError(null);
      setSwapResult(null);
      const quote = await sendRuntimeMessage<WalletSwapQuoteResponse>({
        type: 'wallet_get_swap_quote',
        amount: normalizedSwapAmount,
        slippageBps: Number(swapSlippageBps),
        inputAsset: selectedSwapInputAsset.asset,
        outputMint: effectiveSwapOutputMint
      });
      if (swapQuoteRequestRef.current === requestId) {
        setSwapQuote(quote);
        setSwapSelectedRouteId(quote.selectedRouteId);
      }
    } catch (error) {
      if (swapQuoteRequestRef.current === requestId) {
        setSwapQuote(null);
        setSwapSelectedRouteId(null);
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

    const activeRoute =
      swapQuote.routes.find((route) => route.id === swapSelectedRouteId) ??
      swapQuote.routes[0] ??
      null;
    if (!activeRoute) {
      setSwapError('No swap route is available.');
      return;
    }

    try {
      setSubmittingSwap(true);
      setSwapError(null);
      const result = await sendRuntimeMessage<WalletSwapExecuteResponse>({
        type: 'wallet_execute_swap',
        quoteResponse: activeRoute.quoteResponse,
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

  async function handleGetBridgeQuote(requestId = Date.now()) {
    if (!bridgeDestinationChain || !selectedBridgeDestinationWallet || !bridgeAmount.trim()) {
      return;
    }

    try {
      bridgeQuoteRequestRef.current = requestId;
      setQuotingBridge(true);
      setBridgeError(null);
      setBridgeResult(null);
      const quote = await sendRuntimeMessage<WalletBridgeQuoteResponse>({
        type: 'wallet_get_bridge_quote',
        amount: bridgeAmount,
        toChain: bridgeDestinationChain,
        destinationWalletId: selectedBridgeDestinationWallet.id
      });
      if (bridgeQuoteRequestRef.current === requestId) {
        setBridgeQuote(quote);
        setBridgeSelectedRouteId(quote.selectedRouteId);
      }
    } catch (error) {
      if (bridgeQuoteRequestRef.current === requestId) {
        setBridgeQuote(null);
        setBridgeSelectedRouteId(null);
        setBridgeError(error instanceof Error ? error.message : 'Unable to fetch a bridge quote.');
      }
    } finally {
      if (bridgeQuoteRequestRef.current === requestId) {
        setQuotingBridge(false);
      }
    }
  }

  async function handleExecuteBridge() {
    if (!bridgeQuote || !bridgeDestinationChain || !selectedBridgeDestinationWallet) {
      return;
    }

    const activeRoute =
      bridgeQuote.routes.find((route) => route.id === bridgeSelectedRouteId) ??
      bridgeQuote.routes[0] ??
      null;
    if (!activeRoute) {
      setBridgeError('No bridge route is available.');
      return;
    }

    try {
      setSubmittingBridge(true);
      setBridgeError(null);
      const result = await sendRuntimeMessage<WalletBridgeExecuteResponse>({
        type: 'wallet_execute_bridge',
        quoteResponse: activeRoute.quoteResponse,
        toChain: bridgeDestinationChain,
        destinationWalletId: selectedBridgeDestinationWallet.id,
        password: canUseUnlockedSigner ? undefined : bridgePassword || undefined
      });
      setBridgeResult(result);
      setBridgePassword('');
      void refresh().catch(() => undefined);
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : 'Unable to execute bridge.');
    } finally {
      setSubmittingBridge(false);
    }
  }

  useEffect(() => {
    if (view !== 'swap' || submittingSwap || Boolean(swapResult)) {
      return;
    }

    const slippage = Number(swapSlippageBps);
    const normalizedSwapAmount = normalizeDecimalInputForSubmit(swapAmount, selectedSwapInputDecimals);
    if (
      state?.wallet.selectedNetwork !== 'mainnet-beta' ||
      !selectedSwapInputAsset ||
      !normalizedSwapAmount ||
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
    selectedSwapInputDecimals,
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

  async function handleCopyWalletAddress(walletId: string, address: string | undefined) {
    if (!address) {
      return;
    }
    await navigator.clipboard.writeText(address);
    setCopiedWalletId(walletId);
    window.setTimeout(() => {
      setCopiedWalletId((current) => (current === walletId ? null : current));
    }, 1200);
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
        setSendError(message);
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
    setRecipientScannerVisible(false);
    setRecipientScannerError(null);
    setSendError(null);
    setSendResult(null);
    setView('send');
  }

  async function handleOpenRecipientScanner() {
    setSendError(null);
    if (isPopupSurface) {
      await openExtensionPage(`send.html?${new URLSearchParams({
        ...(assetId && assetId !== 'sol' ? { asset: assetId } : {}),
        scan: '1'
      }).toString()}`);
      window.close();
      return;
    }

    setRecipientScannerError(null);
    setRecipientScannerVisible((current) => !current);
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
    setRecipientScannerVisible(false);
    setRecipientScannerError(null);
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

    const inputMint = nextAsset.asset.kind === 'spl-token' ? nextAsset.asset.mint : JUPITER_SOL_MINT;
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
      const sendAsset =
        selectedAsset.asset.kind === 'evm-token' && assetId === 'custom-evm-token'
          ? customEvmTokenPreview
            ? {
                kind: 'evm-token' as const,
                tokenAddress: customEvmTokenPreview.tokenAddress,
                decimals: customEvmTokenPreview.decimals,
                symbol: customEvmTokenPreview.symbol
              }
            : null
          : selectedAsset.asset;

      if (!sendAsset) {
        throw new Error('Enter a valid token contract before sending.');
      }

      const nextResult = await sendRuntimeMessage<SendTransferResponse>({
        type: 'wallet_send_transfer',
        recipient,
        amount,
        password: canUseUnlockedSigner ? undefined : password || undefined,
        asset: sendAsset
      });
      setSendResult(nextResult);
      setSendError(null);
      setRecipient('');
      setAmount('');
      setPassword('');
      setRecipientScannerVisible(false);
      setRecipientScannerError(null);
    } catch (nextError) {
      setSendError(nextError instanceof Error ? nextError.message : 'Unable to send transfer.');
    } finally {
      setSubmitting(false);
    }

    void refresh().catch(() => {
      // Do not convert a successful send into a failed one because a follow-up refresh was flaky.
    });
  }

  const wallet =
    state?.wallet ??
    ({
      setup: 'idle',
      wallets: [],
      privacyMode: false,
      trackedReputationSpaceIds: [],
      trackedVerificationSpaceIds: [GRAPE_VERIFICATION_REQUIRED_DAO_ID],
      trackedGovernanceDaoIds: [],
      selectedChain: 'solana',
      selectedNetwork: 'mainnet-beta',
      customRpcUrls: {},
      selectedWalletIds: {},
      chainState: {
        solana: { selectedWalletId: undefined, selectedNetwork: 'mainnet-beta', customRpcUrl: null },
        sui: { selectedWalletId: undefined, selectedNetwork: 'mainnet-beta', customRpcUrl: null },
        monad: { selectedWalletId: undefined, selectedNetwork: 'mainnet-beta', customRpcUrl: null },
        ethereum: { selectedWalletId: undefined, selectedNetwork: 'mainnet-beta', customRpcUrl: null }
      }
    } as WalletStateResponse['wallet']);
  const session = state?.session ?? ({ locked: true } as WalletStateResponse['session']);
  const permissions = state?.permissions ?? [];
  const canUseUnlockedSigner = state?.canUseUnlockedSigner ?? false;
  const activeWallet = state?.activeWallet;
  const selectedStakeValidator = stakeValidators.find((validator) => validator.voteAccount === stakeVoteAccount.trim()) ?? null;
  const isWatchOnlyWallet = activeWallet?.signerKind === 'watch-only';
  const governanceVotingReady = !session.locked && !isWatchOnlyWallet;
  const governanceVotingFallbackReady = !isWatchOnlyWallet && (governanceVotingReady || !!governancePassword.trim());
  const governanceVoteErrorRequiresFallback = !!governanceVoteError && (
    governanceVoteError.includes('Enter your password') ||
    governanceVoteError.includes('device unlock') ||
    governanceVoteError.includes('Vote signing session is out of sync') ||
    governanceVoteError.includes('Password is required to sign')
  );
  const governanceNeedsSigningFallback = !isWatchOnlyWallet && (
    !governanceVotingReady ||
    !!governancePassword.trim() ||
    governanceVoteErrorRequiresFallback
  );
  const recentRecipients = state?.recentRecipients ?? [];
  const privacyMode = wallet.privacyMode;
  const selectedChain = wallet.selectedChain;
  const selectedWalletIdForChain = getSelectedWalletIdForChain(wallet, selectedChain);
  const isSolanaChain = selectedChain === 'solana';
  const isSuiChain = selectedChain === 'sui';
  const isMonadChain = selectedChain === 'monad';
  const isEthereumChain = selectedChain === 'ethereum';
  const selectedNetworkLabel = formatNetworkLabel(selectedChain, wallet.selectedNetwork);
  const totalEffectiveReputationPoints = reputation.spaces.reduce((sum, space) => sum + BigInt(space.effectivePoints), BigInt(0)).toString();
  const totalLatestSeasonReputationPoints = reputation.spaces.reduce((sum, space) => sum + BigInt(space.latestSeasonPoints), BigInt(0)).toString();
  const verificationDaoNameMap = new Map<string, string>([
    ...reputation.spaces
      .filter((space) => !!space.name)
      .map((space) => [space.daoId, space.name ?? formatAddress(space.daoId)] as const),
    ...governance.daos.map((dao) => [dao.daoId, dao.realmName] as const)
  ]);
  const trackedVerificationDaoCount = new Set([
    ...wallet.trackedVerificationSpaceIds,
    ...verification.trackedSpaces
  ]).size;
  const verificationLinkedIdentityCount = verification.identities.length;
  const visibleGovernanceProposals = governance.proposals.filter((proposal) => {
    if (proposal.votingPowerType !== 'unknown') {
      return true;
    }

    if (proposal.hasVoted) {
      return true;
    }

    return (proposal.voteSources?.length ?? 0) > 0;
  });
  const liveGovernanceProposalCount = visibleGovernanceProposals.filter((proposal) => {
    const timeMeta = getGovernanceProposalTimeMeta(proposal);
    return proposal.stateCode === 2 && timeMeta.votingWindowOpen;
  }).length;
  const detectedGovernanceDaoIds = new Set([
    ...governance.discoveredDaos,
    ...governance.delegateDaos,
    ...governance.governedDaos
  ]);
  const visibleGovernanceDaoIds = new Set([...detectedGovernanceDaoIds, ...governance.trackedDaos]);
  const totalGovernanceDaoCount = visibleGovernanceDaoIds.size;
  const selectedNetworkCustomRpc =
    selectedChain === 'sui'
      ? wallet.chainState.sui.customRpcUrl ?? ''
      : selectedChain === 'monad'
        ? wallet.chainState.monad.customRpcUrl ?? ''
      : selectedChain === 'ethereum'
        ? wallet.chainState.ethereum.customRpcUrl ?? ''
      : wallet.customRpcUrls[wallet.selectedNetwork] ?? '';

  async function handleWalletSelect(walletId: string) {
    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_select',
      walletId
    });
    setView('home');
    await refresh();
  }

  async function handleChainSelect(chain: 'solana' | 'sui' | 'monad' | 'ethereum') {
    if (chain === selectedChain || !wallet.wallets.some((walletEntry) => walletEntry.chain === chain)) {
      return;
    }
    await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_set_chain',
      chain
    });
    setView('home');
    await refresh();
  }

  const bridgeDestinationChainOptions = useMemo(
    () =>
      VISIBLE_CHAIN_OPTIONS.filter(
        (chain) =>
          chain.id !== selectedChain &&
          getSupportedBridgeDestinations(selectedChain).includes(chain.id) &&
          wallet.wallets.some((walletEntry) => walletEntry.chain === chain.id)
      ),
    [selectedChain, wallet.wallets]
  );

  const bridgeDestinationWallets = useMemo(
    () =>
      bridgeDestinationChain
        ? wallet.wallets.filter((walletEntry) => walletEntry.chain === bridgeDestinationChain)
        : [],
    [bridgeDestinationChain, wallet.wallets]
  );

  const selectedBridgeDestinationWallet =
    bridgeDestinationWallets.find((walletEntry) => walletEntry.id === bridgeDestinationWalletId) ?? bridgeDestinationWallets[0];
  const selectedBridgeDestinationAccount =
    selectedBridgeDestinationWallet?.accounts.find((account) => account.id === selectedBridgeDestinationWallet.selectedAccountId) ??
    selectedBridgeDestinationWallet?.accounts[0] ??
    null;

  useEffect(() => {
    if (bridgeDestinationChainOptions.length === 0) {
      setBridgeDestinationChain(null);
      setBridgeDestinationWalletId('');
      return;
    }

    if (
      !bridgeDestinationChain ||
      !bridgeDestinationChainOptions.some((option) => option.id === bridgeDestinationChain)
    ) {
      setBridgeDestinationChain(bridgeDestinationChainOptions[0].id);
    }
  }, [bridgeDestinationChain, bridgeDestinationChainOptions]);

  useEffect(() => {
    if (!bridgeDestinationChain) {
      setBridgeDestinationWalletId('');
      return;
    }

    const nextWallets = wallet.wallets.filter((walletEntry) => walletEntry.chain === bridgeDestinationChain);
    if (nextWallets.length === 0) {
      setBridgeDestinationWalletId('');
      return;
    }

    if (!nextWallets.some((walletEntry) => walletEntry.id === bridgeDestinationWalletId)) {
      setBridgeDestinationWalletId(nextWallets[0].id);
    }
  }, [bridgeDestinationChain, bridgeDestinationWalletId, wallet.wallets]);

  useEffect(() => {
    if (view !== 'bridge' || submittingBridge || Boolean(bridgeResult)) {
      return;
    }

    if (!bridgeDestinationChain || !selectedBridgeDestinationWallet || !bridgeAmount.trim() || selectedChainValue === 'sui') {
      bridgeQuoteRequestRef.current = 0;
      setQuotingBridge(false);
      return;
    }

    const requestId = Date.now();
    bridgeQuoteRequestRef.current = requestId;
    const timeoutId = window.setTimeout(() => {
      void handleGetBridgeQuote(requestId);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    bridgeAmount,
    bridgeDestinationChain,
    bridgeDestinationWalletId,
    bridgeResult,
    selectedBridgeDestinationWallet,
    selectedChainValue,
    submittingBridge,
    view
  ]);

  if (!state) {
    return (
      <PageShell title="Loading wallet" subtitle="Grape is starting up.">
        <Card title="Wallet unavailable">
          <p className="muted">{surfaceError ?? 'Loading wallet state...'}</p>
        </Card>
      </PageShell>
    );
  }

  if (state.wallet.setup !== 'ready') {
    return (
      <PageShell title="Set up wallet" subtitle="Create or import your wallet for Grape-supported chains directly in the popup.">
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

  if (session.locked && !isWatchOnlyWallet && view === 'approval' && activeApproval) {
    return (
      <PageShell
        eyebrow={null}
        title="Review request"
        subtitle="Unlock and approve or reject this request from the popup."
      >
        {renderApproval()}
      </PageShell>
    );
  }

  if (session.locked && !isWatchOnlyWallet) {
    return (
      <PageShell eyebrow={null} title="" subtitle="">
        {renderLockedWelcome()}
      </PageShell>
    );
  }

  if (!state.access.granted) {
    return (
      <PageShell
        title="Complete Grape Verification"
        subtitle="Verify once with a qualifying Solana wallet and Grape will remember access on this device."
      >
        <Card title="Verification">
          <div className="stack">
            <p className="muted access-required-copy">
              Use one wallet verified in Grape Verification DAO{' '}
              <span className="mono access-required-dao">{GRAPE_VERIFICATION_REQUIRED_DAO_ID}</span>
              After verification succeeds, Grape will not ask you to repeat this flow on each open.
            </p>
            {state.wallet.wallets.some((walletEntry) => walletEntry.chain === 'solana') ? (
              <p className="success-box">
                A Solana wallet is available in this extension. Verify it in Grape Verification, then return here and check verification.
              </p>
            ) : (
              <p className="warning-box">
                Add a Solana wallet first. Grape Verification currently checks eligibility against a Solana wallet.
              </p>
            )}
            {accessError ? <p className="danger-box">{accessError}</p> : null}
            <Button
              className="button-block"
              onClick={() => window.open(buildVerificationSpaceUrl(GRAPE_VERIFICATION_REQUIRED_DAO_ID), '_blank', 'noopener,noreferrer')}
            >
              Open Grape Verification
            </Button>
            <Button
              tone="secondary"
              className="button-block"
              disabled={accessRefreshing}
              onClick={async () => {
                try {
                  setAccessRefreshing(true);
                  setAccessError(null);
                  await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_refresh_access' });
                  await refresh();
                } catch (error) {
                  setAccessError(error instanceof Error ? error.message : 'Unable to check Grape Verification.');
                } finally {
                  setAccessRefreshing(false);
                }
              }}
            >
              {accessRefreshing ? 'Checking verification…' : 'Check verification'}
            </Button>
          </div>
        </Card>
      </PageShell>
    );
  }

  function renderChainSwitcher(compact = false) {
    const availableChains = VISIBLE_CHAIN_OPTIONS.filter((chain) =>
      wallet.wallets.some((walletEntry) => walletEntry.chain === chain.id)
    );
    const selectedChainOption = VISIBLE_CHAIN_OPTIONS.find((chain) => chain.id === selectedChain) ?? availableChains[0];

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`chain-selector-trigger ${compact ? 'compact' : ''}`.trim()}
            aria-label="Switch chain"
            title={selectedChainOption?.label ?? 'Switch chain'}
          >
            <span className="chain-switcher-badge" aria-hidden="true">
              {compact ? selectedChainOption?.glyph : selectedChainOption?.shortLabel}
            </span>
            <span className="chain-switcher-label">
              {compact ? selectedChainOption?.shortLabel : selectedChainOption?.label}
            </span>
            <ChevronDown size={14} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={8} align="start" className="popup-menu-content chain-selector-menu">
            <div className="popup-menu-section">Chains</div>
            {availableChains.map((chain) => (
              <DropdownMenu.Item
                key={chain.id}
                className={`wallet-menu-action ${selectedChain === chain.id ? 'active' : ''}`.trim()}
                onSelect={() => {
                  void handleChainSelect(chain.id);
                }}
              >
                <span className="wallet-menu-action-copy">
                  <span className="chain-switcher-badge" aria-hidden="true">
                    {chain.shortLabel}
                  </span>
                  <span>{chain.label}</span>
                </span>
                {selectedChain === chain.id ? <Check size={14} /> : null}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
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

  async function handleRecentRecipientRemove(address: string) {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_remove_recent_recipient',
      address
    });

    if (recipient === address) {
      setRecipient('');
    }
    if (incidentSafeWallet === address) {
      setIncidentSafeWallet('');
    }

    setState(nextState);
  }

  async function handleSaveCustomRpc() {
    try {
      setCustomRpcBusy(true);
      setCustomRpcError(null);
      await sendRuntimeMessage<WalletStateResponse>(
        selectedChain === 'sui'
          ? {
              type: 'wallet_set_sui_custom_rpc',
              rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
            }
          : selectedChain === 'monad'
            ? {
                type: 'wallet_set_monad_custom_rpc',
                rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
              }
            : selectedChain === 'ethereum'
              ? {
                  type: 'wallet_set_ethereum_custom_rpc',
                  rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
                }
          : {
              type: 'wallet_set_custom_rpc',
              network: wallet.selectedNetwork,
              rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
            }
      );
      await refresh();
    } catch (error) {
      setCustomRpcError(error instanceof Error ? error.message : 'Unable to update custom RPC.');
    } finally {
      setCustomRpcBusy(false);
    }
  }

  async function handleSaveReputationSpaces(daoIds: string[]) {
    try {
      setReputationSpaceSaving(true);
      setReputationSpaceError(null);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_set_reputation_spaces',
        daoIds
      });
      await refresh();
    } catch (error) {
      setReputationSpaceError(error instanceof Error ? error.message : 'Unable to update tracked reputation spaces.');
    } finally {
      setReputationSpaceSaving(false);
    }
  }

  async function handleAddReputationSpace() {
    const nextDaoId = reputationSpaceInput.trim();
    if (!nextDaoId) {
      return;
    }
    if (wallet.trackedReputationSpaceIds.includes(nextDaoId)) {
      setReputationSpaceError('That reputation space is already tracked.');
      return;
    }

    await handleSaveReputationSpaces([...wallet.trackedReputationSpaceIds, nextDaoId]);
    setReputationSpaceInput('');
  }

  async function handleRemoveReputationSpace(daoId: string) {
    await handleSaveReputationSpaces(wallet.trackedReputationSpaceIds.filter((entry) => entry !== daoId));
  }

  async function handleSaveVerificationSpaces(daoIds: string[]) {
    try {
      setVerificationSpaceSaving(true);
      setVerificationSpaceError(null);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_set_verification_spaces',
        daoIds
      });
      await refresh();
    } catch (error) {
      setVerificationSpaceError(error instanceof Error ? error.message : 'Unable to update tracked verification spaces.');
    } finally {
      setVerificationSpaceSaving(false);
    }
  }

  async function handleAddVerificationSpace() {
    const nextDaoId = verificationSpaceInput.trim();
    if (!nextDaoId) {
      return;
    }
    if (wallet.trackedVerificationSpaceIds.includes(nextDaoId)) {
      setVerificationSpaceError('That verification space is already tracked.');
      return;
    }

    await handleSaveVerificationSpaces([...wallet.trackedVerificationSpaceIds, nextDaoId]);
    setVerificationSpaceInput('');
  }

  async function handleRemoveVerificationSpace(daoId: string) {
    await handleSaveVerificationSpaces(wallet.trackedVerificationSpaceIds.filter((entry) => entry !== daoId));
  }

  async function handleSaveGovernanceDaos(daoIds: string[]) {
    try {
      setGovernanceDaoSaving(true);
      setGovernanceDaoError(null);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_set_governance_daos',
        daoIds
      });
      await refresh();
    } catch (error) {
      setGovernanceDaoError(error instanceof Error ? error.message : 'Unable to update tracked governance DAOs.');
    } finally {
      setGovernanceDaoSaving(false);
    }
  }

  async function handleAddGovernanceDao() {
    const nextDaoId = governanceDaoInput.trim();
    if (!nextDaoId) {
      return;
    }
    if (wallet.trackedGovernanceDaoIds.includes(nextDaoId)) {
      setGovernanceDaoError('That governance DAO is already tracked.');
      return;
    }
    if (governance.discoveredDaos.includes(nextDaoId)) {
      setGovernanceDaoError('That governance DAO is already auto-detected for this wallet.');
      return;
    }

    await handleSaveGovernanceDaos([...wallet.trackedGovernanceDaoIds, nextDaoId]);
    setGovernanceDaoInput('');
  }

  async function handleRemoveGovernanceDao(daoId: string) {
    await handleSaveGovernanceDaos(wallet.trackedGovernanceDaoIds.filter((entry) => entry !== daoId));
  }

  async function handleScanGovernanceEligibility() {
    try {
      setGovernanceEligibilityLoading(true);
      setGovernanceEligibilityError(null);
      const nextEligibility = await sendRuntimeMessage<GovernanceEligibleDao[]>({
        type: 'wallet_scan_governance_eligibility'
      });
      setGovernanceEligibility(nextEligibility);
      setGovernanceEligibilityScanned(true);
    } catch (error) {
      setGovernanceEligibility([]);
      setGovernanceEligibilityScanned(true);
      setGovernanceEligibilityError(error instanceof Error ? error.message : 'Unable to scan wallet holdings for governance eligibility.');
    } finally {
      setGovernanceEligibilityLoading(false);
    }
  }

  function openHomeTabAndScroll(target: 'community' | 'verification' | 'governance') {
    setHomeTab(target === 'governance' ? 'governance' : 'community');
    setPendingHomeScrollTarget(target);
  }

  async function handleGovernanceVote(input: {
    daoId: string;
    governanceProgramId: string;
    governanceId: string;
    proposalId: string;
    proposalOwnerRecordId: string;
    tokenOwnerRecordId: string | null;
    governingTokenMint: string;
    voteKind: 'approve' | 'deny' | 'abstain';
    choiceRank?: number;
    voteSources?: WalletGovernanceResponse['proposals'][number]['voteSources'];
  }) {
    const latestState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' }).catch(() => null);
    if (latestState) {
      setState(latestState);
    }

    const latestGovernanceVotingReady = !((latestState?.session ?? state?.session)?.locked ?? true) && !(
      (latestState?.activeWallet ?? state?.activeWallet)?.signerKind === 'watch-only'
    );

    if (!latestGovernanceVotingReady && !governancePassword.trim()) {
      setGovernanceVoteError('Enter your password or use device unlock before voting on proposals.');
      return;
    }

    const voteSources = (input.voteSources ?? []).filter((source) => !source.hasVoted);
    const fallbackSource = input.tokenOwnerRecordId
      ? [{
          tokenOwnerRecordId: input.tokenOwnerRecordId,
          governingTokenOwner: '',
          isDelegate: false,
          hasVoted: false
        }]
      : [];
    const effectiveVoteSources = voteSources.length > 0 ? voteSources : fallbackSource;

    if (effectiveVoteSources.length === 0) {
      setGovernanceVoteError('This wallet does not have a voting record for that proposal mint.');
      return;
    }

    try {
      setGovernanceVotingProposalId(input.proposalId);
      setGovernanceVoteError(null);
      setGovernanceVoteResult(null);
      const ownVoteSource = effectiveVoteSources.find((source) => !source.isDelegate) ?? effectiveVoteSources[0];
      const delegatedVoteSources = effectiveVoteSources.filter(
        (source) => source.isDelegate && source.tokenOwnerRecordId !== ownVoteSource.tokenOwnerRecordId
      );
      const selectedSources = [ownVoteSource];

      if (delegatedVoteSources.length > 0) {
        const delegatePrompt = delegatedVoteSources.length === 1
          ? `This proposal also has ${formatGovernanceVoteSourceLabel(delegatedVoteSources[0])}. Vote ${input.voteKind === 'approve' ? 'Approve' : 'Deny'} with that delegated voting power too?`
          : `This proposal also has ${delegatedVoteSources.length} delegated voting power sources. Vote ${input.voteKind === 'approve' ? 'Approve' : 'Deny'} with those delegated votes too?`;
        if (window.confirm(delegatePrompt)) {
          selectedSources.push(...delegatedVoteSources);
        }
      }

      let lastResult: WalletGovernanceVoteResponse | null = null;
      const skippedAlreadyVotedLabels: string[] = [];
      for (const source of selectedSources) {
        try {
          lastResult = await sendRuntimeMessage<WalletGovernanceVoteResponse>({
            type: 'wallet_cast_governance_vote',
            daoId: input.daoId,
            governanceProgramId: input.governanceProgramId,
            governanceId: input.governanceId,
            proposalId: input.proposalId,
            proposalOwnerRecordId: input.proposalOwnerRecordId,
            tokenOwnerRecordId: source.tokenOwnerRecordId,
            governingTokenMint: input.governingTokenMint,
            voteKind: input.voteKind,
            choiceRank: input.choiceRank,
            password: governancePassword.trim() || undefined
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to submit governance vote.';
          if (message.toLowerCase().includes('already voted')) {
            skippedAlreadyVotedLabels.push(formatGovernanceVoteSourceLabel(source));
            continue;
          }
          throw error;
        }
      }
      if (lastResult) {
        setGovernanceVoteResult(lastResult);
        setGovernancePassword('');
        if (skippedAlreadyVotedLabels.length > 0) {
          setGovernanceVoteError(`Skipped ${skippedAlreadyVotedLabels.join(', ')} because those records already voted. Refreshed governance state.`);
        }
      } else if (skippedAlreadyVotedLabels.length > 0) {
        setGovernanceVoteError(`The selected record already voted: ${skippedAlreadyVotedLabels.join(', ')}. Refreshed governance state.`);
      }
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit governance vote.';
      if (message === 'Password is required to sign.') {
        const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' }).catch(() => null);
        if (nextState) {
          setState(nextState);
        }
        setGovernanceVoteError(
          nextState?.session.locked
            ? 'Enter your password or use device unlock before voting on proposals.'
            : 'Vote signing session is out of sync. Enter your password below or use device unlock, then try again.'
        );
      } else {
        setGovernanceVoteError(message);
      }
    } finally {
      setGovernanceVotingProposalId(null);
    }
  }

  function renderGovernanceProposalCard(
    proposal: WalletGovernanceResponse['proposals'][number],
    nowUnixSeconds: number
  ) {
    const daoSummary = governance.daos.find((dao) => dao.daoId === proposal.daoId) ?? null;
    const isTrackedDao = governance.trackedDaos.includes(proposal.daoId);
    const isDetectedDao = detectedGovernanceDaoIds.has(proposal.daoId);
    const hasCommunityPower = daoSummary
      ? BigInt(daoSummary.communityVotingPower ?? '0') > 0n || BigInt(daoSummary.delegateCommunityVotingPower ?? '0') > 0n
      : false;
    const hasCouncilPower = daoSummary
      ? BigInt(daoSummary.councilVotingPower ?? '0') > 0n || BigInt(daoSummary.delegateCouncilVotingPower ?? '0') > 0n
      : false;
    const hasDaoVotingPower = hasCommunityPower || hasCouncilPower;
    const proposalVoteSources = proposal.voteSources ?? [];
    const availableVoteSources = proposalVoteSources.filter((source) => !source.hasVoted);
    const hasProposalVoteSources = proposalVoteSources.length > 0;
    const hasDelegatedProposalVoteSource = availableVoteSources.some((source) => source.isDelegate);
    const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
    const canVoteNow = proposal.canVote && timeMeta.votingWindowOpen;
    const proposalUrl = buildGovernanceProposalUrl(proposal.daoId, proposal.proposalId);
    const voteDecimals = getGovernanceVoteDecimals(proposal, daoSummary);
    const inactiveVotingPowerMessage =
      !timeMeta.votingWindowOpen && timeMeta.noteText
        ? timeMeta.noteText
        : proposal.hasVoted && availableVoteSources.length === 0
          ? 'This wallet has already voted on this proposal.'
        : hasDaoVotingPower && availableVoteSources.length === 0
          ? 'This wallet has governance power in this DAO, but the proposal vote source is still being resolved.'
          : availableVoteSources.length > 0
            ? hasDelegatedProposalVoteSource
              ? 'This wallet has delegated voting power available for this proposal.'
              : 'This wallet has voting power available for this proposal.'
          : proposal.votingPowerType === 'community' && hasCouncilPower && !hasCommunityPower
            ? 'This is a Community proposal. This wallet currently has Council voting power in this DAO.'
          : proposal.votingPowerType === 'council' && hasCommunityPower && !hasCouncilPower
            ? 'This is a Council proposal. This wallet currently has Community voting power in this DAO.'
            : hasProposalVoteSources
              ? 'This wallet has a proposal voter record, but that voting power is not currently available.'
            : proposal.votingPowerType === 'unknown' && (hasCommunityPower || hasCouncilPower)
              ? 'This wallet has DAO voting power, but the proposal voting class could not be resolved yet.'
              : hasDaoVotingPower
                ? 'This wallet has governance power in this DAO, but the matching voter record for this proposal is not available yet.'
                : isTrackedDao
                  ? 'This wallet is tracking this DAO, but it does not currently have voting power for this proposal.'
                  : isDetectedDao
                    ? 'This DAO was auto-detected for this wallet, but it does not currently have voting power for this proposal.'
                    : 'This wallet does not currently have voting power for this proposal.';

    return (
      <div key={proposal.proposalId} className="governance-proposal-card">
        <div className="governance-proposal-header">
          <div className="governance-proposal-copy">
            <strong className="governance-proposal-title">{proposal.proposalName}</strong>
            <div className="governance-proposal-badges">
              <StatusPill tone="neutral">{formatGovernanceVotingPowerType(proposal.votingPowerType)}</StatusPill>
              {proposal.isDelegate ? (
                <StatusPill tone="neutral">Delegate</StatusPill>
              ) : null}
              <StatusPill tone={timeMeta.badgeTone}>
                {timeMeta.badgeLabel}
              </StatusPill>
              {timeMeta.votingWindowOpen && timeMeta.metaText ? (
                <StatusPill tone="neutral">{timeMeta.metaText}</StatusPill>
              ) : null}
              <button
                type="button"
                className="governance-proposal-link"
                onClick={() => window.open(proposalUrl, '_blank', 'noopener,noreferrer')}
                aria-label={`Open ${proposal.proposalName} on governance.so`}
                title="Open on governance.so"
              >
                <span>Open</span>
                <ExternalLink size={13} />
              </button>
            </div>
            <span className="governance-proposal-meta">
              {proposal.realmName} • {proposal.state}
              {proposal.votingEndsAt ? ` • ${new Date(proposal.votingEndsAt * 1000).toLocaleString()}` : ''}
            </span>
          </div>
        </div>
        <div className="governance-proposal-metrics">
          <span>Yes {formatVotingPower(BigInt(proposal.yesVotes), voteDecimals, true)}</span>
          {BigInt(proposal.noVotes) > BigInt(0) ? <span>No {formatVotingPower(BigInt(proposal.noVotes), voteDecimals, true)}</span> : null}
          {BigInt(proposal.denyVotes) > BigInt(0) ? <span>Deny {formatVotingPower(BigInt(proposal.denyVotes), voteDecimals, true)}</span> : null}
        </div>
        {canVoteNow ? (
          <div className="governance-vote-actions">
            {proposal.choices.map((choice) => (
                <Button
                  key={`${proposal.proposalId}:${choice.rank}`}
                  tone="secondary"
                  disabled={
                  governanceVotingProposalId === proposal.proposalId || !governanceVotingFallbackReady
                  }
                onClick={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
                    governanceProgramId: proposal.governanceProgramId,
                    governanceId: proposal.governanceId,
                    proposalId: proposal.proposalId,
                    proposalOwnerRecordId: proposal.proposalOwnerRecordId,
                    tokenOwnerRecordId: proposal.tokenOwnerRecordId,
                    governingTokenMint: proposal.governingTokenMint,
                    voteKind: 'approve',
                    choiceRank: choice.rank,
                    voteSources: proposal.voteSources
                  })
                }
              >
                {governanceVotingProposalId === proposal.proposalId ? 'Submitting…' : choice.label}
              </Button>
            ))}
            {proposal.hasDenyOption ? (
              <Button
                tone="secondary"
                disabled={
                  governanceVotingProposalId === proposal.proposalId || !governanceVotingFallbackReady
                }
                onClick={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
                    governanceProgramId: proposal.governanceProgramId,
                    governanceId: proposal.governanceId,
                    proposalId: proposal.proposalId,
                    proposalOwnerRecordId: proposal.proposalOwnerRecordId,
                    tokenOwnerRecordId: proposal.tokenOwnerRecordId,
                    governingTokenMint: proposal.governingTokenMint,
                    voteKind: 'deny',
                    voteSources: proposal.voteSources
                  })
                }
              >
                {governanceVotingProposalId === proposal.proposalId ? 'Submitting…' : 'Deny'}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="muted governance-proposal-note">
            {inactiveVotingPowerMessage}
          </p>
        )}
      </div>
    );
  }

  async function handleUnlockInline() {
    try {
      setUnlocking(true);
      setUnlockError(null);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password: unlockPassword
      });
      setUnlockPassword('');
      applyUnlockedState(nextState);
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'Unable to unlock wallet.');
    } finally {
      setUnlocking(false);
    }
  }

  function handleUnlockInlineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleUnlockInline();
  }

  async function handleBiometricUnlockInline() {
    if (!wallet.wallets.length) {
      return;
    }

    const selectedWallet =
      wallet.wallets.find((entry) => entry.id === selectedWalletIdForChain) ??
      wallet.wallets.find((entry) => entry.chain === wallet.selectedChain) ??
      wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setUnlockError(null);
      const password = await unlockWithBiometric(selectedWallet.biometricUnlock);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password
      });
      setUnlockPassword('');
      applyUnlockedState(nextState);
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

    const selectedWallet =
      wallet.wallets.find((entry) => entry.id === selectedWalletIdForChain) ??
      wallet.wallets.find((entry) => entry.chain === wallet.selectedChain) ??
      wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setSendError(null);
      setSwapError(null);
      setTokenActionError(null);
      setIncidentError(null);
      setGovernanceVoteError(null);
      const password = await unlockWithBiometric(selectedWallet.biometricUnlock);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password
      });
      setGovernancePassword('');
      setBridgePassword('');
      setStakePassword('');
      setSwapPassword('');
      setBurnPassword('');
      setIncidentPassword('');
      applyUnlockedState(nextState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to unlock with device.';
      setSendError(message);
      setBridgeError(message);
      setStakeError(message);
      setGovernanceVoteError(message);
      setSwapError(message);
      setTokenActionError(message);
      setIncidentError(message);
    } finally {
      setBiometricUnlocking(false);
    }
  }

  async function handleBiometricUnlockForGovernance() {
    if (!wallet.wallets.length) {
      return;
    }

    const selectedWallet =
      wallet.wallets.find((entry) => entry.id === selectedWalletIdForChain) ??
      wallet.wallets.find((entry) => entry.chain === wallet.selectedChain) ??
      wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setGovernanceVoteError(null);
      const password = await unlockWithBiometric(selectedWallet.biometricUnlock);
      setGovernancePassword(password);
    } catch (error) {
      setGovernanceVoteError(error instanceof Error ? error.message : 'Unable to unlock with device.');
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
          <DropdownMenu.Content sideOffset={8} align="end" className="popup-menu-content wallet-switcher-menu">
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
          <DropdownMenu.Content sideOffset={8} align="end" className="popup-menu-content wallet-switcher-menu">
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

  function renderWalletSwitcher() {
    const groupedWallets = [
      { key: 'hardware', label: 'Hardware Wallets' },
      { key: 'imported', label: 'Imported Wallets' },
      { key: 'created', label: 'Created Wallets' },
      { key: 'watch', label: 'Viewer Wallets' }
    ]
      .map((group) => ({
        ...group,
        wallets: wallet.wallets.filter(
          (walletEntry) => getWalletGroupKey(walletEntry.source, walletEntry.signer.kind) === group.key
        )
      }))
      .filter((group) => group.wallets.length > 0);

    return (
      <DropdownMenu.Root open={walletSwitcherOpen} onOpenChange={setWalletSwitcherOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={`menu-button wallet-switcher-button ${walletSwitcherOpen ? 'open' : ''}`.trim()}
            aria-label={walletSwitcherOpen ? 'Close wallet switcher' : 'Switch wallet'}
            title="Switch wallet"
          >
            {walletSwitcherOpen ? <X size={18} /> : <Landmark size={16} />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={8} align="end" className="popup-menu-content wallet-switcher-menu">
            <div className="popup-menu-section">Wallets</div>
            {groupedWallets.map((group) => (
              <div key={group.key} className="wallet-menu-group">
                <div className="wallet-menu-group-label">{group.label}</div>
                <div className="wallet-menu-list">
                  {group.wallets.map((walletEntry) => {
                    const walletPublicKey =
                      walletEntry.accounts.find((account) => account.id === walletEntry.selectedAccountId)?.publicKey ??
                      walletEntry.accounts[0]?.publicKey;
                    const isActiveWallet = selectedWalletIdForChain === walletEntry.id;
                    const sourceBadge = getWalletSourceBadge(walletEntry.source, walletEntry.signer.kind);

                    return (
                      <div key={walletEntry.id} className="wallet-menu-row">
                        <DropdownMenu.Item
                          className={`wallet-menu-item ${isActiveWallet ? 'active' : ''}`.trim()}
                          onSelect={() => {
                            void handleWalletSelect(walletEntry.id);
                          }}
                        >
                          <div className="wallet-menu-copy">
                            <div className="wallet-menu-heading">
                              <strong>{walletEntry.name}</strong>
                              <span className="wallet-chain-badge" title={`${walletEntry.chain} wallet`}>
                                {walletEntry.chain === 'sui' ? 'SUI' : walletEntry.chain === 'monad' ? 'MON' : walletEntry.chain === 'ethereum' ? 'ETH' : 'SOL'}
                              </span>
                              <span
                                className={`wallet-source-badge ${sourceBadge.tone}`.trim()}
                                title={sourceBadge.label}
                                aria-label={sourceBadge.label}
                              >
                                {sourceBadge.icon}
                              </span>
                              <button
                                type="button"
                                className="wallet-menu-copy-button"
                                aria-label={`Copy address for ${walletEntry.name}`}
                                title={`Copy ${formatAddress(walletPublicKey)}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleCopyWalletAddress(walletEntry.id, walletPublicKey);
                                }}
                              >
                                {copiedWalletId === walletEntry.id ? <Check size={12} /> : <Copy size={12} />}
                              </button>
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
                                <Pencil size={12} />
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
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="muted mono">{formatAddress(walletPublicKey)}</div>
                          </div>
                          {isActiveWallet ? <StatusPill tone="success">Active</StatusPill> : null}
                        </DropdownMenu.Item>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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

          <form className="unlock-welcome-form" onSubmit={handleUnlockInlineSubmit}>
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
              type="submit"
              className="button-block unlock-submit-button"
              disabled={unlocking || !unlockPassword.trim()}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </Button>

            <p className="muted unlock-welcome-helper">
              Unlock once per session. Grape will ask again only after you lock it or the idle timeout expires.
            </p>
          </form>
        </Card>
      </div>
    );
  }

  function renderHome() {
    const nativeAssetName = assets.nativeName ?? (isEthereumChain ? 'Ethereum' : isSuiChain ? 'Sui' : isMonadChain ? 'Monad' : 'Solana');
    const nativeAssetSymbol = assets.nativeSymbol ?? (isEthereumChain ? 'ETH' : isSuiChain ? 'SUI' : isMonadChain ? 'MON' : 'SOL');
    const activeHomeTab =
      (isSuiChain || isMonadChain || isEthereumChain) &&
      (homeTab === 'collectibles' || homeTab === 'staking' || homeTab === 'community' || homeTab === 'governance')
        ? 'tokens'
        : homeTab;
    const nativeAssetId = isEthereumChain ? 'ethereum' : isMonadChain ? 'monad' : isSuiChain ? 'sui' : 'sol';

    return (
      <>
        <Card className="wallet-home-card">
          <div className="wallet-home-topbar">
            <div className="wallet-home-network stack-tight">
              {renderChainSwitcher(true)}
              <StatusPill tone={wallet.selectedNetwork === 'devnet' ? 'warning' : 'success'}>{selectedNetworkLabel}</StatusPill>
            </div>
            <div className="wallet-home-controls">
              {renderWalletSwitcher()}
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

          <div className="quick-actions compact home-quick-actions">
            <button type="button" className="quick-action-card" onClick={() => openSend(nativeAssetId)} aria-label="Send" title="Send" disabled={isWatchOnlyWallet}>
              <span className="quick-action-icon"><SendHorizontal size={18} /></span>
            </button>
            <button
              type="button"
              className="quick-action-card"
              onClick={() => {
                if (!isSolanaChain) {
                  return;
                }
                setSwapQuote(null);
                setSwapResult(null);
                setSwapError(null);
                setView('swap');
              }}
              aria-label="Swap"
              title={isSolanaChain ? 'Swap' : `Swap coming soon on ${nativeAssetName}`}
              disabled={isWatchOnlyWallet || !isSolanaChain}
            >
              <span className="quick-action-icon"><ArrowLeftRight size={18} /></span>
            </button>
            <button
              type="button"
              className="quick-action-card"
              onClick={() => {
                setBridgeQuote(null);
                setBridgeResult(null);
                setBridgeError(null);
                setView('bridge');
              }}
              aria-label="Bridge"
              title={isSuiChain ? 'Bridge source coming soon on Sui' : 'Bridge'}
              disabled={isWatchOnlyWallet || isSuiChain}
            >
              <span className="quick-action-icon"><ArrowUpRight size={18} /></span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => setView('receive')} aria-label="Receive" title="Receive">
              <span className="quick-action-icon"><QrCode size={18} /></span>
            </button>
          </div>

          {isSolanaChain ? (
            <>
              <div className="wallet-home-shortcuts">
                <button
                  type="button"
                  className="wallet-shortcut-card"
                  onClick={() => openHomeTabAndScroll('community')}
                  aria-label="Open community reputation"
                >
                  <span className="wallet-shortcut-label">OG Reputation</span>
                  <strong>
                    {reputationLoading
                      ? 'Loading...'
                      : reputation.spaces.length > 0
                        ? `${formatWholeNumberString(totalEffectiveReputationPoints)} pts`
                        : wallet.trackedReputationSpaceIds.length > 0
                          ? 'No points yet'
                          : 'Add spaces'}
                  </strong>
                  <span className="wallet-shortcut-meta">
                    {reputation.spaces.length > 0
                      ? `Latest s. ${formatWholeNumberString(totalLatestSeasonReputationPoints)} pts`
                      : `${reputation.spaces.length} space${reputation.spaces.length === 1 ? '' : 's'}`}
                  </span>
                </button>
                <button
                  type="button"
                  className="wallet-shortcut-card"
                  onClick={() => openHomeTabAndScroll('governance')}
                  aria-label="Open governance proposals"
                >
                  <span className="wallet-shortcut-label">Governance</span>
                  <strong>
                    {governanceLoading
                      ? 'Loading...'
                      : liveGovernanceProposalCount > 0
                        ? `${liveGovernanceProposalCount} live`
                        : totalGovernanceDaoCount > 0
                          ? 'No live'
                          : 'Scanning DAOs'}
                  </strong>
                  <span className="wallet-shortcut-meta">
                    {totalGovernanceDaoCount} DAO{totalGovernanceDaoCount === 1 ? '' : 's'}
                  </span>
                </button>
              </div>
              <button
                type="button"
                className="wallet-inline-shortcut"
                onClick={() => openHomeTabAndScroll('verification')}
                aria-label="Open verification"
              >
                <span className="wallet-inline-shortcut-label">Verification</span>
                <strong>
                  {verificationLoading
                    ? 'Loading...'
                    : verification.totalVerified > 0
                      ? `${verification.totalVerified} verified`
                      : verificationLinkedIdentityCount > 0
                        ? `${verificationLinkedIdentityCount} linked`
                        : trackedVerificationDaoCount > 0
                          ? 'Verify now'
                          : 'Add spaces'}
                </strong>
                <span className="wallet-inline-shortcut-meta">
                  {trackedVerificationDaoCount} space{trackedVerificationDaoCount === 1 ? '' : 's'}
                </span>
              </button>
            </>
          ) : null}
        </Card>

        {isWatchOnlyWallet ? (
          <p className="warning-box">This is a watch-only wallet. You can view assets, receive funds, and connect to dApps, but signing is disabled.</p>
        ) : null}

        <Tabs.Root value={activeHomeTab} onValueChange={(value) => setHomeTab(value as HomeTab)}>
          <Tabs.List className="content-tabs" aria-label="Wallet content">
            <Tabs.Trigger className="content-tab" value="tokens">
              <span className="content-tab-copy">Tokens</span>
            </Tabs.Trigger>
            {isSolanaChain ? (
              <Tabs.Trigger className="content-tab" value="community">
                <span className="content-tab-copy">Community</span>
              </Tabs.Trigger>
            ) : null}
            {isSolanaChain ? (
              <Tabs.Trigger className="content-tab" value="governance">
                <span className="content-tab-copy">Governance</span>
              </Tabs.Trigger>
            ) : null}
            <Tabs.Trigger className="content-tab" value="activity">
              <span className="content-tab-copy">Activity</span>
            </Tabs.Trigger>
            {isSolanaChain ? (
              <>
                <Tabs.Trigger className="content-tab" value="collectibles">
                  <span className="content-tab-copy">Collectibles</span>
                </Tabs.Trigger>
                <Tabs.Trigger className="content-tab" value="staking">
                  <span className="content-tab-copy">Staking</span>
                </Tabs.Trigger>
              </>
            ) : null}
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
                  <button type="button" className="token-row-button" onClick={() => openSend(nativeAssetId)}>
                    <div className="token-item token-item-interactive">
                      <div className="token-leading">
                        <TokenAvatar
                          token={{ symbol: nativeAssetSymbol, logoUri: assets.nativeLogoUri }}
                          fallbackLabel={nativeAssetSymbol.slice(0, 1)}
                          sol={isSolanaChain}
                        />
                        <div className="token-copy">
                          <strong className="token-name">{nativeAssetName}</strong>
                          <div className="token-subline">
                            <span className="token-subtitle">{nativeAssetUnitPrice ?? nativeAssetSymbol}</span>
                            {nativeAssetChange ? (
                              <span className={`token-change ${assets.nativePriceChange24h && assets.nativePriceChange24h < 0 ? 'negative' : 'positive'}`.trim()}>
                                {nativeAssetChange}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="token-amount-group">
                        <div className="token-amount">{maskSensitiveValue(nativeAssetValue ?? homeBalance, privacyMode)}</div>
                        {nativeAssetValue ? <div className="token-subtitle token-amount-subtitle">{maskSensitiveValue(homeBalance, privacyMode)}</div> : null}
                      </div>
                    </div>
                  </button>

                  {assets.tokens.length === 0 ? (
                    <p className="muted">
                      {isSolanaChain
                        ? 'No SPL token balances found yet.'
                        : isSuiChain
                          ? 'No additional Sui coin balances found yet.'
                          : isMonadChain
                            ? 'No additional Monad token balances found yet.'
                            : 'No additional Ethereum token balances found yet.'}
                    </p>
              ) : (
                    <div className="token-list">
                      {assets.tokens.map((token) => (
                        <TokenRow
                          key={`${token.mint}:${token.programId}`}
                          token={token}
                          privacyMode={privacyMode}
                          onSelect={isSolanaChain ? () => openAssetDetails(token) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </Tabs.Content>

          {isSolanaChain ? (
            <Tabs.Content value="community">
              <div ref={communitySectionRef}>
              <Card className="asset-panel-card community-panel-card">
                <div className="community-panel-header">
                  <div>
                    <strong>Grape Community</strong>
                    <p className="muted">
                      Identity, reputation, access, claims, and governance start here. Track the spaces this wallet is
                      part of and see how its standing evolves.
                    </p>
                  </div>
                  <Button tone="secondary" onClick={() => setView('settings')}>
                    Manage spaces
                  </Button>
                </div>

                {reputationLoading ? <p className="muted">Loading OG reputation…</p> : null}
                {!reputationLoading && reputationError ? <p className="danger-box">{reputationError}</p> : null}
                {!reputationLoading && !reputationError && reputation.spaces.length > 0 ? (
                  <>
                    <div className="community-summary-grid">
                      <div className="community-summary-card">
                        <span className="muted">Effective points</span>
                        <strong>{formatWholeNumberString(totalEffectiveReputationPoints)}</strong>
                      </div>
                      <div className="community-summary-card">
                        <span className="muted">Latest season</span>
                        <strong>{formatWholeNumberString(totalLatestSeasonReputationPoints)}</strong>
                      </div>
                    </div>
                    <div className="grape-reputation-list">
                      {reputation.spaces.map((space) => (
                        <div key={`${space.daoId}:${space.currentSeason}`} className="grape-reputation-row">
                          <div className="grape-reputation-space">
                            <div className="grape-reputation-avatar">
                              {space.imageUri ? <img src={space.imageUri} alt={space.name ?? 'Reputation space'} /> : 'OG'}
                            </div>
                            <div className="grape-reputation-copy">
                              <strong>{space.name ?? `Space ${formatAddress(space.daoId)}`}</strong>
                              <span>
                                {space.symbol ?? formatAddress(space.repMint)} • {space.latestSeasonWithPoints}:{' '}
                                {formatWholeNumberString(space.latestSeasonPoints)} pts
                              </span>
                            </div>
                          </div>
                          <div className="grape-reputation-points">
                            <strong>{formatWholeNumberString(space.effectivePoints)}</strong>
                            <div className="grape-reputation-points-meta">
                              <span>effective</span>
                              <button
                                type="button"
                                className="grape-reputation-link"
                                onClick={() => window.open(buildOgReputationSpaceUrl(space.daoId), '_blank', 'noopener,noreferrer')}
                                aria-label={`Open ${space.name ?? space.daoId} reputation space`}
                                title="Open reputation space"
                              >
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {!reputationLoading && !reputationError && reputation.spaces.length === 0 ? (
                  <div className="community-empty-state">
                    <strong>No tracked reputation yet</strong>
                    <p className="muted">
                      Add the OG Reputation Spaces this wallet belongs to from Settings and Grape will surface the
                      wallet&apos;s points here.
                    </p>
                    <Button onClick={() => setView('settings')}>Add spaces</Button>
                  </div>
                ) : null}

                <div ref={verificationSectionRef} className="community-subsection">
                  <div className="community-subsection-header">
                    <div>
                      <strong>Verification</strong>
                      <p className="muted">
                        Track which identities this wallet has linked in Grape Verification and jump directly into the
                        verification dashboard for each community.
                      </p>
                    </div>
                    <Button tone="secondary" onClick={() => setView('settings')}>
                      Manage verification
                    </Button>
                  </div>

                  {verificationLoading ? <p className="muted">Loading verification status…</p> : null}
                  {!verificationLoading && verificationError ? <p className="danger-box">{verificationError}</p> : null}
                  {!verificationLoading && !verificationError && trackedVerificationDaoCount > 0 ? (
                    <div className="community-summary-grid">
                      <div className="community-summary-card">
                        <span className="muted">Tracked spaces</span>
                        <strong>{trackedVerificationDaoCount}</strong>
                      </div>
                      <div className="community-summary-card">
                        <span className="muted">Verified identities</span>
                        <strong>{verification.totalVerified}</strong>
                      </div>
                      <div className="community-summary-card">
                        <span className="muted">Linked identities</span>
                        <strong>{verificationLinkedIdentityCount}</strong>
                      </div>
                      <div className="community-summary-card">
                        <span className="muted">Needs verification</span>
                        <strong>{Math.max(0, verificationLinkedIdentityCount - verification.totalVerified)}</strong>
                      </div>
                    </div>
                  ) : null}
                  {!verificationLoading && !verificationError && verification.identities.length > 0 ? (
                    <div className="verification-list">
                      {verification.identities.map((identity) => {
                        const daoLabel = verificationDaoNameMap.get(identity.daoId) ?? `DAO ${formatAddress(identity.daoId)}`;
                        const verifiedLabel = identity.verified ? 'Verified' : 'Linked';
                        const linkedMeta =
                          identity.linkedWalletCount > 1
                            ? `${identity.linkedWalletCount} wallets linked`
                            : '1 wallet linked';

                        return (
                          <div key={identity.linkId} className="verification-row">
                            <div className="verification-copy">
                              <strong>{daoLabel}</strong>
                              <span>
                                {formatVerificationPlatform(identity.platform)} • {verifiedLabel}
                                {identity.expiresAt ? ` • expires ${formatRelativeTimeFromNow(identity.expiresAt)}` : ''}
                              </span>
                            </div>
                            <div className="verification-actions">
                              <StatusPill tone={identity.verified ? 'success' : 'warning'}>
                                {formatVerificationPlatform(identity.platform)}
                              </StatusPill>
                              <span className="verification-meta">{linkedMeta}</span>
                              <button
                                type="button"
                                className="grape-reputation-link"
                                onClick={() => window.open(buildVerificationSpaceUrl(identity.daoId), '_blank', 'noopener,noreferrer')}
                                aria-label={`Open ${daoLabel} verification`}
                                title="Open verification dashboard"
                              >
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {!verificationLoading && !verificationError && trackedVerificationDaoCount > 0 && verification.identities.length === 0 ? (
                    <div className="community-empty-state">
                      <strong>No linked identities yet</strong>
                      <p className="muted">
                        This wallet is tracking verification spaces, but it has not linked a verified identity in those
                        communities yet.
                      </p>
                      <Button
                        onClick={() =>
                          window.open(
                            buildVerificationSpaceUrl(
                              wallet.trackedVerificationSpaceIds[0] ?? verification.trackedSpaces[0] ?? ''
                            ),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                        disabled={(wallet.trackedVerificationSpaceIds[0] ?? verification.trackedSpaces[0] ?? '').length === 0}
                      >
                        Open verification
                      </Button>
                    </div>
                  ) : null}
                  {!verificationLoading && !verificationError && trackedVerificationDaoCount === 0 ? (
                    <div className="community-empty-state">
                      <strong>No verification spaces tracked</strong>
                      <p className="muted">
                        Add the DAO ids you want to verify against from Settings and Grape will show this wallet&apos;s
                        linked verification status here.
                      </p>
                      <Button onClick={() => setView('settings')}>Add verification spaces</Button>
                    </div>
                  ) : null}
                </div>
              </Card>
              </div>
            </Tabs.Content>
          ) : null}

          {isSolanaChain ? (
            <Tabs.Content value="governance">
              <div ref={governanceSectionRef}>
              <Card className="asset-panel-card community-panel-card">
                <div className="community-panel-header governance-panel-header">
                  <div className="governance-panel-copy">
                    <strong className="governance-panel-title">Governance</strong>
                    <p className="muted governance-panel-description">
                      Track live proposals across the DAOs this wallet can vote in and cast votes directly from Grape.
                    </p>
                  </div>
                  <Button tone="secondary" onClick={() => setView('settings')}>
                    Manage DAOs
                  </Button>
                </div>

                {governanceVoteResult ? (
                  <p className="success-box">
                    Vote submitted. Signature {formatAddress(governanceVoteResult.signature)}
                  </p>
                ) : null}
                {governanceVoteError ? <p className="danger-box">{governanceVoteError}</p> : null}
                {governanceLoading ? <p className="muted">Loading governance proposals…</p> : null}
                {!governanceLoading && governanceError ? <p className="danger-box">{governanceError}</p> : null}
                {(() => {
                  if (governanceLoading || governanceError) return null;
                  const nowUnixSeconds = Math.floor(Date.now() / 1000);
                  const activeProposals = visibleGovernanceProposals.filter((proposal) => {
                    const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
                    return proposal.stateCode === 2 && timeMeta.votingWindowOpen;
                  });
                  const finalizingProposals = visibleGovernanceProposals.filter((proposal) => {
                    const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
                    return proposal.stateCode === 2 && !timeMeta.votingWindowOpen;
                  });
                  if (activeProposals.length === 0 && finalizingProposals.length === 0) {
                    return (
                      <div className="community-empty-state">
                        <strong>No active votes</strong>
                        <p className="muted">
                          There are no open proposals requiring your vote right now. Your DAO memberships and voting
                          power are visible in <button type="button" className="link-button" onClick={() => setView('settings')}>Manage DAOs</button>.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <>
                      {activeProposals.length > 0 && governanceNeedsSigningFallback ? (
                        <div className="stack">
                          <label className="stack">
                            <span className="muted">Governance signing password</span>
                            <div className="send-input-shell send-input-shell-sign">
                              <Input
                                type="password"
                                value={governancePassword}
                                onChange={(event) => setGovernancePassword(event.target.value)}
                                placeholder={governanceVotingReady ? 'Optional password fallback' : 'Password required to sign'}
                              />
                              {biometricSupported && activeWallet?.biometricEnabled ? (
                                <button
                                  type="button"
                                  className="biometric-inline-button"
                                  onClick={() => void handleBiometricUnlockForGovernance()}
                                  aria-label="Unlock with device"
                                  title="Unlock with device"
                                  disabled={biometricUnlocking}
                                >
                                  <Fingerprint size={16} />
                                </button>
                              ) : null}
                            </div>
                          </label>
                          <p className="muted">
                            Enter your password or use device unlock before voting on proposals.
                          </p>
                        </div>
                      ) : null}
                      {activeProposals.length > 0 ? (
                        <div className="governance-proposal-list">
                          {activeProposals.map((proposal) => renderGovernanceProposalCard(proposal, nowUnixSeconds))}
                        </div>
                      ) : (
                        <div className="community-empty-state governance-empty-subtle">
                          <strong>No open votes</strong>
                          <p className="muted">There are no proposals with an open voting window right now.</p>
                        </div>
                      )}
                      {finalizingProposals.length > 0 ? (
                        <div className="governance-proposal-section">
                          <button
                            type="button"
                            className="governance-finalizing-toggle"
                            onClick={() => setGovernanceShowFinalizing((current) => !current)}
                            aria-expanded={governanceShowFinalizing}
                          >
                            <span className="governance-finalizing-copy">
                              <strong>Needs finalization</strong>
                              <span className="muted">
                                Voting has ended on {finalizingProposals.length} proposal{finalizingProposals.length === 1 ? '' : 's'}.
                              </span>
                            </span>
                            <span className="governance-finalizing-meta">
                              <StatusPill tone="warning">{finalizingProposals.length}</StatusPill>
                              {governanceShowFinalizing ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          </button>
                          {governanceShowFinalizing ? (
                            <div className="governance-proposal-list governance-finalizing-list">
                              {finalizingProposals.map((proposal) => renderGovernanceProposalCard(proposal, nowUnixSeconds))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </Card>
              </div>
            </Tabs.Content>
          ) : null}

          {isSolanaChain ? (
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
          ) : null}

          <Tabs.Content value="activity">
            <Card className="asset-panel-card activity-panel-card">
              {!isSolanaChain && !activityError && !activityLoading ? (
                <p className="muted">
                  {isSuiChain
                    ? 'Sui activity is coming soon. For now, Grape supports holdings and native SUI send.'
                    : isMonadChain
                      ? 'Monad activity is coming soon. For now, Grape supports holdings and native MON send.'
                      : 'Ethereum activity is coming soon. For now, Grape supports holdings and native ETH send.'}
                </p>
              ) : null}
              {activityError ? <p className="danger-box">{activityError}</p> : null}
              {!activityError && activityLoading ? <p className="muted">Loading recent activity...</p> : null}
              {isSolanaChain && !activityError && !activityLoading && activity.length === 0 ? (
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

          {isSolanaChain ? (
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
                  <select
                    className="staking-select"
                    value={selectedStakeValidator?.voteAccount ?? ''}
                    onChange={(event) => setStakeVoteAccount(event.target.value)}
                    disabled={stakeLoading || stakeValidators.length === 0}
                  >
                    <option value="">
                      {stakeLoading ? 'Loading validators...' : stakeValidators.length > 0 ? 'Select validator' : 'No validators loaded'}
                    </option>
                    {stakeValidators.map((validator) => (
                      <option key={validator.voteAccount} value={validator.voteAccount}>
                        {`${formatAddress(validator.voteAccount)} • ${formatSolAmountFromLamports(validator.activatedStakeLamports)} SOL • ${validator.commission}% commission`}
                      </option>
                    ))}
                  </select>
                  {selectedStakeValidator ? (
                    <p className="muted">
                      Active stake {formatSolAmountFromLamports(selectedStakeValidator.activatedStakeLamports)} SOL • Commission {selectedStakeValidator.commission}% • Node {formatAddress(selectedStakeValidator.nodePubkey)}
                    </p>
                  ) : (
                    <p className="muted">
                      Choose a validator from the live Solana vote-account list, or paste a vote account manually.
                    </p>
                  )}
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
          ) : null}
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
    const isNativeSend =
      selectedAsset?.asset.kind === 'sol' ||
      selectedAsset?.asset.kind === 'sui' ||
      selectedAsset?.asset.kind === 'mon' ||
      selectedAsset?.asset.kind === 'eth';
    const isCustomEvmToken = selectedAsset?.asset.kind === 'evm-token' && assetId === 'custom-evm-token';
    const nativeSendLabel = assets.nativeName ?? (isEthereumChain ? 'Ethereum' : isSuiChain ? 'Sui' : isMonadChain ? 'Monad' : 'Solana');
    const nativeSendSymbol = assets.nativeSymbol ?? (isEthereumChain ? 'ETH' : isSuiChain ? 'SUI' : isMonadChain ? 'MON' : 'SOL');
    const selectedAssetName =
      isNativeSend
        ? nativeSendLabel
        : selectedSendCollectible?.name ??
          selectedTokenHolding?.name ??
          (isCustomEvmToken ? customEvmTokenPreview?.name : null) ??
          selectedTokenHolding?.symbol ??
          selectedAsset?.label ??
          'Token';
    const selectedAssetSymbol =
      isNativeSend
        ? nativeSendSymbol
        : selectedSendCollectible?.symbol ??
          selectedTokenHolding?.symbol ??
          (isCustomEvmToken ? customEvmTokenPreview?.symbol : null) ??
          selectedAsset?.label.replace(/ token$/i, '') ??
          'Token';
    const selectedAmountNumber = Number(amount || '0');
    const selectedUnitPrice = isNativeSend ? assets.nativePriceUsd ?? null : selectedTokenHolding?.priceUsd ?? null;
    const selectedFiatValue =
      isCollectibleSend
        ? null
        : Number.isFinite(selectedAmountNumber) && typeof selectedUnitPrice === 'number'
          ? formatUsd(selectedAmountNumber * selectedUnitPrice)
          : null;
    const availableBalanceLabel = isCollectibleSend
      ? '1 NFT available'
      : isCustomEvmToken
        ? customEvmTokenPreview
          ? privacyMode ? '***' : customEvmTokenPreview.amount
          : customEvmTokenLoading
            ? 'Loading token...'
            : customEvmTokenError
              ? 'Token unavailable'
              : 'Enter contract'
        : selectedAsset?.balance ?? 'Unavailable';
    const solanaNativeBalance = typeof assets.lamports === 'number' ? assets.lamports / 1_000_000_000 : 0;
    const solanaGasWarning =
      wallet.selectedChain !== 'solana' || !selectedAsset || isCollectibleSend
        ? null
        : selectedAsset.asset.kind === 'spl-token'
          ? solanaNativeBalance < SOLANA_TOKEN_SEND_RESERVE_SOL
            ? 'This wallet may not have enough SOL for network fees and recipient token account creation.'
            : null
          : selectedAsset.asset.kind === 'sol' && Number.isFinite(selectedAmountNumber) && selectedAmountNumber > 0
            ? solanaNativeBalance <= selectedAmountNumber + SOLANA_SEND_FEE_RESERVE_SOL
              ? 'Leave some SOL in the wallet for network fees.'
              : null
            : null;

    function handleMaxAmount() {
      if (isCollectibleSend) {
        setAmount('1');
        return;
      }

      if (isNativeSend) {
        const baseUnits = typeof assets.lamports === 'number' ? assets.lamports : 0;
        const nativeDecimals = assets.nativeDecimals ?? 9;
        const reservedBaseUnits = isEthereumChain ? 10_000_000_000_000n : isMonadChain ? 1_000_000_000_000_000 : isSuiChain ? 1_000_000 : 10_000;
        const normalizedReservedBaseUnits =
          typeof reservedBaseUnits === 'bigint' ? Number(reservedBaseUnits) : reservedBaseUnits;
        const sendableBaseUnits = Math.max(baseUnits - normalizedReservedBaseUnits, 0);
        setAmount((sendableBaseUnits / 10 ** nativeDecimals).toFixed(Math.min(nativeDecimals, 9)).replace(/\.?0+$/, ''));
        return;
      }

      if (selectedTokenHolding) {
        setAmount(selectedTokenHolding.amount);
        return;
      }

      if (isCustomEvmToken && customEvmTokenPreview) {
        setAmount(customEvmTokenPreview.amount);
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
              <span>{selectedFiatValue ?? (isCollectibleSend ? 'Collectible transfer' : `Send ${selectedAssetSymbol}`)}</span>
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
                  disabled={sendAssetOptions.length <= 1}
                  onClick={() => setSendAssetPickerOpen((value) => !value)}
                >
                  <AssetPickerOptionRow option={selectedAsset} privacyMode={privacyMode} />
                  <ChevronDown className="send-select-chevron" size={18} />
                </button>
                {sendAssetPickerOpen && sendAssetOptions.length > 1 ? (
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

            {isCustomEvmToken ? (
              <div className="send-field-group">
                <label className="send-field-label">Token contract</label>
                <div className="send-input-shell">
                  <Input
                    value={customEvmTokenAddress}
                    onChange={(event) => setCustomEvmTokenAddress(event.target.value)}
                    placeholder="Paste ERC-20 / Monad token contract"
                    className="send-recipient-input"
                  />
                </div>
                {customEvmTokenError ? <p className="danger-box">{customEvmTokenError}</p> : null}
              </div>
            ) : null}

            <div className="send-field-group">
              <label className="send-field-label">Recipient</label>
              <div className="send-input-shell send-input-shell-action">
                <Input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Search or paste"
                  className="send-recipient-input"
                />
                <button
                  type="button"
                  className="biometric-inline-button"
                  onClick={() => void handleOpenRecipientScanner()}
                  aria-label={recipientScannerVisible && !isPopupSurface ? 'Close recipient QR scanner' : 'Scan recipient QR'}
                  title={recipientScannerVisible && !isPopupSurface ? 'Close scanner' : 'Scan recipient QR'}
                >
                  <QrCode size={16} />
                </button>
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
            </div>

            {recentRecipients.length > 0 ? (
              <div className="send-field-group">
                <label className="send-field-label">Recent</label>
                <div className="recipient-list">
                  {recentRecipients.map((entry) => (
                    <div key={entry.address} className={`recipient-chip-shell ${recipient === entry.address ? 'active' : ''}`.trim()}>
                      <button
                        type="button"
                        className={`recipient-chip ${recipient === entry.address ? 'active' : ''}`.trim()}
                        onClick={() => setRecipient(entry.address)}
                        title={entry.address}
                      >
                        <span className="mono">{formatAddress(entry.address)}</span>
                      </button>
                      <button
                        type="button"
                        className="recipient-chip-remove"
                        aria-label={`Remove recent recipient ${entry.address}`}
                        title="Remove recent recipient"
                        onClick={() => void handleRecentRecipientRemove(entry.address)}
                      >
                        <X size={12} />
                      </button>
                    </div>
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

        {solanaGasWarning ? <p className="warning-box">{solanaGasWarning}</p> : null}
        {sendError ? <p className="danger-box">{sendError}</p> : null}
        {surfaceError ? <p className="danger-box">{surfaceError}</p> : null}

        <div className="inline wrap-actions send-flow-actions">
          <Button
            className="button-block"
            disabled={
              !selectedAsset ||
              !recipient.trim() ||
              !amount.trim() ||
              (isCustomEvmToken && (customEvmTokenLoading || !customEvmTokenPreview))
            }
            onClick={handleSend}
          >
            Send now
          </Button>
        </div>
      </>
    );
  }

  function renderReceive() {
    return (
      <>
        <Card className="receive-panel">
          <div className="receive-card">
            {receiveQr ? (
              <div className="receive-qr-shell">
                <img className="receive-qr" src={receiveQr} alt="Wallet address QR code" />
              </div>
            ) : null}
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
                View on Explorer
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
    const trackedReputationCount = wallet.trackedReputationSpaceIds.length;
    const trackedVerificationCount = wallet.trackedVerificationSpaceIds.length;
    const trackedGovernanceCount = wallet.trackedGovernanceDaoIds.length;

    const toggleSettingsSection = (section: 'wallet' | 'reputation' | 'verification' | 'governance') => {
      setExpandedSettingsSections((previous) => {
        const next = new Set(previous);
        if (next.has(section)) {
          next.delete(section);
        } else {
          next.add(section);
        }
        return next;
      });
    };

    const renderSettingsSection = (props: {
      section: 'wallet' | 'reputation' | 'verification' | 'governance';
      title: string;
      summary: string;
      error?: string | null;
      children: ReactNode;
    }) => {
      const isExpanded = expandedSettingsSections.has(props.section);

      return (
        <Card className="settings-section-card">
          <button type="button" className="settings-section-toggle" onClick={() => toggleSettingsSection(props.section)}>
            <div className="settings-section-toggle-copy">
              <strong>{props.title}</strong>
              <span className="settings-section-summary">{props.summary}</span>
            </div>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {isExpanded ? props.children : null}
          {props.error ? <p className="danger-box">{props.error}</p> : null}
        </Card>
      );
    };

    return (
      <>
        {renderSettingsSection({
          section: 'wallet',
          title: 'Wallet',
          summary: `${selectedNetworkLabel} • ${permissions.length} connected site${permissions.length === 1 ? '' : 's'}`,
          children: (
          <div className="stack">
            <label className="stack">
              <span className="muted">Chain</span>
              {renderChainSwitcher()}
            </label>
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
                {isMonadChain || isEthereumChain ? (
                  <>
                    <option value="mainnet-beta">Mainnet</option>
                    <option value="devnet">{isEthereumChain ? 'Sepolia' : 'Testnet'}</option>
                  </>
                ) : (
                  <>
                    <option value="devnet">Devnet</option>
                    <option value="mainnet-beta">{isSuiChain ? 'Mainnet' : 'Mainnet Beta'}</option>
                  </>
                )}
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
                  <small className="muted">
                    Use a custom endpoint for {isSuiChain || isMonadChain || isEthereumChain ? selectedNetworkLabel : wallet.selectedNetwork}.
                  </small>
                </span>
              </label>
              {customRpcEnabled ? (
                <>
                  <Input
                    type="url"
                    value={customRpcInput}
                    onChange={(event) => setCustomRpcInput(event.target.value)}
                    placeholder={
                      isSuiChain
                        ? 'Custom Sui RPC URL'
                        : isMonadChain
                          ? 'Custom Monad RPC URL'
                          : isEthereumChain
                            ? 'Custom Ethereum RPC URL'
                            : `Custom ${wallet.selectedNetwork} RPC URL`
                    }
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
                            await sendRuntimeMessage(
                              isSuiChain
                                ? {
                                    type: 'wallet_set_sui_custom_rpc',
                                    rpcUrl: null
                                  }
                                : isMonadChain
                                  ? {
                                      type: 'wallet_set_monad_custom_rpc',
                                      rpcUrl: null
                                    }
                                  : isEthereumChain
                                    ? {
                                        type: 'wallet_set_ethereum_custom_rpc',
                                        rpcUrl: null
                                      }
                                : {
                                    type: 'wallet_set_custom_rpc',
                                    network: wallet.selectedNetwork,
                                    rpcUrl: null
                                  }
                            );
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
                      await sendRuntimeMessage(
                        isSuiChain
                          ? {
                              type: 'wallet_set_sui_custom_rpc',
                              rpcUrl: null
                            }
                          : isMonadChain
                            ? {
                                type: 'wallet_set_monad_custom_rpc',
                                rpcUrl: null
                              }
                            : isEthereumChain
                              ? {
                                  type: 'wallet_set_ethereum_custom_rpc',
                                  rpcUrl: null
                                }
                          : {
                              type: 'wallet_set_custom_rpc',
                              network: wallet.selectedNetwork,
                              rpcUrl: null
                            }
                      );
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
            <div className="settings-row">
              <span className="muted">Version</span>
              <strong className="mono">{APP_VERSION}</strong>
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
                <span className="muted">Grape Verification</span>
                <strong>{state.access.granted ? 'Verified' : 'Required'}</strong>
              </div>
              <p className="muted">
                Verification is remembered on this device after one successful check.
              </p>
              <div className="inline wrap-actions">
                <Button
                  tone="secondary"
                  onClick={async () => {
                    try {
                      setAccessSettingsBusy(true);
                      setAccessError(null);
                      await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_refresh_access' });
                      await refresh();
                    } catch (error) {
                      setAccessError(error instanceof Error ? error.message : 'Unable to re-check Grape Verification.');
                    } finally {
                      setAccessSettingsBusy(false);
                    }
                  }}
                  disabled={accessSettingsBusy}
                >
                  {accessSettingsBusy ? 'Checking...' : 'Re-check verification'}
                </Button>
                <Button
                  tone="secondary"
                  onClick={async () => {
                      setAccessSettingsBusy(true);
                    try {
                      setAccessError(null);
                      await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_clear_access' });
                      await refresh();
                    } catch (error) {
                      setAccessError(error instanceof Error ? error.message : 'Unable to clear remembered verification.');
                    } finally {
                      setAccessSettingsBusy(false);
                    }
                  }}
                  disabled={accessSettingsBusy}
                >
                  Clear verification
                </Button>
              </div>
              {state.access.grantedAt ? (
                <p className="muted">Granted {new Date(state.access.grantedAt).toLocaleString()}</p>
              ) : null}
              {state.access.lastCheckedAt ? (
                <p className="muted">Last checked {new Date(state.access.lastCheckedAt).toLocaleString()}</p>
              ) : null}
              {accessError ? <p className="danger-box">{accessError}</p> : null}
            </div>
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
          )
        })}
        {renderSettingsSection({
          section: 'reputation',
          title: 'OG Reputation Spaces',
          summary: trackedReputationCount > 0 ? `${trackedReputationCount} tracked` : 'No spaces tracked',
          error: reputationSpaceError,
          children: (
          <div className="stack">
            <p className="muted">
              Add the reputation spaces this wallet is part of, and Grape will track the wallet&apos;s points in each
              space directly.
            </p>
            {selectedChain !== 'solana' ? (
              <p className="muted">Tracked reputation spaces are currently supported for Solana wallets.</p>
            ) : (
              <>
                <div className="inline wrap-actions">
                  <Input
                    value={reputationSpaceInput}
                    onChange={(event) => setReputationSpaceInput(event.target.value)}
                    placeholder="Add reputation space DAO id"
                  />
                  <Button onClick={() => void handleAddReputationSpace()} disabled={reputationSpaceSaving || !reputationSpaceInput.trim()}>
                    {reputationSpaceSaving ? 'Saving...' : 'Add space'}
                  </Button>
                </div>
                {wallet.trackedReputationSpaceIds.length > 0 ? (
                  <div className="reputation-space-list">
                    {wallet.trackedReputationSpaceIds.map((daoId) => (
                      <div key={daoId} className="reputation-space-row">
                        <div className="stack compact-stack">
                          <strong>{formatAddress(daoId)}</strong>
                          <span className="muted mono settings-inline-value">{daoId}</span>
                        </div>
                        <div className="reputation-space-actions">
                          <Button tone="secondary" onClick={() => window.open(buildOgReputationSpaceUrl(daoId), '_blank', 'noopener,noreferrer')}>
                            Open
                          </Button>
                          <Button tone="secondary" onClick={() => void handleRemoveReputationSpace(daoId)} disabled={reputationSpaceSaving}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No reputation spaces are tracked yet.</p>
                )}
              </>
            )}
          </div>
          )
        })}
        {renderSettingsSection({
          section: 'verification',
          title: 'Verification Spaces',
          summary: trackedVerificationCount > 0 ? `${trackedVerificationCount} tracked` : 'No spaces tracked',
          error: verificationSpaceError,
          children: (
          <div className="stack">
            <p className="muted">
              Add the DAO ids you want to verify against. Grape will read this wallet&apos;s linked verification
              identities on-chain and send users to Grape Verification for the actual verify and manage flow.
            </p>
            {selectedChain !== 'solana' ? (
              <p className="muted">Tracked verification spaces are currently supported for Solana wallets.</p>
            ) : (
              <>
                <div className="inline wrap-actions">
                  <Input
                    value={verificationSpaceInput}
                    onChange={(event) => setVerificationSpaceInput(event.target.value)}
                    placeholder="Add verification space DAO id"
                  />
                  <Button
                    onClick={() => void handleAddVerificationSpace()}
                    disabled={verificationSpaceSaving || !verificationSpaceInput.trim()}
                  >
                    {verificationSpaceSaving ? 'Saving...' : 'Add space'}
                  </Button>
                </div>
                {wallet.trackedVerificationSpaceIds.length > 0 ? (
                  <div className="reputation-space-list">
                    {wallet.trackedVerificationSpaceIds.map((daoId) => (
                      <div key={daoId} className="reputation-space-row">
                        <div className="stack compact-stack">
                          <strong>{verificationDaoNameMap.get(daoId) ?? formatAddress(daoId)}</strong>
                          <span className="muted mono settings-inline-value">{daoId}</span>
                        </div>
                        <div className="reputation-space-actions">
                          <Button tone="secondary" onClick={() => window.open(buildVerificationSpaceUrl(daoId), '_blank', 'noopener,noreferrer')}>
                            Open
                          </Button>
                          <Button tone="secondary" onClick={() => void handleRemoveVerificationSpace(daoId)} disabled={verificationSpaceSaving}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No verification spaces are tracked yet.</p>
                )}
              </>
            )}
          </div>
          )
        })}
        {renderSettingsSection({
          section: 'governance',
          title: 'Governance DAOs',
          summary:
            detectedGovernanceDaoIds.size > 0
              ? `${detectedGovernanceDaoIds.size} detected • ${trackedGovernanceCount} tracked`
              : trackedGovernanceCount > 0
                ? `${trackedGovernanceCount} tracked`
                : 'No DAOs detected',
          error: governanceDaoError,
          children: (
          <div className="stack">
            <p className="muted">
              Grape auto-detects the Solana DAOs this wallet participates in from governance membership records. You
              can also add extra realm ids manually if you want to track them explicitly.
            </p>
            {selectedChain !== 'solana' ? (
              <p className="muted">Governance proposal tracking is currently supported for Solana wallets.</p>
            ) : (
              <>
                <div className="stack">
                  <div className="inline wrap-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="stack compact-stack" style={{ flex: 1 }}>
                      <strong>Scan wallet holdings</strong>
                      <p className="muted" style={{ margin: 0 }}>
                        Find DAOs where this wallet holds more than 0 of the community or council token, then jump
                        straight to deposit.
                      </p>
                    </div>
                    <Button onClick={() => void handleScanGovernanceEligibility()} disabled={governanceEligibilityLoading}>
                      {governanceEligibilityLoading ? 'Scanning...' : 'Scan'}
                    </Button>
                  </div>
                  {governanceEligibility.length > 0 ? (
                    <div className="reputation-space-list">
                      {governanceEligibility.map((dao) => {
                        const isDetected = detectedGovernanceDaoIds.has(dao.daoId);
                        const isTracked = governance.trackedDaos.includes(dao.daoId);
                        const matchedLabels = [
                          dao.matchesCommunity ? `Community: ${dao.communityAmountLabel ?? 'Eligible'}` : null,
                          dao.matchesCouncil ? `Council: ${dao.councilAmountLabel ?? 'Eligible'}` : null
                        ].filter((value): value is string => !!value);
                        return (
                          <div key={`eligible:${dao.daoId}`} className="reputation-space-row">
                            <div className="stack compact-stack">
                              <div className="inline wrap-actions">
                                <strong>{dao.realmName}</strong>
                                {dao.matchesCommunity ? <StatusPill tone="neutral">Community</StatusPill> : null}
                                {dao.matchesCouncil ? <StatusPill tone="neutral">Council</StatusPill> : null}
                                {isDetected ? <StatusPill tone="success">Detected</StatusPill> : null}
                                {!isDetected && isTracked ? <StatusPill tone="neutral">Tracked</StatusPill> : null}
                              </div>
                              <span className="muted mono settings-inline-value">{dao.daoId}</span>
                              <span className="muted">{matchedLabels.join(' • ')}</span>
                            </div>
                            <div className="reputation-space-actions">
                              {!isDetected && !isTracked ? (
                                <Button
                                  tone="secondary"
                                  onClick={() => void handleSaveGovernanceDaos([...wallet.trackedGovernanceDaoIds, dao.daoId])}
                                  disabled={governanceDaoSaving}
                                >
                                  Track
                                </Button>
                              ) : null}
                              <Button
                                tone="secondary"
                                onClick={() => window.open(buildGovernanceDaoUrl(dao.daoId), '_blank', 'noopener,noreferrer')}
                              >
                                Deposit
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : governanceEligibilityScanned && !governanceEligibilityLoading && !governanceEligibilityError ? (
                    <p className="muted">No eligible governance DAOs were found from this wallet&apos;s positive token balances.</p>
                  ) : null}
                  {governanceEligibilityError ? <p className="danger-box">{governanceEligibilityError}</p> : null}
                </div>
                {governance.daos.length > 0 ? (
                  <div className="stack">
                    <strong>DAO Memberships</strong>
                    <div className="governance-dao-list">
                      {governance.daos
                        .filter((dao: GovernanceDaoSummary) => {
                          const c = BigInt(dao.communityVotingPower ?? '0');
                          const k = BigInt(dao.councilVotingPower ?? '0');
                          const dc = BigInt(dao.delegateCommunityVotingPower ?? '0');
                          const dk = BigInt(dao.delegateCouncilVotingPower ?? '0');
                          return c > 0n || k > 0n || dc > 0n || dk > 0n;
                        })
                        .sort((a: GovernanceDaoSummary, b: GovernanceDaoSummary) => {
                          const decA = BigInt(10 ** (a.communityTokenDecimals ?? 0));
                          const decB = BigInt(10 ** (b.communityTokenDecimals ?? 0));
                          const totalA = (BigInt(a.communityVotingPower ?? '0') + BigInt(a.delegateCommunityVotingPower ?? '0')) / decA
                            + BigInt(a.councilVotingPower ?? '0') + BigInt(a.delegateCouncilVotingPower ?? '0');
                          const totalB = (BigInt(b.communityVotingPower ?? '0') + BigInt(b.delegateCommunityVotingPower ?? '0')) / decB
                            + BigInt(b.councilVotingPower ?? '0') + BigInt(b.delegateCouncilVotingPower ?? '0');
                          return totalB > totalA ? 1 : totalB < totalA ? -1 : 0;
                        })
                        .map((dao: GovernanceDaoSummary) => {
                          const communityPower = BigInt(dao.communityVotingPower ?? '0');
                          const councilPower = BigInt(dao.councilVotingPower ?? '0');
                          const delegateCommunityPower = BigInt(dao.delegateCommunityVotingPower ?? '0');
                          const delegateCouncilPower = BigInt(dao.delegateCouncilVotingPower ?? '0');
                          const dec = dao.communityTokenDecimals ?? 0;
                          const isExpanded = expandedDaoIds.has(dao.daoId);
                          const toggle = () => setExpandedDaoIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(dao.daoId)) next.delete(dao.daoId); else next.add(dao.daoId);
                            return next;
                          });
                          const isMember = communityPower > 0n || councilPower > 0n;
                          const isDelegate = delegateCommunityPower > 0n || delegateCouncilPower > 0n || dao.delegateCount > 0;
                          return (
                            <div key={dao.daoId} className="governance-dao-row">
                              <button type="button" className="governance-dao-header" onClick={toggle}>
                                <div className="governance-dao-header-left">
                                  <span className="governance-dao-name">{dao.realmName}</span>
                                  {dao.role === 'treasury' && <StatusPill tone="neutral">Treasury</StatusPill>}
                                  {isMember && <StatusPill tone="success">Member</StatusPill>}
                                  {isDelegate && <StatusPill tone="neutral">Delegate</StatusPill>}
                                </div>
                                {isExpanded
                                  ? <ChevronDown size={14} className="governance-dao-chevron" />
                                  : <ChevronRight size={14} className="governance-dao-chevron" />}
                              </button>
                              {isExpanded && (
                                <div className="governance-dao-details">
                                  {communityPower > 0n && (
                                    <div className="governance-dao-stat">
                                      <span className="governance-dao-stat-label">Community votes</span>
                                      <span className="governance-dao-stat-value">{formatVotingPower(communityPower, dec)}</span>
                                    </div>
                                  )}
                                  {councilPower > 0n && (
                                    <div className="governance-dao-stat">
                                      <span className="governance-dao-stat-label">Council votes</span>
                                      <span className="governance-dao-stat-value">{formatVotingPower(councilPower, 0)}</span>
                                    </div>
                                  )}
                                  {delegateCommunityPower > 0n && (
                                    <div className="governance-dao-stat">
                                      <span className="governance-dao-stat-label">
                                        Delegated to you{dao.delegateCount > 0 ? ` (${dao.delegateCount} wallet${dao.delegateCount !== 1 ? 's' : ''})` : ''}
                                      </span>
                                      <span className="governance-dao-stat-value">{formatVotingPower(delegateCommunityPower, dec)}</span>
                                    </div>
                                  )}
                                  {delegateCouncilPower > 0n && (
                                    <div className="governance-dao-stat">
                                      <span className="governance-dao-stat-label">
                                        Delegated council{dao.delegateCount > 0 ? ` (${dao.delegateCount} wallet${dao.delegateCount !== 1 ? 's' : ''})` : ''}
                                      </span>
                                      <span className="governance-dao-stat-value">{formatVotingPower(delegateCouncilPower, 0)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : governance.discoveredDaos.length > 0 ? (
                  <div className="stack">
                    <strong>Detected DAOs</strong>
                    <div className="reputation-space-list">
                      {governance.discoveredDaos.map((daoId) => (
                        <div key={`detected:${daoId}`} className="reputation-space-row">
                          <div className="stack compact-stack">
                            <strong>{formatAddress(daoId)}</strong>
                            <span className="muted mono settings-inline-value">{daoId}</span>
                          </div>
                          <div className="reputation-space-actions">
                            <StatusPill tone="success">Detected</StatusPill>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">No governance DAOs have been auto-detected for this wallet yet.</p>
                )}
                <div className="inline wrap-actions">
                  <Input
                    value={governanceDaoInput}
                    onChange={(event) => setGovernanceDaoInput(event.target.value)}
                    placeholder="Track an extra governance DAO realm id"
                  />
                  <Button onClick={() => void handleAddGovernanceDao()} disabled={governanceDaoSaving || !governanceDaoInput.trim()}>
                    {governanceDaoSaving ? 'Saving...' : 'Add tracked DAO'}
                  </Button>
                </div>
                {wallet.trackedGovernanceDaoIds.length > 0 ? (
                  <div className="stack">
                    <strong>Manual tracked DAOs</strong>
                    <div className="reputation-space-list">
                      {wallet.trackedGovernanceDaoIds.map((daoId) => (
                        <div key={daoId} className="reputation-space-row">
                          <div className="stack compact-stack">
                            <strong>{formatAddress(daoId)}</strong>
                            <span className="muted mono settings-inline-value">{daoId}</span>
                          </div>
                          <div className="reputation-space-actions">
                            <Button tone="secondary" onClick={() => void handleRemoveGovernanceDao(daoId)} disabled={governanceDaoSaving}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">No extra governance DAOs are manually tracked.</p>
                )}
              </>
            )}
          </div>
          )
        })}
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
    if (!isSolanaChain) {
      return (
        <Card title="Security">
          <p className="muted">Security scans and incident response are currently available for Solana wallets only.</p>
        </Card>
      );
    }

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
                  <div key={entry.address} className={`recipient-chip-shell ${incidentSafeWallet === entry.address ? 'active' : ''}`.trim()}>
                    <button
                      type="button"
                      className={`recipient-chip ${incidentSafeWallet === entry.address ? 'active' : ''}`.trim()}
                      onClick={() => setIncidentSafeWallet(entry.address)}
                      title={entry.address}
                    >
                      <span className="mono">{formatAddress(entry.address)}</span>
                    </button>
                    <button
                      type="button"
                      className="recipient-chip-remove"
                      aria-label={`Remove recent recipient ${entry.address}`}
                      title="Remove recent recipient"
                      onClick={() => void handleRecentRecipientRemove(entry.address)}
                    >
                      <X size={12} />
                    </button>
                  </div>
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
    if (!isSolanaChain) {
      return (
        <Card title="Swap">
          <p className="muted">
            {isSuiChain
              ? 'Swaps are coming soon for Sui wallets. Grape currently supports native SUI send and holdings only.'
              : isMonadChain
                ? 'Swaps are coming soon for Monad wallets. Grape currently supports native MON send and holdings only.'
                : 'Swaps are coming soon for Ethereum wallets. Grape currently supports native ETH send and holdings only.'}
          </p>
          <Button tone="secondary" onClick={() => setView('home')}>
            Back to wallet
          </Button>
        </Card>
      );
    }

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
    const activeSwapRoute =
      swapQuote?.routes.find((route) => route.id === swapSelectedRouteId) ??
      swapQuote?.routes[0] ??
      null;
    const quoteOutputValue = activeSwapRoute ? `${activeSwapRoute.outputAmountUi} ${outputAssetSymbol}` : '0';
    const swapPrecisionHint = `${inputAssetSymbol} supports up to ${selectedSwapInputDecimals} decimal place${selectedSwapInputDecimals === 1 ? '' : 's'}.`;

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
      setSwapAmount(formatSwapAmountInput(nextAmount, selectedSwapInputDecimals));
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
      setSwapAmount((current) => sanitizeDecimalInput(current, getSwapAssetDecimals(assetOptions.find((option) => option.id === nextInputId) ?? null)));
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
                              setSwapAmount((current) => sanitizeDecimalInput(current, getSwapAssetDecimals(option)));
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
                      setSwapAmount(sanitizeDecimalInput(event.target.value, selectedSwapInputDecimals));
                      setSwapQuote(null);
                      setSwapResult(null);
                    }}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label="Swap amount"
                  />
                </div>
                <div className="swap-precision-hint muted">{swapPrecisionHint}</div>
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
              {swapQuote.routes.length > 1 ? (
                <div className="swap-route-picker">
                  {swapQuote.routes.map((route) => {
                    const active = route.id === (swapSelectedRouteId ?? swapQuote.selectedRouteId);
                    return (
                      <button
                        key={route.id}
                        type="button"
                        className={`swap-route-option ${active ? 'active' : ''}`.trim()}
                        onClick={() => setSwapSelectedRouteId(route.id)}
                      >
                        <div className="swap-route-option-copy">
                          <strong>{route.label}</strong>
                          <span>{route.routeLabels.length > 0 ? route.routeLabels.join(' -> ') : 'Jupiter route'}</span>
                        </div>
                        <div className="swap-route-option-meta">
                          <strong>{route.outputAmountUi}</strong>
                          <span>{route.priceImpactPct ?? 'Impact n/a'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <KeyValueRow label="Estimated output" value={`${activeSwapRoute?.outputAmountUi ?? '0'} ${outputAssetSymbol}`} />
              <KeyValueRow label="Slippage" value={`${swapQuote.slippageBps} bps`} />
              <KeyValueRow label="Price impact" value={activeSwapRoute?.priceImpactPct ?? 'Unavailable'} />
              <KeyValueRow
                label="Route"
                value={activeSwapRoute?.routeLabels.length ? activeSwapRoute.routeLabels.join(' -> ') : 'Jupiter route'}
              />
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

  function renderBridge() {
    const sourceChainOption = VISIBLE_CHAIN_OPTIONS.find((option) => option.id === selectedChain) ?? VISIBLE_CHAIN_OPTIONS[0];
    const destinationChainOption =
      VISIBLE_CHAIN_OPTIONS.find((option) => option.id === bridgeDestinationChain) ?? bridgeDestinationChainOptions[0] ?? null;
    const sourceSymbol = assets.nativeSymbol ?? LIFI_NATIVE_SYMBOL[selectedChain];
    const sourceName = assets.nativeName ?? sourceChainOption?.label ?? sourceSymbol;
    const bridgeDestinationAddress = selectedBridgeDestinationAccount?.publicKey ?? null;
    const activeBridgeRoute =
      bridgeQuote?.routes.find((route) => route.id === bridgeSelectedRouteId) ??
      bridgeQuote?.routes[0] ??
      null;
    const bridgeCanExecute = activeBridgeRoute ? hasExecutableBridgeTransaction(activeBridgeRoute.quoteResponse) : false;

    if (isWatchOnlyWallet) {
      return (
        <Card title="Watch-only wallet">
          <p className="warning-box">This wallet can view assets and connect to dApps, but it cannot bridge or sign transactions.</p>
          <Button tone="secondary" onClick={() => setView('home')}>
            Back to wallet
          </Button>
        </Card>
      );
    }

    if (isSuiChain) {
      return (
        <Card title="Bridge">
          <p className="muted">Bridge source is coming soon for Sui wallets.</p>
          <Button tone="secondary" onClick={() => setView('home')}>
            Back to wallet
          </Button>
        </Card>
      );
    }

    if (bridgeDestinationChainOptions.length === 0) {
      return (
        <Card title="Bridge">
          <p className="warning-box">No supported bridge destinations are available for this wallet yet. Add an Ethereum or Monad wallet to bridge from Solana, or switch to another source chain.</p>
          <Button tone="secondary" onClick={() => openExtensionPage('onboarding.html')}>
            Add another wallet
          </Button>
        </Card>
      );
    }

    if (submittingBridge) {
      return (
        <>
          <ActionStatusCard
            tone="warning"
            title="Submitting bridge"
            message="Grape is signing the source-chain transaction and handing it off to the bridge route. Keep this window open until it completes."
          />
          {bridgeError ? <p className="danger-box">{bridgeError}</p> : null}
        </>
      );
    }

    if (bridgeResult) {
      return (
        <>
          <ActionStatusCard tone="success" title="Bridge started" message="Your bridge transaction was submitted successfully. Final settlement can take a little longer across chains.">
            <div className="action-status-details">
              <KeyValueRow label="Signature" value={<span className="mono transfer-signature">{bridgeResult.signature}</span>} />
              <KeyValueRow label="From" value={`${bridgeResult.fromAmountUi} ${bridgeResult.fromSymbol}`} />
              <KeyValueRow label="To" value={`${bridgeResult.toAmountUi} ${bridgeResult.toSymbol}`} />
              <KeyValueRow label="Destination" value={<span className="mono">{formatAddress(bridgeResult.destinationAddress)}</span>} />
            </div>
            <div className="inline wrap-actions action-status-actions">
              <Button
                tone="secondary"
                onClick={() => {
                  setBridgeResult(null);
                  setBridgeQuote(null);
                  setBridgeAmount('');
                }}
              >
                Bridge again
              </Button>
              <Button onClick={() => setView('home')}>Done</Button>
            </div>
          </ActionStatusCard>
          {bridgeError ? <p className="danger-box">{bridgeError}</p> : null}
        </>
      );
    }

    return (
      <>
        <Card className="swap-flow-card bridge-flow-card">
          <div className="send-flow-header">
            <button type="button" className="send-back-button" onClick={() => setView('home')} aria-label="Back to wallet">
              <ArrowLeft size={20} />
            </button>
            <h2>Bridge</h2>
          </div>

          <div className="swap-flow-shell bridge-flow-shell">
            <section className="swap-leg">
              <div className="swap-leg-header">
                <span className="send-field-label">From</span>
              </div>
              <div className="swap-leg-main">
                <div className="send-select-shell swap-select-shell bridge-source-shell">
                  <AssetPickerOptionRow
                    option={{
                      id: selectedChain,
                      name: sourceName,
                      symbol: sourceSymbol,
                      balance: privacyMode ? '***' : homeBalance,
                      logoUri: assets.nativeLogoUri,
                      sol: isSolanaChain
                    }}
                    privacyMode={privacyMode}
                  />
                </div>
                <div className="swap-leg-value-row">
                  <input
                    className="swap-leg-amount"
                    value={bridgeAmount}
                    onChange={(event) => {
                      setBridgeAmount(event.target.value);
                      setBridgeQuote(null);
                      setBridgeResult(null);
                    }}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label="Bridge amount"
                  />
                </div>
              </div>
            </section>

            <button type="button" className="swap-flip-button bridge-center-pill" aria-label="Bridge direction" disabled>
              <ArrowUpRight size={18} />
            </button>

            <section className="swap-leg">
              <div className="swap-leg-header">
                <span className="send-field-label">To</span>
              </div>

              <div className="bridge-destination-grid">
                <DropdownMenu.Root open={bridgeChainPickerOpen} onOpenChange={setBridgeChainPickerOpen}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className={`send-select-shell send-select-button bridge-select-shell ${bridgeChainPickerOpen ? 'open' : ''}`.trim()}
                      aria-label="Select destination chain"
                    >
                      <div className="bridge-select-copy">
                        <span className="chain-switcher-badge">{destinationChainOption?.shortLabel ?? '--'}</span>
                        <div className="bridge-select-text">
                          <strong>{destinationChainOption?.label ?? 'Select chain'}</strong>
                          <span className="muted">Destination chain</span>
                        </div>
                      </div>
                      <ChevronDown className="send-select-chevron" size={18} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="popup-menu-content chain-selector-menu" sideOffset={8} align="start">
                      <div className="popup-menu-section">Bridge destination</div>
                      {bridgeDestinationChainOptions.map((option) => (
                        <DropdownMenu.Item
                          key={option.id}
                          className={`wallet-menu-action ${bridgeDestinationChain === option.id ? 'active' : ''}`.trim()}
                          onSelect={() => {
                            setBridgeDestinationChain(option.id);
                            setBridgeDestinationWalletId('');
                            setBridgeQuote(null);
                            setBridgeResult(null);
                          }}
                        >
                          <span className="wallet-menu-action-copy">
                            <span className="chain-switcher-badge">{option.shortLabel}</span>
                            <span>{option.label}</span>
                          </span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <DropdownMenu.Root open={bridgeWalletPickerOpen} onOpenChange={setBridgeWalletPickerOpen}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className={`send-select-shell send-select-button bridge-select-shell ${bridgeWalletPickerOpen ? 'open' : ''}`.trim()}
                      aria-label="Select destination wallet"
                    >
                      <div className="bridge-select-copy">
                        <span className="wallet-source-badge created" aria-hidden="true">
                          {selectedBridgeDestinationWallet ? selectedBridgeDestinationWallet.name.slice(0, 1).toUpperCase() : '?'}
                        </span>
                        <div className="bridge-select-text">
                          <strong>{selectedBridgeDestinationWallet?.name ?? 'Select wallet'}</strong>
                          <span className="mono muted">{formatAddress(bridgeDestinationAddress ?? undefined)}</span>
                        </div>
                      </div>
                      <ChevronDown className="send-select-chevron" size={18} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="popup-menu-content" sideOffset={8} align="start">
                      <div className="popup-menu-section">Destination wallet</div>
                      <div className="wallet-menu-list">
                        {bridgeDestinationWallets.map((walletEntry) => {
                          const account =
                            walletEntry.accounts.find((candidate) => candidate.id === walletEntry.selectedAccountId) ??
                            walletEntry.accounts[0];
                          return (
                            <button
                              key={walletEntry.id}
                              type="button"
                              className={`wallet-menu-item ${selectedBridgeDestinationWallet?.id === walletEntry.id ? 'active' : ''}`.trim()}
                              onClick={() => {
                                setBridgeDestinationWalletId(walletEntry.id);
                                setBridgeWalletPickerOpen(false);
                                setBridgeQuote(null);
                                setBridgeResult(null);
                              }}
                            >
                              <div className="wallet-menu-copy">
                                <div className="wallet-menu-heading">
                                  <strong>{walletEntry.name}</strong>
                                  <span className="wallet-chain-badge">{destinationChainOption?.shortLabel ?? '--'}</span>
                                </div>
                                <div className="mono muted">{formatAddress(account?.publicKey)}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>

              {bridgeDestinationAddress ? (
                <div className="bridge-destination-preview">
                  <span className="muted">Destination address</span>
                  <span className="mono">{bridgeDestinationAddress}</span>
                </div>
              ) : null}
            </section>
          </div>
        </Card>

        <Card title="Quote">
          {bridgeError ? <p className="danger-box">{bridgeError}</p> : null}
          {quotingBridge ? (
            <p className="muted">Fetching the best route…</p>
          ) : bridgeQuote ? (
            <div className="stack bridge-quote-stack">
              {bridgeQuote.routes.length > 1 ? (
                <div className="swap-route-picker">
                  {bridgeQuote.routes.map((route) => {
                    const active = route.id === (bridgeSelectedRouteId ?? bridgeQuote.selectedRouteId);
                    return (
                      <button
                        key={route.id}
                        type="button"
                        className={`swap-route-option ${active ? 'active' : ''}`.trim()}
                        onClick={() => setBridgeSelectedRouteId(route.id)}
                      >
                        <div className="swap-route-option-copy">
                          <strong>{route.label}</strong>
                          <span>{route.routeLabels.length > 0 ? route.routeLabels.join(' → ') : 'Bridge route'}</span>
                        </div>
                        <div className="swap-route-option-meta">
                          <strong>{route.toAmountUi}</strong>
                          <span>{route.feeUsd ? `$${route.feeUsd}` : 'Fee n/a'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="bridge-quote-grid">
                <KeyValueRow label="You send" value={`${activeBridgeRoute?.fromAmountUi ?? '0'} ${activeBridgeRoute?.fromSymbol ?? sourceSymbol}`} />
                <KeyValueRow label="You receive" value={`${activeBridgeRoute?.toAmountUi ?? '0'} ${activeBridgeRoute?.toSymbol ?? sourceSymbol}`} />
                <KeyValueRow
                  label="Minimum received"
                  value={
                    activeBridgeRoute?.minimumReceivedUi
                      ? `${activeBridgeRoute.minimumReceivedUi} ${activeBridgeRoute.toSymbol}`
                      : 'Unavailable'
                  }
                />
                <KeyValueRow label="Estimated fees" value={activeBridgeRoute?.feeUsd ? `$${activeBridgeRoute.feeUsd}` : 'Unavailable'} />
              </div>
              <KeyValueRow label="Destination" value={`${destinationChainOption?.label ?? bridgeDestinationChain} · ${selectedBridgeDestinationWallet?.name ?? 'Wallet'}`} />
              <KeyValueRow
                label="Route"
                value={activeBridgeRoute?.routeLabels.length ? activeBridgeRoute.routeLabels.join(' → ') : 'Bridge route'}
              />
              {!bridgeCanExecute ? <p className="warning-box">This quoted route is not directly executable in Grape yet. Try a different destination or amount.</p> : null}
            </div>
          ) : (
            <p className="muted">
              Enter an amount and choose a destination wallet. Grape will fetch a route automatically.
            </p>
          )}

          {!canUseUnlockedSigner ? (
            <label className="stack">
              <span className="muted">Password</span>
              <div className="send-input-shell send-input-shell-sign">
                <Input
                  type="password"
                  value={bridgePassword}
                  onChange={(event) => setBridgePassword(event.target.value)}
                  placeholder="Password required to sign"
                  className="send-sign-input"
                />
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
            </label>
          ) : null}

          <div className="inline wrap-actions action-status-actions">
            <Button tone="secondary" onClick={() => void handleGetBridgeQuote()} disabled={quotingBridge || !bridgeAmount.trim() || !bridgeDestinationChain}>
              {quotingBridge ? 'Quoting...' : 'Refresh quote'}
            </Button>
            <Button
              onClick={() => void handleExecuteBridge()}
              disabled={
                !bridgeQuote ||
                !bridgeCanExecute ||
                submittingBridge ||
                quotingBridge ||
                (!canUseUnlockedSigner && !bridgePassword.trim())
              }
            >
              Bridge now
            </Button>
          </div>
        </Card>
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
                : view === 'bridge'
                  ? 'Bridge'
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
                : view === 'bridge'
                  ? 'Bridge native assets across the wallets you already manage in Grape.'
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
      {view === 'bridge' ? renderBridge() : null}
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
