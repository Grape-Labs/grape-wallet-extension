import './governance-layout.css';
import { communitySpaceIds } from './communityAssociations';
import { useState } from 'react';
import { ChevronRight, Search, ShieldCheck, Vote, Users, ArrowUpRight } from 'lucide-react';
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
  const [query, setQuery] = useState('');
  const ids = [...new Set([...props.daos.map(d => d.daoId), ...props.reputation.spaces.map(s => s.daoId), ...props.verification.trackedSpaces])];
  const now = Date.now() / 1000;
  const needsVerification = props.verification.identities.filter(i => i.currentWalletLinked && (!i.verified || (i.expiresAt !== null && i.expiresAt <= now)));
  const pending = props.proposals.filter(p => p.stateCode === 2 && p.votingEndsAt !== null && p.votingEndsAt > now && (p.votingAt === null || p.votingAt <= now) && p.voteSources.some(s => !s.hasVoted));
  const voted = props.proposals.filter(p => p.hasVoted || p.recordedVotes?.length);
  const matchingIds = ids.filter(id => {
    const dao = props.daos.find(d => d.daoId === id);
    const rep = props.reputation.spaces.find(s => s.daoId === communitySpaceIds(id, !!dao).reputation);
    return [dao?.realmName, rep?.name, id].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  const displayedIds = query.trim() || showAll ? matchingIds : matchingIds.slice(0, 6);
  return <section className="community-dashboard" aria-label="Community dashboard">
    <header className="community-overview-heading"><div><span className="dashboard-eyebrow">Your governance network</span><h2>Communities</h2><p>Voting power, reputation and membership at a glance.</p></div><label className="community-search"><Search size={16} /><input aria-label="Search communities" placeholder="Find a community…" value={query} onChange={event => setQuery(event.target.value)} /></label></header>
    <div className="community-overview-stats" aria-label="Governance summary">
      <div><Users size={17} /><span><strong>{ids.length}</strong><small>Communities</small></span></div>
      <div><Vote size={17} /><span><strong>{props.daos.length}</strong><small>Participating DAOs</small></span></div>
      <div><ShieldCheck size={17} /><span><strong>{pending.length + needsVerification.length}</strong><small>Actions in loaded data</small></span></div>
    </div>
    <div className="community-dashboard-layout">
      <section className="community-attention" aria-label="Participation activity">
        <div className="community-attention-heading"><span className="community-activity-dot" /><h3>Participation activity</h3><span className="community-attention-count">{pending.length + needsVerification.length ? 'Review below' : 'No pending action loaded'}</span></div>
        <p className="community-dashboard-note">Open a DAO to check its proposals. Activity here covers loaded data only.</p>
        {props.loading ? <p role="status">Refreshing community data…</p> : null}
        {props.incomplete ? <p role="status" className="community-dashboard-note">Some community data is unavailable. Results may be incomplete.</p> : null}
        {pending.map(p => <button key={p.proposalId} type="button" className="community-attention-item" onClick={() => props.onDao(p.daoId)}><span><strong>{p.proposalName}</strong><small>{p.realmName} · Vote by {new Date(p.votingEndsAt! * 1000).toLocaleString()}</small></span><ChevronRight size={16} /></button>)}
        {needsVerification.length ? <button type="button" className="community-attention-item" onClick={() => props.onManage('verification')}><span><strong>Review verification</strong><small>{needsVerification.length} linked identit{needsVerification.length === 1 ? 'y needs' : 'ies need'} verification or renewal</small></span><ChevronRight size={16} /></button> : null}
        {!pending.length && !needsVerification.length && !props.loading ? <p className="community-dashboard-note">Choose a community below to view proposals and your participation.</p> : null}
        {voted.slice(0, 3).map(p => <button key={p.proposalId} type="button" className="community-attention-item" onClick={() => props.onDao(p.daoId)}><span><strong>Voted · {p.proposalName}</strong><small>{props.privacy ? 'Vote details hidden' : p.recordedVotes?.map(v => v.choice).join(', ') || 'Vote recorded'}</small></span><ChevronRight size={16} /></button>)}
      </section>
      <div className="unified-community-grid">
        {displayedIds.map(id => {
          const dao = props.daos.find(d => d.daoId === id);
          const spaces = communitySpaceIds(id, !!dao);
          const rep = props.reputation.spaces.find(s => s.daoId === spaces.reputation);
          const identities = props.verification.identities.filter(i => i.daoId === spaces.verification && i.currentWalletLinked);
          const verified = identities.filter(i => i.verified && (i.expiresAt === null || i.expiresAt > now)).length;
          const name = dao?.realmName || rep?.name || `${id.slice(0, 4)}…${id.slice(-4)}`;
          const powers = dao ? [
            { value: dao.communityVotingPower, decimals: dao.communityTokenDecimals, label: 'Community' },
            { value: dao.councilVotingPower, decimals: 0, label: 'Council' },
            { value: dao.delegateCommunityVotingPower, decimals: dao.communityTokenDecimals, label: 'Delegated community' },
            { value: dao.delegateCouncilVotingPower, decimals: 0, label: 'Delegated council' }
          ].filter(p => BigInt(p.value) > 0n) : [];
          return <article className="unified-community-card" key={id}>
            <button type="button" className="unified-community-title" onClick={() => props.onDao(id)}><span className="community-hub-avatar" aria-hidden="true">{name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{name}</strong><small>{dao ? 'Governance participant' : 'Tracked community'}</small></span><ChevronRight size={17} /></button>
            <div className="unified-community-metrics">
              {powers.map(p => <span key={p.label}><small>{p.label}</small><strong>{props.privacy ? '••••' : props.formatPower(BigInt(p.value), p.decimals)}</strong></span>)}
              {rep ? <span><small>Reputation</small><strong>{props.privacy ? '••••' : rep.effectivePoints} pts</strong></span> : null}
              {identities.length ? <span><small>Verification</small><strong>{verified}/{identities.length} verified</strong></span> : null}
            </div>
            <footer className="community-card-footer"><span>{props.proposals.filter(p => p.daoId === id && p.stateCode === 2 && p.votingEndsAt !== null && p.votingEndsAt > now && (p.votingAt === null || p.votingAt <= now)).length || 'No'} open votes loaded</span><button type="button" className="community-proposal-link" onClick={() => props.onDao(id)}>Open workspace <ArrowUpRight size={14} /></button></footer>
          </article>;
        })}
        {!query.trim() && ids.length > 6 ? <button type="button" className="community-show-all" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer communities' : `View all ${ids.length} communities`}</button> : null}
        {query.trim() && !matchingIds.length ? <p className="community-search-empty">No matching communities. <button type="button" onClick={() => setQuery('')}>Clear search</button></p> : null}
        {!ids.length && !props.loading ? <div className="unified-community-card"><h3>Find your community</h3><p>Add a space to track reputation and verification. DAOs with voting power appear automatically.</p><button type="button" onClick={() => props.onManage('reputation')}>Add a community</button></div> : null}
      </div>
    </div>
  </section>;
}
