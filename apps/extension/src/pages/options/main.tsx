import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import QRCode from 'qrcode';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill, TextArea } from '@grape/ui';
import { DEFAULT_CUSTOM_THEME } from '@grape/core';

import type { WalletDeviceLinkSessionResponse, WalletExportResponse, WalletStateResponse } from '../../shared/models';

import { createBiometricUnlock, isBiometricUnlockSupported, resolveBiometricUnlockConfig, unlockWithBiometric } from '../../shared/biometric';
import { sendRuntimeMessage } from '../../shared/chrome';
import { CustomThemeEditor } from '../../shared/CustomThemeEditor';
import { applyDocumentTheme, THEMES, THEME_BACKGROUND_STYLES, THEME_MOTION_INTENSITIES } from '../../shared/theme';
import { mountPage } from '../lib';

function formatWalletSourceLabel(
  source: 'created' | 'imported-mnemonic' | 'imported-private-key' | 'watch-only' | 'ledger' | undefined,
  signerKind: 'software' | 'watch-only' | 'ledger' | undefined
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

function OptionsPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportedWallet, setExportedWallet] = useState<WalletExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'mnemonic' | 'private-key-array' | 'private-key-base58' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [customRpcEnabled, setCustomRpcEnabled] = useState(false);
  const [customRpcInput, setCustomRpcInput] = useState('');
  const [customRpcLoading, setCustomRpcLoading] = useState(false);
  const [customRpcError, setCustomRpcError] = useState<string | null>(null);
  const [deviceLinkSessions, setDeviceLinkSessions] = useState<WalletDeviceLinkSessionResponse[]>([]);
  const [deviceLinkLoading, setDeviceLinkLoading] = useState(false);
  const [deviceLinkPassword, setDeviceLinkPassword] = useState('');
  const [deviceLinkError, setDeviceLinkError] = useState<string | null>(null);
  const [deviceLinkQr, setDeviceLinkQr] = useState<string | null>(null);
  const [deviceLinkQrExpanded, setDeviceLinkQrExpanded] = useState(false);
  const [copiedDeviceLinkField, setCopiedDeviceLinkField] = useState<'code' | 'payload' | null>(null);
  const [revealedFields, setRevealedFields] = useState<{
    mnemonic: boolean;
    privateKeyArray: boolean;
    privateKeyBase58: boolean;
  }>({
    mnemonic: false,
    privateKeyArray: false,
    privateKeyBase58: false
  });
  const isWatchOnlyWallet = state?.activeWallet?.signerKind === 'watch-only';

  const refresh = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [nextState, nextDeviceLinkSessions] = await Promise.all([
        sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' }),
        sendRuntimeMessage<WalletDeviceLinkSessionResponse[]>({ type: 'wallet_list_device_link_sessions' })
      ]);
      setState(nextState);
      setDeviceLinkSessions(nextDeviceLinkSessions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void isBiometricUnlockSupported().then(setBiometricSupported).catch(() => setBiometricSupported(false));
  }, []);

  useEffect(() => {
    if (state?.session.locked) {
      setExportedWallet(null);
      setExportPassword('');
      setExportError(null);
      setCopiedField(null);
      setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
    }
  }, [state?.session.locked]);

  useEffect(() => {
    setExportedWallet(null);
    setExportError(null);
    setCopiedField(null);
    setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
  }, [state?.activeWallet?.id]);

  useEffect(() => {
    const activeSession = deviceLinkSessions.find((session) => session.status === 'ready');
    if (!activeSession) {
      setDeviceLinkQr(null);
      setDeviceLinkQrExpanded(false);
      return;
    }

    void QRCode.toDataURL(activeSession.qrPayload, {
      errorCorrectionLevel: 'Q',
      margin: 8,
      width: 1400,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then((value) => setDeviceLinkQr(value))
      .catch(() => setDeviceLinkQr(null));
  }, [deviceLinkSessions]);

  useEffect(() => {
    applyDocumentTheme(
      state?.wallet.selectedTheme,
      state?.wallet.customTheme,
      state?.wallet.themeBackgroundStyle,
      state?.wallet.themeMotionIntensity
    );
  }, [state?.wallet.customTheme, state?.wallet.selectedTheme, state?.wallet.themeBackgroundStyle, state?.wallet.themeMotionIntensity]);

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

  function navigateInCurrentTab(path: string) {
    window.location.href = chrome.runtime.getURL(path);
  }

  const applyCustomTheme = async (customTheme: WalletStateResponse['wallet']['customTheme']) => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_set_custom_theme',
      customTheme
    });
    setState(nextState);
  };

  const applyThemeBackgroundStyle = async (style: WalletStateResponse['wallet']['themeBackgroundStyle']) => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_set_theme_background_style',
      style
    });
    setState(nextState);
  };

  const applyThemeMotionIntensity = async (intensity: WalletStateResponse['wallet']['themeMotionIntensity']) => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({
      type: 'wallet_set_theme_motion_intensity',
      intensity
    });
    setState(nextState);
  };

  const settingsActions = (
    <div className="inline wrap-actions">
      <Button tone="secondary" className="mini-button" onClick={() => navigateInCurrentTab('wallet.html?view=settings')}>
        Compact settings
      </Button>
      <Button tone="secondary" className="mini-button" onClick={() => navigateInCurrentTab('wallet.html')}>
        Wallet
      </Button>
    </div>
  );

  if (loading) {
    return (
      <PageShell title="Settings" subtitle="Manage security and connected sites." actions={settingsActions}>
        <Card title="Loading">
          <p className="muted">Loading wallet settings...</p>
        </Card>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell title="Settings" subtitle="Manage security and connected sites." actions={settingsActions}>
        <Card title="Unable to load settings">
          <div className="stack">
            <p className="danger-box">{loadError}</p>
            <Button onClick={() => void refresh()}>Retry</Button>
          </div>
        </Card>
      </PageShell>
    );
  }

  if (!state) {
    return (
      <PageShell title="Settings" subtitle="Manage security and connected sites." actions={settingsActions}>
        <Card title="No wallet state">
          <p className="muted">Wallet state is not available yet.</p>
        </Card>
      </PageShell>
    );
  }

  const selectedWalletId =
    state.wallet.selectedWalletIds[state.wallet.selectedChain] ??
    (state.wallet.selectedChain === 'solana' ? state.wallet.selectedWalletId : undefined);
  const selectedWallet =
    state.wallet.wallets.find((wallet) => wallet.id === selectedWalletId) ??
    state.wallet.wallets.find((wallet) => wallet.chain === state.wallet.selectedChain) ??
    state.wallet.wallets[0];
  const biometricUnlockConfig = resolveBiometricUnlockConfig(state.wallet, selectedWallet);
  const exportIsAvailable = selectedWallet?.signer?.kind === 'software';
  const deviceLinkIsAvailable = selectedWallet?.signer?.kind === 'software';
  const activeDeviceLinkSession = deviceLinkSessions.find((session) => session.status === 'ready') ?? null;
  const exportPayload = exportedWallet
    ? JSON.stringify(
        {
          walletName: exportedWallet.walletName,
          chain: exportedWallet.chain,
          publicKey: exportedWallet.publicKey,
          derivationPath: exportedWallet.derivationPath,
          kind: exportedWallet.kind,
          mnemonic: exportedWallet.mnemonic,
          privateKeyBytes: exportedWallet.privateKeyBytes,
          privateKeyBase58: exportedWallet.privateKeyBase58,
          exportedAt: new Date().toISOString()
        },
        null,
        2
      )
    : '';
  const privateKeyArrayValue = exportedWallet ? JSON.stringify(exportedWallet.privateKeyBytes) : '';

  async function handleCopySecret(
    kind: 'mnemonic' | 'private-key-array' | 'private-key-base58',
    value: string | undefined
  ) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopiedField(kind);
    window.setTimeout(() => setCopiedField(null), 1200);
  }

  async function handleExport() {
    try {
      setExporting(true);
      setExportError(null);
      const nextExport = await sendRuntimeMessage<WalletExportResponse>({
        type: 'wallet_export_secret',
        password: exportPassword
      });
      setExportedWallet(nextExport);
      setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
    } catch (error) {
      setExportedWallet(null);
      setExportError(error instanceof Error ? error.message : 'Unable to export wallet.');
      setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
    } finally {
      setExporting(false);
    }
  }

  async function handleExportWithBiometric() {
    if (!biometricUnlockConfig) {
      return;
    }

    try {
      setExporting(true);
      setExportError(null);
      const unlockedPassword = await unlockWithBiometric(biometricUnlockConfig);
      const nextExport = await sendRuntimeMessage<WalletExportResponse>({
        type: 'wallet_export_secret',
        password: unlockedPassword
      });
      setExportedWallet(nextExport);
      setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
      setExportPassword('');
    } catch (error) {
      setExportedWallet(null);
      setExportError(error instanceof Error ? error.message : 'Unable to export wallet with device unlock.');
      setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadExport() {
    if (!exportPayload || !exportedWallet) {
      return;
    }

    const blob = new Blob([exportPayload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${exportedWallet.walletName.toLowerCase().replace(/\s+/g, '-')}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleEnableBiometric() {
    if (!selectedWallet || !biometricPassword.trim()) {
      return;
    }

    try {
      setBiometricLoading(true);
      setBiometricError(null);
      const config = await createBiometricUnlock(biometricPassword);
      await sendRuntimeMessage({
        type: 'wallet_set_biometric_unlock',
        config
      });
      setBiometricPassword('');
      await refresh();
    } catch (error) {
      setBiometricError(error instanceof Error ? error.message : 'Unable to enable biometric unlock.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleDisableBiometric() {
    try {
      setBiometricLoading(true);
      setBiometricError(null);
      await sendRuntimeMessage({
        type: 'wallet_set_biometric_unlock',
        config: null
      });
      await refresh();
    } catch (error) {
      setBiometricError(error instanceof Error ? error.message : 'Unable to disable biometric unlock.');
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleSaveCustomRpc() {
    if (!state) {
      return;
    }

    try {
      setCustomRpcLoading(true);
      setCustomRpcError(null);
      await sendRuntimeMessage({
        type: 'wallet_set_custom_rpc',
        network: state.wallet.selectedNetwork,
        rpcUrl: customRpcEnabled ? customRpcInput.trim() || null : null
      });
      await refresh();
    } catch (error) {
      setCustomRpcError(error instanceof Error ? error.message : 'Unable to update custom RPC.');
    } finally {
      setCustomRpcLoading(false);
    }
  }

  async function handleCreateDeviceLink(password?: string) {
    try {
      setDeviceLinkLoading(true);
      setDeviceLinkError(null);
      await sendRuntimeMessage<WalletDeviceLinkSessionResponse>({
        type: 'wallet_create_device_link_session',
        password: password?.trim() || undefined
      });
      setDeviceLinkPassword('');
      setCopiedDeviceLinkField(null);
      setDeviceLinkSessions(await sendRuntimeMessage<WalletDeviceLinkSessionResponse[]>({ type: 'wallet_list_device_link_sessions' }));
    } catch (error) {
      setDeviceLinkError(error instanceof Error ? error.message : 'Unable to create device link.');
    } finally {
      setDeviceLinkLoading(false);
    }
  }

  async function handleCreateDeviceLinkWithBiometric() {
    if (!biometricUnlockConfig) {
      return;
    }

    try {
      setDeviceLinkLoading(true);
      setDeviceLinkError(null);
      const unlockedPassword = await unlockWithBiometric(biometricUnlockConfig);
      await handleCreateDeviceLink(unlockedPassword);
    } catch (error) {
      setDeviceLinkError(error instanceof Error ? error.message : 'Unable to verify with device.');
      setDeviceLinkLoading(false);
    }
  }

  async function handleCopyDeviceLink(kind: 'code' | 'payload', value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedDeviceLinkField(kind);
    window.setTimeout(() => setCopiedDeviceLinkField(null), 1200);
  }

  async function handleDeleteDeviceLink(sessionId: string) {
    try {
      setDeviceLinkLoading(true);
      setDeviceLinkError(null);
      const nextSessions = await sendRuntimeMessage<WalletDeviceLinkSessionResponse[]>({
        type: 'wallet_delete_device_link_session',
        sessionId
      });
      setDeviceLinkSessions(nextSessions);
    } catch (error) {
      setDeviceLinkError(error instanceof Error ? error.message : 'Unable to revoke device link.');
    } finally {
      setDeviceLinkLoading(false);
    }
  }

  return (
    <PageShell title="Settings" subtitle="Manage security and connected sites." actions={settingsActions}>
      <Card title="Security">
        <div className="space-between">
          <StatusPill tone={state.session.locked ? 'warning' : 'success'}>
            {state.session.locked ? 'Locked' : 'Unlocked'}
          </StatusPill>
          <Button
            tone="secondary"
            onClick={async () => {
              await sendRuntimeMessage({ type: 'wallet_lock' });
              await refresh();
            }}
          >
            Lock
          </Button>
        </div>
        <label className="stack">
          <span className="muted">Idle timeout (minutes)</span>
          <Input
            type="number"
            min={1}
            value={String(Math.round(state.wallet.idleTimeoutMs / 60_000))}
            onChange={async (event) => {
              const minutes = Number(event.target.value);
              if (!Number.isFinite(minutes) || minutes < 1) {
                return;
              }
              await sendRuntimeMessage({
                type: 'wallet_set_idle_timeout',
                idleTimeoutMs: minutes * 60_000
              });
              await refresh();
            }}
          />
          {state.wallet.dappApprovalMode === 'non-strict' ? (
            <p className="muted">Non-strict mode keeps the unlocked session alive much longer. The manual lock button still locks immediately.</p>
          ) : null}
        </label>
        <label className="stack">
          <span className="muted">Theme</span>
          <select
            value={state.wallet.selectedTheme}
            onChange={async (event) => {
              const nextState = await sendRuntimeMessage<WalletStateResponse>({
                type: 'wallet_set_theme',
                theme: event.target.value as typeof state.wallet.selectedTheme
              });
              setState(nextState);
            }}
          >
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        {state.wallet.selectedTheme === 'custom' ? (
          <CustomThemeEditor
            theme={state.wallet.customTheme}
            onChange={applyCustomTheme}
            onReset={() => applyCustomTheme(DEFAULT_CUSTOM_THEME)}
          />
        ) : null}
        <label className="stack">
          <span className="muted">Background style</span>
          <select
            value={state.wallet.themeBackgroundStyle}
            onChange={(event) => void applyThemeBackgroundStyle(event.target.value as typeof state.wallet.themeBackgroundStyle)}
          >
            {THEME_BACKGROUND_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          <span className="muted">Motion intensity</span>
          <select
            value={state.wallet.themeMotionIntensity}
            onChange={(event) => void applyThemeMotionIntensity(event.target.value as typeof state.wallet.themeMotionIntensity)}
          >
            {THEME_MOTION_INTENSITIES.map((intensity) => (
              <option key={intensity.id} value={intensity.id}>
                {intensity.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline checkbox-row">
          <input
            type="checkbox"
            checked={state.wallet.privacyMode}
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
            <small className="muted">Hide total balance, token values, and token balances with ***.</small>
          </span>
        </label>
        <label className="inline checkbox-row">
          <input
            type="checkbox"
            checked={state.wallet.autoConnectEnabled}
            onChange={async (event) => {
              const nextState = await sendRuntimeMessage<WalletStateResponse>({
                type: 'wallet_set_auto_connect',
                enabled: event.target.checked
              });
              setState(nextState);
            }}
          />
          <span>
            <strong>Auto-connect trusted dApps</strong>
            <small className="muted">Reconnect approved sites automatically. Turn this off to require a fresh connect approval on each page session.</small>
          </span>
        </label>
        <label className="stack">
          <span className="muted">dApp signing mode</span>
          <select
            value={state.wallet.dappApprovalMode}
            onChange={async (event) => {
              const nextState = await sendRuntimeMessage<WalletStateResponse>({
                type: 'wallet_set_dapp_approval_mode',
                mode: event.target.value as typeof state.wallet.dappApprovalMode
              });
              setState(nextState);
            }}
          >
            <option value="strict">Strict · Review every dApp transaction</option>
            <option value="non-strict">Non-strict · Ask once per unlocked session</option>
          </select>
          <p className="muted">
            Strict mode still shows every dApp transaction approval, but uses the unlocked session until the wallet locks or times out.
            Non-strict mode reduces prompts further during an unlocked session.
          </p>
        </label>
        <div className="stack">
          <label className="inline checkbox-row">
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
              <small className="muted">Override the default endpoint for {state.wallet.selectedNetwork}.</small>
            </span>
          </label>
          {customRpcEnabled ? (
            <>
              <Input
                type="url"
                value={customRpcInput}
                onChange={(event) => setCustomRpcInput(event.target.value)}
                placeholder={`Custom ${state.wallet.selectedNetwork} RPC URL`}
              />
              <div className="inline wrap-actions">
                <Button onClick={() => void handleSaveCustomRpc()} disabled={customRpcLoading || !customRpcInput.trim()}>
                  {customRpcLoading ? 'Saving...' : 'Save RPC'}
                </Button>
                {(state.wallet.customRpcUrls[state.wallet.selectedNetwork] ?? '') ? (
                  <Button
                    tone="secondary"
                    onClick={async () => {
                      setCustomRpcLoading(true);
                      setCustomRpcError(null);
                      try {
                        await sendRuntimeMessage({
                          type: 'wallet_set_custom_rpc',
                          network: state.wallet.selectedNetwork,
                          rpcUrl: null
                        });
                        await refresh();
                      } catch (error) {
                        setCustomRpcError(error instanceof Error ? error.message : 'Unable to update custom RPC.');
                      } finally {
                        setCustomRpcLoading(false);
                      }
                    }}
                    disabled={customRpcLoading}
                  >
                    Reset to default
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
          {state.wallet.customRpcUrls[state.wallet.selectedNetwork] ? (
            <KeyValueRow
              label="Current RPC"
              value={<span className="mono transfer-signature">{state.wallet.customRpcUrls[state.wallet.selectedNetwork]}</span>}
            />
          ) : (
            <p className="muted">Using the default RPC for {state.wallet.selectedNetwork}.</p>
          )}
          {customRpcError ? <p className="danger-box">{customRpcError}</p> : null}
        </div>
        <div className="stack">
          <KeyValueRow
            label="Biometric unlock"
            value={
              isWatchOnlyWallet
                ? 'Unavailable'
                : biometricSupported
                ? state.activeWallet?.biometricEnabled
                  ? 'Enabled'
                  : 'Disabled'
                : 'Unavailable'
            }
          />
          {isWatchOnlyWallet ? (
            <p className="muted">Watch-only wallets do not have local secrets, so biometric unlock is not needed.</p>
          ) : biometricSupported ? (
            state.activeWallet?.biometricEnabled ? (
              <div className="stack">
                <p className="muted">Use Touch ID, Face ID, Windows Hello, or the platform authenticator across all software wallets.</p>
                <Button tone="secondary" onClick={() => void handleDisableBiometric()} disabled={biometricLoading}>
                  {biometricLoading ? 'Updating...' : 'Disable biometric unlock'}
                </Button>
              </div>
            ) : (
              <div className="stack">
                <p className="muted">Enable fast unlock once for all software wallets. Your password remains the fallback.</p>
                <Input
                  type="password"
                  value={biometricPassword}
                  onChange={(event) => setBiometricPassword(event.target.value)}
                  placeholder="Confirm password to enable"
                />
                <Button onClick={() => void handleEnableBiometric()} disabled={biometricLoading || !biometricPassword.trim()}>
                  {biometricLoading ? 'Enabling...' : 'Enable biometric unlock'}
                </Button>
              </div>
            )
          ) : (
            <p className="muted">This device or browser profile does not expose a supported platform authenticator.</p>
          )}
          {biometricError ? <p className="danger-box">{biometricError}</p> : null}
        </div>
      </Card>

      <Card title="Backup & export">
        {!selectedWallet ? (
          <p className="muted">Create or import a wallet before exporting secrets.</p>
        ) : !exportIsAvailable ? (
          <div className="stack">
            <p className="warning-box">Ledger and other hardware-backed wallets cannot be exported from Grape. Back them up on the device instead.</p>
            <KeyValueRow label="Selected wallet" value={selectedWallet.name} />
            <KeyValueRow label="Wallet type" value={formatWalletSourceLabel(selectedWallet.source, selectedWallet.signer?.kind)} />
          </div>
        ) : (
          <div className="stack">
            <p className="warning-box">
              Export reveals sensitive wallet material. Only do this offline or into a destination you fully trust.
            </p>
            <KeyValueRow label="Selected wallet" value={selectedWallet.name} />
            <KeyValueRow label="Wallet type" value={formatWalletSourceLabel(selectedWallet.source, selectedWallet.signer?.kind)} />
            <KeyValueRow label="Public key" value={<span className="mono transfer-signature">{state.activeWallet?.publicKey ?? 'Unknown'}</span>} />
            {biometricSupported && biometricUnlockConfig ? (
              <p className="muted">Biometric unlock is available here using the shared wallet password. Password entry remains available as fallback.</p>
            ) : null}
            <label className="stack">
              <span className="muted">Password</span>
              <div className="send-input-shell send-input-shell-action">
                <Input
                  type="password"
                  value={exportPassword}
                  onChange={(event) => setExportPassword(event.target.value)}
                  placeholder="Confirm password to reveal export"
                  className="send-recipient-input"
                />
                {biometricSupported && biometricUnlockConfig ? (
                  <button
                    type="button"
                    className="biometric-inline-button"
                    onClick={() => void handleExportWithBiometric()}
                    disabled={exporting}
                    aria-label={exporting ? 'Checking device' : 'Verify with device'}
                    title={exporting ? 'Checking device...' : 'Verify with device'}
                  >
                    <Fingerprint size={16} />
                  </button>
                ) : null}
              </div>
            </label>
            <div className="inline">
              <Button onClick={() => void handleExport()} disabled={exporting || !exportPassword.trim()}>
                {exporting ? 'Verifying...' : 'Verify password'}
              </Button>
              {exportedWallet ? (
                <Button
                  tone="secondary"
                  onClick={() => {
                    setExportedWallet(null);
                    setExportError(null);
                    setRevealedFields({ mnemonic: false, privateKeyArray: false, privateKeyBase58: false });
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>

            {exportError ? <p className="danger-box">{exportError}</p> : null}

            {exportedWallet ? (
              <div className="stack">
                <p className="warning-box">
                  Password verified. Secrets stay hidden until you explicitly choose to show them.
                </p>
                <KeyValueRow label="Type" value={exportedWallet.kind === 'mnemonic' ? 'Recovery phrase' : 'Private key'} />
                <KeyValueRow label="Derivation path" value={<span className="mono">{exportedWallet.derivationPath}</span>} />
                {exportedWallet.mnemonic ? (
                  <div className="stack">
                    <div className="space-between">
                      <span className="muted">Recovery phrase</span>
                      <div className="inline">
                        <Button
                          tone="secondary"
                          className="mini-button"
                          onClick={() =>
                            setRevealedFields((current) => ({ ...current, mnemonic: !current.mnemonic }))
                          }
                        >
                          {revealedFields.mnemonic ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          tone="secondary"
                          className="mini-button"
                          onClick={() => void handleCopySecret('mnemonic', exportedWallet.mnemonic)}
                          disabled={!revealedFields.mnemonic}
                        >
                          {copiedField === 'mnemonic' ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                    <TextArea readOnly value={revealedFields.mnemonic ? exportedWallet.mnemonic : '•••••••• •••••••• •••••••• ••••••••'} />
                  </div>
                ) : null}
                <div className="stack">
                  <div className="space-between">
                    <span className="muted">Private key (JSON array)</span>
                    <div className="inline">
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() =>
                          setRevealedFields((current) => ({
                            ...current,
                            privateKeyArray: !current.privateKeyArray
                          }))
                        }
                      >
                        {revealedFields.privateKeyArray ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() => void handleCopySecret('private-key-array', privateKeyArrayValue)}
                        disabled={!revealedFields.privateKeyArray}
                      >
                        {copiedField === 'private-key-array' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <TextArea
                    readOnly
                    value={
                      revealedFields.privateKeyArray
                        ? privateKeyArrayValue
                        : '••••••••••••••••••••••••••••••••••••••••••••'
                    }
                  />
                </div>
                <div className="stack">
                  <div className="space-between">
                    <span className="muted">Private key (base58)</span>
                    <div className="inline">
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() =>
                          setRevealedFields((current) => ({
                            ...current,
                            privateKeyBase58: !current.privateKeyBase58
                          }))
                        }
                      >
                        {revealedFields.privateKeyBase58 ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() => void handleCopySecret('private-key-base58', exportedWallet.privateKeyBase58)}
                        disabled={!revealedFields.privateKeyBase58}
                      >
                        {copiedField === 'private-key-base58' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <TextArea
                    readOnly
                    value={
                      revealedFields.privateKeyBase58
                        ? exportedWallet.privateKeyBase58
                        : '••••••••••••••••••••••••••••••••••••••••••••'
                    }
                  />
                </div>
                <Button tone="secondary" onClick={handleDownloadExport}>
                  Download JSON export
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card title="Link new device">
        {!selectedWallet ? (
          <p className="muted">Create or import a wallet before linking another device.</p>
        ) : !deviceLinkIsAvailable ? (
          <div className="stack">
            <p className="warning-box">Only software wallets can be linked with a QR handoff right now.</p>
            <KeyValueRow label="Selected wallet" value={selectedWallet.name} />
            <KeyValueRow label="Wallet type" value={formatWalletSourceLabel(selectedWallet.source, selectedWallet.signer?.kind)} />
          </div>
        ) : (
          <div className="stack">
            <p className="muted">
              Create a short-lived restore handoff for another Grape device. The restore payload is encrypted, and the pairing code is required to unlock it.
            </p>
            <KeyValueRow label="Selected wallet" value={selectedWallet.name} />
            <KeyValueRow label="Public key" value={<span className="mono transfer-signature">{state.activeWallet?.publicKey ?? 'Unknown'}</span>} />
            <label className="stack">
              <span className="muted">Password</span>
              <div className="send-input-shell send-input-shell-action">
                <Input
                  type="password"
                  value={deviceLinkPassword}
                  onChange={(event) => setDeviceLinkPassword(event.target.value)}
                  placeholder="Verify password to create link"
                  className="send-recipient-input"
                />
                {biometricSupported && biometricUnlockConfig ? (
                  <button
                    type="button"
                    className="biometric-inline-button"
                    onClick={() => void handleCreateDeviceLinkWithBiometric()}
                    disabled={deviceLinkLoading}
                    aria-label={deviceLinkLoading ? 'Checking device' : 'Verify with device'}
                    title={deviceLinkLoading ? 'Checking device...' : 'Verify with device'}
                  >
                    <Fingerprint size={16} />
                  </button>
                ) : null}
              </div>
            </label>
            <Button onClick={() => void handleCreateDeviceLink(deviceLinkPassword)} disabled={deviceLinkLoading || !deviceLinkPassword.trim()}>
              {deviceLinkLoading ? 'Creating link...' : 'Link new device'}
            </Button>
            {deviceLinkError ? <p className="danger-box">{deviceLinkError}</p> : null}

            {activeDeviceLinkSession ? (
              <div className="stack">
                <p className="warning-box">
                  This handoff expires automatically. Treat the QR and pairing code like sensitive recovery material until it is used or revoked.
                </p>
                <KeyValueRow label="Expires" value={new Date(activeDeviceLinkSession.expiresAt).toLocaleString()} />
                <div className="space-between" style={{ alignItems: 'center', gap: '12px' }}>
                  <strong>Pairing code</strong>
                  <div className="inline">
                    <Button
                      tone="secondary"
                      className="mini-button"
                      onClick={() => void handleCopyDeviceLink('code', activeDeviceLinkSession.pairingCode)}
                    >
                      {copiedDeviceLinkField === 'code' ? 'Copied' : 'Copy code'}
                    </Button>
                    <Button
                      tone="danger"
                      className="mini-button"
                      onClick={() => void handleDeleteDeviceLink(activeDeviceLinkSession.id)}
                      disabled={deviceLinkLoading}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
                <TextArea readOnly value={activeDeviceLinkSession.pairingCode} />
                {deviceLinkQr ? (
                  <div className="stack" style={{ justifyItems: 'center' }}>
                    <button
                      type="button"
                      className="receive-qr-button"
                      onClick={() => setDeviceLinkQrExpanded(true)}
                      aria-label="Open large device link QR code"
                    >
                      <img className="receive-qr" src={deviceLinkQr} alt="Device link QR code" />
                    </button>
                    <Button tone="secondary" onClick={() => setDeviceLinkQrExpanded(true)}>
                      Open large QR
                    </Button>
                  </div>
                ) : null}
                <div className="stack">
                  <span className="muted">Restore payload</span>
                  <TextArea readOnly value={activeDeviceLinkSession.qrPayload} />
                  <Button tone="secondary" onClick={() => void handleCopyDeviceLink('payload', activeDeviceLinkSession.qrPayload)}>
                    {copiedDeviceLinkField === 'payload' ? 'Copied' : 'Copy restore payload'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card title="Connected sites">
        {state.permissions.length === 0 ? (
          <p className="muted">No sites have been approved yet.</p>
        ) : (
          <>
            <div className="space-between connected-sites-heading">
              <span className="muted">
                {state.permissions.length} trusted {state.permissions.length === 1 ? 'site' : 'sites'}
              </span>
              <Button
                tone="danger"
                className="mini-button"
                onClick={async () => {
                  if (!window.confirm('Revoke access for every trusted dApp? Each site will need approval before connecting again.')) {
                    return;
                  }
                  const nextState = await sendRuntimeMessage<WalletStateResponse>({
                    type: 'wallet_revoke_all_permissions'
                  });
                  setState(nextState);
                }}
              >
                Revoke all
              </Button>
            </div>
            {state.permissions.map((permission) => (
              <div key={permission.origin} className="card">
                <div className="origin-box">
                  {permission.faviconUrl ? <img src={permission.faviconUrl} alt="" /> : null}
                  <div>
                    <strong>{permission.title ?? permission.origin}</strong>
                    <div className="muted mono">{permission.origin}</div>
                  </div>
                </div>
                <div className="stack">
                  <KeyValueRow label="Permissions" value={permission.permissions.join(', ')} />
                  <Button
                    tone="danger"
                    onClick={async () => {
                      await sendRuntimeMessage({
                        type: 'wallet_revoke_permission',
                        origin: permission.origin
                      });
                      await refresh();
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
      {deviceLinkQrExpanded && deviceLinkQr ? (
        <div className="qr-lightbox-backdrop" onClick={() => setDeviceLinkQrExpanded(false)} role="presentation">
          <div className="qr-lightbox" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Large device link QR code">
            <div className="space-between" style={{ alignItems: 'center', gap: '12px' }}>
              <div className="stack" style={{ gap: '6px' }}>
                <strong>Scan on mobile</strong>
                <span className="muted">Hold the phone a bit farther back and keep the full QR inside the frame.</span>
              </div>
              <Button tone="secondary" className="mini-button" onClick={() => setDeviceLinkQrExpanded(false)}>
                Close
              </Button>
            </div>
            <img className="receive-qr receive-qr-large" src={deviceLinkQr} alt="Large device link QR code" />
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

mountPage(<OptionsPage />);
