import { createGovernanceRpcConnection } from '../../../../packages/solana/src/governanceRpc';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

// Run the actual loaders without starting the extension service worker or React Native.
function fixture(platform: 'mobile' | 'extension', options: { expired?: boolean; voted?: boolean; fail?: boolean; delegated?: boolean; noProposals?: boolean; proposalFailure?: boolean; v1?: boolean; scanLimit?: boolean; voteFailure?: boolean; governanceFailure?: boolean; partialProposals?: boolean } = {}) {
  const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
  const owner = key(1), realm = options.scanLimit ? new PublicKey('4ct8XU5tKbMNRphWy4rePsS9kBqPhDdvZoGpmprPaug4') : key(2), mint = key(3), proposalKey = key(4), governance = key(5), tor = key(6), delegator = key(7);
  const program = new PublicKey(options.scanLimit ? 'pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U' : 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
  const now = Math.floor(Date.now() / 1000);
  const membership = { pubkey: tor, account: { realm, governingTokenMint: mint, governingTokenOwner: options.delegated ? delegator : owner, governanceDelegate: options.delegated ? owner : key(8), governingTokenDepositAmount: 1234567890123456789n } };
  const proposal = { pubkey: proposalKey, account: { governance, governingTokenMint: mint, tokenOwnerRecord: tor, state: 2, name: 'Fund public goods', descriptionLink: '', votingAt: { toNumber: () => now - (options.expired ? 7200 : 60) }, draftAt: null, maxVotingTime: null, options: [{ label: 'Approve', voteWeight: 2000000n }], denyVoteWeight: 0n } };
  if (options.v1) Object.assign(proposal.account, { options: [], yesVotesCount: 2000000n, noVotesCount: 1000000n, denyVoteWeight: undefined, maxVotingTime: 1800 });
  const rpc = {
    rpcEndpoint: 'https://rpc.example.com',
    getAccountInfo: vi.fn(async () => ({ owner: program })),
    getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map(() => ({ data: Uint8Array.from({ length: 82 }, (_, i) => i === 44 ? 6 : 0) })))
  };
  const sdk = {
    ProposalState: { Draft: 0, SigningOff: 1, Voting: 2 },
    TokenOwnerRecord: class {},
    MemcmpFilter: class { constructor(public offset: number, public bytes: Uint8Array) {} },
    getRealm: vi.fn(async () => ({ account: { name: 'Example DAO', communityMint: mint, config: { councilMint: null } } })),
    getRealms: vi.fn(async () => [{ pubkey: realm, account: { name: 'Example DAO', communityMint: mint, config: { councilMint: null } } }]),
    getTokenOwnerRecordsByOwner: vi.fn(async (_c: unknown, p: PublicKey) => {
      if (options.fail) throw new Error('RPC unavailable');
      if (options.scanLimit && p.equals(program)) throw new Error('Response is too big: Scan limit exceeded');
      return p.equals(program) && !options.delegated ? [membership] : [];
    }),
    getGovernanceAccounts: vi.fn(async (_c: unknown, p: PublicKey, _class: unknown, filters: Array<{ offset: number }>) => {
      if (options.fail) throw new Error('RPC unavailable');
      return p.equals(program) && options.delegated && filters.some((filter) => filter.offset === 122) ? [membership] : [];
    }),
    getTokenOwnerRecordAddress: vi.fn(async () => tor),
    getTokenOwnerRecord: vi.fn(async () => membership),
    getAllGovernances: vi.fn(async () => {
      if (options.governanceFailure) throw new Error('RPC unavailable');
      const rows = [{ pubkey: governance, account: { config: { baseVotingTime: 3600 } } }];
      if (options.partialProposals) rows.push({ pubkey: key(9), account: { config: { baseVotingTime: 3600 } } });
      return rows;
    }),
    getProposalsByGovernance: vi.fn(async (_c: unknown, _p: unknown, governanceKey: PublicKey) => {
      if (options.partialProposals && governanceKey.equals(key(9))) throw new Error('RPC unavailable');
      if (options.proposalFailure) throw new Error('RPC unavailable');
      return options.noProposals ? [] : [proposal];
    }),
    getVoteRecordsByVoter: vi.fn(async (_c: unknown, _p: unknown, voter: PublicKey) => { if (options.voteFailure) throw new Error('RPC unavailable'); return options.voted && voter.equals(membership.account.governingTokenOwner) ? [{ account: { proposal: proposalKey, governingTokenOwner: voter, isRelinquished: false } }] : []; })
  };
  const path = resolve(platform === 'mobile' ? 'apps/mobile/src/governance.ts' : 'apps/extension/src/background/index.ts');
  let source = readFileSync(path, 'utf8');
  if (platform === 'extension') {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    source = ast.statements.filter((node) =>
      ts.isFunctionDeclaration(node) && node.name && /Governance|formatProposalStateLabel/.test(node.name.text) ||
      ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => /^(DEFAULT_GOVERNANCE_PROGRAM_ID|GOVERNANCE_OWNERS)$/.test(decl.name.getText(ast)))
    ).map((node) => node.getText(ast)).join('\n');
    source += '\nexports.load = fetchGovernanceForWallet;';
  }
  const exports: Record<string, (...args: any[]) => Promise<any>> = {};
  const fetch = vi.fn(() => { throw new Error('GraphQL must never be called'); });
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, ...sdk, PublicKey, fetch, console, createGovernanceRpcConnection,
    require: (name: string) => name.endsWith('/governanceRpc') ? { createGovernanceRpcConnection } : name === './config' ? { getMobileSolanaRpcUrl: () => 'https://rpc.example.com' } : name === '@solana/web3.js' ? { PublicKey, Connection: class { constructor() { return rpc; } } } : sdk
  });
  return { sdk, fetch, realm, owner, load: () => platform === 'mobile' ? exports.fetchMobileGovernanceForWallet(owner.toBase58(), []) : exports.load(rpc, owner, []) };
}

for (const platform of ['mobile', 'extension'] as const) {
  describe(`${platform} governance RPC`, () => {
    it('discovers membership and V2 proposals without GraphQL, using governance voting duration', async () => {
      const f = fixture(platform);
      const result = await f.load();
      expect(result.source).toBe('rpc');
      expect(result.memberDaos).toBe(1);
      expect(result.daos[0].realmName).toBe('Example DAO');
      expect(result.daos[0].proposalStatus).toBe('ready');
      expect(result.proposals[0]).toMatchObject({ canVote: true, yesVotes: '2000000', noVotes: '0' });
      expect(result.proposals[0].votingEndsAt - result.proposals[0].votingAt).toBe(3600);
      expect(f.fetch).not.toHaveBeenCalled();
      if (platform === 'mobile') expect(result.daos[0].votingPower[0].amount).toBe('1234567890123.456789');
      else expect(result.daos[0].communityTokenDecimals).toBe(6);
    });
    it('discovers delegated membership using the serialized delegate offset', async () => {
      const result = await fixture(platform, { delegated: true }).load();
      expect(result.memberDaos).toBe(1);
      expect(result.proposals[0]).toMatchObject({ canVote: true, isDelegate: true });
    });
    it('retains DAO membership when there are no proposals', async () => {
      const result = await fixture(platform, { noProposals: true }).load();
      expect(result.daos).toHaveLength(1);
      expect(result.proposals).toHaveLength(0);
    });
    it('keeps membership balances when proposal RPC fails', async () => {
      const result = await fixture(platform, { proposalFailure: true }).load();
      expect(result.daos).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.proposals).toHaveLength(0);
    });
    it('supports V1 vote counts and explicit voting duration', async () => {
      const result = await fixture(platform, { v1: true }).load();
      expect(result.proposals[0]).toMatchObject({ yesVotes: '2000000', noVotes: '1000000', hasDenyOption: true });
      expect(result.proposals[0].votingEndsAt - result.proposals[0].votingAt).toBe(1800);
    });
    it('uses direct membership addresses when a program scan hits provider limits', async () => {
      const f = fixture(platform, { scanLimit: true });
      const result = await f.load();
      expect(result.daos).toHaveLength(1);
      expect(result.proposals).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.discoveryWarnings.length).toBeGreaterThan(0);
      expect(f.sdk.getTokenOwnerRecordAddress).toHaveBeenCalled();
    });
    it('reuses discovery records without repeating membership scans per DAO', async () => {
      const f = fixture(platform);
      await f.load();
      const calls = f.sdk.getTokenOwnerRecordsByOwner.mock.calls.filter((call) => call[1].toBase58() === 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
      expect(calls).toHaveLength(1);
    });
    it('keeps successfully loaded proposals if another governance fails', async () => {
      const result = await fixture(platform, { partialProposals: true }).load();
      expect(result.proposals).toHaveLength(1);
      expect(result.daos[0].proposalStatus).toBe('unavailable');
    });
    it('keeps balances when governance scans fail without reporting zero proposals as confirmed', async () => {
      const result = await fixture(platform, { governanceFailure: true }).load();
      expect(result.daos).toHaveLength(1);
      expect(result.daos[0].proposalStatus).toBe('unavailable');
    });
    it('keeps proposals but disables voting when vote status cannot be checked', async () => {
      const result = await fixture(platform, { voteFailure: true }).load();
      expect(result.daos).toHaveLength(1);
      expect(result.proposals[0].canVote).toBe(false);
      expect(result.proposals[0].voteSources).toEqual([]);
    });
    it('does not offer a vote after the deadline', async () => {
      expect((await fixture(platform, { expired: true }).load()).proposals[0].canVote).toBe(false);
    });
    it('recognizes existing delegated votes', async () => {
      expect((await fixture(platform, { voted: true, delegated: true }).load()).proposals[0]).toMatchObject({ canVote: false, hasVoted: true });
    });
    it('reports failed discovery instead of asserting that the wallet has no DAOs', async () => {
      const result = await fixture(platform, { fail: true }).load();
      expect(result.discoveryWarnings.length).toBeGreaterThan(0);
    });
  });
}
