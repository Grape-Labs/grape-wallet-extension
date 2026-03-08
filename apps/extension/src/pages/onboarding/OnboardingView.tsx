import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Input, MnemonicGrid, PageShell, StatusPill, TextArea } from '@grape/ui';
import { deriveSolanaAccount0, generateWalletMnemonic, normalizeMnemonic, validateWalletMnemonic } from '@grape/solana';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';

type OnboardingViewProps = {
  compact?: boolean;
  onComplete?: () => void | Promise<void>;
};

type SetupMode = 'create' | 'import';
type SetupStep = 1 | 2 | 3;

const STEP_LABELS: Record<SetupStep, string> = {
  1: 'Choose',
  2: 'Recovery',
  3: 'Password'
};

const STEP_SEQUENCE: SetupStep[] = [1, 2, 3];

export function OnboardingView(props: OnboardingViewProps) {
  const [mode, setMode] = useState<SetupMode>('create');
  const [step, setStep] = useState<SetupStep>(1);
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setGeneratedMnemonic(generateWalletMnemonic());
  }, []);

  const mnemonic = useMemo(
    () => normalizeMnemonic(mode === 'create' ? generatedMnemonic : importMnemonic),
    [generatedMnemonic, importMnemonic, mode]
  );

  const isRecoveryStepValid =
    mode === 'create' ? confirmBackup && validateWalletMnemonic(mnemonic) : validateWalletMnemonic(mnemonic);

  const isPasswordStepValid = !submitting && password.length >= 8 && password === passwordConfirm;

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);

      if (!validateWalletMnemonic(mnemonic)) {
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

      const account = deriveSolanaAccount0(mnemonic);
      const type = mode === 'create' ? 'wallet_create' : 'wallet_import';
      await sendRuntimeMessage<WalletStateResponse>({
        type,
        mnemonic,
        password,
        publicKey: account.publicKey
      });

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
                  setError(null);
                }}
              >
                <strong>Import existing wallet</strong>
                <span className="muted">Restore from a 12-word recovery phrase.</span>
              </button>
            </div>
          </div>
        </Card>
      );
    }

    if (step === 2) {
      return (
        <Card title={mode === 'create' ? 'Back up recovery phrase' : 'Enter recovery phrase'}>
          {mode === 'create' ? (
            <div className="stack">
              <p className="warning-box">
                This phrase is shown once. Store it offline before you continue.
              </p>
              <MnemonicGrid words={generatedMnemonic.split(' ')} />
              <label className="inline checkbox-row">
                <input type="checkbox" checked={confirmBackup} onChange={(event) => setConfirmBackup(event.target.checked)} />
                <span>I wrote down this recovery phrase.</span>
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
          <p className="muted">Use at least 8 characters. You will use this password to unlock and approve signing.</p>
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
                setError(mode === 'create' ? 'Confirm that you backed up the recovery phrase.' : 'Enter a valid mnemonic.');
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
      <div className="step-indicator" aria-label="Onboarding progress">
        {STEP_SEQUENCE.map((numericStep) => {
          return (
            <StatusPill key={numericStep} tone={numericStep === step ? 'success' : 'neutral'}>
              {numericStep}. {STEP_LABELS[numericStep]}
            </StatusPill>
          );
        })}
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
      title="Set up Grape"
      subtitle={mode === 'create' ? 'Create a new Solana wallet in three steps.' : 'Import your wallet in three steps.'}
    >
      {content}
    </PageShell>
  );
}
