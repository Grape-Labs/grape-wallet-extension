import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Input, MnemonicGrid, PageShell, TextArea } from '@grape/ui';
import { deriveSolanaAccount0, generateWalletMnemonic, normalizeMnemonic, validateWalletMnemonic } from '@grape/solana';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { mountPage } from '../lib';

function OnboardingPage() {
  const [mode, setMode] = useState<'create' | 'import'>('create');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGeneratedMnemonic(generateWalletMnemonic());
  }, []);

  const mnemonic = useMemo(
    () => normalizeMnemonic(mode === 'create' ? generatedMnemonic : importMnemonic),
    [generatedMnemonic, importMnemonic, mode]
  );

  const canSubmit =
    password.length >= 8 &&
    password === passwordConfirm &&
    validateWalletMnemonic(mnemonic) &&
    (mode === 'import' || confirmBackup);

  return (
    <PageShell title="Set up Grape" subtitle="Generate a new 12-word wallet or import an existing mnemonic.">
      <Card
        title="Choose setup path"
        footer={
          <div className="inline">
            <Button tone={mode === 'create' ? 'primary' : 'secondary'} onClick={() => setMode('create')}>
              Create
            </Button>
            <Button tone={mode === 'import' ? 'primary' : 'secondary'} onClick={() => setMode('import')}>
              Import
            </Button>
          </div>
        }
      >
        {mode === 'create' ? (
          <div className="stack">
            <p className="warning-box">
              This recovery phrase is shown once. Store it offline before continuing.
            </p>
            <MnemonicGrid words={generatedMnemonic.split(' ')} />
            <label className="inline">
              <input type="checkbox" checked={confirmBackup} onChange={(event) => setConfirmBackup(event.target.checked)} />
              <span>I backed up this recovery phrase.</span>
            </label>
            <Button tone="secondary" onClick={() => setGeneratedMnemonic(generateWalletMnemonic())}>
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
          </label>
        )}
      </Card>

      <Card title="Set a password">
        <div className="stack">
          <label className="stack">
            <span className="muted">Password</span>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="stack">
            <span className="muted">Confirm password</span>
            <Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
          </label>
          {error ? <p className="danger-box">{error}</p> : null}
        </div>
      </Card>

      <Button
        disabled={!canSubmit}
        onClick={async () => {
          try {
            setError(null);
            if (!validateWalletMnemonic(mnemonic)) {
              throw new Error('Enter a valid 12-word mnemonic.');
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
            window.location.href = chrome.runtime.getURL('popup.html');
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Unable to set up wallet.');
          }
        }}
      >
        {mode === 'create' ? 'Create wallet' : 'Import wallet'}
      </Button>
    </PageShell>
  );
}

mountPage(<OnboardingPage />);

