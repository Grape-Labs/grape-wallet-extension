import { useEffect, useState } from 'react';

import { Button, Card, Input, PageShell } from '@grape/ui';

import type { WalletStateResponse } from '../../shared/models';

import { isBiometricUnlockSupported, unlockWithBiometric } from '../../shared/biometric';
import { sendRuntimeMessage } from '../../shared/chrome';
import { closeCurrentWindow } from '../../shared/window';
import { mountPage } from '../lib';

function UnlockPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricUnlocking, setBiometricUnlocking] = useState(false);

  useEffect(() => {
    void sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' }).then(setState).catch(() => setState(null));
    void isBiometricUnlockSupported().then(setBiometricSupported).catch(() => setBiometricSupported(false));
  }, []);

  function resolveNextPath() {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    return redirect?.trim() ? redirect : 'wallet.html';
  }

  function handleUnlockSuccess() {
    const surface = document.body.dataset.surface;
    if (surface === 'popup') {
      closeCurrentWindow();
      return;
    }

    window.location.href = chrome.runtime.getURL(resolveNextPath());
  }

  async function handleBiometricUnlock() {
    const selectedWallet = state?.wallet.wallets.find((entry) => entry.id === state.wallet.selectedWalletId) ?? state?.wallet.wallets[0];
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setError(null);
      const unlockedPassword = await unlockWithBiometric(selectedWallet.biometricUnlock);
      await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password: unlockedPassword
      });
      handleUnlockSuccess();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to unlock with device.');
    } finally {
      setBiometricUnlocking(false);
    }
  }

  return (
    <PageShell title="Unlock" subtitle="Enter your password to open your wallet.">
      <Card title="Wallet locked">
        <div className="stack">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
          {error ? <p className="danger-box">{error}</p> : null}
          <Button
            onClick={async () => {
              try {
                setError(null);
                await sendRuntimeMessage<WalletStateResponse>({
                  type: 'wallet_unlock',
                  password
                });
                handleUnlockSuccess();
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : 'Unable to unlock wallet.');
              }
            }}
          >
            Unlock
          </Button>
          {biometricSupported && state?.activeWallet?.biometricEnabled ? (
            <Button tone="secondary" onClick={() => void handleBiometricUnlock()} disabled={biometricUnlocking}>
              {biometricUnlocking ? 'Checking device...' : 'Unlock with device'}
            </Button>
          ) : null}
        </div>
      </Card>
    </PageShell>
  );
}

mountPage(<UnlockPage />);
