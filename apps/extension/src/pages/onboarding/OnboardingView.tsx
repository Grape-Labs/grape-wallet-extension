import { useEffect, useMemo, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { parseDeviceLinkPayloadText } from '@grape/core';

import { Button, Card, Input, MnemonicGrid, PageShell, TextArea } from '@grape/ui';
import { importEthereumPrivateKey, validateEthereumAddress, validateEthereumPrivateKey } from '@grape/ethereum';
import { importMonadPrivateKey, validateMonadAddress, validateMonadPrivateKey } from '@grape/monad';
import { importSuiPrivateKey, validateSuiAddress, validateSuiPrivateKey } from '@grape/sui';
import { ChainLogoBadge } from '../../shared/chains';
import {
  createDeterministicPasskeyWalletSetup,
  isDeterministicPasskeyWalletSupported,
} from '../../shared/biometric';
import {
  deriveSolanaAccount0,
  entropyToWalletMnemonic,
  generateWalletMnemonic,
  importSolanaPrivateKey,
  normalizeMnemonic,
  type WalletMnemonicLength,
  validateSolanaPrivateKey,
  validateWalletMnemonic
} from '@grape/solana';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { WalletStateResponse } from '../../shared/models';
import { authorizeLedgerTransport, requestLedgerAccounts } from '../../../../../packages/solana/src/ledger';
import { authorizeEthereumLedgerTransport, requestEthereumLedgerAccounts } from '../../../../../packages/ethereum/src/ledger';
import { authorizeMonadLedgerTransport, requestMonadLedgerAccounts } from '../../../../../packages/monad/src/ledger';
import { authorizeSuiLedgerTransport, requestSuiLedgerAccounts } from '../../../../../packages/sui/src/ledger';

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
type LedgerImportChain = 'solana' | 'sui' | 'monad' | 'ethereum';
type SetupStep = 1 | 2 | 3;
type LedgerCandidate = {
  index: number;
  publicKey: string;
  derivationPath: string;
  balanceLabel: string;
  label?: string;
};

const LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 16;
const PASSKEY_WALLET_SETUP_ENABLED = false;
const IMPORT_CHAIN_OPTIONS = [
  { id: 'solana', label: 'Solana', shortLabel: 'SOL' },
  { id: 'sui', label: 'Sui', shortLabel: 'SUI' },
  { id: 'monad', label: 'Monad', shortLabel: 'MON' },
  { id: 'ethereum', label: 'Ethereum', shortLabel: 'ETH' }
] as const satisfies ReadonlyArray<{ id: ImportChain; label: string; shortLabel: string }>;

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

function renderChainOptionButtons<TChain extends ImportChain>(input: {
  value: TChain;
  onChange: (chain: TChain) => void;
  onBeforeChange?: () => void;
}) {
  return (
    <div className="inline wrap-actions chain-option-grid">
      {IMPORT_CHAIN_OPTIONS.map((option) => {
        const active = input.value === option.id;
        return (
          <Button
            key={option.id}
            tone={active ? 'primary' : 'secondary'}
            className={`chain-option-button ${active ? 'active' : ''}`.trim()}
            onClick={() => {
              if (active) {
                return;
              }
              input.onBeforeChange?.();
              input.onChange(option.id as TChain);
            }}
          >
            <span className="chain-option-button-copy">
              <ChainLogoBadge chain={option.id} />
              <span>{option.label}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function generateSetupPassword() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function normalizeScannedRestorePayloadInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('grape-link:{') || trimmed.startsWith('{')) {
    return trimmed;
  }
  if (trimmed.startsWith('grape-link:')) {
    return `grape-link:${trimmed.slice('grape-link:'.length).replace(/\s+/g, '')}`;
  }
  return trimmed.replace(/\s+/g, '');
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
  const [network, setNetwork] = useState<'mainnet-beta' | 'devnet'>('mainnet-beta');
  const [scanningLedger, setScanningLedger] = useState(false);
  const [ledgerPermissionPrimed, setLedgerPermissionPrimed] = useState(false);
  const [mnemonicAccounts, setMnemonicAccounts] = useState<LedgerCandidate[]>([]);
  const [selectedMnemonicAccounts, setSelectedMnemonicAccounts] = useState<LedgerCandidate[]>([]);
  const [scanningMnemonicAccounts, setScanningMnemonicAccounts] = useState(false);
  const [importMethod, setImportMethod] = useState<ImportMethod>('mnemonic');
  const [ledgerChain, setLedgerChain] = useState<LedgerImportChain>('solana');
  const [privateKeyChain, setPrivateKeyChain] = useState<ImportChain>('solana');
  const [watchOnlyChain, setWatchOnlyChain] = useState<ImportChain>('solana');
  const [confirmBackup, setConfirmBackup] = useState(false);
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
  const [easyRecoveryMode, setEasyRecoveryMode] = useState<EasyRecoveryMode>('passkey-only');
  const [confirmPasskeyOnlyAccess, setConfirmPasskeyOnlyAccess] = useState(false);
  const restoreScannerVideoRef = useRef<HTMLVideoElement | null>(null);

  async function scanMnemonicAccounts() {
    if (!validateWalletMnemonic(mnemonic)) {
      setError('Enter a valid recovery phrase before scanning accounts.');
      return;
    }
    setScanningMnemonicAccounts(true);
    setError(null);
    try {
      const accounts = await sendRuntimeMessage<LedgerCandidate[]>({
        type: 'wallet_scan_mnemonic_accounts',
        mnemonic,
        count: 10
      });
      setMnemonicAccounts(accounts);
      setSelectedMnemonicAccounts(accounts.filter((account) => account.index === 0 || account.balanceLabel !== '0 SOL'));
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to scan derived accounts.');
    } finally {
      setScanningMnemonicAccounts(false);
    }
  }

  useEffect(() => {
    setGeneratedMnemonic(generateWalletMnemonic(mnemonicLength));
  }, [mnemonicLength]);

  useEffect(() => {
    if (requestedMode === 'create' || requestedMode === 'import') {
      setSetupTrack('advanced');
      setMode(requestedMode);
    }
  }, [requestedMode]);

  useEffect(() => {
    if (!PASSKEY_WALLET_SETUP_ENABLED && easySetupMethod === 'passkey') {
      setEasySetupMethod('import');
    }
  }, [easySetupMethod]);

  useEffect(() => {
    void (async () => {
      try {
        const state = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
        setNetwork(state.wallet.selectedNetwork);
        setExistingWalletCount(state.wallet.wallets.length);
        setHasPasswordProtectedWallet(state.wallet.wallets.some((wallet) => !!wallet.vault));
      } catch {
        setNetwork('mainnet-beta');
        setExistingWalletCount(0);
        setHasPasswordProtectedWallet(false);
      }
      if (!PASSKEY_WALLET_SETUP_ENABLED) {
        setBiometricSupported(false);
        return;
      }
      try {
        setBiometricSupported(await isDeterministicPasskeyWalletSupported());
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
            const normalizedPayload = normalizeScannedRestorePayloadInput(match.rawValue);
            try {
              parseDeviceLinkPayloadText(normalizedPayload);
              setRestorePayload(normalizedPayload);
              setRestoreScannerVisible(false);
              setError(null);
              return;
            } catch {
              setError('The scanned QR is not a valid Grape restore payload.');
            }
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
  const mnemonicWords = useMemo(() => (mnemonic ? mnemonic.split(' ') : []), [mnemonic]);
  const importMnemonicPreviewCount = useMemo(() => {
    if (importMethod !== 'mnemonic') {
      return 12;
    }

    if (mnemonicWords.length > 12) {
      return Math.max(24, mnemonicWords.length);
    }

    return 12;
  }, [importMethod, mnemonicWords.length]);
  const importMnemonicStatus = useMemo(() => {
    if (importMethod !== 'mnemonic') {
      return null;
    }

    if (mnemonicWords.length === 0) {
      return {
        tone: 'muted' as const,
        message: 'Enter each word in order. Grape accepts 12-word and 24-word recovery phrases.'
      };
    }

    if (validateWalletMnemonic(mnemonic)) {
      return {
        tone: 'success' as const,
        message: `Valid ${mnemonicWords.length}-word recovery phrase.`
      };
    }

    if (mnemonicWords.length < 12) {
      return {
        tone: 'muted' as const,
        message: `${mnemonicWords.length} of 12 words entered.`
      };
    }

    if (mnemonicWords.length === 12) {
      return {
        tone: 'warning' as const,
        message: '12 words entered. If Continue is still disabled, double-check the spelling of each word.'
      };
    }

    if (mnemonicWords.length < 24) {
      return {
        tone: 'warning' as const,
        message: `${mnemonicWords.length} words entered. Recovery phrases are usually exactly 12 or 24 words.`
      };
    }

    return {
      tone: 'danger' as const,
      message: `${mnemonicWords.length} words entered. Recovery phrases must be exactly 12 or 24 words.`
    };
  }, [importMethod, mnemonic, mnemonicWords]);
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
      ? biometricSupported && easyRecoveryMode === 'passkey-only'
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
  const needsPasswordConfirmation = requiresPassword && !isAppendFlow;
  const isPasswordStepValid =
    !requiresPassword || (!submitting && password.length >= 8 && (!needsPasswordConfirmation || password === passwordConfirm));
  const isFinalStepValid = isEasyPasskeyPath
    ? biometricSupported &&
      !needsExistingWalletPasswordForPasskey &&
      easyRecoveryMode === 'passkey-only' &&
      confirmPasskeyOnlyAccess
    : isPasswordStepValid;

async function scanLedgerAccounts(nextScanCount = ledgerScanCount) {
    try {
      setScanningLedger(true);
      setError(null);
      const accounts = await requestLedgerCandidates({
        chain: ledgerChain,
        network,
        count: nextScanCount,
        promptForPermission: false
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

  function handleLedgerScanClick(nextScanCount = ledgerScanCount) {
    if (scanningLedger) {
      return;
    }

    setError(null);
    setScanningLedger(true);

    const run = async () => {
      if (!ledgerPermissionPrimed) {
        switch (ledgerChain) {
          case 'solana':
            await authorizeLedgerTransport();
            break;
          case 'sui':
            await authorizeSuiLedgerTransport();
            break;
          case 'ethereum':
            await authorizeEthereumLedgerTransport();
            break;
          case 'monad':
            await authorizeMonadLedgerTransport();
            break;
        }
        setLedgerPermissionPrimed(true);
      }

      await scanLedgerAccounts(nextScanCount);
    };

    void run().catch((nextError) => {
      setLedgerAccounts([]);
      setLedgerSelectedAccounts([]);
      setError(nextError instanceof Error ? nextError.message : 'Unable to scan Ledger accounts.');
      setScanningLedger(false);
    });
  }

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);

      if (isEasyPasskeyPath && !biometricSupported) {
        throw new Error('Passkey wallet creation is temporarily hidden in this build.');
      }

      if (isEasyPasskeyPath && easyRecoveryMode !== 'passkey-only') {
        throw new Error('Deterministic passkey wallets currently support passkey-only recovery only.');
      }

      if (needsExistingWalletPasswordForPasskey) {
        throw new Error('Adding a deterministic passkey wallet to an existing password wallet set is not supported yet.');
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

      if (needsPasswordConfirmation && password !== passwordConfirm) {
        throw new Error('Passwords do not match.');
      }

      if (isEasyPasskeyPath) {
        if (!confirmPasskeyOnlyAccess) {
          throw new Error('Confirm that you understand passkey-only access has no recovery fallback.');
        }
      }

      if (isEasyRestorePath && !parsedRestorePayload) {
        throw new Error('Paste a valid restore payload from your existing Grape device.');
      }

      const setupPassword = isEasyPasskeyPath ? generateSetupPassword() : password;
      const pendingPasskeySetup = isEasyPasskeyPath ? await createDeterministicPasskeyWalletSetup() : null;
      const walletMnemonic = pendingPasskeySetup ? entropyToWalletMnemonic(pendingPasskeySetup.mnemonicEntropy) : mnemonic;
      const walletPassword = pendingPasskeySetup ? pendingPasskeySetup.vaultPassword : setupPassword;
      let importedState: WalletStateResponse | null = null;
      let importedChain: ImportChain | null = null;

      if (isEasyRestorePath) {
        importedState = await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_import_device_link',
          payload: restorePayload.trim(),
          pairingCode: restorePairingCode.trim(),
          password: setupPassword
        });
      } else if (mode === 'create') {
        const account = deriveSolanaAccount0(walletMnemonic);
        importedState = await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_create',
          mnemonic: walletMnemonic,
          password: walletPassword,
          publicKey: account.publicKey,
          biometricUnlockConfig: pendingPasskeySetup?.config
        });
      } else if (importMethod === 'mnemonic') {
        if (!validateWalletMnemonic(mnemonic)) {
          throw new Error('Enter a valid 12-word or 24-word recovery phrase.');
        }
        const account = deriveSolanaAccount0(walletMnemonic);
        importedState = await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_import',
          mnemonic: walletMnemonic,
          password: walletPassword,
          publicKey: account.publicKey,
          solanaAccounts:
            selectedMnemonicAccounts.length > 0
              ? selectedMnemonicAccounts.map(({ publicKey, derivationPath, index }) => ({ publicKey, derivationPath, index }))
              : undefined,
          biometricUnlockConfig: pendingPasskeySetup?.config
        });
      } else {
        if (importMethod === 'private-key') {
          if (!validateImportedPrivateKey(privateKeyChain, importPrivateKey)) {
            throw new Error(`Enter a valid ${getChainLabel(privateKeyChain)} private key.`);
          }
          const importedPublicKey = importPrivateKeyForChain(privateKeyChain, importPrivateKey);
          importedState = await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_private_key',
            chain: privateKeyChain,
            privateKey: importPrivateKey.trim(),
            password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
            publicKey: importedPublicKey
          });
          importedChain = privateKeyChain;
        } else if (importMethod === 'watch-only') {
          if (!validateWatchOnlyAddress(watchOnlyChain, watchOnlyPublicKey)) {
            throw new Error(`Enter a valid ${getChainLabel(watchOnlyChain)} wallet address.`);
          }
          importedState = await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_watch_only',
            chain: watchOnlyChain,
            publicKey: watchOnlyPublicKey.trim()
          });
          importedChain = watchOnlyChain;
        } else {
          if (ledgerSelectedAccounts.length === 0) {
            throw new Error('Connect your Ledger and choose at least one account first.');
          }
          if (ledgerSelectedAccounts.length === 1) {
            importedState = await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger',
              chain: ledgerChain,
              derivationPath: ledgerSelectedAccounts[0].derivationPath,
              password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
              publicKey: ledgerSelectedAccounts[0].publicKey
            });
          } else {
            importedState = await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger_batch',
              chain: ledgerChain,
              password: isEasyPasskeyPath && needsExistingWalletPasswordForPasskey ? password : setupPassword,
              accounts: ledgerSelectedAccounts
            });
          }
          importedChain = ledgerChain;
        }
      }

      if (importedState && importedChain) {
        const importedWalletId =
          importedState.wallet.selectedWalletIds[importedChain] ??
          importedState.wallet.wallets.find((wallet) => wallet.chain === importedChain)?.id;
        if (importedWalletId) {
          importedState = await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_select',
            walletId: importedWalletId
          });
        }
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
        <Card title="How do you want to add this wallet?">
          <div className="stack">
            <p className="muted">Pick the path that matches what you already have.</p>
            <div className="stack">
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
                <strong>Move from another Grape device</strong>
                <span className="muted">Use the QR handoff and pairing code from an existing Grape wallet.</span>
              </button>
              <button
                type="button"
                className={`choice-card ${setupTrack === 'advanced' && mode === 'create' ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('advanced');
                  setMode('create');
                  setConfirmBackup(false);
                  setConfirmPasskeyOnlyAccess(false);
                  setError(null);
                }}
              >
                <strong>Create new wallet</strong>
                <span className="muted">Generate a fresh recovery phrase and create a new wallet in Grape.</span>
              </button>
              <button
                type="button"
                className={`choice-card ${setupTrack === 'advanced' && mode === 'import' ? 'active' : ''}`.trim()}
                onClick={() => {
                  setSetupTrack('advanced');
                  setMode('import');
                  setImportMethod('mnemonic');
                  setConfirmBackup(false);
                  setConfirmPasskeyOnlyAccess(false);
                  setError(null);
                }}
              >
                <strong>Import existing wallet</strong>
                <span className="muted">Use a recovery phrase, private key, Ledger, or watch-only address.</span>
              </button>
            </div>
            <p className="muted">Wallet approval setup is planned, but it is not available in this build yet.</p>
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
                <p className="danger-box">Passkey setup is not available on this device or in this extension build.</p>
              ) : null}
              <p className="muted">This wallet will be derived directly from a WebAuthn PRF output under the shared Grape RP. Grape will open a secure wallet.grape.app window to create and verify the passkey.</p>
              <div className="stack">
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
                  <span className="muted">The same passkey deterministically recreates the same wallet. If the passkey is lost and not synced elsewhere, the wallet can be lost permanently.</span>
                </button>
                <p className="warning-box">Recovery phrase and trusted recovery are disabled for deterministic passkey wallets until a separate recovery design is implemented.</p>
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
                  onChange={(event) => setRestorePayload(normalizeScannedRestorePayloadInput(event.target.value))}
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
                    onChange={(event) => {
                      setImportMnemonic(event.target.value);
                      setMnemonicAccounts([]);
                      setSelectedMnemonicAccounts([]);
                    }}
                  />
                  {importMnemonicStatus ? (
                    importMnemonicStatus.tone === 'success' ? (
                      <p className="success-box">{importMnemonicStatus.message}</p>
                    ) : importMnemonicStatus.tone === 'warning' ? (
                      <p className="warning-box">{importMnemonicStatus.message}</p>
                    ) : importMnemonicStatus.tone === 'danger' ? (
                      <p className="danger-box">{importMnemonicStatus.message}</p>
                    ) : (
                      <p className="muted">{importMnemonicStatus.message}</p>
                    )
                  ) : null}
                  <MnemonicGrid words={mnemonicWords} totalWords={importMnemonicPreviewCount} emptyLabel="Empty" />
                  {validateWalletMnemonic(mnemonic) ? (
                    <Button
                      tone="secondary"
                      type="button"
                      onClick={() => void scanMnemonicAccounts()}
                      disabled={scanningMnemonicAccounts}
                    >
                      {scanningMnemonicAccounts ? 'Checking balances...' : 'Find derived accounts'}
                    </Button>
                  ) : null}
                  {mnemonicAccounts.length > 0 ? (
                    <div className="stack">
                      <span className="muted">Choose the Solana accounts to import</span>
                      <div className="ledger-account-list">
                        {mnemonicAccounts.map((account) => {
                          const selected = selectedMnemonicAccounts.some(
                            (candidate) => candidate.derivationPath === account.derivationPath
                          );
                          return (
                            <button
                              type="button"
                              key={account.derivationPath}
                              className={`ledger-account-card ${selected ? 'active' : ''}`.trim()}
                              onClick={() =>
                                setSelectedMnemonicAccounts((current) =>
                                  selected
                                    ? current.filter((candidate) => candidate.derivationPath !== account.derivationPath)
                                    : [...current, account].sort((left, right) => left.index - right.index)
                                )
                              }
                            >
                              <span><strong>Account {account.index + 1}</strong> · {account.balanceLabel}</span>
                              <span className="muted mono">{formatAddress(account.publicKey)} · {account.derivationPath}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </label>
              ) : importMethod === 'private-key' ? (
                <div className="stack">
                  <label className="stack">
                    <span className="muted">Chain</span>
                    {renderChainOptionButtons({
                      value: privateKeyChain,
                      onChange: setPrivateKeyChain
                    })}
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
                    {renderChainOptionButtons({
                      value: watchOnlyChain,
                      onChange: setWatchOnlyChain
                    })}
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
                    {renderChainOptionButtons({
                      value: ledgerChain,
                      onChange: setLedgerChain,
                      onBeforeChange: () => {
                        setLedgerAccounts([]);
                        setLedgerSelectedAccounts([]);
                        setLedgerScanCount(LEDGER_ACCOUNT_SCAN_BATCH_SIZE);
                      }
                    })}
                  </label>
                  <p className="muted">
                    Connect your Ledger, unlock it, open the {getChainLabel(ledgerChain)} app, then scan derived accounts on{' '}
                    {ledgerChain === 'solana' ? network : ledgerChain === 'sui' ? (network === 'devnet' ? 'devnet' : 'mainnet') : network === 'devnet' ? 'testnet' : 'mainnet'}.
                  </p>
                  <div className="inline wrap-actions">
                    <Button tone="secondary" onClick={() => handleLedgerScanClick()} disabled={scanningLedger}>
                      {scanningLedger ? 'Scanning...' : ledgerAccounts.length > 0 ? 'Rescan Ledger' : 'Scan Ledger accounts'}
                    </Button>
                    {ledgerAccounts.length > 0 ? (
                      <Button
                        tone="secondary"
                        onClick={() => handleLedgerScanClick(ledgerScanCount + LEDGER_ACCOUNT_SCAN_BATCH_SIZE)}
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
      <Card
        title={
          isEasyPasskeyPath
            ? 'Finish passkey setup'
            : isEasyRestorePath
              ? 'Protect restored wallet'
              : requiresPassword
                ? isAppendFlow
                  ? 'Use existing password'
                  : 'Set password'
                : 'Watch-only ready'
        }
      >
        <div className="stack">
          {isEasyPasskeyPath ? (
            <>
              <p className="muted">Grape will derive both the wallet seed and the local vault password from the same passkey PRF output. There is no separate hidden password or displayed recovery phrase in this mode.</p>
              <p className="muted">The passkey prompt runs on wallet.grape.app, then returns the encrypted result back to the extension.</p>
              {needsExistingWalletPasswordForPasskey ? (
                <p className="warning-box">Adding a deterministic passkey wallet to an existing password-protected wallet set is not supported yet.</p>
              ) : (
                <label className="inline checkbox-row">
                  <input
                    type="checkbox"
                    checked={confirmPasskeyOnlyAccess}
                    onChange={(event) => setConfirmPasskeyOnlyAccess(event.target.checked)}
                  />
                  <span>I understand that losing this passkey may permanently lock me out of this wallet.</span>
                </label>
              )}
              {!biometricSupported ? <p className="danger-box">Passkey setup is not available on this device or in this extension build.</p> : null}
            </>
          ) : requiresPassword ? (
            <>
              <label className="stack">
                <span className="muted">{isAppendFlow ? 'Existing password' : 'Password'}</span>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              {needsPasswordConfirmation ? (
                <label className="stack">
                  <span className="muted">Confirm password</span>
                  <Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
                </label>
              ) : null}
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
                      : 'Choose passkey only to continue.'
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
              ? 'Choose how to add this wallet'
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
                    : isAppendFlow
                      ? 'Use your existing password'
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
          ? 'Add wallet'
          : 'Set up wallet'
      }
      subtitle={
        isAppendFlow
          ? 'Choose the simplest way to add another wallet.'
          : mode === 'create'
            ? 'Create or import a wallet in a few clear steps.'
            : 'Choose the simplest way to get started.'
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
  promptForPermission?: boolean;
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
            count: input.count,
            promptForPermission: input.promptForPermission
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
        count: input.count,
        promptForPermission: input.promptForPermission
      });

      return accounts.map((account: { index: number; publicKey: string; derivationPath: string; balanceLabel: string; label: string }) => ({
        index: account.index,
        publicKey: account.publicKey,
        derivationPath: account.derivationPath,
        balanceLabel: account.balanceLabel,
        label: account.label
      }));
    }
    case 'sui': {
      const network = input.network === 'devnet' ? 'devnet' : 'mainnet';
      const accounts = await requestSuiLedgerAccounts({
        network,
        count: input.count,
        promptForPermission: input.promptForPermission
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
        count: input.count,
        promptForPermission: input.promptForPermission
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
