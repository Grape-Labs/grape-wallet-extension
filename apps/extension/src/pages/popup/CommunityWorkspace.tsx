import { ArrowLeft, ExternalLink, Landmark } from 'lucide-react';
import type { GovernanceDaoSummary, TokenHolding, WalletReputationSpace, WalletVerificationIdentity } from '../../shared/models';

type Props = {
  id: string;
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
  return <section className="community-workspace" aria-label={`${name} community workspace`}>
    <button type="button" className="workspace-back" onClick={props.onBack}><ArrowLeft size={17} /> All communities</button>
    <header className="workspace-header"><span className="workspace-avatar"><Landmark size={26} /></span><div><small>Community workspace</small><h2>{name}</h2><p>{dao ? 'Governance participant' : 'Tracked community'} · {props.id.slice(0, 6)}…{props.id.slice(-6)}</p></div></header>
    {props.loading ? <p className="community-dashboard-note" role="status">Refreshing participation data…</p> : null}
    {props.incomplete ? <p className="community-dashboard-note" role="status">Some data could not be refreshed. Participation details may be incomplete.</p> : null}
    <div className="workspace-grid">
      {dao ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Voting power</h3><button type="button" onClick={() => props.onManage('governance')}>Manage DAOs</button></div>
        {powers.length ? <div className="workspace-metrics">{powers.map(p => <div key={p.label}><small>{p.label}</small><strong>{mask(props.formatPower(BigInt(p.value), p.decimals))}</strong></div>)}</div> : <p>No deposited or delegated voting power found in the loaded data.</p>}
        {dao ? <p>Live and recent proposals appear below. Your recorded votes stay with each proposal.</p> : null}
      </section> : null}
      {props.reputationSpaceId ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Reputation</h3><button type="button" onClick={() => props.onManage('reputation')}>Manage spaces</button></div>
        {rep ? <><div className="workspace-metrics"><div><small>Effective points</small><strong>{mask(rep.effectivePoints)}</strong></div><div><small>Season {rep.latestSeasonWithPoints}</small><strong>{mask(rep.latestSeasonPoints)} pts</strong></div></div>{rep.description ? <p>{rep.description}</p> : null}<a href={`https://reputation.governance.so/dao/${encodeURIComponent(props.reputationSpaceId!)}`} target="_blank" rel="noopener noreferrer">Open reputation <ExternalLink size={13} /></a></> : <p>No reputation record loaded for this community.</p>}
      </section> : null}
      {props.verificationSpaceId ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Verification</h3><button type="button" onClick={() => props.onManage('verification')}>Manage spaces</button></div>
        {props.identities.length ? <ul className="workspace-identities">{props.identities.map(identity => {
          const expired = identity.expiresAt !== null && identity.expiresAt <= now;
          return <li key={identity.identityId + identity.linkId}><span>{identity.platform}</span><strong>{expired ? 'Renew verification' : identity.verified ? 'Verified' : 'Needs verification'}</strong></li>;
        })}</ul> : <p>No linked identities found in the loaded data.</p>}
        <a href={`https://verification.governance.so/?daoId=${encodeURIComponent(props.verificationSpaceId!)}`} target="_blank" rel="noopener noreferrer">Verify for this community <ExternalLink size={13} /></a>
      </section> : null}
      {dao ? <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Community assets</h3></div>
        {props.tokens.length ? <div className="workspace-token-list">{props.tokens.map(token => <button type="button" key={`${token.mint}:${token.programId}`} onClick={() => props.onToken(token)}><span>{token.name || token.symbol || 'Governance token'}</span><strong>{mask(token.amount)} {token.symbol}</strong></button>)}</div> : <p>No wallet token balances match the community or council mint. Deposited voting power is shown separately.</p>}
      </section> : null}
    </div>
    {dao || props.reputationSpaceId || props.verificationSpaceId ? <div className="workspace-apps"><h3>Community apps</h3>
      {dao ? <a href={`https://www.governance.so/dao/${encodeURIComponent(dao.daoId)}`} target="_blank" rel="noopener noreferrer">Grape Governance <ExternalLink size={14} /></a> : null}
      {props.reputationSpaceId ? <a href={`https://reputation.governance.so/dao/${encodeURIComponent(props.reputationSpaceId)}`} target="_blank" rel="noopener noreferrer">OG Reputation <ExternalLink size={14} /></a> : null}
      {props.verificationSpaceId ? <a href={`https://verification.governance.so/?daoId=${encodeURIComponent(props.verificationSpaceId)}`} target="_blank" rel="noopener noreferrer">Grape Verification <ExternalLink size={14} /></a> : null}
    </div> : null}
  </section>;
}
