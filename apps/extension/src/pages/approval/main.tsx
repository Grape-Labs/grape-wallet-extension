import { useEffect, useMemo, useState } from 'react';

import { PageShell } from '@grape/ui';

import type { ApprovalRecord } from '../../shared/models';

import { sendRuntimeMessage } from '../../shared/chrome';
import { ApprovalView } from './ApprovalView';
import { mountPage } from '../lib';

function ApprovalPage() {
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);

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

  return (
    <PageShell
      title="Review request"
      subtitle="Check the origin, network, and requested action before approving."
    >
      <ApprovalView approvalId={approvalId} approval={approval} />
    </PageShell>
  );
}

mountPage(<ApprovalPage />);
