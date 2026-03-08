import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Input, KeyValueRow, PageShell, StatusPill } from '@grape/ui';

import type { ApprovalRecord } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { closeCurrentWindow } from '../../shared/window';
import { mountPage } from '../lib';

function summarizeMessage(base64Message: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64Message), (item) => item.charCodeAt(0)));
  } catch {
    return 'Binary message';
  }
}

function ApprovalPage() {
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const approvalId = useMemo(() => new URLSearchParams(window.location.search).get('approvalId'), []);

  useEffect(() => {
    if (!approvalId) {
      return;
    }
    void sendRuntimeMessage<ApprovalRecord | undefined>({
      type: 'approval_get',
      approvalId
    }).then((result) => setApproval(result ?? null));
  }, [approvalId]);

  if (!approvalId) {
    return (
      <PageShell title="Missing approval" subtitle="This approval request is missing an identifier." />
    );
  }

  if (!approval) {
    return (
      <PageShell title="Waiting for request" subtitle="The approval request may have been resolved already." />
    );
  }

  const requiresPassword = approval.kind !== 'connect';

  return (
    <PageShell
      title="Review request"
      subtitle="Check the origin, network, and requested action before approving."
      actions={<StatusPill tone="warning">{approval.kind}</StatusPill>}
    >
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
        <KeyValueRow label="Account" value={<span className="mono">{approval.publicKey}</span>} />
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
            <KeyValueRow label="Fee payer" value={<span className="mono">{approval.transactionSummary.feePayer ?? 'Unknown'}</span>} />
            <KeyValueRow label="Instructions" value={approval.transactionSummary.instructionCount} />
            {approval.transactionSummary.instructions.map((instruction, index) => (
              <div key={`${instruction.programId}-${index}`} className="card">
                <KeyValueRow label="Program" value={instruction.programName} />
                <KeyValueRow label="Program ID" value={<span className="mono">{instruction.programId}</span>} />
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
        {approval.request.method === 'signAndSendTransaction' ? (
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

      <div className="inline">
        <Button
          tone="danger"
          onClick={async () => {
            await sendRuntimeMessage({
              type: 'approval_respond',
              approvalId,
              approved: false
            });
            closeCurrentWindow();
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
              closeCurrentWindow();
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : 'Unable to approve request.');
            }
          }}
        >
          Approve
        </Button>
      </div>
    </PageShell>
  );
}

mountPage(<ApprovalPage />);
