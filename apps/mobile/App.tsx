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
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import {
  Button as PaperButton,
  Checkbox,
  MD3DarkTheme,
  Provider as PaperProvider,
  SegmentedButtons,
  TextInput as PaperTextInput
} from 'react-native-paper';

import { DEFAULT_THEME, type GrapeTheme } from '@grape/core';
import { chains, getMobileTheme, mobileThemes, type MobileThemePalette } from './src/theme';
import {
  addWalletSet,
  addPrivateKeyWallet,
  createEmptyMobileWalletState,
  createSendActivity,
  createWalletMnemonic,
  createPrivateKeyWallet,
  createWalletSet,
  type MobileActivity,
  type MobileAsset,
  type MobileWallet,
  type MobileWalletState,
  getSelectedWallet,
  isValidMnemonic,
  loadMobileWalletState,
  loadWalletAssets,
  persistMobileWalletState,
  sendNativeAsset,
  unlockMobileWalletState
} from './src/wallet';
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
type MainTab = 'home' | 'receive' | 'activity' | 'settings';

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

  return asset.symbol;
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
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [walletListExpanded, setWalletListExpanded] = useState(false);
  const [showSendComposer, setShowSendComposer] = useState(false);
  const [walletComposerVisible, setWalletComposerVisible] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

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
    () => walletState.wallets.filter((wallet) => wallet.chain === walletState.selectedChain),
    [walletState.selectedChain, walletState.wallets]
  );
  const walletsByChain = useMemo(
    () =>
      chains
        .map((chain) => ({
          chain,
          wallets: walletState.wallets.filter((wallet) => wallet.chain === chain.id)
        }))
        .filter((entry) => entry.wallets.length > 0),
    [walletState.wallets]
  );
  const filteredActivity = useMemo(
    () =>
      walletState.activities
        .filter((activity) => activity.chain === walletState.selectedChain)
        .sort((left, right) => right.timestamp - left.timestamp),
    [walletState.activities, walletState.selectedChain]
  );
  const headlineAsset = assets[0];
  const holdingsSummary = assets.length === 0 ? '--' : headlineAsset?.amountLabel ?? '--';

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

    async function refreshAssets() {
      if (!unlocked || !selectedWallet) {
        setAssets([]);
        return;
      }

      setAssetsLoading(true);
      try {
        const nextAssets = await loadWalletAssets(selectedWallet);
        if (!mounted) {
          return;
        }
        setAssets(nextAssets);
        setError(null);
      } catch (unknownError) {
        if (!mounted) {
          return;
        }
        setError(unknownError instanceof Error ? unknownError.message : 'Unable to load holdings.');
      } finally {
        if (mounted) {
          setAssetsLoading(false);
        }
      }
    }

    void refreshAssets();
    return () => {
      mounted = false;
    };
  }, [selectedWallet, unlocked]);

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
    setShowSendComposer(false);
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
  }

  async function handleRefreshAssets() {
    if (!selectedWallet) {
      return;
    }

    setAssetsLoading(true);
    try {
      const nextAssets = await loadWalletAssets(selectedWallet);
      setAssets(nextAssets);
      setError(null);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Unable to refresh holdings.');
    } finally {
      setAssetsLoading(false);
    }
  }

  async function handleSend() {
    if (!selectedWallet) {
      return;
    }
    if (!sendRecipient.trim() || !sendAmount.trim()) {
      setError('Enter a recipient and amount.');
      return;
    }

    setSendLoading(true);
    try {
      const signature = await sendNativeAsset({
        wallet: selectedWallet,
        recipient: sendRecipient.trim(),
        amount: sendAmount.trim()
      });

      const activity = createSendActivity({
        wallet: selectedWallet,
        recipient: sendRecipient.trim(),
        amountLabel: `${sendAmount.trim()} ${selectedChainMeta.short}`,
        signature
      });
      const nextState = {
        ...walletState,
        activities: [activity, ...walletState.activities].slice(0, 100)
      };

      await saveState(nextState);
      setSendRecipient('');
      setSendAmount('');
      setShowSendComposer(false);
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
    setShowSendComposer(false);
    setScreen('locked');
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
            />
            {walletState.biometricEnabled && biometricAvailable ? (
              <PaperButton
                mode="outlined"
                style={styles.paperSecondaryButton}
                disabled={biometricLoading || submitLoading}
                onPress={() => void handleBiometricUnlock()}
              >
                {biometricLoading ? 'Checking device…' : 'Use Face ID / Touch ID'}
              </PaperButton>
            ) : null}
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
                <Text style={styles.refreshChipText}>↻</Text>
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
            <Pressable style={styles.quickActionButton} onPress={() => setShowSendComposer((value) => !value)}>
              <Text style={styles.quickActionGlyph}>↑</Text>
              <Text style={styles.quickActionLabel}>Send</Text>
            </Pressable>
            <Pressable style={styles.quickActionButton} onPress={() => setMainTab('receive')}>
              <Text style={styles.quickActionGlyph}>↓</Text>
              <Text style={styles.quickActionLabel}>Receive</Text>
            </Pressable>
            <Pressable style={styles.quickActionButtonDisabled}>
              <Text style={styles.quickActionGlyph}>⇄</Text>
              <Text style={styles.quickActionLabelMuted}>Swap</Text>
            </Pressable>
            <Pressable style={styles.quickActionButtonDisabled}>
              <Text style={styles.quickActionGlyph}>⟷</Text>
              <Text style={styles.quickActionLabelMuted}>Bridge</Text>
            </Pressable>
          </View>
        </View>

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

        {showSendComposer ? (
          <View style={[styles.sectionCard, styles.formCard]}>
            <Text style={styles.sectionTitle}>Send {selectedChainMeta.short}</Text>
            <Text style={styles.sectionHint}>Native send is live. Token send comes next.</Text>
            <PaperTextInput
              value={sendRecipient}
              onChangeText={setSendRecipient}
              placeholder="Recipient"
              mode="outlined"
              style={styles.paperInput}
              contentStyle={styles.paperInputContent}
              outlineStyle={styles.paperOutline}
              textColor={activeTheme.text}
            />
            <PaperTextInput
              value={sendAmount}
              onChangeText={setSendAmount}
              placeholder={`Amount in ${selectedChainMeta.short}`}
              keyboardType="decimal-pad"
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
              disabled={sendLoading || !selectedWallet}
              onPress={() => void handleSend()}
            >
              {sendLoading ? 'Sending...' : `Send ${selectedChainMeta.short}`}
            </PaperButton>
          </View>
        ) : null}

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
                    <View key={asset.id} style={styles.assetRow}>
                      <View style={styles.assetGlyph}>
                        <Text style={styles.assetGlyphText}>{asset.symbol.slice(0, 1)}</Text>
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
                      <Text style={styles.rowChevron}>›</Text>
                    </View>
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

  function renderActivityRow(activity: MobileActivity) {
    return (
      <View key={activity.id} style={styles.activityRow}>
        <View style={styles.activityGlyph}>
          <Text style={styles.activityGlyphText}>↑</Text>
        </View>
        <View style={styles.activityCopy}>
          <Text style={styles.activityName}>{activity.title}</Text>
          <Text style={styles.activityMeta}>{activity.amountLabel} · {activity.subtitle}</Text>
          <Text style={styles.activityMeta}>{formatActivityTime(activity.timestamp)}</Text>
        </View>
        <View style={styles.activityStatus}>
          <Text style={styles.activityStatusText}>Sent</Text>
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
              <Text style={styles.sectionHint}>Recent sends will appear here once you start using the wallet.</Text>
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
          <Text style={styles.sectionTitle}>Network services</Text>
          <Text style={styles.sectionHint}>
            RPC, Shyft metadata, and Jupiter pricing can be supplied with EXPO_PUBLIC environment values.
          </Text>
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
                            {active ? (
                              <View style={styles.activePill}>
                                <Text style={styles.activePillText}>Active</Text>
                              </View>
                            ) : null}
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
        <ScrollView
          contentContainerStyle={[
            styles.mainContent,
            {
              paddingHorizontal: screenPadding
            }
          ]}
          showsVerticalScrollIndicator={false}
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

            {mainTab === 'home' ? renderHomeTab() : null}
            {mainTab === 'receive' ? renderReceiveTab() : null}
            {mainTab === 'activity' ? renderActivityTab() : null}
            {mainTab === 'settings' ? renderSettingsTab() : null}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footerShell, { left: footerInset, right: footerInset, bottom: footerInset - 2 }]}>
          <Pressable
            style={[styles.footerButton, mainTab === 'home' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('home')}
          >
            <Text style={styles.footerGlyph}>⌂</Text>
            <Text style={[styles.footerLabel, mainTab === 'home' ? styles.footerLabelActive : null]}>Home</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'receive' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('receive')}
          >
            <Text style={styles.footerGlyph}>⌁</Text>
            <Text style={[styles.footerLabel, mainTab === 'receive' ? styles.footerLabelActive : null]}>Receive</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'activity' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('activity')}
          >
            <Text style={styles.footerGlyph}>◷</Text>
            <Text style={[styles.footerLabel, mainTab === 'activity' ? styles.footerLabelActive : null]}>Activity</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, mainTab === 'settings' ? styles.footerButtonActive : null]}
            onPress={() => setMainTab('settings')}
          >
            <Text style={styles.footerGlyph}>⚙</Text>
            <Text style={[styles.footerLabel, mainTab === 'settings' ? styles.footerLabelActive : null]}>Settings</Text>
          </Pressable>
        </View>
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
    backgroundColor: 'rgba(19, 12, 30, 0.82)',
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
    shadowOpacity: 0.24,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10
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
    backgroundColor: 'rgba(255,255,255,0.05)'
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12
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
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  quickActionButtonDisabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 22,
    paddingVertical: 15,
    backgroundColor: 'rgba(255,255,255,0.03)'
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
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  walletRowActive: {
    backgroundColor: 'rgba(255,255,255,0.1)'
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
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.05)'
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
  rowChevron: {
    color: palette.muted,
    fontSize: 22,
    marginLeft: 4
  },
  receiveAddressCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 8
  },
  qrCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(255,255,255,0.05)'
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
    borderRadius: 18
  }
  });
}
