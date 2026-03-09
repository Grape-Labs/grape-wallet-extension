import { useEffect, useState } from 'react';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill, TextArea } from '@grape/ui';

import type { WalletExportResponse, WalletStateResponse } from '../../shared/models';

import { createBiometricUnlock, isBiometricUnlockSupported } from '../../shared/biometric';
import { sendRuntimeMessage } from '../../shared/chrome';
import { applyDocumentTheme, THEMES } from '../../shared/theme';
import { mountPage } from '../lib';

function OptionsPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportedWallet, setExportedWallet] = useState<WalletExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'mnemonic' | 'private-key' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<{ mnemonic: boolean; privateKey: boolean }>({
    mnemonic: false,
    privateKey: false
  });

  const refresh = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
      setState(nextState);
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
      setRevealedFields({ mnemonic: false, privateKey: false });
    }
  }, [state?.session.locked]);

  useEffect(() => {
    setExportedWallet(null);
    setExportError(null);
    setCopiedField(null);
    setRevealedFields({ mnemonic: false, privateKey: false });
  }, [state?.activeWallet?.id]);

  useEffect(() => {
    applyDocumentTheme(state?.wallet.selectedTheme);
  }, [state?.wallet.selectedTheme]);

  if (loading) {
    return (
      <PageShell title="Settings" subtitle="Manage security and connected sites.">
        <Card title="Loading">
          <p className="muted">Loading wallet settings...</p>
        </Card>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell title="Settings" subtitle="Manage security and connected sites.">
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
      <PageShell title="Settings" subtitle="Manage security and connected sites.">
        <Card title="No wallet state">
          <p className="muted">Wallet state is not available yet.</p>
        </Card>
      </PageShell>
    );
  }

  const selectedWallet = state.wallet.wallets.find((wallet) => wallet.id === state.wallet.selectedWalletId) ?? state.wallet.wallets[0];
  const exportIsAvailable = selectedWallet?.signer?.kind === 'software';
  const exportPayload = exportedWallet
    ? JSON.stringify(
        {
          walletName: exportedWallet.walletName,
          publicKey: exportedWallet.publicKey,
          derivationPath: exportedWallet.derivationPath,
          kind: exportedWallet.kind,
          mnemonic: exportedWallet.mnemonic,
          privateKeyBase58: exportedWallet.privateKeyBase58,
          exportedAt: new Date().toISOString()
        },
        null,
        2
      )
    : '';

  async function handleCopySecret(kind: 'mnemonic' | 'private-key', value: string | undefined) {
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
      setRevealedFields({ mnemonic: false, privateKey: false });
    } catch (error) {
      setExportedWallet(null);
      setExportError(error instanceof Error ? error.message : 'Unable to export wallet.');
      setRevealedFields({ mnemonic: false, privateKey: false });
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
      const config = await createBiometricUnlock(selectedWallet.id, biometricPassword);
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

  return (
    <PageShell title="Settings" subtitle="Manage security and connected sites.">
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
        </label>
        <label className="stack">
          <span className="muted">Theme</span>
          <select
            value={state.wallet.selectedTheme}
            onChange={async (event) => {
              await sendRuntimeMessage({
                type: 'wallet_set_theme',
                theme: event.target.value as typeof state.wallet.selectedTheme
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
          <KeyValueRow
            label="Biometric unlock"
            value={
              biometricSupported
                ? state.activeWallet?.biometricEnabled
                  ? 'Enabled'
                  : 'Disabled'
                : 'Unavailable'
            }
          />
          {biometricSupported ? (
            state.activeWallet?.biometricEnabled ? (
              <div className="stack">
                <p className="muted">Use Touch ID, Face ID, Windows Hello, or the platform authenticator when available.</p>
                <Button tone="secondary" onClick={() => void handleDisableBiometric()} disabled={biometricLoading}>
                  {biometricLoading ? 'Updating...' : 'Disable biometric unlock'}
                </Button>
              </div>
            ) : (
              <div className="stack">
                <p className="muted">Enable fast unlock with the device authenticator. Your password remains the fallback.</p>
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
            <KeyValueRow label="Signer" value="Ledger" />
          </div>
        ) : (
          <div className="stack">
            <p className="warning-box">
              Export reveals sensitive wallet material. Only do this offline or into a destination you fully trust.
            </p>
            <KeyValueRow label="Selected wallet" value={selectedWallet.name} />
            <KeyValueRow label="Public key" value={<span className="mono transfer-signature">{state.activeWallet?.publicKey ?? 'Unknown'}</span>} />
            <label className="stack">
              <span className="muted">Password</span>
              <Input
                type="password"
                value={exportPassword}
                onChange={(event) => setExportPassword(event.target.value)}
                placeholder="Confirm password to reveal export"
              />
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
                    setRevealedFields({ mnemonic: false, privateKey: false });
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
                    <span className="muted">Private key (base58)</span>
                    <div className="inline">
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() =>
                          setRevealedFields((current) => ({ ...current, privateKey: !current.privateKey }))
                        }
                      >
                        {revealedFields.privateKey ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        tone="secondary"
                        className="mini-button"
                        onClick={() => void handleCopySecret('private-key', exportedWallet.privateKeyBase58)}
                        disabled={!revealedFields.privateKey}
                      >
                        {copiedField === 'private-key' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <TextArea readOnly value={revealedFields.privateKey ? exportedWallet.privateKeyBase58 : '••••••••••••••••••••••••••••••••••••••••••••'} />
                </div>
                <Button tone="secondary" onClick={handleDownloadExport}>
                  Download JSON export
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card title="Connected sites">
        {state.permissions.length === 0 ? (
          <p className="muted">No sites have been approved yet.</p>
        ) : (
          state.permissions.map((permission) => (
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
          ))
        )}
      </Card>
    </PageShell>
  );
}

mountPage(<OptionsPage />);
