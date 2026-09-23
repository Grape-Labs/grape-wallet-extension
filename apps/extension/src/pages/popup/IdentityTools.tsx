import { useMemo, useState } from 'react';
import { ArrowUpRight, Copy, Check, ExternalLink, Search, ShieldAlert } from 'lucide-react';
import type { WalletSecurityReportResponse } from '../../shared/models';

type Props = {
  owner: string;
  report: WalletSecurityReportResponse | null;
  loading: boolean;
  error: string | null;
  network: 'mainnet-beta' | 'devnet';
  onAction: (action: 'rent' | 'stake' | 'send' | 'community' | 'governance') => void;
};
export function IdentityTools({ owner, report, loading, error, network, onAction }: Props) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const authorities = useMemo(() => {
    const result = new Map<string, { roles: Set<string>; assets: Set<string> }>();
    const add = (address: string | null, role: string, asset: string) => {
      if (!address) return;
      const row = result.get(address) ?? { roles: new Set<string>(), assets: new Set<string>() };
      row.roles.add(role); row.assets.add(asset); result.set(address, row);
    };
    report?.delegatedTokenAccounts.forEach(row => add(row.delegate, 'Token delegate', row.mint));
    report?.externalCloseAuthorities.forEach(row => add(row.closeAuthority, 'Close authority', row.mint));
    report?.controlledMints.forEach(row => {
      add(row.mintAuthority, 'Mint authority', row.mint);
      add(row.freezeAuthority, 'Freeze authority', row.mint);
    });
    return [...result].filter(([address, row]) => `${address} ${[...row.roles].join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  }, [report, query]);
  return <div className="identity-tools">
    <section className="identity-tools-hero"><ShieldAlert size={24} /><div><h2>Wallet tools</h2><p>Inspect permissions, manage participation, and maintain your wallet.</p></div></section>
    <div className="identity-tool-grid">
      {([
        ['rent', 'Reclaim rent', 'Review empty token accounts and reclaim eligible SOL.'],
        ['stake', 'Native staking', 'Manage delegated SOL and stake withdrawals.'],
        ['send', 'Send assets', 'Select a recipient and review a transfer.'],
        ['community', 'Identity & reputation', 'Review your linked identities and community standing.'],
        ['governance', 'Community workspaces', 'Voting power, proposals, and recorded votes.']
      ] as const).map(([action, title, description]) => <button type="button" key={action} onClick={() => onAction(action)}><strong>{title}<ArrowUpRight size={16} /></strong><small>{description}</small><span>In wallet</span></button>)}
    </div>
    <section className="identity-authorities">
      <div className="identity-section-heading"><div><h3>Authority map</h3><p>Addresses found in this wallet’s token permission scan.</p></div>{report ? <small>Scanned {new Date(report.scannedAt).toLocaleString()}</small> : null}</div>
      <label className="identity-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an address or authority role" aria-label="Search authority map" /></label>
      {loading ? <p role="status">Scanning token permissions…</p> : error ? <p role="alert">The scan could not be refreshed. Review the error below and retry.</p> : null}
      {report ? <><div className="identity-scan-counts"><span><strong>{report.delegatedTokenAccounts.length}</strong> delegated accounts</span><span><strong>{report.externalCloseAuthorities.length}</strong> external close authorities</span><span><strong>{report.controlledMints.length}</strong> controlled mints</span></div>
        {authorities.map(([address, row]) => <div key={address} className="identity-authority-row"><div><strong>{address === owner ? 'This wallet' : `${address.slice(0, 6)}…${address.slice(-6)}`}</strong><small>{[...row.roles].join(' · ')} · {row.assets.size} mint{row.assets.size === 1 ? '' : 's'}</small><code>{address}</code></div><a href={`https://explorer.solana.com/address/${address}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noopener noreferrer" aria-label={`Inspect authority ${address}`}>Inspect <ExternalLink size={13} /></a></div>)}
        {!authorities.length ? <p>{query ? 'No authorities match your search.' : 'No authority addresses found in the loaded scan.'}</p> : null}
        <p className="identity-tools-note">This map covers the scan’s token delegates and authorities, not every permission or program associated with your wallet. Review individual findings below before changing permissions.</p>
      </> : !loading ? <p>Run the scan below to populate the map.</p> : null}
    </section>
    <section className="identity-external-tools"><div className="identity-section-heading"><div><h3>Advanced Grape tools</h3><p>Open Grape Identity in a new tab. Connect your wallet there to use these tools.</p></div></div>
      <div className="identity-tool-grid">{[
        ['Transaction inspector & simulation', '/identity', 'Inspect instructions and preview sensitive actions.'],
        ['Address book & labels', '/identity?action=address-book', 'Manage named recipients in Grape Identity.'],
        ['Claim round manager', '/identity?action=claim-rounds', 'Configure community distribution rounds.'],
        ['Token administration', '/token', 'Mint, metadata, and authority management.'],
        ['NFT administration', '/nft', 'Collection and NFT management tools.']
      ].map(([title,path,description]) => <a key={path} href={`https://grapedao.org${path}`} target="_blank" rel="noopener noreferrer"><strong>{title}<ExternalLink size={14} /></strong><small>{description}</small><span>External app</span></a>)}</div>
      <div className="identity-profile-actions"><a href={`https://grapedao.org/identity/${owner}`} target="_blank" rel="noopener noreferrer">View public wallet profile <ExternalLink size={14} /></a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`https://grapedao.org/identity/${owner}`); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Profile link copied' : 'Copy profile link'}</button>{copyError ? <small role="alert">Could not copy. Open the profile to copy its URL.</small> : null}</div>
    </section>
  </div>;
}
