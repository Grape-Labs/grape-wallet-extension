import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Input, MnemonicGrid, PageShell, TextArea } from '@grape/ui';
import {
  deriveSolanaAccount0,
  generateWalletMnemonic,
  importSolanaPrivateKey,
  normalizeMnemonic,
  requestLedgerAccount,
  validateSolanaPrivateKey,
  validateWalletMnemonic
} from '@grape/solana';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';

type OnboardingViewProps = {
  compact?: boolean;
  onComplete?: () => void | Promise<void>;
};

type SetupMode = 'create' | 'import';
type ImportMethod = 'mnemonic' | 'private-key' | 'ledger';
type SetupStep = 1 | 2 | 3;

export function OnboardingView(props: OnboardingViewProps) {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isAppendFlow = searchParams.get('append') === '1';
  const requestedMode = searchParams.get('mode');
  const [mode, setMode] = useState<SetupMode>('create');
  const [step, setStep] = useState<SetupStep>(1);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [ledgerAccount, setLedgerAccount] = useState<{ publicKey: string; derivationPath: string } | null>(null);
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
          : !!ledgerAccount;

  const isPasswordStepValid = !submitting && password.length >= 8 && password === passwordConfirm;

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

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (password !== passwordConfirm) {
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
        } else {
          if (!ledgerAccount) {
            throw new Error('Connect your Ledger and choose an account first.');
          }
          await sendRuntimeMessage<WalletStateResponse>({
            type: 'wallet_import_ledger',
            derivationPath: ledgerAccount.derivationPath,
            password,
            publicKey: ledgerAccount.publicKey
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
                    setLedgerAccount(null);
                    setError(null);
                  }}
                >
                  <strong>Private key</strong>
                  <span className="muted">Import from a Solana private key in base58, base64, or JSON array format.</span>
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
              ) : (
                <div className="stack">
                  <p className="muted">Connect your Ledger, unlock it, and open the Solana app before continuing.</p>
                  <Button
                    tone="secondary"
                    onClick={async () => {
                      try {
                        setError(null);
                        const account = await requestLedgerAccount();
                        setLedgerAccount(account);
                      } catch (nextError) {
                        setError(nextError instanceof Error ? nextError.message : 'Unable to connect to Ledger.');
                      }
                    }}
                  >
                    {ledgerAccount ? 'Reconnect Ledger' : 'Connect Ledger'}
                  </Button>
                  {ledgerAccount ? (
                    <div className="stack">
                      <div className="muted">Ledger account</div>
                      <div className="mono">{ledgerAccount.publicKey}</div>
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
      <Card title="Set password">
        <div className="stack">
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
                        : 'Connect your Ledger and choose an account.'
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
          {submitting ? 'Setting up...' : mode === 'create' ? 'Create wallet' : 'Import wallet'}
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
                      : 'Connect your Ledger'
                : 'Set your password'}
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
