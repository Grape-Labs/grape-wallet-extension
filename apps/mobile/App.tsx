import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, SvgUri, Text as SvgText } from 'react-native-svg';
import {
  Button as PaperButton,
  Checkbox,
  MD3DarkTheme,
  Modal as PaperModal,
  Portal,
  Provider as PaperProvider,
  SegmentedButtons,
  TextInput as PaperTextInput
} from 'react-native-paper';

import { DEFAULT_THEME, type GrapeTheme } from '@grape/core';
import { chains, getMobileTheme, mobileThemes, type MobileThemePalette } from './src/theme';
import {
  addWalletSet,
  addPrivateKeyWallet,
  createBridgeActivity,
  createSwapActivity,
  createEmptyMobileWalletState,
  createSendActivity,
  createWalletMnemonic,
  createPrivateKeyWallet,
  createWalletSet,
  castWalletGovernanceVote,
  executeWalletBridge,
  executeWalletSwap,
  exportMobileWalletPrivateKey,
  type MobileActivity,
  type MobileAsset,
  type MobileSwapQuote,
  type MobileWallet,
  type MobileWalletState,
  getSelectedWallet,
  getWalletBridgeQuote,
  getWalletSwapQuote,
  isValidMnemonic,
  loadMobileWalletState,
  loadWalletReputation,
  loadWalletGovernance,
  removeMobileWallet,
  loadWalletActivity,
  loadWalletAssets,
  persistMobileWalletState,
  sendWalletAsset,
  updateTrackedGovernanceDaos,
  updateTrackedReputationSpaces,
  updateTrackedVerificationSpaces,
  unlockMobileWalletState
} from './src/wallet';
import type { MobileBridgeQuoteSummary } from './src/config';
import { getMobileSupportedBridgeDestinations } from './src/config';
import type {
  MobileGovernanceResponse,
  MobileGovernanceVoteResponse
} from './src/governance';
import type { MobileReputationResponse } from './src/reputation';
import type { WalletMnemonicLength } from '../../packages/solana/src/mnemonic';

const GRAPE_LOGO_IMAGE = require('./assets/grape_logo_white.png');
const THEME_BACKGROUND_ASSETS: Partial<Record<GrapeTheme, number>> = {
  grape: require('./assets/bg_grape_dark.png'),
  comic: require('./assets/bg_comic.png'),
  matrix: require('./assets/bg_matrix.png'),
  tron: require('./assets/bg_tron.png'),
  apple: require('./assets/bg_glass.png'),
  'liquid-chrome': require('./assets/bg_chrome.png')
};

type Screen = 'loading' | 'setup' | 'locked' | 'ready';
type SetupMode = 'create' | 'import';
type ImportKind = 'mnemonic' | 'private-key';
type MainTab = 'home' | 'receive' | 'governance' | 'activity' | 'settings';

function chainMeta(chain: (typeof chains)[number]['id']) {
  return chains.find((item) => item.id === chain) ?? chains[0];
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatActivityTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatWalletSource(wallet: MobileWallet) {
  switch (wallet.source) {
    case 'created':
      return 'Created in Grape';
    case 'imported-private-key':
      return 'Imported private key';
    case 'imported-mnemonic':
    default:
      return 'Imported recovery phrase';
  }
}

function maskValue(value: string, privacyMode: boolean) {
  return privacyMode ? '***' : value;
}

function formatWholeNumberString(value: string | null | undefined) {
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
  type: MobileGovernanceResponse['proposals'][number]['votingPowerType']
) {
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

function buildGovernanceProposalUrl(daoId: string, proposalId: string) {
  return `https://governance.so/proposal/${daoId}/${proposalId}`;
}

function formatGovernanceVoteSourceLabel(
  source: MobileGovernanceResponse['proposals'][number]['voteSources'][number]
) {
  return source.isDelegate
    ? `delegated power from ${shortenAddress(source.governingTokenOwner)}`
    : 'your voting power';
}

function formatRelativeTimeFromNow(targetUnixSeconds: number, nowUnixSeconds = Math.floor(Date.now() / 1000)) {
  const deltaSeconds = Math.trunc(targetUnixSeconds - nowUnixSeconds);
  const absSeconds = Math.abs(deltaSeconds);
  const safeFormat = (value: number, unit: Intl.RelativeTimeFormatUnit) => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        return rtf.format(value, unit);
      }
    } catch {
      // Fall back below for Android/Hermes builds without full Intl support.
    }

    const absValue = Math.abs(value);
    const label = absValue === 1 ? unit.slice(0, -1) : unit;
    if (value === 0) return 'now';
    return value > 0 ? `in ${absValue} ${label}` : `${absValue} ${label} ago`;
  };

  if (absSeconds < 60) {
    return safeFormat(deltaSeconds, 'second');
  }
  if (absSeconds < 3600) {
    return safeFormat(Math.trunc(deltaSeconds / 60), 'minute');
  }
  if (absSeconds < 86400) {
    return safeFormat(Math.trunc(deltaSeconds / 3600), 'hour');
  }
  if (absSeconds < 604800) {
    return safeFormat(Math.trunc(deltaSeconds / 86400), 'day');
  }
  return safeFormat(Math.trunc(deltaSeconds / 604800), 'week');
}

function getGovernanceProposalTimeMeta(
  proposal: MobileGovernanceResponse['proposals'][number],
  nowUnixSeconds = Math.floor(Date.now() / 1000)
) {
  if (!proposal.votingEndsAt) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : proposal.state,
      badgeSuccess: proposal.canVote,
      badgeWarning: proposal.hasVoted,
      metaText: null as string | null,
      noteText: null as string | null,
      votingWindowOpen: true
    };
  }

  const votingWindowOpen = proposal.votingEndsAt > nowUnixSeconds;
  const relativeTime = formatRelativeTimeFromNow(proposal.votingEndsAt, nowUnixSeconds);

  if (votingWindowOpen) {
    return {
      badgeLabel: proposal.canVote ? 'Vote now' : proposal.hasVoted ? 'Voted' : 'Ending',
      badgeSuccess: proposal.canVote,
      badgeWarning: proposal.hasVoted,
      metaText: `Ending ${relativeTime}`,
      noteText: null as string | null,
      votingWindowOpen
    };
  }

  if (proposal.stateCode === 2) {
    return {
      badgeLabel: 'Finalizing',
      badgeSuccess: false,
      badgeWarning: true,
      metaText: `Ended ${relativeTime}`,
      noteText: 'Voting has ended. This proposal is awaiting on-chain finalization.',
      votingWindowOpen
    };
  }

  return {
    badgeLabel: proposal.state === 'Completed' || proposal.state === 'Executing' ? proposal.state : 'Ended',
    badgeSuccess: false,
    badgeWarning: false,
    metaText: `Ended ${relativeTime}`,
    noteText: null as string | null,
    votingWindowOpen
  };
}

function buildOgReputationSpaceUrl(daoId: string) {
  return `https://reputation.governance.so/dao/${daoId}`;
}

function buildVerificationSpaceUrl(daoId: string) {
  return `https://verification.governance.so/?daoId=${encodeURIComponent(daoId)}`;
}

function getAssetSubtitle(asset: MobileAsset, selectedChainLabel: string, selectedChainShort: string) {
  const normalizedName = asset.name.trim().toLowerCase();
  const normalizedChainLabel = selectedChainLabel.trim().toLowerCase();
  const normalizedSymbol = asset.symbol.trim().toUpperCase();
  const normalizedChainShort = selectedChainShort.trim().toUpperCase();

  if (
    (normalizedName === normalizedChainLabel || normalizedName === normalizedSymbol.toLowerCase()) &&
    normalizedSymbol === normalizedChainShort
  ) {
    return null;
  }

  if (normalizedName === normalizedSymbol.toLowerCase()) {
    return null;
  }

  if (asset.chain === 'solana' && asset.address && asset.metadataSource !== 'native') {
    return `${asset.symbol}  ${shortenAddress(asset.address)}`;
  }

  return asset.symbol;
}

function isSvgUri(uri?: string) {
  return typeof uri === 'string' && uri.trim().toLowerCase().includes('.svg');
}

function dedupeVisibleWallets(wallets: MobileWallet[]) {
  const seen = new Set<string>();
  return wallets.filter((wallet) => {
    const key = `${wallet.chain}:${wallet.address.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function openOgReputationSpace(daoId: string) {
  const url = buildOgReputationSpaceUrl(daoId);
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

async function openVerificationSpace(daoId: string) {
  const url = buildVerificationSpaceUrl(daoId);
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [walletState, setWalletState] = useState<MobileWalletState>(createEmptyMobileWalletState());
  const [error, setError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>('create');
  const [mnemonicLength, setMnemonicLength] = useState<WalletMnemonicLength>(12);
  const [generatedMnemonic, setGeneratedMnemonic] = useState(() => createWalletMnemonic(12));
  const [importKind, setImportKind] = useState<ImportKind>('mnemonic');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importPrivateKeyChain, setImportPrivateKeyChain] = useState<MobileWalletState['selectedChain']>('solana');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [confirmBackedUp, setConfirmBackedUp] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [assets, setAssets] = useState<MobileAsset[]>([]);
  const [remoteActivity, setRemoteActivity] = useState<MobileActivity[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [walletListExpanded, setWalletListExpanded] = useState(false);
  const [sendScreenVisible, setSendScreenVisible] = useState(false);
  const [sendAssetId, setSendAssetId] = useState<string | null>(null);
  const [sendAssetPickerVisible, setSendAssetPickerVisible] = useState(false);
  const [sendAssetSearch, setSendAssetSearch] = useState('');
  const [swapScreenVisible, setSwapScreenVisible] = useState(false);
  const [swapInputAssetId, setSwapInputAssetId] = useState<string | null>(null);
  const [swapOutputAssetId, setSwapOutputAssetId] = useState<string | null>(null);
  const [swapInputPickerVisible, setSwapInputPickerVisible] = useState(false);
  const [swapOutputPickerVisible, setSwapOutputPickerVisible] = useState(false);
  const [swapAssetSearch, setSwapAssetSearch] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapQuote, setSwapQuote] = useState<MobileSwapQuote | null>(null);
  const [swapSelectedRouteId, setSwapSelectedRouteId] = useState<string | null>(null);
  const [swapQuoteLoading, setSwapQuoteLoading] = useState(false);
  const [swapExecuteLoading, setSwapExecuteLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [bridgeScreenVisible, setBridgeScreenVisible] = useState(false);
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [bridgeToChain, setBridgeToChain] = useState<MobileWalletState['selectedChain']>('ethereum');
  const [bridgeDestinationWalletId, setBridgeDestinationWalletId] = useState<string | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<MobileBridgeQuoteSummary | null>(null);
  const [bridgeSelectedRouteId, setBridgeSelectedRouteId] = useState<string | null>(null);
  const [bridgeQuoteLoading, setBridgeQuoteLoading] = useState(false);
  const [bridgeExecuteLoading, setBridgeExecuteLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [walletComposerVisible, setWalletComposerVisible] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [reputation, setReputation] = useState<MobileReputationResponse>({
    spaces: [],
    totalPoints: '0',
    totalEffectivePoints: '0',
    source: 'none',
    refreshedAt: Date.now()
  });
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState<string | null>(null);
  const [reputationSpaceInput, setReputationSpaceInput] = useState('');
  const [reputationSaving, setReputationSaving] = useState(false);
  const [verificationSpaceInput, setVerificationSpaceInput] = useState('');
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [governance, setGovernance] = useState<MobileGovernanceResponse>({
    trackedDaos: [],
    discoveredDaos: [],
    memberDaos: 0,
    proposals: [],
    source: 'none',
    network: 'mainnet-beta',
    refreshedAt: Date.now()
  });
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceDaoInput, setGovernanceDaoInput] = useState('');
  const [governanceSaving, setGovernanceSaving] = useState(false);
  const [governanceVotingProposalId, setGovernanceVotingProposalId] = useState<string | null>(null);
  const [governanceVoteError, setGovernanceVoteError] = useState<string | null>(null);
  const [governanceVoteResult, setGovernanceVoteResult] = useState<MobileGovernanceVoteResponse | null>(null);
  const [governanceShowFinalizing, setGovernanceShowFinalizing] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportReveal, setExportReveal] = useState(false);
  const [exportedPrivateKey, setExportedPrivateKey] = useState<string | null>(null);
  const [exportVerifiedWalletId, setExportVerifiedWalletId] = useState<string | null>(null);

  const selectedWallet = useMemo(() => getSelectedWallet(walletState), [walletState]);
  const selectedChainMeta = chainMeta(walletState.selectedChain);
  const activeTheme = useMemo(
    () => getMobileTheme(walletState.selectedTheme ?? DEFAULT_THEME),
    [walletState.selectedTheme]
  );
  const styles = useMemo(() => createStyles(activeTheme), [activeTheme]);
  const backgroundAsset = THEME_BACKGROUND_ASSETS[activeTheme.id];
  const isCompact = width < 390;
  const isWide = width >= 768;
  const contentMaxWidth = isWide ? 680 : 560;
  const screenPadding = isCompact ? 10 : 12;
  const footerInset = isCompact ? 16 : 20;
  const paperTheme = useMemo(
    () => ({
        ...MD3DarkTheme,
        roundness: 7,
        colors: {
          ...MD3DarkTheme.colors,
          primary: activeTheme.grape,
          secondary: '#b57bff',
          background: activeTheme.bg,
          surface: activeTheme.panel,
          surfaceVariant: 'rgba(255,255,255,0.06)',
          outline: activeTheme.panelBorder,
          onSurface: activeTheme.text,
          onSurfaceVariant: activeTheme.muted,
          error: activeTheme.danger
        }
      }),
    [activeTheme]
  );
  const launchFade = useRef(new Animated.Value(0)).current;
  const launchLift = useRef(new Animated.Value(16)).current;
  const launchScale = useRef(new Animated.Value(0.92)).current;
  const launchHalo = useRef(new Animated.Value(0.35)).current;
  const screenEnterOpacity = useRef(new Animated.Value(0)).current;
  const screenEnterLift = useRef(new Animated.Value(12)).current;
  const screenEnterScale = useRef(new Animated.Value(0.98)).current;
  const refreshSpin = useRef(new Animated.Value(0)).current;
  const lockBreathScale = useRef(new Animated.Value(1)).current;
  const lockHaloPulse = useRef(new Animated.Value(0.18)).current;
  const chainWallets = useMemo(
    () => dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === walletState.selectedChain)),
    [walletState.selectedChain, walletState.wallets]
  );
  const walletsByChain = useMemo(
    () =>
      chains
        .map((chain) => ({
          chain,
          wallets: dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === chain.id))
        }))
        .filter((entry) => entry.wallets.length > 0),
    [walletState.wallets]
  );
  const filteredActivity = useMemo(
    () => {
      const local = walletState.activities.filter((activity) => activity.chain === walletState.selectedChain);
      const merged = new Map<string, MobileActivity>();

      [...remoteActivity, ...local].forEach((activity) => {
        const key = activity.signature || activity.id;
        if (!merged.has(key)) {
          merged.set(key, activity);
        }
      });

      return [...merged.values()].sort((left, right) => right.timestamp - left.timestamp);
    },
    [remoteActivity, walletState.activities, walletState.selectedChain]
  );
  const headlineAsset = assets[0];
  const holdingsSummary = assets.length === 0 ? '--' : headlineAsset?.amountLabel ?? '--';
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );
  const totalEffectiveReputationPoints = useMemo(
    () => formatWholeNumberString(reputation.totalEffectivePoints),
    [reputation.totalEffectivePoints]
  );
  const trackedVerificationSpaceCount = useMemo(
    () => walletState.trackedVerificationSpaceIds.length,
    [walletState.trackedVerificationSpaceIds]
  );
  const actionableGovernanceProposalCount = useMemo(
    () => governance.proposals.filter((proposal) => proposal.canVote).length,
    [governance.proposals]
  );
  const totalGovernanceDaoCount = useMemo(
    () => new Set([...governance.discoveredDaos, ...walletState.trackedGovernanceDaoIds]).size,
    [governance.discoveredDaos, walletState.trackedGovernanceDaoIds]
  );
  const selectedSendAsset = useMemo(() => {
    if (sendAssetId) {
      return assets.find((asset) => asset.id === sendAssetId) ?? null;
    }

    return assets[0] ?? null;
  }, [assets, sendAssetId]);
  const filteredSendAssets = useMemo(() => {
    const query = sendAssetSearch.trim().toLowerCase();
    if (!query) {
      return assets;
    }

    return assets.filter((asset) => {
      const haystacks = [
        asset.name,
        asset.symbol,
        asset.address ?? '',
        asset.description ?? ''
      ];

      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [assets, sendAssetSearch]);
  const swappableAssets = useMemo(
    () => (selectedWallet?.chain === 'solana' ? assets.filter((asset) => asset.chain === 'solana') : []),
    [assets, selectedWallet?.chain]
  );
  const selectedSwapInputAsset = useMemo(() => {
    if (swapInputAssetId) {
      return swappableAssets.find((asset) => asset.id === swapInputAssetId) ?? null;
    }

    return swappableAssets[0] ?? null;
  }, [swapInputAssetId, swappableAssets]);
  const swapOutputCandidates = useMemo(
    () => swappableAssets.filter((asset) => asset.id !== selectedSwapInputAsset?.id),
    [selectedSwapInputAsset?.id, swappableAssets]
  );
  const selectedSwapOutputAsset = useMemo(() => {
    if (swapOutputAssetId) {
      return swapOutputCandidates.find((asset) => asset.id === swapOutputAssetId) ?? null;
    }

    return swapOutputCandidates[0] ?? null;
  }, [swapOutputCandidates, swapOutputAssetId]);
  const filteredSwapAssets = useMemo(() => {
    const query = swapAssetSearch.trim().toLowerCase();
    if (!query) {
      return swappableAssets;
    }

    return swappableAssets.filter((asset) =>
      [asset.name, asset.symbol, asset.address ?? '', asset.description ?? ''].some((value) => value.toLowerCase().includes(query))
    );
  }, [swapAssetSearch, swappableAssets]);
  const bridgeDestinationChains = useMemo(() => {
    if (!selectedWallet || selectedWallet.chain === 'sui') {
      return [] as MobileWalletState['selectedChain'][];
    }

    return getMobileSupportedBridgeDestinations(
      selectedWallet.chain as 'solana' | 'ethereum' | 'monad'
    ) as MobileWalletState['selectedChain'][];
  }, [selectedWallet?.chain]);
  const bridgeDestinationWallets = useMemo(
    () => dedupeVisibleWallets(walletState.wallets.filter((wallet) => wallet.chain === bridgeToChain)),
    [bridgeToChain, walletState.wallets]
  );
  const selectedBridgeDestinationWallet = useMemo(() => {
    if (bridgeDestinationWalletId) {
      return bridgeDestinationWallets.find((wallet) => wallet.id === bridgeDestinationWalletId) ?? null;
    }

    return bridgeDestinationWallets[0] ?? null;
  }, [bridgeDestinationWalletId, bridgeDestinationWallets]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await loadMobileWalletState();
        if (!mounted) {
          return;
        }
        setWalletState(state);
        setScreen(state.setup === 'ready' ? 'locked' : 'setup');
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : 'Unable to load mobile wallet state.');
        setScreen('setup');
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkBiometricAvailability() {
      try {
        const [hasHardware, supported, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          LocalAuthentication.isEnrolledAsync()
        ]);

        if (!mounted) {
          return;
        }

        setBiometricAvailable(hasHardware && enrolled && supported.length > 0);
      } catch {
        if (mounted) {
          setBiometricAvailable(false);
        }
      }
    }

    void checkBiometricAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const settle = Animated.parallel([
      Animated.timing(launchFade, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(launchLift, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(launchScale, {
        toValue: 1,
        damping: 16,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true
      })
    ]);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(launchHalo, {
          toValue: 0.62,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(launchHalo, {
          toValue: 0.28,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    settle.start();
    pulse.start();

    return () => {
      settle.stop();
      pulse.stop();
    };
  }, [launchFade, launchHalo, launchLift, launchScale]);

  useEffect(() => {
    if (screen === 'loading') {
      return;
    }

    screenEnterOpacity.setValue(0);
    screenEnterLift.setValue(12);
    screenEnterScale.setValue(0.98);

    Animated.parallel([
      Animated.timing(screenEnterOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(screenEnterLift, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(screenEnterScale, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [screen, screenEnterLift, screenEnterOpacity, screenEnterScale]);

  useEffect(() => {
    if (!assetsLoading) {
      refreshSpin.stopAnimation();
      Animated.timing(refreshSpin, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      return;
    }

    refreshSpin.setValue(0);
    const spinner = Animated.loop(
      Animated.timing(refreshSpin, {
        toValue: 1,
        duration: 880,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    spinner.start();

    return () => {
      spinner.stop();
    };
  }, [assetsLoading, refreshSpin]);

  useEffect(() => {
    if (screen !== 'locked') {
      lockBreathScale.stopAnimation();
      lockHaloPulse.stopAnimation();
      lockBreathScale.setValue(1);
      lockHaloPulse.setValue(0.08);
      return;
    }

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockBreathScale, {
          toValue: 1.012,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1.018,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1.008,
          duration: 170,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockBreathScale, {
          toValue: 1,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockHaloPulse, {
          toValue: 0.065,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.085,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.055,
          duration: 170,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(lockHaloPulse, {
          toValue: 0.04,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );

    breathLoop.start();
    pulseLoop.start();

    return () => {
      breathLoop.stop();
      pulseLoop.stop();
    };
  }, [lockBreathScale, lockHaloPulse, screen]);

  useEffect(() => {
    setGeneratedMnemonic(createWalletMnemonic(mnemonicLength));
    setConfirmBackedUp(false);
  }, [mnemonicLength]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletData() {
      if (!unlocked || !selectedWallet) {
        setAssets([]);
        setRemoteActivity([]);
        return;
      }

      setAssetsLoading(true);
      setActivityLoading(true);
      try {
        const [nextAssets, nextActivity] = await Promise.all([
          loadWalletAssets(selectedWallet),
          loadWalletActivity(selectedWallet).catch(() => [])
        ]);
        if (!mounted) {
          return;
        }
        setAssets(nextAssets);
        setRemoteActivity(nextActivity);
        setError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : 'Unable to load holdings.');
      } finally {
        if (mounted) {
          setAssetsLoading(false);
          setActivityLoading(false);
        }
      }
    }

    void refreshWalletData();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletReputation() {
      if (!unlocked || !selectedWallet || selectedWallet.chain !== 'solana') {
        if (mounted) {
          setReputation({
            spaces: [],
            totalPoints: '0',
            totalEffectivePoints: '0',
            source: 'none',
            refreshedAt: Date.now()
          });
          setReputationError(null);
          setReputationLoading(false);
        }
        return;
      }

      if (walletState.trackedReputationSpaceIds.length === 0) {
        if (mounted) {
          setReputation({
            spaces: [],
            totalPoints: '0',
            totalEffectivePoints: '0',
            source: 'none',
            refreshedAt: Date.now()
          });
          setReputationError(null);
          setReputationLoading(false);
        }
        return;
      }

      setReputationLoading(true);
      try {
        const nextReputation = await loadWalletReputation(selectedWallet, walletState.trackedReputationSpaceIds);
        if (!mounted) {
          return;
        }
        setReputation(nextReputation);
        setReputationError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to load reputation.');
      } finally {
        if (mounted) {
          setReputationLoading(false);
        }
      }
    }

    void refreshWalletReputation();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked, walletState.trackedReputationSpaceIds]);

  useEffect(() => {
    let mounted = true;

    async function refreshWalletGovernance() {
      if (!unlocked || !selectedWallet || selectedWallet.chain !== 'solana') {
        if (mounted) {
          setGovernance({
            trackedDaos: walletState.trackedGovernanceDaoIds,
            discoveredDaos: [],
            memberDaos: 0,
            proposals: [],
            source: 'none',
            network: 'mainnet-beta',
            refreshedAt: Date.now()
          });
          setGovernanceError(null);
          setGovernanceLoading(false);
        }
        return;
      }

      setGovernanceLoading(true);
      try {
        const nextGovernance = await loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds);
        if (!mounted) {
          return;
        }
        setGovernance(nextGovernance);
        setGovernanceError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setGovernance({
          trackedDaos: walletState.trackedGovernanceDaoIds,
          discoveredDaos: [],
          memberDaos: 0,
          proposals: [],
          source: 'none',
          network: 'mainnet-beta',
          refreshedAt: Date.now()
        });
        setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to load governance proposals.');
      } finally {
        if (mounted) {
          setGovernanceLoading(false);
        }
      }
    }

    void refreshWalletGovernance();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked, walletState.trackedGovernanceDaoIds]);

  useEffect(() => {
    setSelectedAssetId(null);
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    setSendRecipient('');
    setSendAmount('');
    setSendAssetId(null);
    setSendScreenVisible(false);
    setSendAssetPickerVisible(false);
    setSendAssetSearch('');
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    setSwapAmount('');
    setSwapQuote(null);
    setSwapSelectedRouteId(null);
    setSwapInputAssetId(null);
    setSwapOutputAssetId(null);
    setSwapAssetSearch('');
    setSwapInputPickerVisible(false);
    setSwapOutputPickerVisible(false);
    setSwapScreenVisible(false);
    setSwapError(null);
  }, [selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    const nextToChain = bridgeDestinationChains[0] ?? 'ethereum';
    setBridgeAmount('');
    setBridgeToChain(nextToChain);
    setBridgeDestinationWalletId(null);
    setBridgeQuote(null);
    setBridgeSelectedRouteId(null);
    setBridgeScreenVisible(false);
    setBridgeError(null);
  }, [bridgeDestinationChains, selectedWallet?.id, walletState.selectedChain]);

  useEffect(() => {
    if (!bridgeDestinationWallets.some((wallet) => wallet.id === bridgeDestinationWalletId)) {
      setBridgeDestinationWalletId(bridgeDestinationWallets[0]?.id ?? null);
    }
  }, [bridgeDestinationWalletId, bridgeDestinationWallets]);

  useEffect(() => {
    setExportPassword('');
    setExportLoading(false);
    setExportReveal(false);
    setExportedPrivateKey(null);
    setExportVerifiedWalletId(null);
  }, [selectedWallet?.id]);

  async function saveState(nextState: MobileWalletState) {
    setWalletState(nextState);
    await persistMobileWalletState(nextState);
  }

  async function handleCreateWallet() {
    if (!confirmBackedUp) {
      setError('Confirm that you backed up the recovery phrase.');
      return;
    }
    if (setupPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitLoading(true);
    try {
      const nextState = await createWalletSet({
        mnemonic: generatedMnemonic,
        password: setupPassword,
        source: 'created'
      });
      setWalletState(nextState);
      setUnlocked(true);
      setScreen('ready');
      setMainTab('home');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to create wallet.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleImportWallet() {
    if (setupPassword.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitLoading(true);
    try {
      const nextState =
        importKind === 'mnemonic'
          ? await createWalletSet({
              mnemonic: importMnemonic.trim(),
              password: setupPassword,
              source: 'imported-mnemonic'
            })
          : await createPrivateKeyWallet({
              chain: importPrivateKeyChain,
              privateKey: importPrivateKey.trim(),
              password: setupPassword
            });
      setWalletState(nextState);
      setUnlocked(true);
      setScreen('ready');
      setMainTab('home');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to import wallet.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleAddWallet() {
    if (setupMode === 'create' && !confirmBackedUp) {
      setError('Confirm that you backed up the recovery phrase.');
      return;
    }

    if (setupMode === 'import' && importKind === 'mnemonic' && !isValidMnemonic(importMnemonic)) {
      setError('Recovery phrase is invalid.');
      return;
    }

    if (setupMode === 'import' && importKind === 'private-key' && !importPrivateKey.trim()) {
      setError('Private key is required.');
      return;
    }

    setSubmitLoading(true);
    try {
      const nextState =
        setupMode === 'create'
          ? await addWalletSet({
              state: walletState,
              mnemonic: generatedMnemonic,
              source: 'created'
            })
          : importKind === 'mnemonic'
            ? await addWalletSet({
                state: walletState,
                mnemonic: importMnemonic.trim(),
                source: 'imported-mnemonic'
              })
            : await addPrivateKeyWallet({
                state: walletState,
                chain: importPrivateKeyChain,
                privateKey: importPrivateKey.trim()
              });
      setWalletState(nextState);
      setWalletListExpanded(true);
      setWalletComposerVisible(false);
      setImportMnemonic('');
      setImportPrivateKey('');
      setConfirmBackedUp(false);
      setGeneratedMnemonic(createWalletMnemonic(mnemonicLength));
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to add wallet.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleUnlock() {
    if (!walletState.passwordHash) {
      setScreen('setup');
      return;
    }

    setSubmitLoading(true);
    try {
      const valid = await unlockMobileWalletState(walletState, unlockPassword);
      if (!valid) {
        setError('Password is incorrect.');
        return;
      }

      setUnlocked(true);
      setScreen('ready');
      setUnlockPassword('');
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to unlock wallet.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleSelectChain(chain: MobileWalletState['selectedChain']) {
    const nextState = {
      ...walletState,
      selectedChain: chain
    };
    await saveState(nextState);
    setWalletListExpanded(false);
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
    setMainTab('home');
  }

  async function handleSelectWallet(walletId: string, chain = walletState.selectedChain) {
    const nextState = {
      ...walletState,
      selectedChain: chain,
      selectedWalletIds: {
        ...walletState.selectedWalletIds,
        [chain]: walletId
      }
    };
    await saveState(nextState);
    setWalletListExpanded(false);
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
  }

  async function handleRefreshAssets() {
    if (!selectedWallet) {
      return;
    }

    setAssetsLoading(true);
    setActivityLoading(true);
    setGovernanceLoading(selectedWallet.chain === 'solana');
    try {
      const [nextAssets, nextActivity, nextReputation, nextGovernance] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => []),
        selectedWallet.chain === 'solana'
          ? loadWalletReputation(selectedWallet, walletState.trackedReputationSpaceIds).catch(() => ({
              spaces: [],
              totalPoints: '0',
              totalEffectivePoints: '0',
              source: 'none' as const,
              refreshedAt: Date.now()
            }))
          : Promise.resolve({
              spaces: [],
              totalPoints: '0',
              totalEffectivePoints: '0',
              source: 'none' as const,
              refreshedAt: Date.now()
            }),
        selectedWallet.chain === 'solana'
          ? loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds).catch(() => ({
              trackedDaos: walletState.trackedGovernanceDaoIds,
              discoveredDaos: [],
              memberDaos: 0,
              proposals: [],
              source: 'none' as const,
              network: 'mainnet-beta' as const,
              refreshedAt: Date.now()
            }))
          : Promise.resolve({
              trackedDaos: walletState.trackedGovernanceDaoIds,
              discoveredDaos: [],
              memberDaos: 0,
              proposals: [],
              source: 'none' as const,
              network: 'mainnet-beta' as const,
              refreshedAt: Date.now()
            })
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setReputation(nextReputation);
      setGovernance(nextGovernance);
      setReputationError(null);
      setGovernanceError(null);
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to refresh holdings.');
    } finally {
      setAssetsLoading(false);
      setActivityLoading(false);
      setGovernanceLoading(false);
    }
  }

  async function handleSend() {
    if (!selectedWallet || !selectedSendAsset) {
      return;
    }
    if (!sendRecipient.trim() || !sendAmount.trim()) {
      setError('Enter a recipient and amount.');
      return;
    }

    setSendLoading(true);
    try {
      const signature = await sendWalletAsset({
        wallet: selectedWallet,
        asset: selectedSendAsset,
        recipient: sendRecipient.trim(),
        amount: sendAmount.trim()
      });

      const activity = createSendActivity({
        wallet: selectedWallet,
        asset: selectedSendAsset,
        recipient: sendRecipient.trim(),
        amountLabel: `${sendAmount.trim()} ${selectedSendAsset.symbol}`,
        signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setSendRecipient('');
      setSendAmount('');
      setSendAssetId(null);
      setSendScreenVisible(false);
      setError(null);
      Alert.alert('Sent', `Transaction submitted.\n\n${signature}`);
      const nextAssets = await loadWalletAssets(selectedWallet);
      setAssets(nextAssets);
      setMainTab('activity');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to send asset.');
    } finally {
      setSendLoading(false);
    }
  }

  async function handleGetSwapQuote() {
    if (!selectedWallet || !selectedSwapInputAsset || !selectedSwapOutputAsset) {
      setSwapError('Choose both swap assets first.');
      return;
    }
    if (!swapAmount.trim()) {
      setSwapError('Enter an amount to swap.');
      return;
    }

    setSwapQuoteLoading(true);
    setSwapError(null);
    try {
      const nextQuote = await getWalletSwapQuote({
        wallet: selectedWallet,
        inputAsset: selectedSwapInputAsset,
        outputAsset: selectedSwapOutputAsset,
        amount: swapAmount.trim(),
        slippageBps: 50
      });
      setSwapQuote(nextQuote);
      setSwapSelectedRouteId(nextQuote.selectedRouteId);
    } catch (unknownError) {
      setSwapQuote(null);
      setSwapSelectedRouteId(null);
      setSwapError(unknownError instanceof Error ? unknownError.message : 'Unable to fetch a swap quote.');
    } finally {
      setSwapQuoteLoading(false);
    }
  }

  async function handleExecuteSwap() {
    if (!selectedWallet || !selectedSwapInputAsset || !selectedSwapOutputAsset || !swapQuote) {
      return;
    }

    const activeRoute = swapQuote.routes.find((route) => route.id === swapSelectedRouteId) ?? swapQuote.routes[0];
    if (!activeRoute) {
      setSwapError('Choose a route before swapping.');
      return;
    }

    setSwapExecuteLoading(true);
    setSwapError(null);
    try {
      const result = await executeWalletSwap({
        wallet: selectedWallet,
        quoteResponse: activeRoute.quoteResponse
      });
      const activity = createSwapActivity({
        wallet: selectedWallet,
        inputAsset: selectedSwapInputAsset,
        outputAsset: selectedSwapOutputAsset,
        inputAmountLabel: `${result.inputAmountUi} ${selectedSwapInputAsset.symbol}`,
        outputAmountLabel: `${result.outputAmountUi} ${selectedSwapOutputAsset.symbol}`,
        signature: result.signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setSwapAmount('');
      setSwapQuote(null);
      setSwapSelectedRouteId(null);
      setSwapScreenVisible(false);
      Alert.alert('Swap submitted', `${result.inputAmountUi} ${selectedSwapInputAsset.symbol} -> ${result.outputAmountUi} ${selectedSwapOutputAsset.symbol}`);
      const [nextAssets, nextActivity] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => [])
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setMainTab('activity');
    } catch (unknownError) {
      setSwapError(unknownError instanceof Error ? unknownError.message : 'Unable to execute the swap.');
    } finally {
      setSwapExecuteLoading(false);
    }
  }

  async function handleGetBridgeQuote() {
    if (!selectedWallet || !selectedBridgeDestinationWallet) {
      setBridgeError('Choose a destination wallet first.');
      return;
    }
    if (!bridgeAmount.trim()) {
      setBridgeError('Enter an amount to bridge.');
      return;
    }

    setBridgeQuoteLoading(true);
    setBridgeError(null);
    try {
      const nextQuote = await getWalletBridgeQuote({
        state: walletState,
        wallet: selectedWallet,
        amount: bridgeAmount.trim(),
        toChain: bridgeToChain,
        destinationWalletId: selectedBridgeDestinationWallet.id
      });
      setBridgeQuote(nextQuote);
      setBridgeSelectedRouteId(nextQuote.selectedRouteId);
    } catch (unknownError) {
      setBridgeQuote(null);
      setBridgeSelectedRouteId(null);
      setBridgeError(unknownError instanceof Error ? unknownError.message : 'Unable to fetch a bridge quote.');
    } finally {
      setBridgeQuoteLoading(false);
    }
  }

  async function handleExecuteBridge() {
    if (!selectedWallet || !selectedBridgeDestinationWallet || !bridgeQuote) {
      return;
    }

    const activeRoute = bridgeQuote.routes.find((route) => route.id === bridgeSelectedRouteId) ?? bridgeQuote.routes[0];
    if (!activeRoute) {
      setBridgeError('Choose a route before bridging.');
      return;
    }

    setBridgeExecuteLoading(true);
    setBridgeError(null);
    try {
      const result = await executeWalletBridge({
        state: walletState,
        wallet: selectedWallet,
        quoteResponse: activeRoute.quoteResponse,
        toChain: bridgeToChain,
        destinationWalletId: selectedBridgeDestinationWallet.id
      });
      const activity = createBridgeActivity({
        wallet: selectedWallet,
        destinationWallet: selectedBridgeDestinationWallet,
        fromAmountLabel: `${result.fromAmountUi} ${result.fromSymbol}`,
        toAmountLabel: `${result.toAmountUi} ${result.toSymbol}`,
        signature: result.signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setBridgeAmount('');
      setBridgeQuote(null);
      setBridgeSelectedRouteId(null);
      setBridgeScreenVisible(false);
      Alert.alert('Bridge submitted', `${result.fromAmountUi} ${result.fromSymbol} -> ${result.toAmountUi} ${result.toSymbol}`);
      const [nextAssets, nextActivity] = await Promise.all([
        loadWalletAssets(selectedWallet),
        loadWalletActivity(selectedWallet).catch(() => [])
      ]);
      setAssets(nextAssets);
      setRemoteActivity(nextActivity);
      setMainTab('activity');
    } catch (unknownError) {
      setBridgeError(unknownError instanceof Error ? unknownError.message : 'Unable to execute the bridge.');
    } finally {
      setBridgeExecuteLoading(false);
    }
  }

  async function handleShareAddress() {
    if (!selectedWallet) {
      return;
    }

    await Share.share({
      title: `${selectedWallet.name} address`,
      message: `${selectedWallet.name}\n${selectedWallet.address}`
    });
  }

  async function handleSetPrivacyMode(value: boolean) {
    await saveState({
      ...walletState,
      privacyMode: value
    });
  }

  async function handleSetBiometricEnabled(value: boolean) {
    const nextState: MobileWalletState = {
      ...walletState,
      biometricEnabled: value
    };
    setWalletState(nextState);
    await persistMobileWalletState(nextState);
  }

  async function handleSetTheme(theme: GrapeTheme) {
    if (theme === walletState.selectedTheme) {
      return;
    }

    await saveState({
      ...walletState,
      selectedTheme: theme
    });
  }

  async function handleAddReputationSpace() {
    const daoId = reputationSpaceInput.trim();
    if (!daoId) {
      return;
    }

    setReputationSaving(true);
    try {
      const nextState = await updateTrackedReputationSpaces({
        state: walletState,
        daoIds: [...walletState.trackedReputationSpaceIds, daoId]
      });
      setWalletState(nextState);
      setReputationSpaceInput('');
      setReputationError(null);
    } catch (unknownError) {
      setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to add reputation space.');
    } finally {
      setReputationSaving(false);
    }
  }

  async function handleRemoveReputationSpace(daoId: string) {
    setReputationSaving(true);
    try {
      const nextState = await updateTrackedReputationSpaces({
        state: walletState,
        daoIds: walletState.trackedReputationSpaceIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setReputationError(null);
    } catch (unknownError) {
      setReputationError(unknownError instanceof Error ? unknownError.message : 'Unable to remove reputation space.');
    } finally {
      setReputationSaving(false);
    }
  }

  async function handleAddVerificationSpace() {
    const daoId = verificationSpaceInput.trim();
    if (!daoId) {
      return;
    }
    if (walletState.trackedVerificationSpaceIds.includes(daoId)) {
      setVerificationError('That verification space is already tracked.');
      return;
    }

    setVerificationSaving(true);
    try {
      const nextState = await updateTrackedVerificationSpaces({
        state: walletState,
        daoIds: [...walletState.trackedVerificationSpaceIds, daoId]
      });
      setWalletState(nextState);
      setVerificationSpaceInput('');
      setVerificationError(null);
    } catch (unknownError) {
      setVerificationError(unknownError instanceof Error ? unknownError.message : 'Unable to add verification space.');
    } finally {
      setVerificationSaving(false);
    }
  }

  async function handleRemoveVerificationSpace(daoId: string) {
    setVerificationSaving(true);
    try {
      const nextState = await updateTrackedVerificationSpaces({
        state: walletState,
        daoIds: walletState.trackedVerificationSpaceIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setVerificationError(null);
    } catch (unknownError) {
      setVerificationError(unknownError instanceof Error ? unknownError.message : 'Unable to remove verification space.');
    } finally {
      setVerificationSaving(false);
    }
  }

  async function handleAddGovernanceDao() {
    const daoId = governanceDaoInput.trim();
    if (!daoId) {
      return;
    }
    if (walletState.trackedGovernanceDaoIds.includes(daoId)) {
      setGovernanceError('That governance DAO is already tracked.');
      return;
    }
    if (governance.discoveredDaos.includes(daoId)) {
      setGovernanceError('That governance DAO is already auto-detected for this wallet.');
      return;
    }

    setGovernanceSaving(true);
    try {
      const nextState = await updateTrackedGovernanceDaos({
        state: walletState,
        daoIds: [...walletState.trackedGovernanceDaoIds, daoId]
      });
      setWalletState(nextState);
      setGovernanceDaoInput('');
      setGovernanceError(null);
    } catch (unknownError) {
      setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to add governance DAO.');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function handleRemoveGovernanceDao(daoId: string) {
    setGovernanceSaving(true);
    try {
      const nextState = await updateTrackedGovernanceDaos({
        state: walletState,
        daoIds: walletState.trackedGovernanceDaoIds.filter((entry) => entry !== daoId)
      });
      setWalletState(nextState);
      setGovernanceError(null);
    } catch (unknownError) {
      setGovernanceError(unknownError instanceof Error ? unknownError.message : 'Unable to remove governance DAO.');
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function handleGovernanceVote(input: {
    daoId: string;
    governanceId: string;
    proposalId: string;
    proposalOwnerRecordId: string;
    tokenOwnerRecordId: string | null;
    governingTokenMint: string;
    voteKind: 'approve' | 'deny' | 'abstain';
    choiceRank?: number;
    voteSources?: MobileGovernanceResponse['proposals'][number]['voteSources'];
  }) {
    if (!selectedWallet) {
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
        const includeDelegates = await new Promise<boolean>((resolve) => {
          Alert.alert('Delegated voting power', delegatePrompt, [
            { text: 'Only mine', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Vote all', onPress: () => resolve(true) }
          ], {
            cancelable: true,
            onDismiss: () => resolve(false)
          });
        });
        if (includeDelegates) {
          selectedSources.push(...delegatedVoteSources);
        }
      }

      let result: MobileGovernanceVoteResponse | null = null;
      for (const source of selectedSources) {
        result = await castWalletGovernanceVote({
          state: walletState,
          wallet: selectedWallet,
          daoId: input.daoId,
          governanceId: input.governanceId,
          proposalId: input.proposalId,
          proposalOwnerRecordId: input.proposalOwnerRecordId,
          tokenOwnerRecordId: source.tokenOwnerRecordId,
          governingTokenMint: input.governingTokenMint,
          voteKind: input.voteKind,
          choiceRank: input.choiceRank
        });
      }
      if (!result) {
        throw new Error('No eligible votes were available for this proposal.');
      }
      setGovernanceVoteResult(result);
      const nextGovernance = await loadWalletGovernance(selectedWallet, walletState.trackedGovernanceDaoIds);
      setGovernance(nextGovernance);
      Alert.alert('Vote submitted', result.signature);
    } catch (unknownError) {
      setGovernanceVoteError(unknownError instanceof Error ? unknownError.message : 'Unable to submit governance vote.');
    } finally {
      setGovernanceVotingProposalId(null);
    }
  }

  function renderMobileGovernanceProposalCard(
    proposal: MobileGovernanceResponse['proposals'][number],
    nowUnixSeconds: number
  ) {
    const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
    const canVoteNow = proposal.canVote && timeMeta.votingWindowOpen;
    const proposalVoteSources = proposal.voteSources ?? [];
    const availableVoteSources = proposalVoteSources.filter((source) => !source.hasVoted);
    const hasProposalVoteSources = proposalVoteSources.length > 0;
    const hasDelegatedProposalVoteSource = availableVoteSources.some((source) => source.isDelegate);
    const proposalUrl = buildGovernanceProposalUrl(proposal.daoId, proposal.proposalId);
    const inactiveVotingPowerMessage =
      !timeMeta.votingWindowOpen && timeMeta.noteText
        ? timeMeta.noteText
        : proposal.hasVoted && availableVoteSources.length === 0
          ? 'This wallet already voted on the active proposal.'
          : availableVoteSources.length > 0
            ? hasDelegatedProposalVoteSource
              ? 'This wallet has delegated voting power available for this proposal.'
              : 'This wallet has voting power available for this proposal.'
            : hasProposalVoteSources
              ? 'This wallet has a proposal voter record, but that voting power is not currently available.'
              : proposal.votingPowerType === 'unknown'
                ? 'This wallet has governance power in this DAO, but the proposal voting class could not be resolved yet.'
                : 'This wallet is tracking the DAO, but it does not currently have voting power for this proposal.';

    return (
      <View key={proposal.proposalId} style={styles.sectionCard}>
        <View style={styles.governanceProposalHeader}>
          <View style={styles.governanceProposalCopy}>
            <Text style={styles.governanceProposalTitle}>{proposal.proposalName}</Text>
            <View style={styles.governanceProposalBadges}>
              <View style={styles.governanceStatusPill}>
                <Text style={styles.governanceStatusPillText}>{formatGovernanceVotingPowerType(proposal.votingPowerType)}</Text>
              </View>
              {proposal.isDelegate ? (
                <View style={styles.governanceStatusPill}>
                  <Text style={styles.governanceStatusPillText}>Delegate</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.governanceStatusPill,
                  timeMeta.badgeSuccess ? styles.governanceStatusPillSuccess : null
                ]}
              >
                <Text
                  style={[
                    styles.governanceStatusPillText,
                    timeMeta.badgeSuccess ? styles.governanceStatusPillTextSuccess : null
                  ]}
                >
                  {timeMeta.badgeLabel}
                </Text>
              </View>
              {timeMeta.votingWindowOpen && timeMeta.metaText ? (
                <View style={styles.governanceStatusPill}>
                  <Text style={styles.governanceStatusPillText}>{timeMeta.metaText}</Text>
                </View>
              ) : null}
              <Pressable
                style={styles.governanceOpenButton}
                onPress={() => void Linking.openURL(proposalUrl)}
              >
                <Text style={styles.governanceOpenButtonText}>Open</Text>
                <Feather name="external-link" size={16} color={activeTheme.text} />
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              {proposal.realmName} • {proposal.state}
              {timeMeta.metaText ? ` • ${timeMeta.metaText}` : ''}
              {proposal.votingEndsAt ? ` • ${new Date(proposal.votingEndsAt * 1000).toLocaleString()}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.governanceMetricsRow}>
          <Text style={styles.governanceMetricText}>Yes {formatWholeNumberString(proposal.yesVotes)}</Text>
          {BigInt(proposal.noVotes) > BigInt(0) ? (
            <Text style={styles.governanceMetricText}>No {formatWholeNumberString(proposal.noVotes)}</Text>
          ) : null}
          {BigInt(proposal.denyVotes) > BigInt(0) ? (
            <Text style={styles.governanceMetricText}>Deny {formatWholeNumberString(proposal.denyVotes)}</Text>
          ) : null}
        </View>

        {canVoteNow ? (
          <View style={styles.governanceVoteActions}>
            {proposal.choices.map((choice) => (
              <Pressable
                key={`${proposal.proposalId}:${choice.rank}`}
                style={styles.governanceVoteButton}
                disabled={governanceVotingProposalId === proposal.proposalId}
                onPress={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
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
                <Text style={styles.governanceVoteButtonText}>
                  {governanceVotingProposalId === proposal.proposalId ? 'Submitting...' : choice.label}
                </Text>
              </Pressable>
            ))}
            {proposal.hasDenyOption ? (
              <Pressable
                style={styles.governanceVoteButtonSecondary}
                disabled={governanceVotingProposalId === proposal.proposalId}
                onPress={() =>
                  void handleGovernanceVote({
                    daoId: proposal.daoId,
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
                <Text style={styles.governanceVoteButtonSecondaryText}>
                  {governanceVotingProposalId === proposal.proposalId ? 'Submitting...' : 'Deny'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.sectionHint}>
            {inactiveVotingPowerMessage}
          </Text>
        )}
      </View>
    );
  }

  async function handleDeleteWallet(wallet: MobileWallet) {
    Alert.alert('Delete wallet', `Remove ${wallet.name} from Grape on this device?`, [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const nextState = await removeMobileWallet({
                state: walletState,
                walletId: wallet.id
              });
              setWalletState(nextState);
              setError(null);
              setSelectedAssetId(null);
              setSendAssetId(null);
              setSendScreenVisible(false);
              if (nextState.setup !== 'ready' || nextState.wallets.length === 0) {
                setUnlocked(false);
                setScreen('setup');
                setMainTab('home');
              }
            } catch (unknownError) {
              setError(unknownError instanceof Error ? unknownError.message : 'Unable to delete wallet.');
            }
          })();
        }
      }
    ]);
  }

  async function handleVerifyExportPassword() {
    if (!selectedWallet) {
      return;
    }

    setExportLoading(true);
    setError(null);
    try {
      const exported = await exportMobileWalletPrivateKey({
        state: walletState,
        wallet: selectedWallet,
        password: exportPassword
      });
      setExportVerifiedWalletId(selectedWallet.id);
      setExportedPrivateKey(exported.privateKey);
      setExportReveal(true);
      setExportPassword('');
    } catch (unknownError) {
      setExportVerifiedWalletId(null);
      setExportedPrivateKey(null);
      setExportReveal(false);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to verify password for export.');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleBiometricVerifyExport() {
    if (!selectedWallet || !walletState.biometricEnabled || !biometricAvailable || exportLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify to reveal export key',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (!result.success) {
        setError('Biometric verification was cancelled.');
        return;
      }

      const exported = await exportMobileWalletPrivateKey({
        state: walletState,
        wallet: selectedWallet,
        allowUnlockedSession: unlocked
      });
      setExportVerifiedWalletId(selectedWallet.id);
      setExportedPrivateKey(exported.privateKey);
      setExportReveal(true);
      setExportPassword('');
    } catch (unknownError) {
      setExportVerifiedWalletId(null);
      setExportedPrivateKey(null);
      setExportReveal(false);
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to verify export with biometrics.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleBiometricUnlock() {
    if (!walletState.biometricEnabled || !biometricAvailable || submitLoading || biometricLoading) {
      return;
    }

    setError(null);
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Grape',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (!result.success) {
        setError('Biometric unlock was cancelled.');
        return;
      }

      setUnlocked(true);
      setUnlockPassword('');
      setScreen('ready');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Biometric unlock failed.');
    } finally {
      setBiometricLoading(false);
    }
  }

  function handleLock() {
    setUnlocked(false);
    setMainTab('home');
    setSendScreenVisible(false);
    setScreen('locked');
  }

  function openSendScreen(assetId?: string | null) {
    setSwapScreenVisible(false);
    setBridgeScreenVisible(false);
    setSendAssetId(assetId ?? null);
    setSelectedAssetId(null);
    setSendRecipient('');
    setSendAmount('');
    setSendAssetSearch('');
    setSendAssetPickerVisible(false);
    setError(null);
    setSendScreenVisible(true);
  }

  function openSwapScreen(inputAssetId?: string | null, outputAssetId?: string | null) {
    setSendScreenVisible(false);
    setBridgeScreenVisible(false);
    setSelectedAssetId(null);
    setSwapInputAssetId(inputAssetId ?? null);
    setSwapOutputAssetId(outputAssetId ?? null);
    setSwapAmount('');
    setSwapQuote(null);
    setSwapSelectedRouteId(null);
    setSwapInputPickerVisible(false);
    setSwapOutputPickerVisible(false);
    setSwapAssetSearch('');
    setSwapError(null);
    setSwapScreenVisible(true);
  }

  function openBridgeScreen() {
    setSendScreenVisible(false);
    setSwapScreenVisible(false);
    setSelectedAssetId(null);
    setBridgeAmount('');
    setBridgeQuote(null);
    setBridgeSelectedRouteId(null);
    setBridgeError(null);
    setBridgeScreenVisible(true);
  }

  function renderBrandWordmark() {
    return (
      <Svg width={152} height={34} viewBox="0 0 152 34">
        <Defs>
          <SvgLinearGradient id="grapeWordmark" x1="0%" y1="50%" x2="100%" y2="50%">
            <Stop offset="0%" stopColor={activeTheme.brandGradient[0]} />
            <Stop offset="52%" stopColor={activeTheme.brandGradient[1]} />
            <Stop offset="100%" stopColor={activeTheme.brandGradient[2]} />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          x="0"
          y="26"
          fill="url(#grapeWordmark)"
          fontSize="28"
          fontWeight="900"
          letterSpacing="0.8"
        >
          Grape
        </SvgText>
      </Svg>
    );
  }

  function renderBrandLogo(size = 42) {
    return (
      <Image
        source={GRAPE_LOGO_IMAGE}
        style={{ width: size, height: size, resizeMode: 'contain' }}
      />
    );
  }

  function renderAssetGlyph(asset: MobileAsset, size: number, textStyle: object, imageStyle: object) {
    if (asset.logoUri) {
      if (isSvgUri(asset.logoUri)) {
        return <SvgUri uri={asset.logoUri} width={size} height={size} />;
      }

      return (
        <Image
          source={{ uri: asset.logoUri }}
          style={imageStyle}
          resizeMode="cover"
        />
      );
    }

    return <Text style={textStyle}>{asset.symbol.slice(0, 1)}</Text>;
  }

  function renderMnemonicPills(mnemonic: string) {
    const words = mnemonic.trim().split(/\s+/).filter(Boolean);

    return (
      <View style={styles.mnemonicWordGrid}>
        {words.map((word, index) => (
          <View key={`${word}-${index}`} style={styles.mnemonicWordPill}>
            <Text style={styles.mnemonicWordIndex}>{index + 1}</Text>
            <Text style={styles.mnemonicWordText}>{word}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderSetupProgress(label: string) {
    return (
      <View style={styles.setupProgressShell}>
        <View style={styles.setupProgressHeader}>
          <ActivityIndicator color={activeTheme.grape} />
          <Text style={styles.setupProgressLabel}>{label}</Text>
        </View>
        <View style={styles.setupProgressTrack}>
          <Animated.View
            style={[
              styles.setupProgressFill,
              {
                backgroundColor: activeTheme.primaryButton,
                transform: [
                  {
                    translateX: launchHalo.interpolate({
                      inputRange: [0.28, 0.62],
                      outputRange: [-48, 48]
                    })
                  }
                ]
              }
            ]}
          />
        </View>
      </View>
    );
  }

  function renderSolanaCommunityShortcuts() {
    if (selectedWallet?.chain !== 'solana') {
      return null;
    }

    const reputationValue = reputationLoading
      ? 'Loading...'
      : reputation.spaces.length > 0
        ? `${totalEffectiveReputationPoints} pts`
        : walletState.trackedReputationSpaceIds.length > 0
          ? 'No points yet'
          : 'Add spaces';
    const reputationMeta = `${reputation.spaces.length} space${reputation.spaces.length === 1 ? '' : 's'}`;
    const governanceValue = governanceLoading
      ? 'Loading...'
      : actionableGovernanceProposalCount > 0
        ? `${actionableGovernanceProposalCount} ready`
        : governance.proposals.length > 0
          ? `${governance.proposals.length} active`
          : totalGovernanceDaoCount > 0
            ? 'Tracked'
            : 'Join DAOs';
    const governanceMeta = `${totalGovernanceDaoCount} DAO${totalGovernanceDaoCount === 1 ? '' : 's'}`;
    const verificationValue = trackedVerificationSpaceCount > 0 ? 'Verify now' : 'Add spaces';
    const verificationMeta = `${trackedVerificationSpaceCount} space${trackedVerificationSpaceCount === 1 ? '' : 's'}`;
    const handleVerificationPress = () => {
      if (trackedVerificationSpaceCount === 1 && walletState.trackedVerificationSpaceIds[0]) {
        void openVerificationSpace(walletState.trackedVerificationSpaceIds[0]);
        return;
      }
      setMainTab('settings');
    };

    return (
      <View style={styles.communityShortcutStack}>
        <View style={styles.communityShortcutRow}>
          <Pressable style={styles.communityShortcutCard} onPress={() => setMainTab('settings')}>
            <Text style={styles.communityShortcutLabel}>OG Reputation</Text>
            <Text style={styles.communityShortcutValue}>{reputationValue}</Text>
            <Text style={styles.communityShortcutMeta}>{reputationMeta}</Text>
          </Pressable>
          <Pressable style={styles.communityShortcutCard} onPress={() => setMainTab('governance')}>
            <Text style={styles.communityShortcutLabel}>Governance</Text>
            <Text style={styles.communityShortcutValue}>{governanceValue}</Text>
            <Text style={styles.communityShortcutMeta}>{governanceMeta}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.communityInlineShortcut} onPress={handleVerificationPress}>
          <Text style={styles.communityInlineShortcutLabel}>Verification</Text>
          <Text style={styles.communityInlineShortcutValue}>{verificationValue}</Text>
          <Text style={styles.communityInlineShortcutMeta}>{verificationMeta}</Text>
        </Pressable>
      </View>
    );
  }

  function renderSetupScreen() {
    return (
      <KeyboardAvoidingView
        style={styles.screenFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: screenPadding
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Animated.View
            style={[
              styles.screenShell,
              {
                maxWidth: contentMaxWidth,
                opacity: screenEnterOpacity,
                transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
              }
            ]}
          >
            <View style={styles.heroBlock}>
              <View style={styles.logoOrb}>
                {renderBrandLogo(40)}
              </View>
              <Text style={styles.brand}>GRAPE</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Set up your wallet</Text>
              <Text style={styles.heroCopy}>
                Create or import one 12-word or 24-word recovery phrase and Grape will derive your mobile wallets from it.
              </Text>
            </View>

            <SegmentedButtons
              value={setupMode}
              onValueChange={(value) => {
                setSetupMode(value as SetupMode);
                setError(null);
              }}
              buttons={[
                { value: 'create', label: 'Create' },
                { value: 'import', label: 'Import' }
              ]}
              style={styles.paperSegments}
              density="small"
            />

            <View style={[styles.sectionCard, styles.formCard]}>
              {setupMode === 'create' ? (
                <>
                  <Text style={styles.sectionTitle}>Recovery phrase</Text>
                  <Text style={styles.sectionHint}>Back up this 12-word or 24-word phrase before continuing.</Text>
                  <SegmentedButtons
                    value={String(mnemonicLength)}
                    onValueChange={(value) => setMnemonicLength(Number(value) as WalletMnemonicLength)}
                    buttons={[
                      { value: '12', label: '12 words' },
                      { value: '24', label: '24 words' }
                    ]}
                    style={styles.paperSegments}
                    density="small"
                  />
                  <View style={[styles.mnemonicCard, styles.formMnemonicCard]}>{renderMnemonicPills(generatedMnemonic)}</View>
                  <PaperButton mode="outlined" style={styles.paperSecondaryButton} onPress={() => setGeneratedMnemonic(createWalletMnemonic(mnemonicLength))}>
                    Generate a new phrase
                  </PaperButton>
                  <Pressable style={styles.checkboxRow} onPress={() => setConfirmBackedUp((value) => !value)}>
                    <Checkbox status={confirmBackedUp ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                    <Text style={styles.checkboxLabel}>I backed up this recovery phrase.</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Import wallet</Text>
                  <View style={styles.formChoiceRow}>
                    <Text style={styles.formChoiceLabel}>Import with</Text>
                    <SegmentedButtons
                      value={importKind}
                      onValueChange={(value) => setImportKind(value as ImportKind)}
                      buttons={[
                        { value: 'mnemonic', label: 'Recovery phrase' },
                        { value: 'private-key', label: 'Private key' }
                      ]}
                      style={styles.paperSegments}
                      density="small"
                    />
                  </View>
                  {importKind === 'mnemonic' ? (
                    <PaperTextInput
                      value={importMnemonic}
                      onChangeText={setImportMnemonic}
                      placeholder="Enter your 12-word or 24-word recovery phrase"
                      mode="outlined"
                      multiline
                      style={styles.paperInput}
                      contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                      outlineStyle={styles.paperOutline}
                      textColor={activeTheme.text}
                    />
                  ) : (
                    <>
                      <SegmentedButtons
                        value={importPrivateKeyChain}
                        onValueChange={(value) => setImportPrivateKeyChain(value as MobileWalletState['selectedChain'])}
                        buttons={chains.map((item) => ({ value: item.id, label: item.short }))}
                        style={styles.paperSegments}
                        density="small"
                      />
                      <PaperTextInput
                        value={importPrivateKey}
                        onChangeText={setImportPrivateKey}
                        placeholder={`Enter your ${chainMeta(importPrivateKeyChain).label} private key`}
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  )}
                </>
              )}

              <PaperTextInput
                value={setupPassword}
                onChangeText={setSetupPassword}
                placeholder="Password"
                secureTextEntry
                mode="outlined"
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />
              <PaperTextInput
                value={setupPasswordConfirm}
                onChangeText={setSetupPasswordConfirm}
                placeholder="Confirm password"
                secureTextEntry
                mode="outlined"
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />

              {submitLoading
                ? renderSetupProgress(setupMode === 'create' ? 'Creating your wallet…' : 'Importing your wallet…')
                : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={submitLoading}
                onPress={() => void (setupMode === 'create' ? handleCreateWallet() : handleImportWallet())}
              >
                {submitLoading ? 'Please wait…' : setupMode === 'create' ? 'Create wallet' : 'Import wallet'}
              </PaperButton>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderLockedScreen() {
    const lockHaloScale = lockHaloPulse.interpolate({
      inputRange: [0.08, 0.14],
      outputRange: [1, 1.06]
    });
    const lockLogoOpacity = lockHaloPulse.interpolate({
      inputRange: [0.08, 0.14],
      outputRange: [0.94, 0.98]
    });

    return (
      <KeyboardAvoidingView
        style={styles.screenFlex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.lockedScrollContent,
            {
              paddingHorizontal: screenPadding
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Animated.View
            style={[
              styles.lockedCard,
              {
                maxWidth: contentMaxWidth,
                opacity: screenEnterOpacity,
                transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
              }
            ]}
          >
            <Animated.View
              style={[
                styles.lockLogoCluster,
                {
                  opacity: lockLogoOpacity,
                  transform: [{ scale: lockBreathScale }]
                }
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.lockLogoHalo,
                  {
                    opacity: lockHaloPulse.interpolate({
                      inputRange: [0.04, 0.085],
                      outputRange: [0.03, 0.08]
                    }),
                    transform: [{ scale: lockHaloScale }]
                  }
                ]}
              />
              <View style={styles.logoOrb}>
                {renderBrandLogo(40)}
              </View>
            </Animated.View>
            <Text style={styles.brand}>GRAPE</Text>
            <Text style={[styles.lockedTitle, isCompact ? styles.lockedTitleCompact : null]}>Unlock your wallet</Text>
            <Text style={styles.sectionHint}>Unlock once per session to use your multi-chain wallet on mobile.</Text>
            <PaperTextInput
              value={unlockPassword}
              onChangeText={setUnlockPassword}
              placeholder="Password"
              secureTextEntry
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              right={
                walletState.biometricEnabled && biometricAvailable ? (
                  <PaperTextInput.Icon
                    icon="fingerprint"
                    onPress={() => void handleBiometricUnlock()}
                    disabled={biometricLoading || submitLoading}
                    forceTextInputFocus={false}
                  />
                ) : undefined
              }
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={submitLoading}
              onPress={() => void handleUnlock()}
            >
              {submitLoading ? 'Unlocking...' : 'Unlock'}
            </PaperButton>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderHomeTab() {
    const refreshRotation = refreshSpin.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg']
    });

    if (selectedAsset) {
      const assetSubtitle = getAssetSubtitle(selectedAsset, selectedChainMeta.label, selectedChainMeta.short);
      return (
        <View style={styles.stack}>
          <View style={styles.sectionCard}>
            <Pressable style={styles.detailBackRow} onPress={() => setSelectedAssetId(null)}>
              <Feather name="chevron-left" size={18} color={activeTheme.text} />
              <Text style={styles.detailBackText}>Back to holdings</Text>
            </Pressable>

            <View style={styles.assetDetailHeader}>
              <View style={styles.assetDetailGlyph}>
                {renderAssetGlyph(selectedAsset, 56, styles.assetDetailGlyphText, styles.assetDetailGlyphImage)}
              </View>
              <View style={styles.assetDetailCopy}>
                <Text style={styles.assetDetailName}>{selectedAsset.name}</Text>
                <Text style={styles.assetDetailSymbol}>{selectedAsset.symbol}</Text>
              </View>
            </View>

            <View style={styles.assetDetailStats}>
              <View style={styles.assetDetailStat}>
                <Text style={styles.assetDetailLabel}>Holdings</Text>
                <Text style={styles.assetDetailValue}>{maskValue(selectedAsset.amountLabel, walletState.privacyMode)}</Text>
              </View>
              {selectedAsset.valueLabel ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Estimated value</Text>
                  <Text style={styles.assetDetailValue}>{maskValue(selectedAsset.valueLabel, walletState.privacyMode)}</Text>
                </View>
              ) : null}
              <View style={styles.assetDetailStat}>
                <Text style={styles.assetDetailLabel}>Chain</Text>
                <Text style={styles.assetDetailMeta}>{selectedChainMeta.label}</Text>
              </View>
              {assetSubtitle ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Symbol</Text>
                  <Text style={styles.assetDetailMeta}>{assetSubtitle}</Text>
                </View>
              ) : null}
              <View style={styles.assetDetailStat}>
                <Text style={styles.assetDetailLabel}>Wallet</Text>
                <Text style={styles.assetDetailMeta}>{selectedWallet?.name ?? '--'}</Text>
              </View>
              <View style={styles.assetDetailStat}>
                <Text style={styles.assetDetailLabel}>Asset address</Text>
                <Text style={styles.assetDetailMeta}>
                  {selectedAsset.address ? shortenAddress(selectedAsset.address) : '--'}
                </Text>
              </View>
              <View style={styles.assetDetailStat}>
                <Text style={styles.assetDetailLabel}>Metadata source</Text>
                <Text style={styles.assetDetailMeta}>
                  {selectedAsset.metadataSource === 'shyft'
                    ? 'Shyft'
                    : selectedAsset.metadataSource === 'rpc'
                      ? 'RPC'
                      : 'Native'}
                </Text>
              </View>
              {typeof selectedAsset.decimals === 'number' ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Decimals</Text>
                  <Text style={styles.assetDetailMeta}>{selectedAsset.decimals}</Text>
                </View>
              ) : null}
              {selectedAsset.description ? (
                <View style={styles.assetDetailStat}>
                  <Text style={styles.assetDetailLabel}>Details</Text>
                  <Text style={styles.assetDetailMeta}>{selectedAsset.description}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                openSendScreen(selectedAsset.id);
              }}
            >
              <Text style={styles.primaryButtonText}>Send asset</Text>
            </Pressable>
          </View>

          {renderSolanaCommunityShortcuts()}
        </View>
      );
    }

    return (
      <>
        <View style={styles.heroCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.walletIdentity}>
              <View style={[styles.walletAvatar, { borderColor: `${selectedChainMeta.accent}55`, backgroundColor: `${selectedChainMeta.accent}1f` }]}>
                <Text style={[styles.walletAvatarText, { color: selectedChainMeta.accent }]}>{selectedChainMeta.short}</Text>
              </View>
              <View style={styles.walletIdentityCopy}>
                <Text style={styles.cardName}>{selectedWallet?.name ?? '--'}</Text>
              </View>
            </View>
            <Pressable style={styles.refreshChip} onPress={() => void handleRefreshAssets()}>
              <Animated.View style={[styles.refreshGlyphWrap, { transform: [{ rotate: refreshRotation }] }]}>
                <MaterialCommunityIcons name="refresh" size={22} color={activeTheme.text} />
              </Animated.View>
            </Pressable>
          </View>

          <Text style={styles.cardAddress}>{selectedWallet ? shortenAddress(selectedWallet.address) : '--'}</Text>

          <View style={styles.balanceBlock}>
            <Text style={styles.cardLabel}>Holdings</Text>
            <Text style={styles.cardBalance}>{maskValue(holdingsSummary, walletState.privacyMode)}</Text>
            <Text style={styles.cardSubtle}>{assets.length} asset{assets.length === 1 ? '' : 's'} in this wallet</Text>
          </View>

          <View style={styles.quickActionsRow}>
            <Pressable style={styles.quickActionButton} onPress={() => openSendScreen()}>
              <MaterialCommunityIcons name="send-outline" size={24} color={activeTheme.text} />
              <Text style={styles.quickActionLabel}>Send</Text>
            </Pressable>
            <Pressable style={styles.quickActionButton} onPress={() => setMainTab('receive')}>
              <MaterialCommunityIcons name="qrcode" size={24} color={activeTheme.text} />
              <Text style={styles.quickActionLabel}>Receive</Text>
            </Pressable>
            <Pressable
              style={selectedWallet?.chain === 'solana' ? styles.quickActionButton : styles.quickActionButtonDisabled}
              onPress={selectedWallet?.chain === 'solana' ? () => openSwapScreen() : undefined}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={24} color={selectedWallet?.chain === 'solana' ? activeTheme.text : activeTheme.muted} />
              <Text style={selectedWallet?.chain === 'solana' ? styles.quickActionLabel : styles.quickActionLabelMuted}>Swap</Text>
            </Pressable>
            <Pressable
              style={selectedWallet && bridgeDestinationChains.length > 0 ? styles.quickActionButton : styles.quickActionButtonDisabled}
              onPress={selectedWallet && bridgeDestinationChains.length > 0 ? () => openBridgeScreen() : undefined}
            >
              <MaterialCommunityIcons
                name="transit-connection-variant"
                size={24}
                color={selectedWallet && bridgeDestinationChains.length > 0 ? activeTheme.text : activeTheme.muted}
              />
              <Text style={selectedWallet && bridgeDestinationChains.length > 0 ? styles.quickActionLabel : styles.quickActionLabelMuted}>Bridge</Text>
            </Pressable>
          </View>
        </View>

        {renderSolanaCommunityShortcuts()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Chains</Text>
            <Text style={styles.sectionHint}>One wallet set, four chains</Text>
          </View>
          <View style={styles.pillRow}>
            {chains
              .filter((item) => walletState.wallets.some((wallet) => wallet.chain === item.id))
              .map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.chainPill, walletState.selectedChain === item.id ? styles.chainPillActive : null]}
                  onPress={() => void handleSelectChain(item.id)}
                >
                  <Text style={[styles.chainPillText, walletState.selectedChain === item.id ? styles.chainPillTextActive : null]}>
                    {item.short}
                  </Text>
                </Pressable>
              ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Wallets</Text>
            <Text style={styles.sectionHint}>{chainWallets.length} on {selectedChainMeta.label}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.walletSwitchRow}
          >
            {chainWallets.map((wallet) => {
              const active = wallet.id === selectedWallet?.id;
              return (
                <Pressable
                  key={wallet.id}
                  style={[styles.walletSwitchChip, active ? styles.walletSwitchChipActive : null]}
                  onPress={() => void handleSelectWallet(wallet.id, wallet.chain)}
                >
                  <Text style={[styles.walletSwitchChipTitle, active ? styles.walletSwitchChipTitleActive : null]}>
                    {wallet.name}
                  </Text>
                  <Text style={styles.walletSwitchChipAddress}>{shortenAddress(wallet.address)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Holdings</Text>
            <Text style={styles.sectionHint}>
              {assetsLoading ? 'Refreshing' : `${assets.length} asset${assets.length === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={styles.stack}>
            {assetsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={activeTheme.grape} />
                <Text style={styles.sectionHint}>Loading holdings...</Text>
              </View>
            ) : assets.length === 0 ? (
              <Text style={styles.sectionHint}>No assets found for this wallet.</Text>
            ) : (
              assets.map((asset) => (
                (() => {
                  const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                  return (
                    <Pressable key={asset.id} style={styles.assetRow} onPress={() => setSelectedAssetId(asset.id)}>
                      <View style={styles.assetGlyph}>
                        {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                      </View>
                      <View style={styles.assetCopy}>
                        <Text style={styles.assetName}>{asset.name}</Text>
                        {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                      </View>
                      <View style={styles.assetValueStack}>
                        <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                        {asset.valueLabel ? (
                          <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={20} color={activeTheme.muted} style={styles.rowChevronIcon} />
                    </Pressable>
                  );
                })()
              ))
            )}
          </View>
        </View>

      </>
    );
  }

  function renderReceiveTab() {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Receive</Text>
        <Text style={styles.sectionHint}>Use this QR code or address to receive assets on {selectedChainMeta.label}.</Text>
        <View style={styles.qrCard}>
          {selectedWallet?.address ? (
            <View style={styles.qrSurface}>
              <QRCode
                value={selectedWallet.address}
                size={220}
                color="#F8F4FF"
                backgroundColor="transparent"
              />
            </View>
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderText}>Preparing QR</Text>
            </View>
          )}
        </View>
        <View style={styles.receiveAddressCard}>
          <Text style={styles.receiveAddressLabel}>{selectedWallet?.name ?? 'Wallet'}</Text>
          <Text style={styles.receiveAddressValue}>{selectedWallet?.address ?? '--'}</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => void handleShareAddress()}>
          <Text style={styles.primaryButtonText}>Share address</Text>
        </Pressable>
      </View>
    );
  }

  function renderGovernanceTab() {
    if (selectedWallet?.chain !== 'solana') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Governance</Text>
          <Text style={styles.sectionHint}>Governance proposal tracking and voting are currently available for Solana wallets only.</Text>
        </View>
      );
    }

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Governance</Text>
          <Text style={styles.sectionHint}>
            Follow active proposals for the DAOs this wallet participates in and cast votes directly from mobile.
          </Text>
          <View style={styles.reputationSummaryGrid}>
            <View style={styles.reputationSummaryCard}>
              <Text style={styles.reputationSummaryLabel}>Active proposals</Text>
              <Text style={styles.reputationSummaryValue}>{governance.proposals.length}</Text>
            </View>
            <View style={styles.reputationSummaryCard}>
              <Text style={styles.reputationSummaryLabel}>Participating DAOs</Text>
              <Text style={styles.reputationSummaryValue}>{totalGovernanceDaoCount}</Text>
            </View>
          </View>
        </View>

        {governanceVoteResult ? (
          <View style={styles.successBox}>
            <Text style={styles.successBoxText}>Vote submitted. Signature {shortenAddress(governanceVoteResult.signature)}</Text>
          </View>
        ) : null}
        {governanceVoteError ? <Text style={styles.errorText}>{governanceVoteError}</Text> : null}
        {governanceLoading ? (
          <View style={styles.sectionCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.sectionHint}>Loading governance proposals...</Text>
            </View>
          </View>
        ) : null}
        {!governanceLoading && governanceError ? (
          <View style={styles.sectionCard}>
            <Text style={styles.errorText}>{governanceError}</Text>
          </View>
        ) : null}
        {!governanceLoading && !governanceError && governance.proposals.length === 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>No active governance proposals</Text>
            <Text style={styles.sectionHint}>
              {totalGovernanceDaoCount > 0
                ? 'This wallet is part of tracked or discovered DAOs, but none currently have active proposals.'
                : 'No governance DAOs have been detected for this wallet yet.'}
            </Text>
          </View>
        ) : null}

        {!governanceLoading && !governanceError ? (() => {
          const nowUnixSeconds = Math.floor(Date.now() / 1000);
          const activeProposals = governance.proposals.filter((proposal) => {
            const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
            return proposal.stateCode === 2 && timeMeta.votingWindowOpen;
          });
          const finalizingProposals = governance.proposals.filter((proposal) => {
            const timeMeta = getGovernanceProposalTimeMeta(proposal, nowUnixSeconds);
            return proposal.stateCode === 2 && !timeMeta.votingWindowOpen;
          });

          return (
            <>
              {activeProposals.map((proposal) => renderMobileGovernanceProposalCard(proposal, nowUnixSeconds))}
              {finalizingProposals.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    onPress={() => setGovernanceShowFinalizing((current) => !current)}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.sectionTitle}>Needs finalization</Text>
                      <Text style={styles.sectionHint}>
                        Voting has ended on {finalizingProposals.length} proposal{finalizingProposals.length === 1 ? '' : 's'}.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={styles.governanceStatusPill}>
                        <Text style={styles.governanceStatusPillText}>{finalizingProposals.length}</Text>
                      </View>
                      <Feather name={governanceShowFinalizing ? 'chevron-down' : 'chevron-right'} size={18} color={activeTheme.muted} />
                    </View>
                  </Pressable>
                  {governanceShowFinalizing ? (
                    <View style={{ marginTop: 12, gap: 12 }}>
                      {finalizingProposals.map((proposal) => renderMobileGovernanceProposalCard(proposal, nowUnixSeconds))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          );
        })() : null}
      </View>
    );
  }

  function renderSendTab() {
    const selectedSendAssetSubtitle = selectedSendAsset
      ? getAssetSubtitle(selectedSendAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setSendScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Send asset</Text>
          <Text style={styles.sectionHint}>
            Choose what to send from {selectedWallet?.name ?? 'this wallet'}, then confirm the destination and amount.
          </Text>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Asset</Text>
            <Text style={styles.sectionHint}>{assets.length} available</Text>
          </View>
          <Pressable style={styles.sendAssetSelectButton} onPress={() => setSendAssetPickerVisible(true)}>
            {selectedSendAsset ? (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  {renderAssetGlyph(selectedSendAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>{selectedSendAsset.name}</Text>
                  <Text style={styles.sendSelectedAssetMeta}>
                    {selectedSendAssetSubtitle ?? selectedSendAsset.symbol}
                  </Text>
                </View>
                <View style={styles.assetValueStack}>
                  <Text style={styles.assetValue}>{maskValue(selectedSendAsset.amountLabel, walletState.privacyMode)}</Text>
                  <Text style={styles.assetValueMeta}>Tap to switch</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  <MaterialCommunityIcons name="swap-horizontal-circle-outline" size={26} color={activeTheme.text} />
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>Choose asset</Text>
                  <Text style={styles.sendSelectedAssetMeta}>Select what you want to send</Text>
                </View>
              </>
            )}
            <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
          </Pressable>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <Text style={styles.sectionTitle}>Transfer details</Text>
          {selectedSendAsset ? (
            <View style={styles.sendSelectedAssetCard}>
              <View style={styles.sendSelectedAssetGlyph}>
                {renderAssetGlyph(selectedSendAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
              </View>
              <View style={styles.sendSelectedAssetCopy}>
                <Text style={styles.sendSelectedAssetName}>{selectedSendAsset.name}</Text>
                <Text style={styles.sendSelectedAssetMeta}>
                  {selectedSendAssetSubtitle ?? selectedSendAsset.symbol}
                </Text>
              </View>
              <Text style={styles.sendSelectedAssetBalance}>
                {maskValue(selectedSendAsset.amountLabel, walletState.privacyMode)}
              </Text>
            </View>
          ) : null}
          <PaperTextInput
            value={sendRecipient}
            onChangeText={setSendRecipient}
            placeholder="Recipient"
            autoCapitalize="none"
            autoCorrect={false}
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          <PaperTextInput
            value={sendAmount}
            onChangeText={setSendAmount}
            placeholder={selectedSendAsset ? `Amount in ${selectedSendAsset.symbol}` : 'Amount'}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          {selectedWallet?.chain === 'sui' && selectedSendAsset?.tokenType === 'sui-coin' ? (
            <Text style={styles.sectionHint}>Sui fungible token send is not available on mobile yet. Native SUI only.</Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={sendLoading || !selectedWallet || !selectedSendAsset}
            onPress={() => void handleSend()}
          >
            {sendLoading ? 'Sending...' : `Send ${selectedSendAsset?.symbol ?? selectedChainMeta.short}`}
          </PaperButton>
        </View>
      </View>
    );
  }

  function renderRoutePicker(options: Array<{ id: string; label: string; meta: string; helper?: string }>, selectedId: string | null, onSelect: (id: string) => void) {
    return (
      <View style={styles.routePicker}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.routeOption, selectedId === option.id ? styles.routeOptionActive : null]}
            onPress={() => onSelect(option.id)}
          >
            <Text style={styles.routeOptionLabel}>{option.label}</Text>
            <Text style={styles.routeOptionValue}>{option.meta}</Text>
            {option.helper ? <Text style={styles.routeOptionHelper}>{option.helper}</Text> : null}
          </Pressable>
        ))}
      </View>
    );
  }

  function renderSwapTab() {
    const selectedInputSubtitle = selectedSwapInputAsset
      ? getAssetSubtitle(selectedSwapInputAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;
    const selectedOutputSubtitle = selectedSwapOutputAsset
      ? getAssetSubtitle(selectedSwapOutputAsset, selectedChainMeta.label, selectedChainMeta.short)
      : null;
    const routeOptions = (swapQuote?.routes ?? []).map((route) => ({
      id: route.id,
      label: route.label,
      meta: `${route.outputAmountUi} ${selectedSwapOutputAsset?.symbol ?? ''}`.trim(),
      helper: route.routeLabels.length > 0 ? route.routeLabels.join(' · ') : route.priceImpactPct ? `${route.priceImpactPct}% impact` : undefined
    }));

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setSwapScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>Swap</Text>
          <Text style={styles.sectionHint}>Review multiple Jupiter routes, then swap between assets held in this Solana wallet.</Text>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <Text style={styles.sectionTitle}>From</Text>
          <Pressable style={styles.sendAssetSelectButton} onPress={() => setSwapInputPickerVisible(true)}>
            {selectedSwapInputAsset ? (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  {renderAssetGlyph(selectedSwapInputAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>{selectedSwapInputAsset.name}</Text>
                  <Text style={styles.sendSelectedAssetMeta}>{selectedInputSubtitle ?? selectedSwapInputAsset.symbol}</Text>
                </View>
                <View style={styles.assetValueStack}>
                  <Text style={styles.assetValue}>{maskValue(selectedSwapInputAsset.amountLabel, walletState.privacyMode)}</Text>
                  <Text style={styles.assetValueMeta}>Tap to switch</Text>
                </View>
              </>
            ) : null}
            <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
          </Pressable>

          <Text style={styles.sectionTitle}>To</Text>
          <Pressable style={styles.sendAssetSelectButton} onPress={() => setSwapOutputPickerVisible(true)}>
            {selectedSwapOutputAsset ? (
              <>
                <View style={styles.sendSelectedAssetGlyph}>
                  {renderAssetGlyph(selectedSwapOutputAsset, 44, styles.assetGlyphText, styles.assetGlyphImage)}
                </View>
                <View style={styles.sendSelectedAssetCopy}>
                  <Text style={styles.sendSelectedAssetName}>{selectedSwapOutputAsset.name}</Text>
                  <Text style={styles.sendSelectedAssetMeta}>{selectedOutputSubtitle ?? selectedSwapOutputAsset.symbol}</Text>
                </View>
              </>
            ) : (
              <View style={styles.sendSelectedAssetCopy}>
                <Text style={styles.sendSelectedAssetName}>Choose output asset</Text>
                <Text style={styles.sendSelectedAssetMeta}>Select what you want to receive</Text>
              </View>
            )}
            <Feather name="chevron-down" size={18} color={activeTheme.muted} style={styles.rowChevronIcon} />
          </Pressable>

          <PaperTextInput
            value={swapAmount}
            onChangeText={setSwapAmount}
            placeholder={selectedSwapInputAsset ? `Amount in ${selectedSwapInputAsset.symbol}` : 'Amount'}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          {swapError ? <Text style={styles.errorText}>{swapError}</Text> : null}
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={swapQuoteLoading || swapExecuteLoading || !selectedSwapInputAsset || !selectedSwapOutputAsset}
            onPress={() => void handleGetSwapQuote()}
          >
            {swapQuoteLoading ? 'Fetching routes...' : 'Get routes'}
          </PaperButton>
        </View>

        {swapQuote ? (
          <View style={[styles.sectionCard, styles.formCard]}>
            <Text style={styles.sectionTitle}>Routes</Text>
            <Text style={styles.sectionHint}>Pick the route you want Grape to execute.</Text>
            {renderRoutePicker(routeOptions, swapSelectedRouteId, setSwapSelectedRouteId)}
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={swapExecuteLoading}
              onPress={() => void handleExecuteSwap()}
            >
              {swapExecuteLoading ? 'Submitting swap...' : `Swap ${selectedSwapInputAsset?.symbol ?? ''}`}
            </PaperButton>
          </View>
        ) : null}
      </View>
    );
  }

  function renderBridgeTab() {
    const routeOptions = (bridgeQuote?.routes ?? []).map((route) => ({
      id: route.id,
      label: route.label,
      meta: `${route.toAmountUi} ${route.toSymbol}`.trim(),
      helper: route.routeLabels.length > 0 ? route.routeLabels.join(' · ') : route.feeUsd ? `${route.feeUsd} fee` : undefined
    }));

    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Pressable style={styles.detailBackRow} onPress={() => setBridgeScreenVisible(false)}>
            <Feather name="chevron-left" size={18} color={activeTheme.text} />
            <Text style={styles.detailBackText}>Back to wallet</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>Bridge</Text>
          <Text style={styles.sectionHint}>Move a native asset from this wallet to another chain wallet you already manage in Grape.</Text>
        </View>

        <View style={[styles.sectionCard, styles.formCard]}>
          <Text style={styles.sectionTitle}>Destination chain</Text>
          <SegmentedButtons
            value={bridgeToChain}
            onValueChange={(value) => {
              setBridgeToChain(value as MobileWalletState['selectedChain']);
              setBridgeQuote(null);
              setBridgeSelectedRouteId(null);
              setBridgeError(null);
            }}
            buttons={bridgeDestinationChains.map((chain) => ({ value: chain, label: chainMeta(chain).short }))}
            style={styles.paperSegments}
            density="small"
          />

          <Text style={styles.sectionTitle}>Destination wallet</Text>
          <View style={styles.stack}>
            {bridgeDestinationWallets.length === 0 ? (
              <Text style={styles.sectionHint}>Add a {chainMeta(bridgeToChain).label} wallet before bridging there.</Text>
            ) : (
              bridgeDestinationWallets.map((wallet) => {
                const active = wallet.id === selectedBridgeDestinationWallet?.id;
                return (
                  <Pressable
                    key={wallet.id}
                    style={[styles.walletRow, active ? styles.walletRowActive : null]}
                    onPress={() => {
                      setBridgeDestinationWalletId(wallet.id);
                      setBridgeQuote(null);
                      setBridgeSelectedRouteId(null);
                    }}
                  >
                    <View style={styles.walletCopy}>
                      <Text style={styles.walletName}>{wallet.name}</Text>
                      <Text style={styles.walletMeta}>{shortenAddress(wallet.address)}</Text>
                    </View>
                    {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <PaperTextInput
            value={bridgeAmount}
            onChangeText={setBridgeAmount}
            placeholder={selectedWallet ? `Amount in ${selectedWallet.chain === 'solana' ? 'SOL' : selectedWallet.chain === 'ethereum' ? 'ETH' : selectedWallet.chain === 'monad' ? 'MON' : 'asset'}` : 'Amount'}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          {bridgeError ? <Text style={styles.errorText}>{bridgeError}</Text> : null}
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={bridgeQuoteLoading || bridgeExecuteLoading || !selectedBridgeDestinationWallet}
            onPress={() => void handleGetBridgeQuote()}
          >
            {bridgeQuoteLoading ? 'Fetching routes...' : 'Get routes'}
          </PaperButton>
        </View>

        {bridgeQuote ? (
          <View style={[styles.sectionCard, styles.formCard]}>
            <Text style={styles.sectionTitle}>Routes</Text>
            <Text style={styles.sectionHint}>Pick the bridge route you want Grape to use.</Text>
            {renderRoutePicker(routeOptions, bridgeSelectedRouteId, setBridgeSelectedRouteId)}
            <PaperButton
              mode="contained"
              style={styles.paperPrimaryButton}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={bridgeExecuteLoading}
              onPress={() => void handleExecuteBridge()}
            >
              {bridgeExecuteLoading ? 'Submitting bridge...' : 'Bridge now'}
            </PaperButton>
          </View>
        ) : null}
      </View>
    );
  }

  function renderActivityRow(activity: MobileActivity) {
    const isFailed = activity.status === 'failed';
    const isSuccess = activity.status === 'success';
    const statusLabel = isFailed ? 'Failed' : isSuccess ? 'Success' : 'Pending';
    const glyphName =
      activity.type.includes('send') || activity.type.includes('transfer')
        ? 'arrow-top-right'
        : activity.type.includes('swap')
          ? 'swap-horizontal'
          : activity.type.includes('stake')
            ? 'archive-arrow-up'
            : 'clock-outline';

    return (
      <View key={activity.id} style={styles.activityRow}>
        <View style={styles.activityGlyph}>
          <MaterialCommunityIcons name={glyphName as never} size={20} color={activeTheme.text} />
        </View>
        <View style={styles.activityCopy}>
          <Text style={styles.activityName}>{activity.title}</Text>
          <Text style={styles.activityMeta}>{activity.amountLabel} · {activity.subtitle}</Text>
          <Text style={styles.activityMeta}>{formatActivityTime(activity.timestamp)}</Text>
        </View>
        <View style={styles.activityStatus}>
          <Text style={styles.activityStatusText}>{statusLabel}</Text>
        </View>
      </View>
    );
  }

  function renderActivityTab() {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <Text style={styles.sectionHint}>{filteredActivity.length} item{filteredActivity.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.stack}>
          {filteredActivity.length === 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>No activity yet</Text>
              <Text style={styles.sectionHint}>
                {activityLoading
                  ? 'Loading recent activity...'
                  : 'Recent wallet activity will appear here once the chain index catches up.'}
              </Text>
            </View>
          ) : (
            filteredActivity.map(renderActivityRow)
          )}
        </View>
      </View>
    );
  }

  function renderSettingsTab() {
    return (
      <View style={styles.stack}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <Text style={styles.sectionHint}>Match the same visual families and background graphics as the extension.</Text>
          <View style={styles.themeGrid}>
            {mobileThemes.map((theme) => {
              const selected = walletState.selectedTheme === theme.id;
              return (
                <Pressable
                  key={theme.id}
                  style={[styles.themeChip, selected ? styles.themeChipActive : null]}
                  onPress={() => void handleSetTheme(theme.id)}
                >
                  <Text style={[styles.themeChipText, selected ? styles.themeChipTextActive : null]}>{theme.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.settingsRow}>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsTitle}>Privacy mode</Text>
              <Text style={styles.sectionHint}>Hide balances and wallet values on screen.</Text>
            </View>
            <Switch
              value={walletState.privacyMode}
              onValueChange={(value) => void handleSetPrivacyMode(value)}
              trackColor={{ true: activeTheme.primaryButton, false: 'rgba(255,255,255,0.16)' }}
              thumbColor={walletState.privacyMode ? '#f7f2ff' : '#d0c0df'}
            />
          </View>
          <View style={styles.settingsRow}>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsTitle}>Biometric unlock</Text>
              <Text style={styles.sectionHint}>
                {biometricAvailable ? 'Unlock the wallet with your device biometric if available.' : 'Biometric unlock is not available on this device.'}
              </Text>
            </View>
            <Switch
              value={walletState.biometricEnabled}
              onValueChange={(value) => void handleSetBiometricEnabled(value)}
              disabled={!biometricAvailable}
              trackColor={{ true: activeTheme.primaryButton, false: 'rgba(255,255,255,0.16)' }}
              thumbColor={walletState.biometricEnabled ? '#f7f2ff' : '#d0c0df'}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Current wallet</Text>
          <Text style={styles.sectionHint}>{selectedWallet?.name ?? '--'} · {selectedChainMeta.label}</Text>
          <Text style={styles.settingsMono}>{selectedWallet?.address ?? '--'}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Backup & export</Text>
          <Text style={styles.sectionHint}>
            Export the current wallet private key only if you have a secure destination. A successful password or biometric check reveals it immediately.
          </Text>
          <PaperTextInput
            value={exportPassword}
            onChangeText={setExportPassword}
            placeholder="Password"
            secureTextEntry
            mode="outlined"
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
            right={
              walletState.biometricEnabled && biometricAvailable ? (
                <PaperTextInput.Icon
                  icon="fingerprint"
                  onPress={() => void handleBiometricVerifyExport()}
                  disabled={exportLoading || biometricLoading || !selectedWallet}
                  forceTextInputFocus={false}
                />
              ) : undefined
            }
          />
          <View style={styles.walletToolsRow}>
            <PaperButton
              mode="contained"
              style={[styles.paperPrimaryButton, styles.walletToolButton]}
              buttonColor={activeTheme.primaryButton}
              textColor={activeTheme.primaryButtonText}
              disabled={exportLoading || !exportPassword.trim() || !selectedWallet}
              onPress={() => void handleVerifyExportPassword()}
            >
              {exportLoading ? 'Checking...' : 'Reveal with password'}
            </PaperButton>
            <PaperButton
              mode="outlined"
              style={[styles.paperSecondaryButton, styles.walletToolButton]}
              disabled={!exportedPrivateKey || exportVerifiedWalletId !== selectedWallet?.id}
              onPress={() => setExportReveal((value) => !value)}
            >
              {exportReveal ? 'Hide key' : 'Show key'}
            </PaperButton>
          </View>
          <View style={styles.exportSecretCard}>
            <Text style={styles.exportSecretLabel}>Private key</Text>
            <Text style={styles.settingsMono}>
              {exportedPrivateKey && exportReveal && exportVerifiedWalletId === selectedWallet?.id
                ? exportedPrivateKey
                : '••••••••••••••••••••••••••••••••'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Network services</Text>
          <Text style={styles.sectionHint}>
            RPC, Shyft metadata, and Jupiter pricing can be supplied with EXPO_PUBLIC environment values.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Verification Spaces</Text>
          <Text style={styles.sectionHint}>
            Add the DAO ids you want to verify against. Mobile opens Grape Verification directly for tracked spaces.
          </Text>
          <PaperTextInput
            value={verificationSpaceInput}
            onChangeText={setVerificationSpaceInput}
            placeholder="Add Solana verification DAO id"
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={verificationSaving || !verificationSpaceInput.trim()}
            onPress={() => void handleAddVerificationSpace()}
          >
            {verificationSaving ? 'Saving...' : 'Add verification space'}
          </PaperButton>
          {verificationError ? <Text style={styles.errorText}>{verificationError}</Text> : null}
          {walletState.trackedVerificationSpaceIds.length === 0 ? (
            <Text style={styles.sectionHint}>No verification spaces tracked yet.</Text>
          ) : (
            <View style={styles.stack}>
              {walletState.trackedVerificationSpaceIds.map((daoId) => (
                <View key={daoId} style={styles.reputationSpaceRow}>
                  <View style={styles.reputationSpaceCopy}>
                    <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                    <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                  </View>
                  <View style={styles.reputationSpaceActions}>
                    <Pressable
                      style={styles.reputationOpenButton}
                      onPress={() => void openVerificationSpace(daoId)}
                    >
                      <Feather name="external-link" size={16} color={activeTheme.text} />
                    </Pressable>
                    <Pressable
                      style={styles.reputationRemoveButton}
                      onPress={() => void handleRemoveVerificationSpace(daoId)}
                    >
                      <Feather name="trash-2" size={16} color={activeTheme.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Governance DAOs</Text>
          <Text style={styles.sectionHint}>
            Grape auto-detects the Solana DAOs this wallet participates in from governance membership records. You can also track extra realm ids here.
          </Text>
          {selectedWallet?.chain !== 'solana' ? (
            <Text style={styles.sectionHint}>Governance proposal tracking is currently supported for Solana wallets.</Text>
          ) : (
            <>
              <Text style={styles.settingsTitle}>Auto-detected</Text>
              {governance.discoveredDaos.length > 0 ? (
                <View style={styles.stack}>
                  {governance.discoveredDaos.map((daoId) => (
                    <View key={daoId} style={styles.reputationSpaceRow}>
                      <View style={styles.reputationSpaceCopy}>
                        <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                        <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                      </View>
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Detected</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionHint}>No governance DAOs have been auto-detected for this wallet yet.</Text>
              )}

              <PaperTextInput
                value={governanceDaoInput}
                onChangeText={setGovernanceDaoInput}
                placeholder="Track an extra governance DAO realm id"
                mode="outlined"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />
              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={governanceSaving || !governanceDaoInput.trim()}
                onPress={() => void handleAddGovernanceDao()}
              >
                {governanceSaving ? 'Saving...' : 'Add tracked DAO'}
              </PaperButton>
              {walletState.trackedGovernanceDaoIds.length > 0 ? (
                <View style={styles.stack}>
                  {walletState.trackedGovernanceDaoIds.map((daoId) => (
                    <View key={daoId} style={styles.reputationSpaceRow}>
                      <View style={styles.reputationSpaceCopy}>
                        <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                        <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                      </View>
                      <Pressable
                        style={styles.reputationRemoveButton}
                        onPress={() => void handleRemoveGovernanceDao(daoId)}
                      >
                        <Feather name="trash-2" size={16} color={activeTheme.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionHint}>No extra governance DAOs are being tracked.</Text>
              )}
              {governanceError ? <Text style={styles.errorText}>{governanceError}</Text> : null}
            </>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>OG Reputation Spaces</Text>
          <Text style={styles.sectionHint}>
            Track Solana OG reputation by adding DAO space ids here. Home will then show the current wallet’s effective points per tracked space.
          </Text>
          <PaperTextInput
            value={reputationSpaceInput}
            onChangeText={setReputationSpaceInput}
            placeholder="Add Solana DAO space id"
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.paperInput}
            contentStyle={styles.paperInputContent}
            outlineStyle={styles.paperOutline}
            textColor={activeTheme.text}
          />
          <PaperButton
            mode="contained"
            style={styles.paperPrimaryButton}
            buttonColor={activeTheme.primaryButton}
            textColor={activeTheme.primaryButtonText}
            disabled={reputationSaving || !reputationSpaceInput.trim()}
            onPress={() => void handleAddReputationSpace()}
          >
            {reputationSaving ? 'Saving...' : 'Add reputation space'}
          </PaperButton>
          {reputationError ? <Text style={styles.errorText}>{reputationError}</Text> : null}
          {walletState.trackedReputationSpaceIds.length === 0 ? (
            <Text style={styles.sectionHint}>No tracked spaces yet.</Text>
          ) : (
            <View style={styles.stack}>
              {walletState.trackedReputationSpaceIds.map((daoId) => (
                <View key={daoId} style={styles.reputationSpaceRow}>
                  <View style={styles.reputationSpaceCopy}>
                    <Text style={styles.reputationSpaceTitle}>{shortenAddress(daoId)}</Text>
                    <Text style={styles.reputationSpaceMono}>{daoId}</Text>
                  </View>
                  <View style={styles.reputationSpaceActions}>
                    <Pressable
                      style={styles.reputationOpenButton}
                      onPress={() => void openOgReputationSpace(daoId)}
                    >
                      <Feather name="external-link" size={16} color={activeTheme.text} />
                    </Pressable>
                    <Pressable
                      style={styles.reputationRemoveButton}
                      onPress={() => void handleRemoveReputationSpace(daoId)}
                    >
                      <Feather name="trash-2" size={16} color={activeTheme.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Pressable style={styles.sectionHeader} onPress={() => setWalletListExpanded((value) => !value)}>
            <Text style={styles.sectionTitle}>All wallets</Text>
            <Text style={styles.sectionHint}>{walletListExpanded ? 'Hide' : 'Show'}</Text>
          </Pressable>

          <View style={[styles.walletToolsRow, styles.formWalletToolsRow]}>
            <PaperButton
              mode="outlined"
              style={[styles.paperSecondaryButton, styles.walletToolButton]}
              onPress={() => {
                setSetupMode('create');
                setWalletComposerVisible((value) => !value || setupMode !== 'create');
              }}
            >
              Create wallet
            </PaperButton>
            <PaperButton
              mode="outlined"
              style={[styles.paperSecondaryButton, styles.walletToolButton]}
              onPress={() => {
                setSetupMode('import');
                setWalletComposerVisible((value) => !value || setupMode !== 'import');
              }}
            >
              Import wallet
            </PaperButton>
          </View>

          {walletComposerVisible ? (
            <View style={[styles.sectionCardMuted, styles.formCard]}>
              <Text style={styles.sectionTitle}>{setupMode === 'create' ? 'Create wallet' : 'Import wallet'}</Text>
              <Text style={styles.sectionHint}>
                {setupMode === 'create'
                  ? 'Create another wallet set from a fresh 12-word or 24-word recovery phrase.'
                  : 'Add another wallet using a recovery phrase or private key.'}
              </Text>

              {setupMode === 'create' ? (
                <>
                  <SegmentedButtons
                    value={String(mnemonicLength)}
                    onValueChange={(value) => setMnemonicLength(Number(value) as WalletMnemonicLength)}
                    buttons={[
                      { value: '12', label: '12 words' },
                      { value: '24', label: '24 words' }
                    ]}
                    style={styles.paperSegments}
                    density="small"
                  />
                  <View style={[styles.mnemonicCard, styles.formMnemonicCard]}>{renderMnemonicPills(generatedMnemonic)}</View>
                  <Pressable style={styles.checkboxRow} onPress={() => setConfirmBackedUp((value) => !value)}>
                    <Checkbox status={confirmBackedUp ? 'checked' : 'unchecked'} color={activeTheme.grape} />
                    <Text style={styles.checkboxLabel}>I saved this phrase securely.</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.formChoiceRow}>
                    <Text style={styles.formChoiceLabel}>Import with</Text>
                    <SegmentedButtons
                      value={importKind}
                      onValueChange={(value) => setImportKind(value as ImportKind)}
                      buttons={[
                        { value: 'mnemonic', label: 'Recovery phrase' },
                        { value: 'private-key', label: 'Private key' }
                      ]}
                      style={styles.paperSegments}
                      density="small"
                    />
                  </View>
                  {importKind === 'mnemonic' ? (
                    <PaperTextInput
                      value={importMnemonic}
                      onChangeText={setImportMnemonic}
                      placeholder="Paste 12 or 24-word recovery phrase"
                      mode="outlined"
                      multiline
                      style={styles.paperInput}
                      contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                      outlineStyle={styles.paperOutline}
                      textColor={activeTheme.text}
                    />
                  ) : (
                    <>
                      <SegmentedButtons
                        value={importPrivateKeyChain}
                        onValueChange={(value) => setImportPrivateKeyChain(value as MobileWalletState['selectedChain'])}
                        buttons={chains.map((item) => ({ value: item.id, label: item.short }))}
                        style={styles.paperSegments}
                        density="small"
                      />
                      <PaperTextInput
                        value={importPrivateKey}
                        onChangeText={setImportPrivateKey}
                        placeholder={`Paste ${chainMeta(importPrivateKeyChain).label} private key`}
                        mode="outlined"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.paperInput}
                        contentStyle={[styles.paperInputContent, styles.paperTextAreaContent]}
                        outlineStyle={styles.paperOutline}
                        textColor={activeTheme.text}
                      />
                    </>
                  )}
                </>
              )}

              <PaperTextInput
                value={setupPassword}
                onChangeText={setSetupPassword}
                placeholder="Password"
                secureTextEntry
                mode="outlined"
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />
              <PaperTextInput
                value={setupPasswordConfirm}
                onChangeText={setSetupPasswordConfirm}
                placeholder="Confirm password"
                secureTextEntry
                mode="outlined"
                style={styles.paperInput}
                contentStyle={styles.paperInputContent}
                outlineStyle={styles.paperOutline}
                textColor={activeTheme.text}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PaperButton
                mode="contained"
                style={styles.paperPrimaryButton}
                buttonColor={activeTheme.primaryButton}
                textColor={activeTheme.primaryButtonText}
                disabled={submitLoading}
                onPress={() => void handleAddWallet()}
              >
                {submitLoading ? 'Working...' : setupMode === 'create' ? 'Create wallet' : 'Import wallet'}
              </PaperButton>
            </View>
          ) : null}

          {walletListExpanded ? (
            <View style={styles.stack}>
              {walletsByChain.map(({ chain, wallets }) => {
                const meta = chainMeta(chain.id);
                return (
                  <View key={chain.id} style={styles.walletGroupSection}>
                    <Text style={styles.walletGroupTitle}>{chain.label}</Text>
                    <View style={styles.stack}>
                      {wallets.map((wallet) => {
                        const active = wallet.id === walletState.selectedWalletIds[wallet.chain];
                        return (
                          <Pressable
                            key={wallet.id}
                            onPress={() => void handleSelectWallet(wallet.id, wallet.chain)}
                            style={[styles.walletRow, active ? styles.walletRowActive : null]}
                          >
                            <View style={[styles.walletGlyph, { borderColor: `${meta.accent}55`, backgroundColor: `${meta.accent}18` }]}>
                              <Text style={[styles.walletGlyphText, { color: meta.accent }]}>{meta.short}</Text>
                            </View>
                            <View style={styles.walletCopy}>
                              <Text style={styles.walletName}>{wallet.name}</Text>
                              <Text style={styles.walletMeta}>{formatWalletSource(wallet)}</Text>
                              <Text style={styles.walletMeta}>{shortenAddress(wallet.address)}</Text>
                            </View>
                            <View style={styles.walletRowActions}>
                              {active ? (
                                <View style={styles.activePill}>
                                  <Text style={styles.activePillText}>Active</Text>
                                </View>
                              ) : null}
                              <Pressable
                                style={styles.walletDeleteButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteWallet(wallet);
                                }}
                              >
                                <Feather name="trash-2" size={16} color={activeTheme.danger} />
                              </Pressable>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Session</Text>
          <Text style={styles.sectionHint}>Lock the app and require password unlock again.</Text>
          <Pressable style={styles.secondaryButton} onPress={handleLock}>
            <Text style={styles.secondaryButtonText}>Lock wallet</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderReadyScreen() {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.screenFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <ScrollView
          contentContainerStyle={[
            styles.mainContent,
            {
              paddingHorizontal: screenPadding,
              paddingBottom: sendScreenVisible || swapScreenVisible || bridgeScreenVisible ? 220 : 140
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
            <Animated.View
              style={[
                styles.screenShell,
                {
                  maxWidth: contentMaxWidth,
                  opacity: screenEnterOpacity,
                  transform: [{ translateY: screenEnterLift }, { scale: screenEnterScale }]
                }
              ]}
            >
              <View style={styles.mobileAppBar}>
                <View style={styles.mobileAppBarCopy}>
                  {renderBrandWordmark()}
                </View>
              </View>

            {error ? (
              <View style={styles.inlineErrorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {sendScreenVisible
              ? renderSendTab()
              : swapScreenVisible
                ? renderSwapTab()
                : bridgeScreenVisible
                  ? renderBridgeTab()
                  : mainTab === 'home'
                    ? renderHomeTab()
                    : mainTab === 'receive'
                      ? renderReceiveTab()
                      : mainTab === 'governance'
                        ? renderGovernanceTab()
                        : mainTab === 'activity'
                          ? renderActivityTab()
                          : renderSettingsTab()}
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>

        {sendScreenVisible || swapScreenVisible || bridgeScreenVisible ? null : (
        <View style={[styles.footerShell, { left: footerInset, right: footerInset, bottom: footerInset - 2 }]}>
          <Pressable
            style={[styles.footerButton, mainTab === 'home' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('home')}
          >
            <MaterialCommunityIcons name="home-variant-outline" size={24} color={mainTab === 'home' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'home' ? styles.footerLabelActive : null]}>Home</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'receive' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('receive')}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={24} color={mainTab === 'receive' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'receive' ? styles.footerLabelActive : null]}>Receive</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'governance' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('governance')}
          >
            <MaterialCommunityIcons name="bank-outline" size={24} color={mainTab === 'governance' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'governance' ? styles.footerLabelActive : null]}>Gov</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'activity' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('activity')}
          >
            <MaterialCommunityIcons name="history" size={24} color={mainTab === 'activity' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'activity' ? styles.footerLabelActive : null]}>Activity</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'settings' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('settings')}
          >
            <MaterialCommunityIcons name="cog-outline" size={24} color={mainTab === 'settings' ? activeTheme.text : activeTheme.muted} />
            <Text style={[styles.footerLabel, mainTab === 'settings' ? styles.footerLabelActive : null]}>Settings</Text>
          </Pressable>
        </View>
        )}
        <Portal>
          <PaperModal
            visible={sendAssetPickerVisible}
            onDismiss={() => setSendAssetPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Select asset</Text>
              <Text style={styles.sectionHint}>{assets.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={sendAssetSearch}
              onChangeText={setSendAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSendAssets.length === 0 ? (
                  <Text style={styles.sectionHint}>No assets match your search.</Text>
                ) : (
                  filteredSendAssets.map((asset) => {
                    const active = asset.id === selectedSendAsset?.id;
                    const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                    return (
                      <Pressable
                        key={asset.id}
                        style={[styles.assetRow, active ? styles.assetRowActive : null]}
                        onPress={() => {
                          setSendAssetId(asset.id);
                          setSendAssetPickerVisible(false);
                          setSendAssetSearch('');
                        }}
                      >
                        <View style={styles.assetGlyph}>
                          {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                        </View>
                        <View style={styles.assetCopy}>
                          <Text style={styles.assetName}>{asset.name}</Text>
                          {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                        </View>
                        <View style={styles.assetValueStack}>
                          <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                          {asset.valueLabel ? (
                            <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text>
                          ) : null}
                        </View>
                        {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </PaperModal>
          <PaperModal
            visible={swapInputPickerVisible}
            onDismiss={() => setSwapInputPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Swap from</Text>
              <Text style={styles.sectionHint}>{swappableAssets.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={swapAssetSearch}
              onChangeText={setSwapAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSwapAssets.length === 0 ? (
                  <Text style={styles.sectionHint}>No assets match your search.</Text>
                ) : (
                  filteredSwapAssets.map((asset) => {
                    const active = asset.id === selectedSwapInputAsset?.id;
                    const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                    return (
                      <Pressable
                        key={asset.id}
                        style={[styles.assetRow, active ? styles.assetRowActive : null]}
                        onPress={() => {
                          setSwapInputAssetId(asset.id);
                          if (swapOutputAssetId === asset.id) {
                            setSwapOutputAssetId(null);
                          }
                          setSwapQuote(null);
                          setSwapSelectedRouteId(null);
                          setSwapInputPickerVisible(false);
                          setSwapAssetSearch('');
                        }}
                      >
                        <View style={styles.assetGlyph}>
                          {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                        </View>
                        <View style={styles.assetCopy}>
                          <Text style={styles.assetName}>{asset.name}</Text>
                          {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                        </View>
                        <View style={styles.assetValueStack}>
                          <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                          {asset.valueLabel ? <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text> : null}
                        </View>
                        {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </PaperModal>
          <PaperModal
            visible={swapOutputPickerVisible}
            onDismiss={() => setSwapOutputPickerVisible(false)}
            contentContainerStyle={styles.sendAssetPickerModal}
          >
            <View style={styles.sendAssetPickerHeader}>
              <Text style={styles.sectionTitle}>Swap to</Text>
              <Text style={styles.sectionHint}>{swapOutputCandidates.length} available in this wallet</Text>
            </View>
            <PaperTextInput
              value={swapAssetSearch}
              onChangeText={setSwapAssetSearch}
              placeholder="Search by name, symbol, or address"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.sendAssetPickerList} keyboardShouldPersistTaps="handled">
              <View style={styles.stack}>
                {filteredSwapAssets.filter((asset) => asset.id !== selectedSwapInputAsset?.id).length === 0 ? (
                  <Text style={styles.sectionHint}>No output assets match your search.</Text>
                ) : (
                  filteredSwapAssets
                    .filter((asset) => asset.id !== selectedSwapInputAsset?.id)
                    .map((asset) => {
                      const active = asset.id === selectedSwapOutputAsset?.id;
                      const assetSubtitle = getAssetSubtitle(asset, selectedChainMeta.label, selectedChainMeta.short);
                      return (
                        <Pressable
                          key={asset.id}
                          style={[styles.assetRow, active ? styles.assetRowActive : null]}
                          onPress={() => {
                            setSwapOutputAssetId(asset.id);
                            setSwapQuote(null);
                            setSwapSelectedRouteId(null);
                            setSwapOutputPickerVisible(false);
                            setSwapAssetSearch('');
                          }}
                        >
                          <View style={styles.assetGlyph}>
                            {renderAssetGlyph(asset, 52, styles.assetGlyphText, styles.assetGlyphImage)}
                          </View>
                          <View style={styles.assetCopy}>
                            <Text style={styles.assetName}>{asset.name}</Text>
                            {assetSubtitle ? <Text style={styles.assetMeta}>{assetSubtitle}</Text> : null}
                          </View>
                          <View style={styles.assetValueStack}>
                            <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                            {asset.valueLabel ? <Text style={styles.assetValueMeta}>{maskValue(asset.valueLabel, walletState.privacyMode)}</Text> : null}
                          </View>
                          {active ? <Feather name="check" size={18} color={activeTheme.text} style={styles.rowCheckIcon} /> : null}
                        </Pressable>
                      );
                    })
                )}
              </View>
            </ScrollView>
          </PaperModal>
        </Portal>
      </>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
    <SafeAreaView style={styles.safe}>
      <StatusBar style={activeTheme.id === 'champagne' ? 'dark' : 'light'} />
      {backgroundAsset ? (
        <Image
          source={backgroundAsset}
          style={[styles.backgroundImage, { opacity: activeTheme.backgroundImageOpacity }]}
          blurRadius={activeTheme.backgroundImageBlur}
        />
      ) : null}
      {activeTheme.backgroundTint ? <View style={[styles.backgroundTint, { backgroundColor: activeTheme.backgroundTint }]} pointerEvents="none" /> : null}
      <View style={styles.bgGlowTop} pointerEvents="none" />
      <View style={styles.bgGlowBottom} pointerEvents="none" />

      {screen === 'loading' ? (
        <View style={styles.centered}>
          <Animated.View
            style={[
              styles.launchShell,
              {
                opacity: launchFade,
                transform: [{ translateY: launchLift }, { scale: launchScale }]
              }
            ]}
          >
            <Animated.View style={[styles.launchHalo, { opacity: launchHalo }]} />
            <View style={styles.logoOrb}>
              {renderBrandLogo(40)}
            </View>
            <View style={styles.launchWordmark}>{renderBrandWordmark()}</View>
            <Text style={styles.launchTitle}>Your social wallet is getting ready</Text>
            <Text style={styles.launchCopy}>
              Unlock communities, assets, governance, and identity across every chain you use.
            </Text>
            <View style={styles.launchProgressRow}>
                <ActivityIndicator color={activeTheme.grape} />
              <Text style={styles.loadingText}>Loading Grape</Text>
            </View>
          </Animated.View>
        </View>
      ) : null}

      {screen === 'setup' ? renderSetupScreen() : null}
      {screen === 'locked' ? renderLockedScreen() : null}
      {screen === 'ready' ? renderReadyScreen() : null}
    </SafeAreaView>
    </PaperProvider>
  );
}

function createStyles(palette: MobileThemePalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject
  },
  screenFlex: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    paddingVertical: 14,
    paddingBottom: 40,
    gap: 16
  },
  screenShell: {
    width: '100%',
    alignSelf: 'center',
    gap: 16
  },
  lockedScrollContent: {
    flexGrow: 1,
    paddingVertical: 28,
    justifyContent: 'center'
  },
  mainContent: {
    paddingTop: 18,
    paddingBottom: 140,
    gap: 20
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28
  },
  launchShell: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderRadius: 32,
    backgroundColor: palette.id === 'apple' ? 'rgba(28, 36, 46, 0.48)' : 'rgba(19, 12, 30, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10
  },
  launchHalo: {
    position: 'absolute',
    top: -72,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(181, 123, 255, 0.28)'
  },
  launchWordmark: {
    marginTop: 18
  },
  launchTitle: {
    marginTop: 18,
    color: palette.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center'
  },
  launchCopy: {
    marginTop: 10,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center'
  },
  launchProgressRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  bgGlowTop: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 999,
    opacity: 0.18,
    backgroundColor: palette.bgGlowTop
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 999,
    opacity: 0.14,
    backgroundColor: palette.bgGlowBottom
  },
  logoOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 4, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  loadingText: {
    marginTop: 12,
    color: palette.text,
    fontSize: 16,
    fontWeight: '600'
  },
  heroBlock: {
    paddingTop: 20,
    gap: 8
  },
  brand: {
    color: palette.grape,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 4,
    alignSelf: 'flex-start',
    textAlign: 'left',
    marginTop: -4
  },
  heroTitle: {
    color: palette.text,
    fontSize: 38,
    fontWeight: '800'
  },
  heroTitleCompact: {
    fontSize: 32
  },
  heroCopy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 25
  },
  formChoiceRow: {
    gap: 10
  },
  formChoiceLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  section: {
    gap: 12
  },
  sectionCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 30,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.24,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 10
  },
  formCard: {
    padding: 18,
    gap: 18
  },
  setupProgressShell: {
    gap: 10,
    marginTop: -2
  },
  setupProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  setupProgressLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  setupProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: palette.softPanel,
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  setupProgressFill: {
    width: '58%',
    height: '100%',
    borderRadius: 999,
    opacity: 0.96
  },
  inlineErrorCard: {
    backgroundColor: 'rgba(255, 94, 122, 0.12)',
    borderColor: 'rgba(255, 142, 161, 0.25)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800'
  },
  sectionHint: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left'
  },
  walletToolsRow: {
    flexDirection: 'row',
    gap: 10
  },
  formWalletToolsRow: {
    gap: 12
  },
  walletToolButton: {
    flex: 1
  },
  mnemonicCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  formMnemonicCard: {
    padding: 18
  },
  mnemonicWordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  mnemonicWordPill: {
    minWidth: '30%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4
  },
  mnemonicWordIndex: {
    color: palette.grape,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  mnemonicWordText: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700'
  },
  input: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  formInput: {
    minHeight: 58,
    fontSize: 17
  },
  textarea: {
    minHeight: 132,
    textAlignVertical: 'top',
    paddingTop: 16
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: palette.primaryButton,
    shadowColor: palette.primaryButton,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  buttonDisabled: {
    opacity: 0.55
  },
  primaryButtonText: {
    color: palette.primaryButtonText,
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700'
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  checkboxLabel: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    lineHeight: 20
  },
  lockedCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 32,
    paddingTop: 18,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.28,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 12
  },
  lockLogoCluster: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: -2,
    marginBottom: -2,
    marginLeft: -2,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lockLogoHalo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: palette.grape,
    opacity: 0.08
  },
  lockedTitle: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    alignSelf: 'flex-start',
    textAlign: 'left'
  },
  lockedTitleCompact: {
    fontSize: 30
  },
  mobileAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 4,
    paddingTop: 4
  },
  mobileAppBarCopy: {
    flex: 1,
    gap: 2,
    marginTop: 5
  },
  heroCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 36,
    padding: 24,
    gap: 18,
    shadowColor: '#000',
    shadowOpacity: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 0.26,
    shadowRadius: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: palette.id === 'apple' || palette.id === 'champagne' ? 0 : 12
  },
  walletIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  walletAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  walletAvatarText: {
    fontSize: 17,
    fontWeight: '900'
  },
  walletIdentityCopy: {
    gap: 2,
    flex: 1
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  refreshChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(128,93,36,0.08)'
          : 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshGlyphWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshChipText: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
    includeFontPadding: false
  },
  cardLabel: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  cardName: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  cardAddress: {
    color: palette.text,
    fontSize: 31,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3
  },
  balanceBlock: {
    gap: 6
  },
  cardBalance: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800'
  },
  cardSubtle: {
    color: palette.muted,
    fontSize: 14,
    flexShrink: 1
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'nowrap'
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.68)'
          : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(128,93,36,0.08)'
          : 'rgba(255,255,255,0.06)'
  },
  quickActionButtonDisabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.06)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.52)'
          : 'rgba(255,255,255,0.03)'
  },
  quickActionGlyph: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '800'
  },
  quickActionLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700'
  },
  quickActionLabelMuted: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  walletSwitchRow: {
    gap: 10,
    paddingRight: 6
  },
  walletSwitchChip: {
    minWidth: 138,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 4
  },
  walletSwitchChipActive: {
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  walletSwitchChipTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  walletSwitchChipTitleActive: {
    color: palette.grape
  },
  walletSwitchChipAddress: {
    color: palette.muted,
    fontSize: 13
  },
  formPillRow: {
    gap: 10
  },
  chainPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  chainPillActive: {
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  chainPillText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  chainPillTextActive: {
    color: palette.text
  },
  stack: {
    gap: 12
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  walletRowActive: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.1)'
  },
  walletGroupSection: {
    gap: 10
  },
  walletGroupTitle: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  walletGlyph: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  walletGlyphText: {
    fontWeight: '800'
  },
  walletCopy: {
    flex: 1,
    gap: 2
  },
  walletRowActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  walletName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  walletMeta: {
    color: palette.muted,
    fontSize: 14
  },
  activePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(139,247,198,0.1)'
  },
  activePillText: {
    color: palette.mint,
    fontSize: 13,
    fontWeight: '800'
  },
  walletDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 94, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 122, 0.14)'
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  assetRowActive: {
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.14)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.11)',
    borderColor: palette.primaryButton
  },
  assetGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#090b14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  assetGlyphImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22
  },
  assetGlyphText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  assetCopy: {
    flex: 1,
    gap: 2
  },
  assetName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  assetMeta: {
    color: palette.muted,
    fontSize: 14
  },
  assetValueStack: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4
  },
  assetValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  assetValueMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  rowCheckIcon: {
    marginLeft: 4
  },
  rowChevron: {
    color: palette.muted,
    fontSize: 22,
    marginLeft: 4
  },
  rowChevronIcon: {
    marginLeft: 4
  },
  sendSelectedAssetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  sendAssetSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  sendSelectedAssetGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090b14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  sendSelectedAssetCopy: {
    flex: 1,
    gap: 2
  },
  sendSelectedAssetName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800'
  },
  sendSelectedAssetMeta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  sendSelectedAssetBalance: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  sendAssetPickerModal: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.panel,
    maxHeight: '76%'
  },
  sendAssetPickerHeader: {
    gap: 4,
    marginBottom: 12
  },
  sendAssetPickerList: {
    marginTop: 14
  },
  routePicker: {
    gap: 10,
    marginTop: 8,
    marginBottom: 12
  },
  routeOption: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    gap: 4
  },
  routeOptionActive: {
    borderColor: palette.primaryButton,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.13)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.84)'
          : 'rgba(255,255,255,0.1)'
  },
  routeOptionLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  routeOptionValue: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '900'
  },
  routeOptionHelper: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  receiveAddressCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 8
  },
  qrCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 28,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  qrSurface: {
    width: 236,
    height: 236,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 7, 20, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrPlaceholderText: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  receiveAddressLabel: {
    color: palette.muted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  receiveAddressValue: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700'
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  activityGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(159,99,255,0.18)'
  },
  activityGlyphText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  activityCopy: {
    flex: 1,
    gap: 2
  },
  activityName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  activityMeta: {
    color: palette.muted,
    fontSize: 13
  },
  activityStatus: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.15)'
  },
  activityStatusText: {
    color: palette.mint,
    fontSize: 12,
    fontWeight: '800'
  },
  assetDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  assetDetailCopy: {
    flex: 1,
    gap: 4
  },
  assetDetailName: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  assetDetailSymbol: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '700'
  },
  assetDetailStats: {
    gap: 12
  },
  assetDetailStat: {
    gap: 4
  },
  assetDetailLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  assetDetailValue: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800'
  },
  assetDetailMeta: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600'
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  themeChipActive: {
    backgroundColor: palette.softPanel,
    borderColor: palette.primaryButton
  },
  themeChipText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  themeChipTextActive: {
    color: palette.text
  },
  settingsCopy: {
    flex: 1,
    gap: 4
  },
  settingsTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800'
  },
  settingsMono: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Courier'
  },
  exportSecretCard: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  exportSecretLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  footerShell: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    padding: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: palette.footerBg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14
  },
  footerButton: {
    flex: 1,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 22
  },
  footerButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  footerGlyph: {
    color: palette.text,
    fontSize: 23,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: 'center'
  },
  footerLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  footerLabelActive: {
    color: palette.text
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  paperSegments: {
    marginTop: 2
  },
  paperInput: {
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  paperInputContent: {
    minHeight: 56,
    color: palette.text
  },
  paperTextAreaContent: {
    minHeight: 120,
    textAlignVertical: 'top'
  },
  paperOutline: {
    borderRadius: 20,
    borderColor: palette.panelBorder
  },
  paperPrimaryButton: {
    borderRadius: 20,
    shadowColor: palette.primaryButton,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  paperSecondaryButton: {
    borderRadius: 18,
    backgroundColor: palette.id === 'apple' ? 'rgba(255,255,255,0.11)' : 'transparent'
  },
  inlineActionText: {
    color: palette.grape,
    fontSize: 13,
    fontWeight: '800'
  },
  communityShortcutRow: {
    flexDirection: 'row',
    gap: 10
  },
  communityShortcutStack: {
    gap: 8
  },
  communityShortcutCard: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.05)'
  },
  communityShortcutLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  communityShortcutValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18
  },
  communityShortcutMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  communityInlineShortcut: {
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.08)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.04)'
  },
  communityInlineShortcutLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  communityInlineShortcutValue: {
    marginTop: 2,
    color: palette.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18
  },
  communityInlineShortcutMeta: {
    marginTop: 2,
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  successBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,247,198,0.22)',
    backgroundColor: 'rgba(139,247,198,0.12)'
  },
  successBoxText: {
    color: palette.mint,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  governanceProposalHeader: {
    gap: 10
  },
  governanceProposalCopy: {
    flex: 1,
    gap: 4
  },
  governanceProposalTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  governanceProposalBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8
  },
  governanceStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  governanceStatusPillSuccess: {
    backgroundColor: 'rgba(139,247,198,0.14)',
    borderColor: 'rgba(139,247,198,0.1)'
  },
  governanceStatusPillText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  governanceStatusPillTextSuccess: {
    color: palette.mint
  },
  governanceMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  governanceMetricText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  governanceVoteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  governanceVoteButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryButton
  },
  governanceVoteButtonText: {
    color: palette.primaryButtonText,
    fontSize: 14,
    fontWeight: '800'
  },
  governanceVoteButtonSecondary: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  governanceVoteButtonSecondaryText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800'
  },
  governanceOpenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(255,255,255,0.08)'
  },
  governanceOpenButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '800'
  },
  reputationSummaryGrid: {
    flexDirection: 'row',
    gap: 10
  },
  reputationSummaryCard: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.1)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.76)'
          : 'rgba(255,255,255,0.06)'
  },
  reputationSummaryLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  reputationSummaryValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '900'
  },
  reputationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  reputationLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  reputationAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  reputationAvatarImage: {
    width: '100%',
    height: '100%'
  },
  reputationAvatarText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '800'
  },
  reputationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  reputationName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  reputationMeta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18
  },
  reputationPoints: {
    alignItems: 'flex-end',
    gap: 3
  },
  reputationPointsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  reputationPointsValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '900'
  },
  reputationPointsLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  reputationSpaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.09)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.72)'
          : 'rgba(255,255,255,0.05)'
  },
  reputationSpaceCopy: {
    flex: 1,
    gap: 4
  },
  reputationSpaceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  reputationSpaceTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  reputationSpaceMono: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Courier'
  },
  reputationRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 94, 122, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 122, 0.14)'
  },
  reputationOpenButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      palette.id === 'apple'
        ? 'rgba(255,255,255,0.12)'
        : palette.id === 'champagne'
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  }
  });
}
