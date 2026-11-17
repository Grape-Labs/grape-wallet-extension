import './governance-layout.css';
import { ArrowLeft, ExternalLink, Landmark, Vote, Award, ShieldCheck, Wallet, ArrowDown } from 'lucide-react';
import { GovernanceEmbed } from './GovernanceEmbed';
import type { GovernanceDaoSummary, TokenHolding, WalletReputationSpace, WalletVerificationIdentity } from '../../shared/models';

type Props = {
  id: string;
  governanceView: 'overview' | 'full';
  onGovernanceView: (view: 'overview' | 'full') => void;
  dao?: GovernanceDaoSummary;
  reputation?: WalletReputationSpace;
  reputationSpaceId?: string | null;
  verificationSpaceId?: string | null;
  identities: WalletVerificationIdentity[];
  tokens: TokenHolding[];
  privacy: boolean;
  loading: boolean;
  incomplete: boolean;
  onBack: () => void;
  onManage: (section: 'governance' | 'reputation' | 'verification') => void;
  onToken: (token: TokenHolding) => void;
  formatPower: (amount: bigint, decimals: number) => string;
};

export function CommunityWorkspace(props: Props) {
  const { dao, reputation: rep } = props;
  const name = dao?.realmName || rep?.name || `${props.id.slice(0, 4)}…${props.id.slice(-4)}`;
  const now = Date.now() / 1000;
  const powers = dao ? [
    { value: dao.communityVotingPower, decimals: dao.communityTokenDecimals, label: 'Your community power' },
    { value: dao.councilVotingPower, decimals: 0, label: 'Your council power' },
    { value: dao.delegateCommunityVotingPower, decimals: dao.communityTokenDecimals, label: 'Delegated community power' },
    { value: dao.delegateCouncilVotingPower, decimals: 0, label: 'Delegated council power' }
  ].filter(p => BigInt(p.value) > 0n) : [];
  const mask = (value: string) => props.privacy ? '••••' : value;
  return <section className={`community-workspace ${dao && props.governanceView === 'full' ? 'community-workspace-full' : ''}`.trim()} aria-label={`${name} community workspace`}>
    <button type="button" className="workspace-back" onClick={props.onBack}><ArrowLeft size={17} /> All communities</button>
    <header className="workspace-header"><span className="workspace-avatar" aria-hidden="true">{name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span><div className="workspace-header-copy"><small>Community workspace</small><h2>{name}</h2><p>{props.id.slice(0, 6)}…{props.id.slice(-6)}</p></div><span className="workspace-membership"><Landmark size={13} />{dao ? 'Governance participant' : 'Tracked community'}</span></header>
    {dao ? <div className="workspace-navigation"><div className="workspace-view-switch" role="group" aria-label="Governance view">
      <button type="button" aria-pressed={props.governanceView === 'overview'} onClick={() => props.onGovernanceView('overview')}>Overview</button>
      <button type="button" aria-pressed={props.governanceView === 'full'} onClick={() => props.onGovernanceView('full')}>Full governance</button>
    </div>{props.governanceView === 'overview' ? <a className="workspace-proposals-shortcut" href="#wallet-governance-proposals">View proposals <ArrowDown size={14} /></a> : null}</div> : null}
    {dao && props.governanceView === 'full' ? <GovernanceEmbed key={dao.daoId} daoId={dao.daoId} name={name} /> : <>
    {props.loading ? <p className="community-dashboard-note" role="status">Refreshing participation data…</p> : null}
    {props.incomplete ? <p className="community-dashboard-note" role="status">Some data could not be refreshed. Participation details may be incomplete.</p> : null}
    <div className="workspace-grid">
      {dao ? <section className="workspace-panel workspace-voting-panel"><div className="workspace-panel-heading"><h3><Vote size={17} />Voting power</h3><button type="button" onClick={() => props.onManage('governance')}>Manage DAOs</button></div>
        {powers.length ? <div className="workspace-metrics">{powers.map(p => <div key={p.label}><small>{p.label}</small><strong>{mask(props.formatPower(BigInt(p.value), p.decimals))}</strong></div>)}</div> : <p>No deposited or delegated voting power found in the loaded data.</p>}

      </section> : null}
      {props.reputationSpaceId ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3><Award size={17} />Reputation</h3><button type="button" onClick={() => props.onManage('reputation')}>Manage spaces</button></div>
        {rep ? <><div className="workspace-metrics"><div><small>Effective points</small><strong>{mask(rep.effectivePoints)}</strong></div><div><small>Season {rep.latestSeasonWithPoints}</small><strong>{mask(rep.latestSeasonPoints)} pts</strong></div></div>{rep.description ? <p>{rep.description}</p> : null}<a href={`https://reputation.governance.so/dao/${encodeURIComponent(props.reputationSpaceId!)}`} target="_blank" rel="noopener noreferrer">Open reputation <ExternalLink size={13} /></a></> : <p>No reputation record loaded for this community.</p>}
      </section> : null}
      {props.verificationSpaceId ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3><ShieldCheck size={17} />Verification</h3><button type="button" onClick={() => props.onManage('verification')}>Manage spaces</button></div>
        {props.identities.length ? <ul className="workspace-identities">{props.identities.map(identity => {
          const expired = identity.expiresAt !== null && identity.expiresAt <= now;
          return <li key={identity.identityId + identity.linkId}><span>{identity.platform}</span><strong className={expired || !identity.verified ? 'workspace-identity-pending' : 'workspace-identity-verified'}>{!expired && identity.verified ? <ShieldCheck size={12} /> : null}{expired ? 'Renew verification' : identity.verified ? 'Verified' : 'Needs verification'}</strong></li>;
        })}</ul> : <p>No linked identities found in the loaded data.</p>}
        <a href={`https://verification.governance.so/?daoId=${encodeURIComponent(props.verificationSpaceId!)}`} target="_blank" rel="noopener noreferrer">Verify for this community <ExternalLink size={13} /></a>
      </section> : null}
      {dao ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3><Wallet size={17} />Community assets</h3></div>
        {props.tokens.length ? <div className="workspace-token-list">{props.tokens.map(token => <button type="button" key={`${token.mint}:${token.programId}`} onClick={() => props.onToken(token)}><span>{token.name || token.symbol || 'Governance token'}</span><strong>{mask(token.amount)} {token.symbol}</strong></button>)}</div> : <p>No wallet token balances match the community or council mint. Deposited voting power is shown separately.</p>}
      </section> : null}
    </div>
    {dao || props.reputationSpaceId || props.verificationSpaceId ? <div className="workspace-apps"><h3>Community apps</h3>
      {dao ? <a href={`https://www.governance.so/dao/${encodeURIComponent(dao.daoId)}`} target="_blank" rel="noopener noreferrer">Grape Governance <ExternalLink size={14} /></a> : null}
      {props.reputationSpaceId ? <a href={`https://reputation.governance.so/dao/${encodeURIComponent(props.reputationSpaceId)}`} target="_blank" rel="noopener noreferrer">OG Reputation <ExternalLink size={14} /></a> : null}
      {props.verificationSpaceId ? <a href={`https://verification.governance.so/?daoId=${encodeURIComponent(props.verificationSpaceId)}`} target="_blank" rel="noopener noreferrer">Grape Verification <ExternalLink size={14} /></a> : null}
    </div> : null}
    </>}
  </section>;
}
