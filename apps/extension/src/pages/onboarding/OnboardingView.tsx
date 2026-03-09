import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';

import { Button, Card, Input, MnemonicGrid, PageShell, TextArea } from '@grape/ui';
import {
  deriveSolanaAccount0,
  generateWalletMnemonic,
  importSolanaPrivateKey,
  LEDGER_ACCOUNT_SCAN_BATCH_SIZE,
  normalizeMnemonic,
  requestLedgerAccounts,
  validateSolanaPrivateKey,
  validateWalletMnemonic
} from '@grape/solana';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { getRpcEndpoint } from '../../shared/rpc';

type OnboardingViewProps = {
  compact?: boolean;
  onComplete?: () => void | Promise<void>;
};

type SetupMode = 'create' | 'import';
type ImportMethod = 'mnemonic' | 'private-key' | 'watch-only' | 'ledger';
type SetupStep = 1 | 2 | 3;
type LedgerCandidate = {
  index: number;
  publicKey: string;
  derivationPath: string;
  lamports: number;
  label?: string;
};

function getLedgerCandidateKey(account: Pick<LedgerCandidate, 'publicKey' | 'derivationPath'>) {
  return `${account.publicKey}:${account.derivationPath}`;
}

function formatLamports(lamports: number) {
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} SOL`;
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

export function OnboardingView(props: OnboardingViewProps) {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isAppendFlow = searchParams.get('append') === '1';
  const requestedMode = searchParams.get('mode');
  const [mode, setMode] = useState<SetupMode>('create');
  const [step, setStep] = useState<SetupStep>(1);
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
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setGeneratedMnemonic(generateWalletMnemonic());
  }, []);

  useEffect(() => {
    if (requestedMode === 'create' || requestedMode === 'import') {
      setMode(requestedMode);
    }
  }, [requestedMode]);

  useEffect(() => {
    void (async () => {
      try {
        const state = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
        setNetwork(state.wallet.selectedNetwork);
      } catch {
        setNetwork('devnet');
      }
    })();
  }, []);

  const mnemonic = useMemo(
    () => normalizeMnemonic(mode === 'create' || importMethod === 'mnemonic' ? (mode === 'create' ? generatedMnemonic : importMnemonic) : ''),
    [generatedMnemonic, importMnemonic, importMethod, mode]
  );

  const isRecoveryStepValid =
    mode === 'create'
      ? confirmBackup && validateWalletMnemonic(mnemonic)
      : importMethod === 'mnemonic'
        ? validateWalletMnemonic(mnemonic)
        : importMethod === 'private-key'
          ? validateSolanaPrivateKey(importPrivateKey)
          : importMethod === 'watch-only'
            ? validatePublicKey(watchOnlyPublicKey)
          : ledgerSelectedAccounts.length > 0;

  const requiresPassword = mode === 'create' || importMethod === 'mnemonic' || importMethod === 'private-key' || importMethod === 'ledger';
  const isPasswordStepValid = !requiresPassword || (!submitting && password.length >= 8 && password === passwordConfirm);

  async function scanLedgerAccounts(nextScanCount = ledgerScanCount) {
    try {
      setScanningLedger(true);
      setError(null);
      const accounts = await requestLedgerAccounts({
        rpcEndpoint: getRpcEndpoint(network),
        startIndex: 0,
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

      if (mode === 'create' && !validateWalletMnemonic(mnemonic)) {
        throw new Error('Enter a valid 12-word mnemonic.');
      }

      if (mode === 'create' && !confirmBackup) {
        throw new Error('Confirm that you backed up the recovery phrase.');
      }

      if (requiresPassword && password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (requiresPassword && password !== passwordConfirm) {
        throw new Error('Passwords do not match.');
      }

      if (mode === 'create') {
        const account = deriveSolanaAccount0(mnemonic);
        await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_create',
          mnemonic,
          password,
          publicKey: account.publicKey
        });
      } else if (importMethod === 'mnemonic') {
        if (!validateWalletMnemonic(mnemonic)) {
          throw new Error('Enter a valid 12-word mnemonic.');
        }
        const account = deriveSolanaAccount0(mnemonic);
        await sendRuntimeMessage<WalletStateResponse>({
          type: 'wallet_import',
          mnemonic,
          password,
          publicKey: account.publicKey
        });
      } else {
        if (importMethod === 'private-key') {
          if (!validateSolanaPrivateKey(importPrivateKey)) {
            throw new Error('Enter a valid Solana private key.');
          }
          const account = importSolanaPrivateKey(importPrivateKey);
          await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_private_key',
            privateKey: importPrivateKey.trim(),
            password,
            publicKey: account.publicKey
          });
        } else if (importMethod === 'watch-only') {
          if (!validatePublicKey(watchOnlyPublicKey)) {
            throw new Error('Enter a valid Solana wallet address.');
          }
          await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_watch_only',
            publicKey: watchOnlyPublicKey.trim()
          });
        } else {
          if (ledgerSelectedAccounts.length === 0) {
            throw new Error('Connect your Ledger and choose at least one account first.');
          }
          if (ledgerSelectedAccounts.length === 1) {
            await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger',
              derivationPath: ledgerSelectedAccounts[0].derivationPath,
              password,
              publicKey: ledgerSelectedAccounts[0].publicKey
            });
          } else {
            await sendRuntimeMessage<WalletStateResponse>({
              type: 'wallet_import_ledger_batch',
              password,
              accounts: ledgerSelectedAccounts
            });
          }
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
        <Card title="Choose setup path">
          <div className="stack">
            <p className="muted">Pick how you want to start using Grape.</p>
            <div className="stack">
              <button
                type="button"
                className={`choice-card ${mode === 'create' ? 'active' : ''}`.trim()}
                onClick={() => {
                  setMode('create');
                  setError(null);
                }}
              >
                <strong>Create new wallet</strong>
                <span className="muted">Generate a fresh 12-word recovery phrase.</span>
              </button>
              <button
                type="button"
                className={`choice-card ${mode === 'import' ? 'active' : ''}`.trim()}
                onClick={() => {
                  setMode('import');
                  setImportMethod('mnemonic');
                  setError(null);
                }}
              >
                <strong>Import existing wallet</strong>
                <span className="muted">Restore from a recovery phrase or a private key.</span>
              </button>
            </div>
          </div>
        </Card>
      );
    }

    if (step === 2) {
      return (
        <Card title={mode === 'create' ? 'Back up recovery phrase' : 'Import wallet'}>
          {mode === 'create' ? (
            <div className="stack">
              <p className="warning-box">This phrase is shown once. Save it somewhere offline before you continue.</p>
              <MnemonicGrid words={generatedMnemonic.split(' ')} />
              <label className="inline checkbox-row">
                <input type="checkbox" checked={confirmBackup} onChange={(event) => setConfirmBackup(event.target.checked)} />
                <span>I saved this recovery phrase.</span>
              </label>
              <Button
                tone="secondary"
                onClick={() => {
                  setGeneratedMnemonic(generateWalletMnemonic());
                  setConfirmBackup(false);
                }}
              >
                Generate another phrase
              </Button>
            </div>
          ) : (
            <div className="stack">
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
                  <span className="muted">Import from a 12-word mnemonic.</span>
                </button>
                <button
                  type="button"
                  className={`choice-card ${importMethod === 'private-key' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setImportMethod('private-key');
                    setLedgerSelectedAccounts([]);
                    setError(null);
                  }}
                >
                  <strong>Private key</strong>
                  <span className="muted">Import from a Solana private key in base58, base64, or JSON array format.</span>
                </button>
                <button
                  type="button"
                  className={`choice-card ${importMethod === 'watch-only' ? 'active' : ''}`.trim()}
                  onClick={() => {
                    setImportMethod('watch-only');
                    setLedgerSelectedAccounts([]);
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
                    setError(null);
                  }}
                >
                  <strong>Ledger</strong>
                  <span className="muted">Connect a Ledger over WebHID and use it as a hardware signer.</span>
                </button>
              </div>

              {importMethod === 'mnemonic' ? (
                <label className="stack">
                  <span className="muted">Recovery phrase</span>
                  <TextArea
                    placeholder="Enter your 12-word mnemonic"
                    value={importMnemonic}
                    onChange={(event) => setImportMnemonic(event.target.value)}
                  />
                  {importMnemonic.trim().length > 0 && !validateWalletMnemonic(mnemonic) ? (
                    <p className="danger-box">That recovery phrase is not valid.</p>
                  ) : null}
                </label>
              ) : importMethod === 'private-key' ? (
                <label className="stack">
                  <span className="muted">Private key</span>
                  <TextArea
                    placeholder="Paste a base58 string, base64 string, or JSON byte array"
                    value={importPrivateKey}
                    onChange={(event) => setImportPrivateKey(event.target.value)}
                  />
                  {importPrivateKey.trim().length > 0 && !validateSolanaPrivateKey(importPrivateKey) ? (
                    <p className="danger-box">That private key is not valid.</p>
                  ) : null}
                </label>
              ) : importMethod === 'watch-only' ? (
                <label className="stack">
                  <span className="muted">Public wallet address</span>
                  <TextArea
                    placeholder="Paste a Solana public key"
                    value={watchOnlyPublicKey}
                    onChange={(event) => setWatchOnlyPublicKey(event.target.value)}
                  />
                  <p className="warning-box">Watch-only wallets can view balances and connect to dApps, but they cannot sign messages or transactions.</p>
                  {watchOnlyPublicKey.trim().length > 0 && !validatePublicKey(watchOnlyPublicKey) ? (
                    <p className="danger-box">That wallet address is not valid.</p>
                  ) : null}
                </label>
              ) : (
                <div className="stack">
                  <p className="muted">Connect your Ledger, unlock it, open the Solana app, then scan derived accounts on {network}. Grape checks both current and legacy Solana Ledger derivation paths.</p>
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
                        <span className="muted">Select one or more, sorted by SOL balance</span>
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
                                  <span>{formatLamports(account.lamports)}</span>
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
      <Card title={requiresPassword ? 'Set password' : 'Watch-only ready'}>
        <div className="stack">
          {requiresPassword ? (
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
      return (
        <div className="inline wrap-actions">
          <Button tone="secondary" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button
            onClick={() => {
              if (!isRecoveryStepValid) {
                setError(
                  mode === 'create'
                    ? 'Confirm that you backed up the recovery phrase.'
                    : importMethod === 'mnemonic'
                      ? 'Enter a valid mnemonic.'
                      : importMethod === 'private-key'
                        ? 'Enter a valid Solana private key.'
                        : importMethod === 'watch-only'
                          ? 'Enter a valid Solana wallet address.'
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
          disabled={!isPasswordStepValid}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Setting up...'
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
              ? 'Choose how to start'
              : step === 2
                ? mode === 'create'
                  ? 'Save your recovery phrase'
                  : importMethod === 'mnemonic'
                    ? 'Enter your recovery phrase'
                    : importMethod === 'private-key'
                      ? 'Enter your private key'
                      : importMethod === 'watch-only'
                        ? 'Add a public wallet'
                        : 'Connect your Ledger'
                : requiresPassword
                  ? 'Set your password'
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
      title={isAppendFlow ? (mode === 'create' ? 'Add wallet' : 'Import wallet') : 'Set up wallet'}
      subtitle={
        isAppendFlow
          ? mode === 'create'
            ? 'Create another wallet and add it to Grape.'
            : 'Import another wallet into Grape.'
          : mode === 'create'
            ? 'Create a new wallet in a few clear steps.'
            : 'Import your wallet with a recovery phrase or private key.'
      }
    >
      {content}
    </PageShell>
  );
}
