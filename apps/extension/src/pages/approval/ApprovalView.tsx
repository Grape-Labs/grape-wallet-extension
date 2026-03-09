import { useEffect, useMemo, useState } from 'react';

import { Fingerprint } from 'lucide-react';

import { Button, Card, Input, KeyValueRow, StatusPill } from '@grape/ui';

import type { ApprovalRecord, WalletStateResponse } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { isBiometricUnlockSupported, unlockWithBiometric } from '../../shared/biometric';
import { closeCurrentWindow } from '../../shared/window';

function formatAddress(address: string | undefined, start = 6, end = 6): string {
  if (!address) {
    return 'Unknown';
  }

  if (address.length <= start + end + 3) {
    return address;
  }

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

function summarizeMessage(base64Message: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64Message), (item) => item.charCodeAt(0)));
  } catch {
    return 'Binary message';
  }
}

function renderInstructionValue(value: string, isAddress?: boolean) {
  if (!isAddress) {
    return value;
  }

  return (
    <span className="mono approval-address" title={value}>
      {formatAddress(value)}
    </span>
  );
}

export function ApprovalView(props: {
  approvalId: string;
  approval: ApprovalRecord;
  inline?: boolean;
  onResolved?: () => void;
}) {
  const { approval, approvalId, inline, onResolved } = props;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [walletState, setWalletState] = useState<WalletStateResponse | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricUnlocking, setBiometricUnlocking] = useState(false);
  const [showSimulationLogs, setShowSimulationLogs] = useState(false);
  const requiresPassword = approval.kind !== 'connect' && (approval.requiresPassword ?? true);
  const selectedWallet =
    walletState?.wallet.wallets.find((entry) => entry.id === walletState.wallet.selectedWalletId) ?? walletState?.wallet.wallets[0];
  const biometricEnabled = biometricSupported && !!selectedWallet?.biometricUnlock && !!walletState?.activeWallet?.biometricEnabled;
  const successCopy = useMemo(() => {
    switch (approval.kind) {
      case 'connect':
        return {
          title: 'Connected',
          body: 'Grape approved the connection request for this site.'
        };
      case 'sign-message':
        return {
          title: 'Message signed',
          body: 'The message was signed successfully and returned to the dApp.'
        };
      case 'sign-transaction':
      case 'sign-all-transactions':
        return {
          title: 'Signature approved',
          body: 'The signed transaction payload was returned to the dApp.'
        };
      case 'sign-and-send-transaction':
        return {
          title: 'Transaction submitted',
          body: 'The transaction was approved, signed, and broadcast successfully.'
        };
      default:
        return {
          title: 'Approved',
          body: 'The request was approved successfully.'
        };
    }
  }, [approval.kind]);

  async function handleResolved() {
    if (inline) {
      onResolved?.();
      return;
    }
    closeCurrentWindow();
  }

  useEffect(() => {
    void isBiometricUnlockSupported().then(setBiometricSupported).catch(() => setBiometricSupported(false));
    void sendRuntimeMessage<WalletStateResponse>({ type: 'wallet_get_state' })
      .then(setWalletState)
      .catch(() => setWalletState(null));
  }, []);

  async function handleBiometricUnlock() {
    if (!selectedWallet?.biometricUnlock) {
      return;
    }

    try {
      setBiometricUnlocking(true);
      setError(null);
      const nextPassword = await unlockWithBiometric(selectedWallet.biometricUnlock);
      const nextState = await sendRuntimeMessage<WalletStateResponse>({
        type: 'wallet_unlock',
        password: nextPassword
      });
      setPassword('');
      setWalletState(nextState);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to unlock with device.');
    } finally {
      setBiometricUnlocking(false);
    }
  }

  if (submitting) {
    return (
      <Card className="action-status-card">
        <div className="action-status-body">
          <div className="action-status-spinner" aria-hidden="true" />
          <StatusPill tone="warning">Working</StatusPill>
          <div className="action-status-copy">
            <h2>{approval.kind === 'sign-and-send-transaction' ? 'Submitting transaction' : 'Processing approval'}</h2>
            <p className="muted">
              Grape is finalizing this request. Keep this window open until it completes.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (approved) {
    return (
      <Card className="action-status-card action-status-card-success">
        <div className="action-status-body">
          <div className="action-status-check" aria-hidden="true">
            <span />
          </div>
          <StatusPill tone="success">Success</StatusPill>
          <div className="action-status-copy">
            <h2>{successCopy.title}</h2>
            <p className="muted">{successCopy.body}</p>
          </div>
          <Button className="button-block" onClick={() => void handleResolved()}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="inline approval-inline-header">
        <StatusPill tone="warning">{approval.kind}</StatusPill>
      </div>

      <Card title="Origin">
        <div className="origin-box">
          {approval.origin.faviconUrl ? <img src={approval.origin.faviconUrl} alt="" /> : null}
          <div>
            <strong>{approval.origin.title ?? approval.origin.origin}</strong>
            <div className="mono muted">{approval.origin.origin}</div>
          </div>
        </div>
      </Card>

      <Card title="Request details">
        <KeyValueRow label="Network" value={approval.network} />
        <KeyValueRow
          label="Account"
          value={
            <span className="mono approval-address" title={approval.publicKey}>
              {formatAddress(approval.publicKey)}
            </span>
          }
        />
        {approval.requestedPermissions?.length ? (
          <div className="stack">
            <span className="muted">Requested permissions</span>
            {approval.requestedPermissions.map((permission) => (
              <StatusPill key={permission}>{permission}</StatusPill>
            ))}
          </div>
        ) : null}
        {approval.request.method === 'signMessage' ? (
          <p className="warning-box">{summarizeMessage(approval.request.params.message)}</p>
        ) : null}
        {approval.request.method === 'signAllTransactions' ? (
          <p className="warning-box">
            This request asks to sign {approval.request.params.transactions.length} transactions.
          </p>
        ) : null}
        {approval.transactionSummary ? (
          <div className="stack">
            <KeyValueRow
              label="Fee payer"
              value={
                <span className="mono approval-address" title={approval.transactionSummary.feePayer ?? 'Unknown'}>
                  {formatAddress(approval.transactionSummary.feePayer)}
                </span>
              }
            />
            <KeyValueRow label="Instructions" value={approval.transactionSummary.instructionCount} />
            {approval.transactionSummary.instructions.map((instruction, index) => (
              <div key={`${instruction.programId}-${index}`} className="card">
                <KeyValueRow label="Program" value={instruction.programName} />
                {instruction.title ? <KeyValueRow label="Action" value={instruction.title} /> : null}
                <KeyValueRow
                  label="Program ID"
                  value={
                    <span className="mono approval-address" title={instruction.programId}>
                      {formatAddress(instruction.programId)}
                    </span>
                  }
                />
                <KeyValueRow label="Accounts" value={instruction.accountCount} />
                {instruction.details?.map((detail) => (
                  <KeyValueRow key={`${instruction.programId}-${index}-${detail.label}`} label={detail.label} value={renderInstructionValue(detail.value, detail.address)} />
                ))}
                {instruction.warning ? <p className="warning-box">{instruction.warning}</p> : null}
              </div>
            ))}
            {approval.transactionSummary.simulation ? (
              <div className="card approval-simulation-card">
                <div className="inline approval-simulation-header">
                  <span>Simulation</span>
                  <StatusPill tone={approval.transactionSummary.simulation.ok ? 'success' : 'danger'}>
                    {approval.transactionSummary.simulation.ok ? 'Passed' : 'Failed'}
                  </StatusPill>
                </div>
                {approval.transactionSummary.simulation.error ? (
                  <p className="warning-box">{approval.transactionSummary.simulation.error}</p>
                ) : (
                  <p className="muted approval-simulation-copy">
                    Grape simulated this transaction on the selected RPC before approval.
                  </p>
                )}
                {approval.transactionSummary.simulation.unitsConsumed != null ? (
                  <KeyValueRow label="Compute units" value={approval.transactionSummary.simulation.unitsConsumed.toLocaleString()} />
                ) : null}
                {approval.transactionSummary.simulation.logs.length > 0 ? (
                  <div className="stack">
                    <div className="approval-simulation-actions">
                      <button
                        type="button"
                        className="button secondary mini-button approval-simulation-toggle"
                        onClick={() => setShowSimulationLogs((current) => !current)}
                      >
                        {showSimulationLogs ? 'Hide logs' : 'Show logs'}
                      </button>
                      <p className="muted approval-simulation-hint">
                        {approval.transactionSummary.simulation.logs.length} log
                        {approval.transactionSummary.simulation.logs.length === 1 ? '' : 's'} available
                      </p>
                    </div>
                    {showSimulationLogs ? (
                      <div className="approval-log-box">
                        {approval.transactionSummary.simulation.logs.map((line, lineIndex) => (
                          <div key={`${approval.id}-simulation-log-${lineIndex}`} className="approval-log-line">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {approval.transactionSummary.warnings.map((warning) => (
              <p key={warning} className="warning-box">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        {approval.request.method === 'signAndSendTransaction' || approval.request.method === 'sendTransaction' ? (
          <p className="warning-box">This will sign and broadcast the transaction to the selected RPC endpoint.</p>
        ) : null}
      </Card>

      {requiresPassword ? (
        <Card title="Confirm password">
          <div className="stack">
            <div className="send-input-shell send-input-shell-sign">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password to sign"
              />
              {biometricEnabled ? (
                <button
                  type="button"
                  className="biometric-inline-button"
                  onClick={() => void handleBiometricUnlock()}
                  aria-label="Unlock with device"
                  title="Unlock with device"
                  disabled={biometricUnlocking}
                >
                  <Fingerprint size={16} />
                </button>
              ) : null}
            </div>
            <p className="muted">Grape never auto-approves signing requests.</p>
          </div>
        </Card>
      ) : null}

      {error ? <p className="danger-box">{error}</p> : null}

      <div className="inline approval-action-row">
        <Button
          tone="danger"
          disabled={submitting}
          onClick={async () => {
            await sendRuntimeMessage({
              type: 'approval_respond',
              approvalId,
              approved: false
            });
            await handleResolved();
          }}
        >
          Reject
        </Button>
        <Button
          disabled={submitting || (requiresPassword && !password.trim())}
          onClick={async () => {
            try {
              setSubmitting(true);
              setError(null);
              await sendRuntimeMessage({
                type: 'approval_respond',
                approvalId,
                approved: true,
                password: requiresPassword ? password : undefined
              });
              setApproved(true);
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : 'Unable to approve request.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Approve
        </Button>
      </div>
    </>
  );
}
