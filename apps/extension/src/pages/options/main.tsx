import { useEffect, useState } from 'react';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { mountPage } from '../lib';

function OptionsPage() {
  const [state, setState] = useState<WalletStateResponse | null>(null);

  const refresh = async () => {
    const nextState = await sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' });
    setState(nextState);
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!state) {
    return null;
  }

  return (
    <PageShell title="Settings" subtitle="Review site connections, session timeout, and network defaults.">
      <Card title="Session">
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

