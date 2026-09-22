import { useState } from 'react';
import { ChevronRight, Landmark, Settings, ShieldAlert } from 'lucide-react';
import type { GovernanceDaoSummary, WalletGovernanceProposal, WalletReputationResponse, WalletVerificationResponse } from '../../shared/models';

type Props = {
  daos: GovernanceDaoSummary[];
  reputation: WalletReputationResponse;
  verification: WalletVerificationResponse;
  proposals: WalletGovernanceProposal[];
  loading: boolean;
  incomplete: boolean;
  privacy: boolean;
  onDao: (id: string) => void;
  onManage: (section: 'reputation' | 'verification' | 'governance') => void;
  formatPower: (amount: bigint, decimals: number) => string;
};

export function CommunityDashboard(props: Props) {
  const [showAll, setShowAll] = useState(false);
  const ids = [...new Set([...props.daos.map(d => d.daoId), ...props.reputation.spaces.map(s => s.daoId), ...props.verification.trackedSpaces])];
  const now = Date.now() / 1000;
  const needsVerification = props.verification.identities.filter(i => i.currentWalletLinked && (!i.verified || (i.expiresAt !== null && i.expiresAt <= now)));
  const pending = props.proposals.filter(p => p.stateCode === 2 && p.votingEndsAt !== null && p.votingEndsAt > now && (p.votingAt === null || p.votingAt <= now) && p.voteSources.some(s => !s.hasVoted));
  const voted = props.proposals.filter(p => p.hasVoted || p.recordedVotes?.length);
  return <section className="community-dashboard" aria-label="Community dashboard">
    <div className="community-dashboard-heading"><div><span className="dashboard-eyebrow">Your place in the ecosystem</span><h2>My communities</h2><p>Membership, reputation, and participation in one place.</p></div><button type="button" onClick={() => props.onManage('reputation')}><Settings size={16} /> Manage</button></div>
    <div className="community-dashboard-layout">
      <section className="community-attention">
        <div className="community-dashboard-heading"><h3>Needs your attention</h3><ShieldAlert size={18} /></div>
        <p className="community-dashboard-note">Proposal checks run when you open a DAO. This panel reflects loaded proposals, not every DAO.</p>
        {props.loading ? <p role="status">Refreshing community data…</p> : null}
        {props.incomplete ? <p role="status" className="community-dashboard-note">Some community data is unavailable. Results may be incomplete.</p> : null}
        {pending.map(p => <button key={p.proposalId} type="button" className="community-attention-item" onClick={() => props.onDao(p.daoId)}><span><strong>{p.proposalName}</strong><small>{p.realmName} · Vote by {new Date(p.votingEndsAt! * 1000).toLocaleString()}</small></span><ChevronRight size={16} /></button>)}
        {needsVerification.length ? <button type="button" className="community-attention-item" onClick={() => props.onManage('verification')}><span><strong>Review verification</strong><small>{needsVerification.length} linked identit{needsVerification.length === 1 ? 'y needs' : 'ies need'} verification or renewal</small></span><ChevronRight size={16} /></button> : null}
        {!pending.length && !needsVerification.length && !props.loading ? <p className="community-dashboard-note">No action found in the data loaded so far. Open a community to check its proposals.</p> : null}
        {voted.slice(0, 3).map(p => <button key={p.proposalId} type="button" className="community-attention-item" onClick={() => props.onDao(p.daoId)}><span><strong>Voted · {p.proposalName}</strong><small>{props.privacy ? 'Vote details hidden' : p.recordedVotes?.map(v => v.choice).join(', ') || 'Vote recorded'}</small></span><ChevronRight size={16} /></button>)}
      </section>
      <div className="unified-community-grid">
        {(showAll ? ids : ids.slice(0, 4)).map(id => {
          const dao = props.daos.find(d => d.daoId === id);
          const rep = props.reputation.spaces.find(s => s.daoId === id);
          const identities = props.verification.identities.filter(i => i.daoId === id && i.currentWalletLinked);
          const verified = identities.filter(i => i.verified && (i.expiresAt === null || i.expiresAt > now)).length;
          const name = dao?.realmName || rep?.name || `${id.slice(0, 4)}…${id.slice(-4)}`;
          const powers = dao ? [
            { value: dao.communityVotingPower, decimals: dao.communityTokenDecimals, label: 'Community' },
            { value: dao.councilVotingPower, decimals: 0, label: 'Council' },
            { value: dao.delegateCommunityVotingPower, decimals: dao.communityTokenDecimals, label: 'Delegated community' },
            { value: dao.delegateCouncilVotingPower, decimals: 0, label: 'Delegated council' }
          ].filter(p => BigInt(p.value) > 0n) : [];
          return <article className="unified-community-card" key={id}>
            <button type="button" className="unified-community-title" onClick={() => props.onDao(id)}><span className="community-hub-avatar"><Landmark size={20} /></span><span><strong>{name}</strong><small>{dao ? 'Voting member' : 'Tracked community'}</small></span><ChevronRight size={17} /></button>
            <div className="unified-community-metrics">
              {powers.map(p => <span key={p.label}><small>{p.label}</small><strong>{props.privacy ? '••••' : props.formatPower(BigInt(p.value), p.decimals)}</strong></span>)}
              {rep ? <span><small>Reputation</small><strong>{props.privacy ? '••••' : rep.effectivePoints} pts</strong></span> : null}
              {identities.length ? <span><small>Verification</small><strong>{verified}/{identities.length} verified</strong></span> : null}
            </div>
            <button type="button" className="community-proposal-link" onClick={() => props.onDao(id)}>Open workspace <ChevronRight size={14} /></button>
          </article>;
        })}
        {ids.length > 4 ? <button type="button" className="community-show-all" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer communities' : `View all ${ids.length} communities`}</button> : null}
        {!ids.length && !props.loading ? <div className="unified-community-card"><h3>Find your community</h3><p>Add a space to track reputation and verification. DAOs with voting power appear automatically.</p><button type="button" onClick={() => props.onManage('reputation')}>Add a community</button></div> : null}
      </div>
    </div>
  </section>;
}
