import type { Ref } from 'react';
import { AtSign, Check, ChevronRight, ExternalLink, Mail, MessageCircle, RefreshCcw, Send, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import type { WalletReputationResponse, WalletVerificationResponse } from '../../shared/models';

type Props = {
  reputation: WalletReputationResponse;
  verification: WalletVerificationResponse;
  reputationLoading: boolean;
  verificationLoading: boolean;
  reputationError: string | null;
  verificationError: string | null;
  effectivePoints: string;
  latestSeasonPoints: string;
  trackedVerificationSpaces: string[];
  daoNames: Map<string, string>;
  verificationRef: Ref<HTMLDivElement>;
  formatPoints: (value: string) => string;
  formatAddress: (value: string) => string;
  formatTime: (value: number) => string;
  onManage: () => void;
  onRefreshVerification: () => void;
  onOpenReputation: (daoId: string) => void;
  onOpenVerification: (daoId: string) => void;
};

const platforms = {
  discord: { label: 'Discord', Icon: MessageCircle },
  telegram: { label: 'Telegram', Icon: Send },
  twitter: { label: 'Twitter', Icon: AtSign },
  email: { label: 'Email', Icon: Mail },
  unknown: { label: 'Identity', Icon: ShieldCheck }
};

export function CommunityPanel(props: Props) {
  const { reputation, verification, reputationLoading, verificationLoading, reputationError, verificationError, formatPoints } = props;
  const groups = new Map<string, WalletVerificationResponse['identities']>();
  for (const identity of verification.identities) {
    const group = groups.get(identity.daoId) ?? [];
    group.push(identity);
    groups.set(identity.daoId, group);
  }
  const pending = verification.identities.filter((identity) => !identity.verified).length;
  const spaceCount = reputation.spaces.length;

  return (
    <div className="community-hub">
      <header className="community-hub-heading">
        <div><h2>Community</h2><p>Your reputation &amp; identities</p></div>
        <button className="community-hub-tool" onClick={props.onManage} type="button"><Settings size={14} /> Manage</button>
      </header>

      <section className="community-hub-section" aria-label="OG Reputation">
        <div className="community-hub-section-title"><h3><Sparkles size={14} /> OG Reputation</h3>{!reputationLoading && !reputationError && spaceCount > 0 ? <span>{spaceCount} space{spaceCount === 1 ? '' : 's'}</span> : null}</div>
        {reputationLoading ? <div className="community-hub-loading" role="status">Updating reputation…</div> : reputationError ? (
          <div className="community-hub-error" role="alert">{reputationError}</div>
        ) : spaceCount > 0 ? (
          <div className="community-reputation-card">
            <div className="community-reputation-overview">
              <div><span className="community-hub-eyebrow">Effective points</span><div className="community-reputation-total">{formatPoints(props.effectivePoints)}<span>pts</span></div></div>
              <div className="community-reputation-season"><strong>{formatPoints(props.latestSeasonPoints)} <span>pts</span></strong><span>Latest season earned</span></div>
            </div>
            <div className="community-reputation-spaces">
              {reputation.spaces.map((space) => (
                <button className="community-reputation-space" key={space.daoId} type="button" onClick={() => props.onOpenReputation(space.daoId)} aria-label={`Open ${space.name ?? 'reputation space'} in a new tab`}>
                  <span className="community-hub-avatar"><Sparkles size={18} />{space.imageUri ? <img src={space.imageUri} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : null}</span>
                  <span className="community-hub-copy"><strong>{space.name ?? `Space ${props.formatAddress(space.daoId)}`}</strong><small>Season {space.latestSeasonWithPoints} · {formatPoints(space.latestSeasonPoints)} pts</small></span>
                  {spaceCount > 1 ? <span className="community-space-score"><strong>{formatPoints(space.effectivePoints)}</strong><small>effective pts</small></span> : <span className="community-space-symbol">{space.symbol}</span>}
                  <ExternalLink size={13} className="community-hub-external" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="community-hub-empty"><Sparkles size={22} /><strong>Your reputation starts here</strong><p>Add a space to track your points across seasons.</p><button type="button" className="community-hub-text-action" onClick={props.onManage}>Add a space <ChevronRight size={14} /></button></div>
        )}
      </section>

      <section ref={props.verificationRef} className="community-hub-section" aria-label="Verification">
        <div className="community-hub-section-title"><h3><ShieldCheck size={15} /> Verification</h3><button type="button" className="community-hub-icon-button" onClick={props.onRefreshVerification} disabled={verificationLoading} aria-label="Refresh verification" title="Refresh verification"><RefreshCcw size={14} className={verificationLoading ? 'community-hub-spinning' : undefined} /></button></div>
        {verificationLoading ? <div className="community-hub-loading" role="status">Checking linked identities…</div> : verificationError ? (
          <div className="community-hub-error" role="alert"><span>{verificationError}</span><button className="community-hub-text-action" type="button" onClick={props.onRefreshVerification}>Try again <RefreshCcw size={13} /></button></div>
        ) : groups.size > 0 ? (
          <>
            <div className={`community-verification-summary${pending ? ' is-pending' : ''}`}><span>{pending ? <ShieldCheck size={14} /> : <Check size={14} />}{verification.totalVerified} of {verification.identities.length} identities verified</span>{pending ? <small>{pending} to verify</small> : <small>All set</small>}</div>
            <div className="community-identity-groups">
              {Array.from(groups, ([daoId, identities]) => (
                <div className="community-identity-group" key={daoId}>
                  <div className="community-identity-group-title"><strong>{props.daoNames.get(daoId) ?? `DAO ${props.formatAddress(daoId)}`}</strong><button className="community-hub-icon-button" type="button" onClick={() => props.onOpenVerification(daoId)} aria-label={`Manage identities for ${props.daoNames.get(daoId) ?? props.formatAddress(daoId)} in a new tab`} title="Manage identities"><ExternalLink size={13} /></button></div>
                  {identities.map((identity) => {
                    const { label, Icon } = platforms[identity.platform];
                    return <div key={identity.linkId} className="community-identity-row"><span className={`community-platform-icon platform-${identity.platform}`}><Icon size={17} /></span><div className="community-hub-copy"><strong>{label}</strong>{identity.expiresAt || identity.linkedWalletCount > 1 ? <small>{identity.expiresAt ? `Expires ${props.formatTime(identity.expiresAt)}` : `${identity.linkedWalletCount} wallets linked`}</small> : null}</div><span className={`community-identity-status${identity.verified ? ' is-verified' : ''}`}>{identity.verified ? <Check size={12} /> : null}{identity.verified ? 'Verified' : 'Unverified'}</span></div>;
                  })}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="community-hub-empty"><ShieldCheck size={22} /><strong>Connect your identities</strong><p>Link a social account to verify your place in a community.</p><button type="button" className="community-hub-text-action" onClick={() => props.trackedVerificationSpaces[0] ? props.onOpenVerification(props.trackedVerificationSpaces[0]) : props.onManage}>{props.trackedVerificationSpaces.length ? 'Verify an identity' : 'Add a community'} <ChevronRight size={14} /></button></div>
        )}
      </section>
    </div>
  );
}
