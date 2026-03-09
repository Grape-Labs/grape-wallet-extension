import { useState } from 'react';

import { Button, Card, Input, KeyValueRow, StatusPill } from '@grape/ui';

import type { ApprovalRecord } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
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

export function ApprovalView(props: {
  approvalId: string;
  approval: ApprovalRecord;
  inline?: boolean;
  onResolved?: () => void;
}) {
  const { approval, approvalId, inline, onResolved } = props;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requiresPassword = approval.kind !== 'connect' && (approval.requiresPassword ?? true);

  async function handleResolved() {
    if (inline) {
      onResolved?.();
      return;
    }
    closeCurrentWindow();
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
                <KeyValueRow
                  label="Program ID"
                  value={
                    <span className="mono approval-address" title={instruction.programId}>
                      {formatAddress(instruction.programId)}
                    </span>
                  }
                />
                <KeyValueRow label="Accounts" value={instruction.accountCount} />
                {instruction.warning ? <p className="warning-box">{instruction.warning}</p> : null}
              </div>
            ))}
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
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password to sign"
            />
            <p className="muted">Grape never auto-approves signing requests.</p>
          </div>
        </Card>
      ) : null}

      {error ? <p className="danger-box">{error}</p> : null}

      <div className="inline approval-action-row">
        <Button
          tone="danger"
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
          onClick={async () => {
            try {
              setError(null);
              await sendRuntimeMessage({
                type: 'approval_respond',
                approvalId,
                approved: true,
                password: requiresPassword ? password : undefined
              });
              await handleResolved();
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : 'Unable to approve request.');
            }
          }}
        >
          Approve
        </Button>
      </div>
    </>
  );
}
