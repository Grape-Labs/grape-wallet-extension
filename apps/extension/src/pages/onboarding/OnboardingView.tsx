import { useEffect, useMemo, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { parseDeviceLinkPayloadText } from '@grape/core';

import { Button, Card, Input, MnemonicGrid, PageShell, TextArea } from '@grape/ui';
import { importEthereumPrivateKey, validateEthereumAddress, validateEthereumPrivateKey } from '@grape/ethereum';
import { importMonadPrivateKey, validateMonadAddress, validateMonadPrivateKey } from '@grape/monad';
import { importSuiPrivateKey, validateSuiAddress, validateSuiPrivateKey } from '@grape/sui';
import {
  createBiometricUnlock,
  isBiometricUnlockSupported,
} from '../../shared/biometric';
import {
  deriveSolanaAccount0,
  generateWalletMnemonic,
  importSolanaPrivateKey,
  normalizeMnemonic,
  type WalletMnemonicLength,
  validateSolanaPrivateKey,
  validateWalletMnemonic
} from '@grape/solana';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { WalletStateResponse } from '../../shared/models';
import { requestLedgerAccounts } from '../../../../../packages/solana/src/ledger';
import { requestEthereumLedgerAccounts } from '../../../../../packages/ethereum/src/ledger';
import { requestMonadLedgerAccounts } from '../../../../../packages/monad/src/ledger';

type OnboardingViewProps = {
  compact?: boolean;
  onComplete?: () => void | Promise<void>;
};

type SetupTrack = 'easy' | 'advanced';
type EasySetupMethod = 'passkey' | 'approval' | 'restore' | 'import';
type EasyRecoveryMode = 'passkey-only' | 'passkey-phrase' | 'trusted-recovery';
type SetupMode = 'create' | 'import';
type ImportMethod = 'mnemonic' | 'private-key' | 'watch-only' | 'ledger';
type ImportChain = 'solana' | 'sui' | 'monad' | 'ethereum';
type LedgerImportChain = 'solana' | 'monad' | 'ethereum';
type SetupStep = 1 | 2 | 3;
type LedgerCandidate = {
  index: number;
  publicKey: string;
  derivationPath: string;
  balanceLabel: string;
  label?: string;
};

const LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 16;

function getLedgerCandidateKey(account: Pick<LedgerCandidate, 'publicKey' | 'derivationPath'>) {
  return `${account.publicKey}:${account.derivationPath}`;
}

function formatAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function validatePublicKey(value: string) {
  try {
    new PublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

function validateImportedPrivateKey(chain: ImportChain, value: string) {
  switch (chain) {
    case 'solana':
      return validateSolanaPrivateKey(value);
    case 'sui':
      return validateSuiPrivateKey(value);
    case 'monad':
      return validateMonadPrivateKey(value);
    case 'ethereum':
      return validateEthereumPrivateKey(value);
  }
}

function importPrivateKeyForChain(chain: ImportChain, value: string) {
  switch (chain) {
    case 'solana':
      return importSolanaPrivateKey(value).publicKey;
    case 'sui':
      return importSuiPrivateKey(value).address;
    case 'monad':
      return importMonadPrivateKey(value).address;
    case 'ethereum':
      return importEthereumPrivateKey(value).address;
  }
}

function validateWatchOnlyAddress(chain: ImportChain, value: string) {
  switch (chain) {
    case 'solana':
      return validatePublicKey(value);
    case 'sui':
      return validateSuiAddress(value.trim());
    case 'monad':
      return validateMonadAddress(value.trim());
    case 'ethereum':
      return validateEthereumAddress(value.trim());
  }
}

function getChainLabel(chain: ImportChain) {
  switch (chain) {
    case 'solana':
      return 'Solana';
    case 'sui':
      return 'Sui';
    case 'monad':
      return 'Monad';
    case 'ethereum':
      return 'Ethereum';
  }
}

function generateSetupPassword() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

export function OnboardingView(props: OnboardingViewProps) {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isAppendFlow = searchParams.get('append') === '1';
  const requestedMode = searchParams.get('mode');
  const [setupTrack, setSetupTrack] = useState<SetupTrack>('easy');
  const [easySetupMethod, setEasySetupMethod] = useState<EasySetupMethod>('import');
  const [mode, setMode] = useState<SetupMode>('import');
  const [step, setStep] = useState<SetupStep>(1);
  const [mnemonicLength, setMnemonicLength] = useState<WalletMnemonicLength>(12);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [watchOnlyPublicKey, setWatchOnlyPublicKey] = useState('');
  const [ledgerSelectedAccounts, setLedgerSelectedAccounts] = useState<Array<{ publicKey: string; derivationPath: string }>>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerCandidate[]>([]);
  const [ledgerScanCount, setLedgerScanCount] = useState(LEDGER_ACCOUNT_SCAN_BATCH_SIZE);
  const [network, setNetwork] = useState<'mainnet-beta' | 'devnet'>('devnet');
  const [scanningLedger, setScanningLedger] = useState(false);
  const [importMethod, setImportMethod] = useState<ImportMethod>('mnemonic');
  const [ledgerChain, setLedgerChain] = useState<LedgerImportChain>('solana');
  const [privateKeyChain, setPrivateKeyChain] = useState<ImportChain>('solana');
  const [watchOnlyChain, setWatchOnlyChain] = useState<ImportChain>('solana');
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [showAdvancedCustody, setShowAdvancedCustody] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [restorePayload, setRestorePayload] = useState('');
  const [restorePairingCode, setRestorePairingCode] = useState('');
  const [restoreScannerVisible, setRestoreScannerVisible] = useState(false);
  const [restoreScannerLoading, setRestoreScannerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [existingWalletCount, setExistingWalletCount] = useState(0);
  const [hasPasswordProtectedWallet, setHasPasswordProtectedWallet] = useState(false);
  const [easyRecoveryMode, setEasyRecoveryMode] = useState<EasyRecoveryMode>('passkey-phrase');
  const [confirmPasskeyOnlyAccess, setConfirmPasskeyOnlyAccess] = useState(false);
  const restoreScannerVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setGeneratedMnemonic(generateWalletMnemonic(mnemonicLength));
  }, [mnemonicLength]);

  useEffect(() => {
    if (requestedMode === 'create' || requestedMode === 'import') {
      setSetupTrack('advanced');
      setShowAdvancedCustody(true);
      setMode(requestedMode);
    }
  }, [requestedMode]);

  useEffect(() => {
    void (async () => {
      try {
        const state = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
        setNetwork(state.wallet.selectedNetwork);
        setExistingWalletCount(state.wallet.wallets.length);
        setHasPasswordProtectedWallet(state.wallet.wallets.some((wallet) => !!wallet.vault));
      } catch {
        setNetwork('devnet');
        setExistingWalletCount(0);
        setHasPasswordProtectedWallet(false);
      }
      try {
        setBiometricSupported(await isBiometricUnlockSupported());
      } catch {
        setBiometricSupported(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!restoreScannerVisible) {
      return;
    }

    let active = true;
    let frameId = 0;
    let stream: MediaStream | null = null;

    const startScanner = async () => {
      const video = restoreScannerVideoRef.current;
      if (!video) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera scanning is not available in this browser.');
      }

      const detectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!detectorCtor) {
        throw new Error('QR scanning is not available in this browser. Paste the restore payload instead.');
      }

      setRestoreScannerLoading(true);
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
            setRestorePayload(match.rawValue.trim());
            setRestoreScannerVisible(false);
            setError(null);
            return;
          }
        }
        frameId = window.requestAnimationFrame(() => {
          void scanFrame();
        });
      };

      setRestoreScannerLoading(false);
      void scanFrame();
    };

    void startScanner().catch((nextError) => {
      if (active) {
        setRestoreScannerLoading(false);
        setRestoreScannerVisible(false);
        setError(nextError instanceof Error ? nextError.message : 'Unable to start QR scanning.');
      }
    });

    return () => {
      active = false;
      setRestoreScannerLoading(false);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const video = restoreScannerVideoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [restoreScannerVisible]);

  const mnemonic = useMemo(
    () => normalizeMnemonic(mode === 'create' || importMethod === 'mnemonic' ? (mode === 'create' ? generatedMnemonic : importMnemonic) : ''),
    [generatedMnemonic, importMnemonic, importMethod, mode]
  );
  const isEasyTrack = setupTrack === 'easy';
  const isEasyPasskeyPath = isEasyTrack && easySetupMethod === 'passkey';
  const isEasyApprovalPath = isEasyTrack && easySetupMethod === 'approval';
  const isEasyRestorePath = isEasyTrack && easySetupMethod === 'restore';
  const isComingSoonEasyPath = isEasyApprovalPath;
  const needsExistingWalletPasswordForPasskey = isEasyPasskeyPath && hasPasswordProtectedWallet;
  const parsedRestorePayload = useMemo(() => {
    if (!restorePayload.trim()) {
      return null;
    }
    try {
      return parseDeviceLinkPayloadText(restorePayload);
    } catch {
      return null;
    }
  }, [restorePayload]);

  const isRecoveryStepValid =
    isEasyPasskeyPath
      ? biometricSupported && easyRecoveryMode !== 'trusted-recovery'
      : isEasyRestorePath
        ? !!parsedRestorePayload && restorePairingCode.trim().length >= 4
      : mode === 'create'
      ? confirmBackup && validateWalletMnemonic(mnemonic)
      : importMethod === 'mnemonic'
        ? validateWalletMnemonic(mnemonic)
        : importMethod === 'private-key'
          ? validateImportedPrivateKey(privateKeyChain, importPrivateKey)
          : importMethod === 'watch-only'
            ? validateWatchOnlyAddress(watchOnlyChain, watchOnlyPublicKey)
            : ledgerSelectedAccounts.length > 0;

  const requiresPassword =
    isEasyRestorePath ||
    (!isEasyPasskeyPath && (mode === 'create' || importMethod === 'mnemonic' || importMethod === 'private-key' || importMethod === 'ledger'));
  const isPasswordStepValid = !requiresPassword || (!submitting && password.length >= 8 && password === passwordConfirm);
  const isFinalStepValid = isEasyPasskeyPath
    ? biometricSupported &&
      (!needsExistingWalletPasswordForPasskey || password.trim().length >= 8) &&
      easyRecoveryMode !== 'trusted-recovery'
    : isPasswordStepValid;

async function scanLedgerAccounts(nextScanCount = ledgerScanCount) {
    try {
      setScanningLedger(true);
      setError(null);
      const accounts = await requestLedgerCandidates({
        chain: ledgerChain,
        network,
        count: nextScanCount
      });
      setLedgerScanCount(nextScanCount);
      setLedgerAccounts(accounts);
      setLedgerSelectedAccounts((currentSelected) => {
        const available = new Set(accounts.map((account) => getLedgerCandidateKey(account)));
        const preserved = currentSelected.filter((account) => available.has(getLedgerCandidateKey(account)));
        if (preserved.length > 0) {
          return preserved;
        }
        return accounts[0] ? [{ publicKey: accounts[0].publicKey, derivationPath: accounts[0].derivationPath }] : [];
      });
    } catch (nextError) {
      setLedgerAccounts([]);
      setLedgerSelectedAccounts([]);
      setError(nextError instanceof Error ? nextError.message : 'Unable to scan Ledger accounts.');
    } finally {
      setScanningLedger(false);
    }
  }

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);

      if (isEasyPasskeyPath && !biometricSupported) {
        throw new Error('Passkey setup is not available on this device.');
      }

      if (isEasyPasskeyPath && easyRecoveryMode === 'trusted-recovery') {
        throw new Error('Trusted-device or account recovery is not available yet.');
      }

      if (needsExistingWalletPasswordForPasskey && password.trim().length < 8) {
        throw new Error('Enter your existing Grape password to add this passkey wallet.');
      }

      if (!isEasyPasskeyPath && mode === 'create' && !validateWalletMnemonic(mnemonic)) {
        throw new Error('Enter a valid 12-word or 24-word recovery phrase.');
      }

      if (!isEasyPasskeyPath && mode === 'create' && !confirmBackup) {
        throw new Error('Confirm that you backed up the recovery phrase.');
      }

      if (requiresPassword && password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (requiresPassword && password !== passwordConfirm) {
        throw new Error('Passwords do not match.');
      }

      if (isEasyPasskeyPath) {
        if (easyRecoveryMode === 'passkey-phrase' && !confirmBackup) {
          throw new Error('Confirm that you backed up the recovery phrase.');
        }
        if (easyRecoveryMode === 'passkey-only' && !confirmPasskeyOnlyAccess) {
          throw new Error('Confirm that you understand passkey-only access has no recovery fallback.');
        }
      }

      if (isEasyRestorePath && !parsedRestorePayload) {
        throw new Error('Paste a valid restore payload from your existing Grape device.');
      }

      const setupPassword = isEasyPasskeyPath ? generateSetupPassword() : password;
      let pendingBiometricConfig: Awaited<ReturnType<typeof createBiometricUnlock>> | null = null;

      if (isEasyPasskeyPath) {
        const passkeyPassword = needsExistingWalletPasswordForPasskey ? password : setupPassword;
        pendingBiometricConfig = await createBiometricUnlock('pending-easy-setup', passkeyPassword);
      }

      if (isEasyRestorePath) {
        await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_import_device_link',
          payload: restorePayload.trim(),
          pairingCode: restorePairingCode.trim(),
          password: setupPassword
        });
      } else if (mode === 'create') {
        const account = deriveSolanaAccount0(mnemonic);
        await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_create',
          mnemonic,
          password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
          publicKey: account.publicKey
        });
      } else if (importMethod === 'mnemonic') {
        if (!validateWalletMnemonic(mnemonic)) {
          throw new Error('Enter a valid 12-word or 24-word recovery phrase.');
        }
        const account = deriveSolanaAccount0(mnemonic);
        await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_import',
          mnemonic,
          password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
          publicKey: account.publicKey
        });
      } else {
        if (importMethod === 'private-key') {
          if (!validateImportedPrivateKey(privateKeyChain, importPrivateKey)) {
            throw new Error(`Enter a valid ${getChainLabel(privateKeyChain)} private key.`);
          }
          const importedPublicKey = importPrivateKeyForChain(privateKeyChain, importPrivateKey);
          await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_private_key',
            chain: privateKeyChain,
            privateKey: importPrivateKey.trim(),
            password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
            publicKey: importedPublicKey
          });
        } else if (importMethod === 'watch-only') {
          if (!validateWatchOnlyAddress(watchOnlyChain, watchOnlyPublicKey)) {
            throw new Error(`Enter a valid ${getChainLabel(watchOnlyChain)} wallet address.`);
          }
          await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_watch_only',
            chain: watchOnlyChain,
            publicKey: watchOnlyPublicKey.trim()
          });
        } else {
          if (ledgerSelectedAccounts.length === 0) {
            throw new Error('Connect your Ledger and choose at least one account first.');
          }
          if (ledgerSelectedAccounts.length === 1) {
            await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger',
              chain: ledgerChain,
              derivationPath: ledgerSelectedAccounts[0].derivationPath,
              password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
              publicKey: ledgerSelectedAccounts[0].publicKey
            });
          } else {
            await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger_batch',
              chain: ledgerChain,
              password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
              accounts: ledgerSelectedAccounts
            });
          }
        }
      }

      if (isEasyPasskeyPath) {
        await sendRuntimeMessage({
          type: 'wallet_set_biometric_unlock',
          config: pendingBiometricConfig
        });
      }

      if (props.onComplete) {
        await props.onComplete();
      } else {
        window.location.href = chrome.runtime.getURL('popup.html');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to set up wallet.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderStepContent() {
    if (step === 1) {
      return (
        <Card title="Choose setup path">
          <div className="stack">
            <p className="muted">Start with the simplest path first. Advanced custody is still available, but it should be intentional.</p>
            <div className="stack">
              <div className="space-between" style={{ alignItems: 'center' }}>
                <strong>Easy setup</strong>
                <span className="section-label">Recommended</span>
              </div>
              <button
                type="button"
                className={`choice-card ${isEasyPasskeyPath ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('easy');
                  setEasySetupMethod('passkey');
                  setMode('create');
                  setImportMethod('mnemonic');
                  setEasyRecoveryMode('passkey-phrase');
                  setConfirmBackup(false);
                  setConfirmPasskeyOnlyAccess(false);
                  setError(null);
                }}
              >
                <div className="space-between" style={{ alignItems: 'flex-start', gap: '12px' }}>
                  <strong>Create with passkey</strong>
                  <span className="section-label">Device unlock</span>
                </div>
                <span className="muted">Use the device security users already trust, with recovery options made explicit before they commit.</span>
              </button>
              <button
                type="button"
                className={`choice-card ${isEasyApprovalPath ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('easy');
                  setEasySetupMethod('approval');
                  setMode('create');
                  setImportMethod('mnemonic');
                  setError(null);
                }}
              >
                <div className="space-between" style={{ alignItems: 'flex-start', gap: '12px' }}>
                  <strong>Create from existing wallet approval</strong>
                  <span className="section-label">{existingWalletCount > 0 ? 'Coming next' : 'Needs wallet'}</span>
                </div>
                <span className="muted">
                  {existingWalletCount > 0
                    ? 'Approve setup from an existing wallet instead of forcing raw secret management on day one.'
                    : 'This path becomes available after you already have at least one wallet in Grape.'}
                </span>
              </button>
              <button
                type="button"
                className={`choice-card ${isEasyRestorePath ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('easy');
                  setEasySetupMethod('restore');
                  setMode('import');
                  setImportMethod('mnemonic');
                  setConfirmBackup(false);
                  setConfirmPasskeyOnlyAccess(false);
                  setError(null);
                }}
              >
                <strong>Restore from Grape</strong>
                <span className="muted">Move your wallet from another Grape device with a short-lived QR handoff and pairing code.</span>
              </button>
              <button
                type="button"
                className={`choice-card ${isEasyTrack && easySetupMethod === 'import' ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('easy');
                  setEasySetupMethod('import');
                  setMode('import');
                  setImportMethod('mnemonic');
                  setConfirmBackup(false);
                  setConfirmPasskeyOnlyAccess(false);
                  setError(null);
                }}
              >
                <strong>Import seed / private key</strong>
                <span className="muted">Use an existing recovery phrase or private key when you need the fastest live path right now.</span>
              </button>
              <div className="warning-box">
                <strong>Recovery options for easy setup</strong>
                <div className="stack" style={{ marginTop: '10px' }}>
                  <span>Passkey only</span>
                  <span>Passkey + recovery phrase</span>
                  <span>Passkey + trusted-device/account recovery</span>
                </div>
              </div>
            </div>
            <div className="stack">
              <div className="space-between" style={{ alignItems: 'center' }}>
                <strong>Advanced custody</strong>
                <Button
                  tone="secondary"
                  onClick={() => {
                    setShowAdvancedCustody((currentValue) => !currentValue);
                    setError(null);
                  }}
                >
                  {showAdvancedCustody ? 'Hide advanced' : 'Show advanced'}
                </Button>
              </div>
              <p className="muted">Reveal the raw custody paths only when you want full manual control.</p>
              {showAdvancedCustody ? (
                <div className="stack">
                  <button
                    type="button"
                    className={`choice-card ${setupTrack === 'advanced' && mode === 'create' ? 'active' : ''}`.trim()}
                    onClick={() => {
                      setSetupTrack('advanced');
                      setMode('create');
                      setError(null);
                    }}
                  >
                    <strong>Create new wallet</strong>
                    <span className="muted">Generate a fresh 12-word or 24-word recovery phrase for supported chains.</span>
                  </button>
                  <button
                    type="button"
                    className={`choice-card ${setupTrack === 'advanced' && mode === 'import' ? 'active' : ''}`.trim()}
                    onClick={() => {
                      setSetupTrack('advanced');
                      setMode('import');
                      setImportMethod('mnemonic');
                      setError(null);
                    }}
                  >
                    <strong>Import existing wallet</strong>
                    <span className="muted">Restore from a recovery phrase, private key, watch-only address, or Ledger.</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      );
    }

    if (step === 2) {
      return (
        <Card
          title={
            isEasyPasskeyPath
              ? 'Create with passkey'
              : isEasyApprovalPath
                ? 'Create from existing wallet approval'
                : isEasyRestorePath
                  ? 'Restore from Grape'
                : mode === 'create'
                  ? 'Back up recovery phrase'
                  : isEasyTrack
                    ? 'Import seed or private key'
                    : 'Import wallet'
          }
        >
          {isEasyPasskeyPath ? (
            <div className="stack">
              {!biometricSupported ? (
                <p className="danger-box">This device does not support secure passkey unlock. Use seed/private key import or advanced custody instead.</p>
              ) : null}
              <p className="muted">Choose how this passkey-backed wallet should recover if the device is lost.</p>
              <div className="stack">
                <button
                  type="button"
                  className={`choice-card ${easyRecoveryMode === 'passkey-phrase' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setEasyRecoveryMode('passkey-phrase');
                    setConfirmBackup(false);
                    setConfirmPasskeyOnlyAccess(false);
                    setError(null);
                  }}
                >
                  <strong>Passkey + recovery phrase</strong>
                  <span className="muted">Recommended. Device unlock for daily use, with a seed phrase fallback you keep offline.</span>
                </button>
                <button
                  type="button"
                  className={`choice-card ${easyRecoveryMode === 'passkey-only' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setEasyRecoveryMode('passkey-only');
                    setConfirmBackup(false);
                    setConfirmPasskeyOnlyAccess(false);
                    setError(null);
                  }}
                >
                  <strong>Passkey only</strong>
                  <span className="muted">Fastest setup. If the passkey is lost and not synced elsewhere, this wallet can be lost permanently.</span>
                </button>
                <button
                  type="button"
                  className={`choice-card ${easyRecoveryMode === 'trusted-recovery' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setEasyRecoveryMode('trusted-recovery');
                    setConfirmBackup(false);
                    setConfirmPasskeyOnlyAccess(false);
                    setError(null);
                  }}
                >
                  <div className="space-between" style={{ alignItems: 'flex-start', gap: '12px' }}>
                    <strong>Passkey + trusted-device/account recovery</strong>
                    <span className="section-label">Coming next</span>
                  </div>
                  <span className="muted">A trusted recovery model needs additional custody and approval infrastructure.</span>
                </button>
              </div>
            </div>
          ) : isComingSoonEasyPath ? (
            <div className="stack">
              <p className="warning-box">
                Wallet-approved setup is planned, but it is not live in this build yet.
              </p>
              <p className="muted">
                The recovery model for this path should be clear before anyone commits. That is the product shape, even though the runtime support is
                still pending.
              </p>
              <div className="choice-card active">
                <strong>Recovery design</strong>
                <div className="stack" style={{ marginTop: '10px' }}>
                  <span className="muted">Passkey only</span>
                  <span className="muted">Passkey + recovery phrase</span>
                  <span className="muted">Passkey + trusted-device/account recovery</span>
                </div>
              </div>
            </div>
          ) : isEasyRestorePath ? (
            <div className="stack">
              <p className="muted">
                On your existing device, open Settings, choose <strong>Link new device</strong>, then paste the restore payload here and enter the pairing code shown next to the QR.
              </p>
              <label className="stack">
                <div className="space-between" style={{ alignItems: 'center', gap: '12px' }}>
                  <span className="muted">Restore payload</span>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setRestoreScannerVisible((currentValue) => !currentValue);
                      setError(null);
                    }}
                  >
                    {restoreScannerVisible ? 'Close scanner' : 'Scan QR'}
                  </Button>
                </div>
                <TextArea
                  value={restorePayload}
                  onChange={(event) => setRestorePayload(event.target.value)}
                  placeholder="Paste the restore payload from your other Grape device"
                />
              </label>
              {restoreScannerVisible ? (
                <div className="device-link-scanner">
                  <video ref={restoreScannerVideoRef} className="device-link-scanner-video" muted />
                  <div className="device-link-scanner-copy">
                    <span>{restoreScannerLoading ? 'Starting camera…' : 'Point the camera at the Grape restore QR.'}</span>
                  </div>
                </div>
              ) : null}
              <label className="stack">
                <span className="muted">Pairing code</span>
                <Input
                  value={restorePairingCode}
                  onChange={(event) => setRestorePairingCode(event.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH"
                />
              </label>
              {parsedRestorePayload ? (
                <div className="choice-card active">
                  <strong>{parsedRestorePayload.walletName}</strong>
                  <span className="muted">
                    {getChainLabel(parsedRestorePayload.chain as ImportChain)} • {formatAddress(parsedRestorePayload.publicKey)}
                  </span>
                  <span className="muted">Expires {new Date(parsedRestorePayload.expiresAt).toLocaleString()}</span>
                </div>
              ) : restorePayload.trim() ? (
                <p className="warning-box">The restore payload could not be parsed yet. Copy it again from the existing Grape device.</p>
              ) : null}
            </div>
          ) : mode === 'create' ? (
            <div className="stack">
              <label className="stack">
                <span className="muted">Recovery phrase length</span>
                <div className="inline wrap-actions">
                  <Button
                    tone={mnemonicLength === 12 ? 'primary' : 'secondary'}
                    onClick={() => {
                      setMnemonicLength(12);
                      setConfirmBackup(false);
                    }}
                  >
                    12 words
                  </Button>
                  <Button
                    tone={mnemonicLength === 24 ? 'primary' : 'secondary'}
                    onClick={() => {
                      setMnemonicLength(24);
                      setConfirmBackup(false);
                    }}
                  >
                    24 words
                  </Button>
                </div>
              </label>
              <p className="warning-box">This phrase is shown once. Save it somewhere offline before you continue.</p>
              <MnemonicGrid words={generatedMnemonic.split(' ')} />
              <label className="inline checkbox-row">
                <input type="checkbox" checked={confirmBackup} onChange={(event) => setConfirmBackup(event.target.checked)} />
                <span>I saved this recovery phrase.</span>
              </label>
              <Button
                tone="secondary"
                onClick={() => {
                  setGeneratedMnemonic(generateWalletMnemonic(mnemonicLength));
                  setConfirmBackup(false);
                }}
              >
                Generate another phrase
              </Button>
            </div>
          ) : (
            <div className="stack">
              {isEasyTrack ? (
                <p className="muted">Easy setup currently supports importing a recovery phrase or private key. Ledger and watch-only stay in advanced custody.</p>
              ) : null}
              <div className="stack">
                <button
                  type="button"
                  className={`choice-card ${importMethod === 'mnemonic' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setImportMethod('mnemonic');
                    setError(null);
                  }}
                >
                  <strong>Recovery phrase</strong>
                  <span className="muted">Import from a valid 12-word or 24-word recovery phrase.</span>
                </button>
                <button
                  type="button"
                  className={`choice-card ${importMethod === 'private-key' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setImportMethod('private-key');
                    setLedgerSelectedAccounts([]);
                    setPrivateKeyChain('solana');
                    setError(null);
                  }}
                >
                  <strong>Private key</strong>
                  <span className="muted">Import from a Solana, Sui, Monad, or Ethereum private key.</span>
                </button>
                {!isEasyTrack ? (
                  <>
                    <button
                      type="button"
                      className={`choice-card ${importMethod === 'watch-only' ? 'active' : ''}`.trim()}
                      onClick={() => {
                        setImportMethod('watch-only');
                        setLedgerSelectedAccounts([]);
                        setWatchOnlyChain('solana');
                        setError(null);
                      }}
                    >
                      <strong>Watch-only wallet</strong>
                      <span className="muted">Track any public address and connect to dApps without signing.</span>
                    </button>
                    <button
                      type="button"
                      className={`choice-card ${importMethod === 'ledger' ? 'active' : ''}`.trim()}
                      onClick={() => {
                        setImportMethod('ledger');
                        setLedgerChain('solana');
                        setLedgerAccounts([]);
                        setLedgerSelectedAccounts([]);
                        setError(null);
                      }}
                    >
                      <strong>Ledger</strong>
                      <span className="muted">Connect a Ledger over WebHID and import supported hardware accounts.</span>
                    </button>
                  </>
                ) : null}
              </div>

              {importMethod === 'mnemonic' ? (
                <label className="stack">
                  <span className="muted">Recovery phrase</span>
                  <TextArea
                    placeholder="Enter your 12-word or 24-word recovery phrase"
                    value={importMnemonic}
                    onChange={(event) => setImportMnemonic(event.target.value)}
                  />
                  {importMnemonic.trim().length > 0 && !validateWalletMnemonic(mnemonic) ? (
                    <p className="danger-box">That recovery phrase is not valid.</p>
                  ) : null}
                </label>
              ) : importMethod === 'private-key' ? (
                <div className="stack">
                  <label className="stack">
                    <span className="muted">Chain</span>
                    <div className="inline wrap-actions">
                      <Button tone={privateKeyChain === 'solana' ? 'primary' : 'secondary'} onClick={() => setPrivateKeyChain('solana')}>
                        Solana
                      </Button>
                      <Button tone={privateKeyChain === 'sui' ? 'primary' : 'secondary'} onClick={() => setPrivateKeyChain('sui')}>
                        Sui
                      </Button>
                      <Button tone={privateKeyChain === 'monad' ? 'primary' : 'secondary'} onClick={() => setPrivateKeyChain('monad')}>
                        Monad
                      </Button>
                      <Button tone={privateKeyChain === 'ethereum' ? 'primary' : 'secondary'} onClick={() => setPrivateKeyChain('ethereum')}>
                        Ethereum
                      </Button>
                    </div>
                  </label>
                  <label className="stack">
                    <span className="muted">Private key</span>
                    <TextArea
                      placeholder={
                        privateKeyChain === 'solana'
                          ? 'Paste a base58 string, base64 string, or JSON byte array'
                          : privateKeyChain === 'sui'
                            ? 'Paste a suiprivkey string, base64 string, hex string, or JSON byte array'
                            : privateKeyChain === 'monad'
                              ? 'Paste a 32-byte hex private key'
                              : 'Paste a 32-byte hex private key'
                      }
                      value={importPrivateKey}
                      onChange={(event) => setImportPrivateKey(event.target.value)}
                    />
                    {importPrivateKey.trim().length > 0 && !validateImportedPrivateKey(privateKeyChain, importPrivateKey) ? (
                      <p className="danger-box">That {getChainLabel(privateKeyChain)} private key is not valid.</p>
                    ) : null}
                  </label>
                </div>
              ) : importMethod === 'watch-only' ? (
                <div className="stack">
                  <label className="stack">
                    <span className="muted">Chain</span>
                    <div className="inline wrap-actions">
                      <Button tone={watchOnlyChain === 'solana' ? 'primary' : 'secondary'} onClick={() => setWatchOnlyChain('solana')}>
                        Solana
                      </Button>
                      <Button tone={watchOnlyChain === 'sui' ? 'primary' : 'secondary'} onClick={() => setWatchOnlyChain('sui')}>
                        Sui
                      </Button>
                      <Button tone={watchOnlyChain === 'monad' ? 'primary' : 'secondary'} onClick={() => setWatchOnlyChain('monad')}>
                        Monad
                      </Button>
                      <Button tone={watchOnlyChain === 'ethereum' ? 'primary' : 'secondary'} onClick={() => setWatchOnlyChain('ethereum')}>
                        Ethereum
                      </Button>
                    </div>
                  </label>
                  <label className="stack">
                    <span className="muted">Public wallet address</span>
                    <TextArea
                      placeholder={
                        watchOnlyChain === 'solana'
                          ? 'Paste a Solana public key'
                          : watchOnlyChain === 'sui'
                            ? 'Paste a Sui wallet address'
                            : watchOnlyChain === 'monad'
                              ? 'Paste a Monad wallet address'
                              : 'Paste an Ethereum wallet address'
                      }
                      value={watchOnlyPublicKey}
                      onChange={(event) => setWatchOnlyPublicKey(event.target.value)}
                    />
                    <p className="warning-box">Watch-only wallets can view balances and connect to dApps, but they cannot sign messages or transactions.</p>
                    {watchOnlyPublicKey.trim().length > 0 && !validateWatchOnlyAddress(watchOnlyChain, watchOnlyPublicKey) ? (
                      <p className="danger-box">That {getChainLabel(watchOnlyChain)} wallet address is not valid.</p>
                    ) : null}
                  </label>
                </div>
              ) : (
                <div className="stack">
                  <label className="stack">
                    <span className="muted">Chain</span>
                    <div className="inline wrap-actions">
                      <Button
                        tone={ledgerChain === 'solana' ? 'primary' : 'secondary'}
                        onClick={() => {
                          setLedgerChain('solana');
                          setLedgerAccounts([]);
                          setLedgerSelectedAccounts([]);
                          setLedgerScanCount(LEDGER_ACCOUNT_SCAN_BATCH_SIZE);
                        }}
                      >
                        Solana
                      </Button>
                      <Button
                        tone={ledgerChain === 'monad' ? 'primary' : 'secondary'}
                        onClick={() => {
                          setLedgerChain('monad');
                          setLedgerAccounts([]);
                          setLedgerSelectedAccounts([]);
                          setLedgerScanCount(LEDGER_ACCOUNT_SCAN_BATCH_SIZE);
                        }}
                      >
                        Monad
                      </Button>
                      <Button
                        tone={ledgerChain === 'ethereum' ? 'primary' : 'secondary'}
                        onClick={() => {
                          setLedgerChain('ethereum');
                          setLedgerAccounts([]);
                          setLedgerSelectedAccounts([]);
                          setLedgerScanCount(LEDGER_ACCOUNT_SCAN_BATCH_SIZE);
                        }}
                      >
                        Ethereum
                      </Button>
                    </div>
                  </label>
                  <p className="muted">
                    Connect your Ledger, unlock it, open the {getChainLabel(ledgerChain)} app, then scan derived accounts on{' '}
                    {ledgerChain === 'solana' ? network : network === 'devnet' ? 'testnet' : 'mainnet'}. Sui Ledger support is
                    coming separately.
                  </p>
                  <div className="inline wrap-actions">
                    <Button tone="secondary" onClick={() => void scanLedgerAccounts()} disabled={scanningLedger}>
                      {scanningLedger ? 'Scanning...' : ledgerAccounts.length > 0 ? 'Rescan Ledger' : 'Scan Ledger accounts'}
                    </Button>
                    {ledgerAccounts.length > 0 ? (
                      <Button
                        tone="secondary"
                        onClick={() => void scanLedgerAccounts(ledgerScanCount + LEDGER_ACCOUNT_SCAN_BATCH_SIZE)}
                        disabled={scanningLedger}
                      >
                        Scan more
                      </Button>
                    ) : null}
                  </div>
                  {ledgerAccounts.length > 0 ? (
                    <div className="stack">
                      <div className="space-between">
                        <span className="muted">Detected accounts</span>
                        <span className="muted">Select one or more, sorted by balance</span>
                      </div>
                      <div className="stack">
                        {ledgerAccounts.map((account) => {
                          const accountKey = getLedgerCandidateKey(account);
                          const isActive = ledgerSelectedAccounts.some((entry) => getLedgerCandidateKey(entry) === accountKey);
                          return (
                            <button
                              key={`${account.publicKey}:${account.derivationPath}`}
                              type="button"
                              className={`choice-card ${isActive ? 'active' : ''}`.trim()}
                              onClick={() => {
                                setLedgerSelectedAccounts((currentSelected) =>
                                  currentSelected.some((entry) => getLedgerCandidateKey(entry) === accountKey)
                                    ? currentSelected.filter((entry) => getLedgerCandidateKey(entry) !== accountKey)
                                    : [...currentSelected, { publicKey: account.publicKey, derivationPath: account.derivationPath }]
                                );
                                setError(null);
                              }}
                            >
                              <div className="space-between">
                                <strong>{account.label ?? `Ledger account ${account.index}`}</strong>
                                <div className="inline" style={{ gap: '8px', alignItems: 'center' }}>
                                  {isActive ? <span className="section-label">Selected</span> : null}
                                  <span>{account.balanceLabel}</span>
                                </div>
                              </div>
                              <span className="muted mono">{formatAddress(account.publicKey)}</span>
                              <span className="muted mono">{account.derivationPath}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </Card>
      );
    }

    return (
      <Card title={isEasyPasskeyPath ? 'Finish passkey setup' : isEasyRestorePath ? 'Protect restored wallet' : requiresPassword ? 'Set password' : 'Watch-only ready'}>
        <div className="stack">
          {isEasyPasskeyPath ? (
            <>
              <p className="muted">Grape will create the wallet, protect it with a hidden local password, then bind device unlock to this wallet immediately.</p>
              {needsExistingWalletPasswordForPasskey ? (
                <label className="stack">
                  <span className="muted">Existing Grape password</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter the password already used by your other wallets"
                  />
                </label>
              ) : null}
              {easyRecoveryMode === 'passkey-phrase' ? (
                <>
                  <p className="warning-box">This recovery phrase is shown once. Save it somewhere offline before you finish.</p>
                  <MnemonicGrid words={generatedMnemonic.split(' ')} />
                  <label className="inline checkbox-row">
                    <input type="checkbox" checked={confirmBackup} onChange={(event) => setConfirmBackup(event.target.checked)} />
                    <span>I saved this recovery phrase.</span>
                  </label>
                </>
              ) : easyRecoveryMode === 'passkey-only' ? (
                <label className="inline checkbox-row">
                  <input
                    type="checkbox"
                    checked={confirmPasskeyOnlyAccess}
                    onChange={(event) => setConfirmPasskeyOnlyAccess(event.target.checked)}
                  />
                  <span>I understand that losing this passkey may permanently lock me out of this wallet.</span>
                </label>
              ) : (
                <p className="warning-box">Trusted-device or account recovery is not available yet. Choose passkey only or passkey plus recovery phrase.</p>
              )}
              {!biometricSupported ? <p className="danger-box">Passkey setup is not available on this device.</p> : null}
            </>
          ) : requiresPassword ? (
            <>
              <label className="stack">
                <span className="muted">Password</span>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label className="stack">
                <span className="muted">Confirm password</span>
                <Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
              </label>
              <p className="muted">
                {isAppendFlow
                  ? 'Use your existing wallet password so this wallet can be unlocked alongside the others.'
                  : isEasyRestorePath
                    ? 'Use at least 8 characters. This password protects the restored wallet on this device.'
                    : 'Use at least 8 characters. You will use this password to unlock and approve signing.'}
              </p>
            </>
          ) : (
            <p className="muted">
              Watch-only wallets do not store secrets locally, so no password is needed. You can view assets and connect to dApps, but signing stays disabled.
            </p>
          )}
          {error ? <p className="danger-box">{error}</p> : null}
        </div>
      </Card>
    );
  }

  function renderActions() {
    if (step === 1) {
      return (
        <Button className="button-block" onClick={() => setStep(2)}>
          Continue
        </Button>
      );
    }

    if (step === 2) {
      if (isComingSoonEasyPath) {
        return (
          <div className="inline wrap-actions">
            <Button tone="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => {
                setEasySetupMethod('import');
                setMode('import');
                setImportMethod('mnemonic');
                setError(null);
              }}
            >
              Use seed / private key
            </Button>
          </div>
        );
      }

      return (
        <div className="inline wrap-actions">
          <Button tone="secondary" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button
            onClick={() => {
              if (!isRecoveryStepValid) {
                setError(
                  isEasyPasskeyPath
                    ? !biometricSupported
                      ? 'Passkey setup is not available on this device.'
                      : easyRecoveryMode === 'trusted-recovery'
                        ? 'Trusted-device or account recovery is not available yet.'
                        : 'Choose a supported recovery model to continue.'
                    : isEasyRestorePath
                      ? !parsedRestorePayload
                        ? 'Paste a valid restore payload from your existing Grape device.'
                        : 'Enter the pairing code from your existing Grape device.'
                    : mode === 'create'
                    ? 'Confirm that you backed up the recovery phrase.'
                    : importMethod === 'mnemonic'
                      ? 'Enter a valid mnemonic.'
                      : importMethod === 'private-key'
                        ? `Enter a valid ${getChainLabel(privateKeyChain)} private key.`
                        : importMethod === 'watch-only'
                          ? `Enter a valid ${getChainLabel(watchOnlyChain)} wallet address.`
                          : 'Connect your Ledger and choose at least one account.'
                );
                return;
              }
              setError(null);
              setStep(3);
            }}
          >
            Continue
          </Button>
        </div>
      );
    }

    return (
      <div className="inline wrap-actions">
        <Button tone="secondary" onClick={() => setStep(2)}>
          Back
        </Button>
        <Button
          disabled={!isFinalStepValid}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Setting up...'
            : isEasyPasskeyPath
              ? 'Create with passkey'
              : isEasyRestorePath
                ? 'Restore wallet'
              : mode === 'create'
              ? 'Create wallet'
              : importMethod === 'ledger' && ledgerSelectedAccounts.length > 1
                ? `Import ${ledgerSelectedAccounts.length} wallets`
                : 'Import wallet'}
        </Button>
      </div>
    );
  }

  const content = (
    <>
      <div className="setup-progress" aria-label="Onboarding progress">
        <div className="setup-progress-copy">
          <span className="section-label">Step {step} of 3</span>
          <strong>
            {step === 1
              ? 'Choose your setup path'
              : step === 2
                ? isEasyPasskeyPath
                  ? 'Review passkey recovery options'
                  : isEasyApprovalPath
                    ? 'Review wallet-approved recovery options'
                    : isEasyRestorePath
                      ? 'Enter restore handoff'
                    : mode === 'create'
                      ? 'Save your recovery phrase'
                      : importMethod === 'mnemonic'
                        ? 'Enter your recovery phrase'
                        : importMethod === 'private-key'
                          ? `Enter your ${getChainLabel(privateKeyChain)} private key`
                          : importMethod === 'watch-only'
                            ? `Add a ${getChainLabel(watchOnlyChain)} wallet`
                            : 'Connect your Ledger'
                : requiresPassword
                  ? isEasyTrack
                    ? 'Secure this wallet'
                    : 'Set your password'
                  : isEasyPasskeyPath
                    ? 'Finish passkey setup'
                  : 'Review watch-only wallet'}
          </strong>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>
      {renderStepContent()}
      {step !== 3 && error ? <p className="danger-box">{error}</p> : null}
      {renderActions()}
    </>
  );

  if (props.compact) {
    return content;
  }

  return (
    <PageShell
      title={
        isAppendFlow
          ? setupTrack === 'advanced' && mode === 'create'
            ? 'Add wallet'
            : 'Add wallet to Grape'
          : setupTrack === 'easy'
            ? 'Easy setup'
            : 'Set up wallet'
      }
      subtitle={
        isAppendFlow
          ? setupTrack === 'advanced' && mode === 'create'
            ? 'Create another wallet set and add it to Grape.'
            : 'Add another wallet with the setup path that fits your recovery model.'
          : setupTrack === 'easy'
            ? 'Start with passkey-oriented onboarding or import a seed/private key, then reveal advanced custody only when you actually need it.'
            : mode === 'create'
              ? 'Create a new wallet for Grape-supported chains in a few clear steps.'
              : 'Import your wallet with a recovery phrase, private key, watch-only address, or Ledger.'
      }
    >
      {content}
    </PageShell>
  );
}

async function requestLedgerCandidates(input: {
  chain: LedgerImportChain;
  network: 'mainnet-beta' | 'devnet';
  count: number;
}): Promise<LedgerCandidate[]> {
  switch (input.chain) {
    case 'solana': {
      const candidateRpcEndpoints =
        input.network === 'devnet'
          ? ['https://api.devnet.solana.com']
          : ['https://api.mainnet-beta.solana.com', 'https://rpc.shyft.to?api_key=cb-RCXQBMM7kY7K6'];

      let accounts;
      let lastError: unknown = null;
      for (const rpcEndpoint of candidateRpcEndpoints) {
        try {
          accounts = await requestLedgerAccounts({
            rpcEndpoint,
            count: input.count
          });
          break;
        } catch (error) {
          lastError = error;
          if (!isForbiddenRpcError(error) || rpcEndpoint === candidateRpcEndpoints[candidateRpcEndpoints.length - 1]) {
            continue;
          }
        }
      }

      if (!accounts) {
        throw lastError ?? new Error('Ledger scan failed.');
      }

      return accounts.map((account: { index: number; publicKey: string; derivationPath: string; lamports: number; label?: string }) => ({
        index: account.index,
        publicKey: account.publicKey,
        derivationPath: account.derivationPath,
        balanceLabel: `${(account.lamports / 1_000_000_000).toLocaleString(undefined, {
          maximumFractionDigits: 6
        })} SOL`,
        label: account.label
      }));
    }
    case 'ethereum': {
      const network = input.network === 'devnet' ? 'sepolia' : 'mainnet';
      const accounts = await requestEthereumLedgerAccounts({
        network,
        count: input.count
      });

      return accounts.map((account: { index: number; publicKey: string; derivationPath: string; balanceLabel: string; label: string }) => ({
        index: account.index,
        publicKey: account.publicKey,
        derivationPath: account.derivationPath,
        balanceLabel: account.balanceLabel,
        label: account.label
      }));
    }
    case 'monad': {
      const network = input.network === 'devnet' ? 'testnet' : 'mainnet';
      const accounts = await requestMonadLedgerAccounts({
        network,
        count: input.count
      });

      return accounts.map((account: { index: number; publicKey: string; derivationPath: string; balanceLabel: string; label: string }) => ({
        index: account.index,
        publicKey: account.publicKey,
        derivationPath: account.derivationPath,
        balanceLabel: account.balanceLabel,
        label: account.label
      }));
    }
  }
}

function isForbiddenRpcError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();
  return normalized.includes('403') || normalized.includes('forbidden') || normalized.includes('access forbidden');
}
