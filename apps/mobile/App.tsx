import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { chains, palette } from './src/theme';
import {
  createEmptyMobileWalletState,
  createSendActivity,
  createWalletMnemonic,
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

type Screen = 'loading' | 'setup' | 'locked' | 'ready';
type SetupMode = 'create' | 'import';
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
  return wallet.source === 'created' ? 'Created in Grape' : 'Imported recovery phrase';
}

function maskValue(value: string, privacyMode: boolean) {
  return privacyMode ? '***' : value;
}

export default function App() {
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>('loading');
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [walletState, setWalletState] = useState<MobileWalletState>(createEmptyMobileWalletState());
  const [error, setError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>('create');
  const [generatedMnemonic, setGeneratedMnemonic] = useState(() => createWalletMnemonic());
  const [importMnemonic, setImportMnemonic] = useState('');
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

  const selectedWallet = useMemo(() => getSelectedWallet(walletState), [walletState]);
  const selectedChainMeta = chainMeta(walletState.selectedChain);
  const isCompact = width < 390;
  const isWide = width >= 768;
  const contentMaxWidth = isWide ? 640 : 520;
  const screenPadding = isCompact ? 16 : 20;
  const footerInset = isCompact ? 16 : 20;
  const chainWallets = useMemo(
    () => walletState.wallets.filter((wallet) => wallet.chain === walletState.selectedChain),
    [walletState.selectedChain, walletState.wallets]
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
    if (!isValidMnemonic(importMnemonic)) {
      setError('Recovery phrase is invalid.');
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
        mnemonic: importMnemonic.trim(),
        password: setupPassword,
        source: 'imported-mnemonic'
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

  async function handleSelectWallet(walletId: string) {
    const nextState = {
      ...walletState,
      selectedWalletIds: {
        ...walletState.selectedWalletIds,
        [walletState.selectedChain]: walletId
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

  function handleLock() {
    setUnlocked(false);
    setMainTab('home');
    setShowSendComposer(false);
    setScreen('locked');
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
          <View style={[styles.screenShell, { maxWidth: contentMaxWidth }]}>
            <View style={styles.heroBlock}>
              <Text style={styles.brand}>GRAPE</Text>
              <Text style={[styles.heroTitle, isCompact ? styles.heroTitleCompact : null]}>Set up your wallet</Text>
              <Text style={styles.heroCopy}>
                Create or import one 12-word recovery phrase and Grape will derive your mobile wallets from it.
              </Text>
            </View>

            <View style={styles.segmentRow}>
              <Pressable
                style={[styles.segmentButton, setupMode === 'create' ? styles.segmentButtonActive : null]}
                onPress={() => {
                  setSetupMode('create');
                  setError(null);
                }}
              >
                <Text style={[styles.segmentButtonText, setupMode === 'create' ? styles.segmentButtonTextActive : null]}>
                  Create
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segmentButton, setupMode === 'import' ? styles.segmentButtonActive : null]}
                onPress={() => {
                  setSetupMode('import');
                  setError(null);
                }}
              >
                <Text style={[styles.segmentButtonText, setupMode === 'import' ? styles.segmentButtonTextActive : null]}>
                  Import
                </Text>
              </Pressable>
            </View>

            <View style={styles.sectionCard}>
              {setupMode === 'create' ? (
                <>
                  <Text style={styles.sectionTitle}>Recovery phrase</Text>
                  <Text style={styles.sectionHint}>Back up this 12-word phrase before continuing.</Text>
                  <View style={styles.mnemonicCard}>
                    <Text style={styles.mnemonicText}>{generatedMnemonic}</Text>
                  </View>
                  <Pressable style={styles.secondaryButton} onPress={() => setGeneratedMnemonic(createWalletMnemonic())}>
                    <Text style={styles.secondaryButtonText}>Generate a new phrase</Text>
                  </Pressable>
                  <Pressable style={styles.checkboxRow} onPress={() => setConfirmBackedUp((value) => !value)}>
                    <View style={[styles.checkbox, confirmBackedUp ? styles.checkboxActive : null]}>
                      {confirmBackedUp ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>I backed up this recovery phrase.</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Import recovery phrase</Text>
                  <TextInput
                    value={importMnemonic}
                    onChangeText={setImportMnemonic}
                    placeholder="Enter your 12-word recovery phrase"
                    placeholderTextColor={palette.muted}
                    multiline
                    style={[styles.input, styles.textarea]}
                  />
                </>
              )}

              <TextInput
                value={setupPassword}
                onChangeText={setSetupPassword}
                placeholder="Password"
                placeholderTextColor={palette.muted}
                secureTextEntry
                style={styles.input}
              />
              <TextInput
                value={setupPasswordConfirm}
                onChangeText={setSetupPasswordConfirm}
                placeholder="Confirm password"
                placeholderTextColor={palette.muted}
                secureTextEntry
                style={styles.input}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={[styles.primaryButton, submitLoading ? styles.buttonDisabled : null]}
                disabled={submitLoading}
                onPress={() => void (setupMode === 'create' ? handleCreateWallet() : handleImportWallet())}
              >
                <Text style={styles.primaryButtonText}>
                  {submitLoading ? 'Working...' : setupMode === 'create' ? 'Create wallet' : 'Import wallet'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderLockedScreen() {
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
          <View style={[styles.lockedCard, { maxWidth: contentMaxWidth }]}>
            <Text style={styles.brand}>GRAPE</Text>
            <Text style={[styles.lockedTitle, isCompact ? styles.lockedTitleCompact : null]}>Unlock your wallet</Text>
            <Text style={styles.sectionHint}>Unlock once per session to use your multi-chain wallet on mobile.</Text>
            <TextInput
              value={unlockPassword}
              onChangeText={setUnlockPassword}
              placeholder="Password"
              placeholderTextColor={palette.muted}
              secureTextEntry
              style={styles.input}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryButton, submitLoading ? styles.buttonDisabled : null]}
              disabled={submitLoading}
              onPress={() => void handleUnlock()}
            >
              <Text style={styles.primaryButtonText}>{submitLoading ? 'Unlocking...' : 'Unlock'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderHomeTab() {
    return (
      <>
        <View style={styles.heroCard}>
          <View style={styles.cardTopRow}>
            <View style={[styles.chainBadge, { borderColor: selectedChainMeta.accent }]}>
              <Text style={[styles.chainBadgeText, { color: selectedChainMeta.accent }]}>{selectedChainMeta.label}</Text>
            </View>
            <Pressable style={styles.refreshChip} onPress={() => void handleRefreshAssets()}>
              <Text style={styles.refreshChipText}>{assetsLoading ? 'Refreshing' : 'Refresh'}</Text>
            </Pressable>
          </View>

          <Text style={styles.cardLabel}>Active wallet</Text>
          <Text style={styles.cardName}>{selectedWallet?.name ?? '--'}</Text>
          <Text style={styles.cardAddress}>{selectedWallet ? shortenAddress(selectedWallet.address) : '--'}</Text>

          <View style={styles.balanceBlock}>
            <Text style={styles.cardLabel}>Holdings</Text>
            <Text style={styles.cardBalance}>{maskValue(holdingsSummary, walletState.privacyMode)}</Text>
            <Text style={styles.cardSubtle}>
              {assets.length > 1 ? `${assets.length} assets on ${selectedChainMeta.label}` : `1 wallet on ${selectedChainMeta.label}`}
            </Text>
          </View>

          <View style={styles.quickActionsRow}>
            <Pressable style={styles.quickActionButton} onPress={() => setShowSendComposer((value) => !value)}>
              <Text style={styles.quickActionGlyph}>↗</Text>
              <Text style={styles.quickActionLabel}>Send</Text>
            </Pressable>
            <Pressable style={styles.quickActionButton} onPress={() => setMainTab('receive')}>
              <Text style={styles.quickActionGlyph}>⌁</Text>
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
          <Pressable style={styles.sectionHeader} onPress={() => setWalletListExpanded((value) => !value)}>
            <Text style={styles.sectionTitle}>Wallets on {selectedChainMeta.label}</Text>
            <Text style={styles.sectionHint}>{walletListExpanded ? 'Hide' : 'Show'}</Text>
          </Pressable>
          {walletListExpanded ? (
            <View style={styles.stack}>
              {chainWallets.map((wallet) => {
                const active = wallet.id === selectedWallet?.id;
                const meta = chainMeta(wallet.chain);
                return (
                  <Pressable
                    key={wallet.id}
                    onPress={() => void handleSelectWallet(wallet.id)}
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
          ) : null}
        </View>

        {showSendComposer ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Send {selectedChainMeta.short}</Text>
            <Text style={styles.sectionHint}>Native send is live. Token send comes next.</Text>
            <TextInput
              value={sendRecipient}
              onChangeText={setSendRecipient}
              placeholder="Recipient"
              placeholderTextColor={palette.muted}
              style={styles.input}
            />
            <TextInput
              value={sendAmount}
              onChangeText={setSendAmount}
              placeholder={`Amount in ${selectedChainMeta.short}`}
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryButton, sendLoading ? styles.buttonDisabled : null]}
              disabled={sendLoading || !selectedWallet}
              onPress={() => void handleSend()}
            >
              <Text style={styles.primaryButtonText}>{sendLoading ? 'Sending...' : `Send ${selectedChainMeta.short}`}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Holdings</Text>
            <Text style={styles.sectionHint}>{assetsLoading ? 'Refreshing' : selectedChainMeta.label}</Text>
          </View>
          <View style={styles.stack}>
            {assetsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.grape} />
                <Text style={styles.sectionHint}>Loading holdings...</Text>
              </View>
            ) : assets.length === 0 ? (
              <Text style={styles.sectionHint}>No assets found for this wallet.</Text>
            ) : (
              assets.map((asset) => (
                <View key={asset.id} style={styles.assetRow}>
                  <View style={styles.assetGlyph}>
                    <Text style={styles.assetGlyphText}>{asset.symbol.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.assetCopy}>
                    <Text style={styles.assetName}>{asset.name}</Text>
                    <Text style={styles.assetMeta}>{asset.symbol}</Text>
                  </View>
                  <Text style={styles.assetValue}>{maskValue(asset.amountLabel, walletState.privacyMode)}</Text>
                </View>
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
        <Text style={styles.sectionTitle}>Receive {selectedChainMeta.short}</Text>
        <Text style={styles.sectionHint}>Share this address to receive assets on {selectedChainMeta.label}.</Text>
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
          <Text style={styles.activityGlyphText}>↗</Text>
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
          <Text style={styles.sectionHint}>{selectedChainMeta.label}</Text>
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
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.settingsRow}>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsTitle}>Privacy mode</Text>
              <Text style={styles.sectionHint}>Hide balances and wallet values on screen.</Text>
            </View>
            <Switch
              value={walletState.privacyMode}
              onValueChange={(value) => void handleSetPrivacyMode(value)}
              trackColor={{ true: '#7b49dc', false: '#3b2744' }}
              thumbColor={walletState.privacyMode ? '#f7f2ff' : '#d0c0df'}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Current wallet</Text>
          <Text style={styles.sectionHint}>{selectedWallet?.name ?? '--'} · {selectedChainMeta.label}</Text>
          <Text style={styles.settingsMono}>{selectedWallet?.address ?? '--'}</Text>
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
          <View style={[styles.screenShell, { maxWidth: contentMaxWidth }]}>
            <View style={styles.mobileAppBar}>
              <View style={styles.mobileAppBarCopy}>
                <Text style={styles.brand}>GRAPE</Text>
                <Text style={styles.mobileAppBarTitle}>
                  {selectedWallet?.name ?? 'Wallet'}
                </Text>
                <Text style={styles.mobileAppBarMeta}>{selectedChainMeta.label}</Text>
              </View>
              <Pressable style={styles.mobileAppBarAction} onPress={() => void handleRefreshAssets()}>
                <Text style={styles.mobileAppBarActionText}>{assetsLoading ? '···' : '↻'}</Text>
              </Pressable>
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
          </View>
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.bgGlowTop} pointerEvents="none" />
      <View style={styles.bgGlowBottom} pointerEvents="none" />

      {screen === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={palette.grape} />
          <Text style={styles.loadingText}>Loading Grape</Text>
        </View>
      ) : null}

      {screen === 'setup' ? renderSetupScreen() : null}
      {screen === 'locked' ? renderLockedScreen() : null}
      {screen === 'ready' ? renderReadyScreen() : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  screenFlex: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    paddingVertical: 20,
    paddingBottom: 36,
    gap: 18
  },
  screenShell: {
    width: '100%',
    alignSelf: 'center',
    gap: 18
  },
  lockedScrollContent: {
    flexGrow: 1,
    paddingVertical: 24,
    justifyContent: 'center'
  },
  mainContent: {
    paddingTop: 16,
    paddingBottom: 132,
    gap: 18
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  bgGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 999,
    opacity: 0.22,
    backgroundColor: '#7c26a8'
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -90,
    width: 280,
    height: 280,
    borderRadius: 999,
    opacity: 0.18,
    backgroundColor: '#2c195f'
  },
  loadingText: {
    marginTop: 12,
    color: palette.text,
    fontSize: 16,
    fontWeight: '600'
  },
  heroBlock: {
    paddingTop: 24,
    gap: 8
  },
  brand: {
    color: palette.grape,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 4
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
    lineHeight: 24
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: palette.softPanel,
    borderRadius: 18,
    padding: 4,
    gap: 4
  },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center'
  },
  segmentButtonActive: {
    backgroundColor: '#341043'
  },
  segmentButtonText: {
    color: palette.muted,
    fontWeight: '700'
  },
  segmentButtonTextActive: {
    color: palette.text
  },
  section: {
    gap: 12
  },
  sectionCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 28,
    padding: 22,
    gap: 14
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
    lineHeight: 20
  },
  mnemonicCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  mnemonicText: {
    color: palette.text,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600'
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 16
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 16
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#9f63ff'
  },
  buttonDisabled: {
    opacity: 0.55
  },
  primaryButtonText: {
    color: '#120316',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.04)'
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  checkboxActive: {
    backgroundColor: '#9f63ff',
    borderColor: '#9f63ff'
  },
  checkboxMark: {
    color: '#120316',
    fontWeight: '900'
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
    borderRadius: 28,
    padding: 24,
    gap: 14
  },
  lockedTitle: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800'
  },
  lockedTitleCompact: {
    fontSize: 30
  },
  mobileAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  mobileAppBarCopy: {
    flex: 1,
    gap: 2
  },
  mobileAppBarTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '800'
  },
  mobileAppBarMeta: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: '600'
  },
  mobileAppBarAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.panelBorder
  },
  mobileAppBarActionText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  heroCard: {
    backgroundColor: palette.panel,
    borderColor: palette.panelBorder,
    borderWidth: 1,
    borderRadius: 32,
    padding: 22,
    gap: 16
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  chainBadge: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  chainBadgeText: {
    fontSize: 14,
    fontWeight: '800'
  },
  refreshChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  refreshChipText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700'
  },
  cardLabel: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  cardName: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800'
  },
  cardAddress: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800'
  },
  balanceBlock: {
    gap: 6
  },
  cardBalance: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '800'
  },
  cardSubtle: {
    color: palette.muted,
    fontSize: 14
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
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  quickActionButtonDisabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  quickActionGlyph: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800'
  },
  quickActionLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700'
  },
  quickActionLabelMuted: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chainPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  chainPillActive: {
    backgroundColor: '#341043'
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
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  walletRowActive: {
    backgroundColor: '#341043'
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
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(139,247,198,0.15)'
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
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.04)'
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
  assetValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800'
  },
  receiveAddressCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.panelBorder,
    gap: 8
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
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.04)'
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
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    backgroundColor: 'rgba(21, 6, 31, 0.96)'
  },
  footerButton: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 18
  },
  footerButtonActive: {
    backgroundColor: '#341043'
  },
  footerGlyph: {
    color: palette.text,
    fontSize: 20
  },
  footerLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  footerLabelActive: {
    color: palette.text
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  }
});
