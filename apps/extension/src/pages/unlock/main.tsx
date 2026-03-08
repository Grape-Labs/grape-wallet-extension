import { useState } from 'react';

import { Button, Card, Input, PageShell } from '@grape/ui';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { closeCurrentWindow } from '../../shared/window';
import { mountPage } from '../lib';

function UnlockPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

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
        </div>
      </Card>
    </PageShell>
  );
}

mountPage(<UnlockPage />);
