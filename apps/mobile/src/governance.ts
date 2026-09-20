import { describeGovernanceVote } from '../../../packages/solana/src/governanceVote';
import { createGovernanceRpcConnection, createGovernanceRpcReadSession } from '../../../packages/solana/src/governanceRpc';
import { getMobileSolanaRpcUrl } from './config';

const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';
const DEFAULT_GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const GOVERNANCE_PROGRAM_VERSION_V1 = 1;
const GOVERNANCE_PROGRAM_VERSION_V2 = 2;
const GOVERNANCE_PROGRAM_VERSION_V3 = 3;

type GovernanceOwner = {
  owner: string;
  name: string;
  dao: string;
};

type GovernanceRealmInfo = {
  daoId: string;
  name: string;
  communityMint: string;
  councilMint: string | null;
};

type GovernanceMembershipRecord = {
  pubkey: string;
  governingTokenMint: string;
  governingTokenOwner: string;
  governanceDelegate: string | null;
  governingTokenDepositAmount: string;
};

export type MobileGovernanceProposalChoice = {
  rank: number;
  label: string;
  voteWeight: string;
  voteResult?: string | null;
};

export type MobileGovernanceProposalVoteSource = {
  tokenOwnerRecordId: string;
  governingTokenOwner: string;
  isDelegate: boolean;
  hasVoted: boolean;
};

export type MobileGovernanceProposal = {
  daoId: string;
  realmName: string;
  governanceProgramId: string;
  governanceId: string;
  proposalId: string;
  proposalName: string;
  descriptionLink?: string | null;
  state: string;
  stateCode: number;
  draftAt: number | null;
  votingAt: number | null;
  votingEndsAt: number | null;
  governingTokenMint: string;
  proposalOwnerRecordId: string;
  tokenOwnerRecordId: string | null;
  canVote: boolean;
  hasVoted: boolean;
  recordedVotes?: { governingTokenOwner: string; isDelegate: boolean; choice: string }[];
  hasDenyOption: boolean;
  isDelegate: boolean;
  votingPowerType: 'community' | 'council' | 'delegated-community' | 'delegated-council' | 'unknown';
  voteSources: MobileGovernanceProposalVoteSource[];
  choices: MobileGovernanceProposalChoice[];
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  denyVotes: string;
};

export type MobileGovernanceResponse = {
  discoveryWarnings?: string[];
  warnings?: string[];
  trackedDaos: string[];
  discoveredDaos: string[];
  daos: Array<{
    daoId: string;
    realmName: string;
    proposalStatus?: 'ready' | 'unavailable';
    votingPower?: Array<{ mint: string; kind: string; amount: string; delegated: boolean }>;
  }>;
  memberDaos: number;
  proposals: MobileGovernanceProposal[];
  source: 'shyft' | 'rpc' | 'none';
  network: 'mainnet-beta' | 'devnet';
  refreshedAt: number;
};

export type MobileGovernanceVoteResponse = {
  signature: string;
  daoId: string;
  proposalId: string;
  voteKind: 'approve' | 'deny' | 'abstain';
  choiceLabel?: string;
  network: 'mainnet-beta' | 'devnet';
};

export type MobileGovernanceEligibleHolding = {
  mint: string;
  amountUi: number;
  amountLabel?: string;
  symbol?: string;
  name?: string;
  logoUri?: string;
};

export type MobileGovernanceEligibleDao = {
  daoId: string;
  realmName: string;
  communityMint: string;
  councilMint: string | null;
  communityHolding: MobileGovernanceEligibleHolding | null;
  councilHolding: MobileGovernanceEligibleHolding | null;
};

const GOVERNANCE_OWNERS: GovernanceOwner[] = [
  { owner: DEFAULT_GOVERNANCE_PROGRAM_ID, name: DEFAULT_GOVERNANCE_PROGRAM_ID, dao: 'By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip' },
  { owner: 'GovMaiHfpVPw8BAM1mbdzgmSZYDw2tdP32J2fapoQoYs', name: 'Marinade_DAO', dao: '899YG3yk4F66ZgbNWLHriZHTXSKk9e1kvsKEquW7L6Mo' },
  { owner: 'GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J', name: 'Mango', dao: 'DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE' },
  { owner: 'GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe', name: 'Psy_Finance', dao: 'FiG6YoqWnVzUmxFNukcRVXZC51HvLr6mts8nxcm7ScR8' },
  { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', name: 'Jet_Custody', dao: 'FbpwgUzRPTneoZHDMNnM1zXb7Jm9iY8MzX2mAM8L6f43' },
  { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', name: 'Jet_Custody', dao: 'ATnhhZJ74xg4mzxDyNQ5YAE1BZ98PhrhAsMS4xNXquvX' },
  { owner: 'pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U', name: 'Pyth_Governance', dao: '4ct8XU5tKbMNRphWy4rePsS9kBqPhDdvZoGpmprPaug4' },
  { owner: 'GMnke6kxYvqoAXgbFGnu84QzvNHoqqTnijWSXYYTFQbB', name: 'MonkeDAO', dao: 'B1CxhV1khhj7n5mi5hebbivesqH9mvXr5Hfh2nD2UCh6' },
  { owner: 'hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S', name: 'Helium', dao: '2VfPJn8ML1hNBnsEBo7SzmG11UJc7gbY8b23A3K8expd' },
  { owner: 'MGovW65tDhMMcpEmsegpsdgvzb6zUwGsNjhXFxRAnjd', name: 'MEAN_DAO', dao: '5o6gEoeJBpuXT1H1ijFTq3KcSGx7ayabdG2hji7cB3FG' },
  { owner: 'J9uWvULFL47gtCPvgR3oN7W357iehn5WF2Vn9MJvcSxz', name: 'Orca', dao: '66Du7mXgS2KMQBUk6m9h3TszMjqZqdWhsG3Duuf69VNW' },
  { owner: 'ALLGnZikNaJQeN4KCAbDjZRSzvSefUdeTpk18yfizZvT', name: 'ALLOVR_DAO', dao: 'A7nud4wxpAySc7Ai11vwXtkez79tHvcEvSquFBxw4iDh' },
  { owner: 'AEauWRrpn9Cs6GXujzdp1YhMmv2288kBt3SdEcPYEerr', name: 'Metaplex_DAO', dao: 'DA5G7QQbFioZ6K33wQcH8fVdgFcnaDjLD7DLQkapZg5X' },
  { owner: 'GMpXgTSJt2nJ7zjD1RwbT2QyPhKqD2MjAZuEaLsfPYLF', name: 'Metaplex_Genesis', dao: 'Cdui9Va8XnKVng3VGZXcfBFF6XSxbqSi2XruMc7iu817' },
  { owner: 'GmtpXy362L8cZfkRmTZMYunWVe8TyRjX5B7sodPZ63LJ', name: 'Metaplex_Found', dao: '2sEcHwzsNBwNoTM1yAXjtF1HTMQKUAXf8ivtdpSpo9Fv' },
  { owner: 'AVoAYTs36yB5izAaBkxRG67wL1AMwG3vo41hKtUSb8is', name: 'Serum', dao: '3MMDxjv1SzEFQDKryT7csAvaydYtrgMAc3L9xL9CVLCg' },
  { owner: '5hAykmD4YGcQ7Am3N7nC9kyELq6CThAkU82nhNKDJiCy', name: 'SOCEAN', dao: '759qyfKDMMuo9v36tW7fbGanL63mZFPNbhU7zjPrkuGK' },
  { owner: 'jdaoDN37BrVRvxuXSeyR7xE5Z9CAoQApexGrQJbnj6V', name: 'JungleDeFi_DAO', dao: '5g94Ver64ruf9CGBL3k2oQGdKCUt4QKjN7NQojSrHAwH' },
  { owner: 'jtogvBNH3WBSWDYD5FJfQP2ZxNTuf82zL8GkEhPeaJx', name: 'Jito', dao: 'jjCAwuuNpJCNMLAanpwgJZ6cdXzLPXe2GfD6TaDQBXt' }
];

function loadSolanaWeb3Module() {
  return require('@solana/web3.js') as typeof import('@solana/web3.js');
}

function loadSplGovernanceModule() {
  return require('@solana/spl-governance') as typeof import('@solana/spl-governance');
}

function getConnection() {
  const { Connection } = loadSolanaWeb3Module();
  return createGovernanceRpcConnection(new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed'));
}

function getNetworkLabel() {
  return getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK).includes('devnet') ? 'devnet' : 'mainnet-beta';
}

export async function resolveMobileGovernanceProgramVersion(
  connection: import('@solana/web3.js').Connection,
  programId: import('@solana/web3.js').PublicKey,
  realmPk: import('@solana/web3.js').PublicKey
): Promise<number> {
  const { getGovernanceProgramVersion, getRealmConfigAddress } = loadSplGovernanceModule();
  const programIdValue = programId.toBase58();

  try {
    const detectedVersion = await getGovernanceProgramVersion(connection, programId);
    if (detectedVersion > GOVERNANCE_PROGRAM_VERSION_V1) {
      return detectedVersion;
    }
  } catch {
    // Some RPC endpoints fail the metadata/simulation probe and spl-governance falls back to v1.
  }

  if (programIdValue === DEFAULT_GOVERNANCE_PROGRAM_ID) {
    return GOVERNANCE_PROGRAM_VERSION_V3;
  }

  if (GOVERNANCE_OWNERS.some((entry) => entry.owner === programIdValue)) {
    return GOVERNANCE_PROGRAM_VERSION_V2;
  }

  try {
    const realmConfigPk = await getRealmConfigAddress(programId, realmPk);
    const realmConfigInfo = await connection.getAccountInfo(realmConfigPk, 'confirmed');
    if (realmConfigInfo) {
      return GOVERNANCE_PROGRAM_VERSION_V2;
    }
  } catch {
    // Ignore and keep the conservative fallback below.
  }

  return GOVERNANCE_PROGRAM_VERSION_V1;
}

// Bound program scans so indexed RPC providers are not flooded by discovery.
async function mapGovernanceRpc<T, R>(items: T[], load: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await load(items[index]);
    }
  }));
  return results;
}

function getGovernanceRpcFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/too big|scan limit|excluded from account secondary indexes/i.test(message)) return 'RPC scan limit';
  if (/429|rate limit|too many requests/i.test(message)) return 'RPC rate limit';
  return 'RPC unavailable';
}

// A realm's token-owner-record addresses are deterministic; no program scan is needed.
async function fetchGovernanceKnownRealmMemberships(
  connection: import('@solana/web3.js').Connection,
  programId: import('@solana/web3.js').PublicKey,
  owner: import('@solana/web3.js').PublicKey
) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getRealm, getTokenOwnerRecordAddress, getTokenOwnerRecord } = loadSplGovernanceModule();
  const records: Awaited<ReturnType<typeof getTokenOwnerRecord>>[] = [];
  const realmIds = Array.from(new Set(GOVERNANCE_OWNERS.filter((entry) => entry.owner === programId.toBase58()).map((entry) => entry.dao)));
  for (const realmId of realmIds) {
    const realmKey = new PublicKey(realmId);
    const realm = await getRealm(connection, realmKey);
    const mints = [realm.account.communityMint, realm.account.config.councilMint].filter((mint): mint is import('@solana/web3.js').PublicKey => !!mint);
    const keys = await Promise.all(mints.map((mint) => getTokenOwnerRecordAddress(programId, realmKey, mint, owner)));
    const infos = await connection.getMultipleAccountsInfo(keys, 'confirmed');
    for (let index = 0; index < keys.length; index++) {
      if (infos[index]) records.push(await getTokenOwnerRecord(connection, keys[index]));
    }
  }
  return records;
}

function getGovernanceNamespaces(): Array<{ namespace: string; programId: string }> {
  const seen = new Set<string>();
  const entries = [
    { namespace: DEFAULT_GOVERNANCE_PROGRAM_ID, programId: DEFAULT_GOVERNANCE_PROGRAM_ID },
    ...GOVERNANCE_OWNERS.map((entry) => ({ namespace: entry.name, programId: entry.owner }))
  ];

  return entries.filter((entry) => {
    const key = `${entry.namespace}:${entry.programId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTrackedDaoIds(value: string[]) {
  return Array.from(
    new Set(
      value
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function formatProposalStateLabel(stateCode: number) {
  const { ProposalState } = loadSplGovernanceModule();
  switch (stateCode) {
    case ProposalState.Draft:
      return 'Draft';
    case ProposalState.SigningOff:
      return 'Signing Off';
    case ProposalState.Voting:
      return 'Voting';
    case ProposalState.Succeeded:
      return 'Succeeded';
    case ProposalState.Executing:
      return 'Executing';
    case ProposalState.Completed:
      return 'Completed';
    case ProposalState.Cancelled:
      return 'Cancelled';
    case ProposalState.Defeated:
      return 'Defeated';
    case ProposalState.ExecutingWithErrors:
      return 'Executing With Errors';
    case ProposalState.Vetoed:
      return 'Vetoed';
    default:
      return 'Unknown';
  }
}

function isActiveGovernanceProposalState(stateCode: number) {
  const { ProposalState } = loadSplGovernanceModule();
  return stateCode === ProposalState.Draft || stateCode === ProposalState.SigningOff || stateCode === ProposalState.Voting;
}

function compareGovernanceProposalDisplayOrder(left: MobileGovernanceProposal, right: MobileGovernanceProposal) {
  if (left.canVote !== right.canVote) return left.canVote ? -1 : 1;
  const leftActive = isActiveGovernanceProposalState(left.stateCode) ? 1 : 0;
  const rightActive = isActiveGovernanceProposalState(right.stateCode) ? 1 : 0;
  if (leftActive !== rightActive) {
    return rightActive - leftActive;
  }

  return (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0);
}

function limitGovernanceProposalsForDisplay(
  proposals: MobileGovernanceProposal[],
  maxProposals = 50
): MobileGovernanceProposal[] {
  const deduped = new Map<string, MobileGovernanceProposal>();
  for (const proposal of proposals) {
    if (!proposal?.proposalId) {
      continue;
    }
    if (!deduped.has(proposal.proposalId)) {
      deduped.set(proposal.proposalId, proposal);
      continue;
    }

    const existing = deduped.get(proposal.proposalId);
    if (existing && compareGovernanceProposalDisplayOrder(proposal, existing) < 0) {
      deduped.set(proposal.proposalId, proposal);
    }
  }

  const sorted = Array.from(deduped.values()).sort(compareGovernanceProposalDisplayOrder);
  const active = sorted.filter((proposal) => isActiveGovernanceProposalState(proposal.stateCode));
  if (active.length >= maxProposals) {
    return active;
  }

  const activeIds = new Set(active.map((proposal) => proposal.proposalId));
  const recent = sorted.filter((proposal) => !activeIds.has(proposal.proposalId));
  return [...active, ...recent.slice(0, maxProposals - active.length)];
}

async function fetchGovernanceRealmDirectory(): Promise<GovernanceRealmInfo[]> {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getRealms } = loadSplGovernanceModule();
  const connection = getConnection();
  const batches = await mapGovernanceRpc(getGovernanceNamespaces(), async ({ programId }) => {
    const accounts = await getRealms(connection, new PublicKey(programId));
    return accounts.map((entry) => ({
      daoId: entry.pubkey.toBase58(), name: entry.account.name,
      communityMint: entry.account.communityMint.toBase58(),
      councilMint: entry.account.config.councilMint?.toBase58() ?? null
    }));
  });
  return Array.from(new Map(batches.flat().map((realm) => [realm.daoId, realm])).values());
}

export async function scanMobileGovernanceDaoEligibility(
  holdings: MobileGovernanceEligibleHolding[]
): Promise<MobileGovernanceEligibleDao[]> {
  const normalizedHoldings = holdings
    .map((holding) => ({
      ...holding,
      mint: holding.mint.trim()
    }))
    .filter((holding) => !!holding.mint && Number.isFinite(holding.amountUi) && holding.amountUi > 0);

  if (normalizedHoldings.length === 0) {
    return [];
  }

  const holdingByMint = new Map<string, MobileGovernanceEligibleHolding>();
  for (const holding of normalizedHoldings) {
    if (!holdingByMint.has(holding.mint)) {
      holdingByMint.set(holding.mint, holding);
    }
  }

  const realms = await fetchGovernanceRealmDirectory();
  return realms
    .map((realm) => {
      const communityHolding = holdingByMint.get(realm.communityMint) ?? null;
      const councilHolding = realm.councilMint ? holdingByMint.get(realm.councilMint) ?? null : null;
      if (!communityHolding && !councilHolding) {
        return null;
      }

      return {
        daoId: realm.daoId,
        realmName: realm.name,
        communityMint: realm.communityMint,
        councilMint: realm.councilMint,
        communityHolding,
        councilHolding
      } satisfies MobileGovernanceEligibleDao;
    })
    .filter((entry): entry is MobileGovernanceEligibleDao => !!entry)
    .sort((left, right) => {
      const leftScore = (left.communityHolding ? 1 : 0) + (left.councilHolding ? 1 : 0);
      const rightScore = (right.communityHolding ? 1 : 0) + (right.councilHolding ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      const leftAmount = (left.communityHolding?.amountUi ?? 0) + (left.councilHolding?.amountUi ?? 0);
      const rightAmount = (right.communityHolding?.amountUi ?? 0) + (right.councilHolding?.amountUi ?? 0);
      if (leftAmount !== rightAmount) {
        return rightAmount - leftAmount;
      }

      return left.realmName.localeCompare(right.realmName);
    });
}

async function discoverRpcGovernanceMembershipsForWallet(ownerAddress: string, warnings: string[], connection = getConnection()) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getTokenOwnerRecordsByOwner, getGovernanceAccounts, TokenOwnerRecord, MemcmpFilter } = loadSplGovernanceModule();
  const owner = new PublicKey(ownerAddress);
  const membershipsByRealm = new Map<string, GovernanceMembershipRecord[]>();
  const allProgramIds = Array.from(new Set([DEFAULT_GOVERNANCE_PROGRAM_ID, ...GOVERNANCE_OWNERS.map((entry) => entry.owner)]));

  const results = await mapGovernanceRpc(allProgramIds, async (programId) => Promise.allSettled([
    getTokenOwnerRecordsByOwner(connection, new PublicKey(programId), owner),
    getGovernanceAccounts(connection, new PublicKey(programId), TokenOwnerRecord, [new MemcmpFilter(122, owner.toBuffer())])
  ]));
  const torResults = results.map((result) => result[0]);
  const delegateTorResults = results.map((result) => result[1]);

  const addMembership = (entry: {
    pubkey: { toBase58(): string };
    account: {
      realm: { toBase58(): string };
      governingTokenMint: { toBase58(): string };
      governingTokenOwner: { toBase58(): string };
      governanceDelegate?: { toBase58(): string } | null;
      governingTokenDepositAmount: { toString(): string };
    };
  }) => {
    const realm = entry.account.realm.toBase58();
    const membership: GovernanceMembershipRecord = {
      pubkey: entry.pubkey.toBase58(),
      governingTokenMint: entry.account.governingTokenMint.toBase58(),
      governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
      governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
      governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
    };

    if (!membershipsByRealm.has(realm)) {
      membershipsByRealm.set(realm, []);
    }
    const existing = membershipsByRealm.get(realm)!;
    if (!existing.some((candidate) => candidate.pubkey === membership.pubkey)) {
      existing.push(membership);
    }
  };

  for (let index = 0; index < allProgramIds.length; index += 1) {

    const ownerResult = torResults[index];
    const programId = allProgramIds[index];
    const programName = GOVERNANCE_OWNERS.find((entry) => entry.owner === programId)?.name ?? programId;
    if (ownerResult.status === 'rejected') {
      warnings.push(`Additional membership discovery for ${programName}: ${getGovernanceRpcFailureReason(ownerResult.reason)}. Known realms checked directly.`);
      const fallback = await fetchGovernanceKnownRealmMemberships(connection, new PublicKey(programId), owner).catch(() => []);
      fallback.forEach(addMembership);
    }
    if (ownerResult.status === 'fulfilled') {
      for (const entry of ownerResult.value) {
        addMembership(entry);
      }
    }

    const delegateResult = delegateTorResults[index];
    if (delegateResult.status === 'rejected') warnings.push(`Additional delegate discovery for ${programName}: ${getGovernanceRpcFailureReason(delegateResult.reason)}.`);
    if (delegateResult.status === 'fulfilled') {
      for (const entry of delegateResult.value) {
        addMembership(entry);
      }
    }
  }

  return membershipsByRealm;
}

function resolveGovernanceProposalMembership(
  proposalMint: string,
  ownerAddress: string,
  memberships: GovernanceMembershipRecord[]
): GovernanceMembershipRecord | null {
  const directMatch = memberships.find(
    (membership) => membership.governingTokenMint === proposalMint && membership.governingTokenOwner === ownerAddress
  );
  if (directMatch) {
    return directMatch;
  }

  return (
    memberships.find(
      (membership) =>
        membership.governingTokenMint === proposalMint &&
        membership.governanceDelegate === ownerAddress &&
        membership.governingTokenOwner !== ownerAddress
    ) ?? null
  );
}

function getGovernanceProposalVotingPowerType(
  proposalMint: string,
  councilMint: string | null,
  membership: GovernanceMembershipRecord | null,
  ownerAddress: string
): MobileGovernanceProposal['votingPowerType'] {
  const isCouncilProposal = !!councilMint && proposalMint === councilMint;
  if (!membership) {
    return 'unknown';
  }

  const isDelegate = membership.governingTokenOwner !== ownerAddress;
  if (isCouncilProposal) {
    return isDelegate ? 'delegated-council' : 'council';
  }

  return isDelegate ? 'delegated-community' : 'community';
}

function buildGovernanceProposalVoteSources(
  proposalMint: string,
  ownerAddress: string,
  memberships: GovernanceMembershipRecord[],
  votedOwners: Set<string>
): MobileGovernanceProposalVoteSource[] {
  return memberships
    .filter((membership) => membership.governingTokenMint === proposalMint)
    .filter((membership) => BigInt(membership.governingTokenDepositAmount) > BigInt(0))
    .filter((membership) => {
      const isDirect = membership.governingTokenOwner === ownerAddress;
      if (isDirect) {
        return true;
      }
      return membership.governanceDelegate === ownerAddress;
    })
    .map((membership) => ({
      tokenOwnerRecordId: membership.pubkey,
      governingTokenOwner: membership.governingTokenOwner,
      isDelegate: membership.governingTokenOwner !== ownerAddress,
      hasVoted: votedOwners.has(membership.governingTokenOwner)
    }))
    .sort((left, right) => {
      if (left.isDelegate !== right.isDelegate) {
        return left.isDelegate ? 1 : -1;
      }
      return left.governingTokenOwner.localeCompare(right.governingTokenOwner);
    });
}

async function fetchGovernanceForDaoViaRpc(ownerAddress: string, daoId: string, warnings: string[] = [], preloadedMemberships?: GovernanceMembershipRecord[], connection = getConnection(), loadProposals = true) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getAllGovernances, getProposalsByGovernance, getRealm, getTokenOwnerRecordsByOwner, getVoteRecordsByVoter, getGovernanceAccounts, TokenOwnerRecord, MemcmpFilter, ProposalState } = loadSplGovernanceModule();
  const realmInfo = await connection.getAccountInfo(new PublicKey(daoId));
  if (!realmInfo) throw new Error('DAO realm account was not found.');
  const governanceOwner = { owner: realmInfo.owner.toBase58() };
  const programId = realmInfo.owner;
  const realmPk = new PublicKey(daoId);
  const owner = new PublicKey(ownerAddress);

  let governanceLoaded = true;
  let voteStatusKnown = true;
  const [realmAccount, tokenOwnerRecords, delegatedTokenOwnerRecords, governanceAccounts] = await Promise.all([
    getRealm(connection, realmPk),
    preloadedMemberships ? Promise.resolve([]) : getTokenOwnerRecordsByOwner(connection, programId, owner),
    preloadedMemberships ? Promise.resolve([]) : getGovernanceAccounts(connection, programId, TokenOwnerRecord, [new MemcmpFilter(122, owner.toBuffer())]),
    (loadProposals ? getAllGovernances(connection, programId, realmPk) : Promise.resolve([])).catch(() => {
      governanceLoaded = false;
      warnings.push(`Proposal accounts for ${daoId} could not be loaded. Membership balances are available.`);
      return [];
    }),
  ]);

  const realmTokenOwnerRecords = [
    ...tokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId),
    ...delegatedTokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId)
  ].filter((entry, index, allEntries) => allEntries.findIndex((candidate) => candidate.pubkey.equals(entry.pubkey)) === index);
  const membershipRecords = preloadedMemberships ?? realmTokenOwnerRecords.map((entry) => ({
    pubkey: entry.pubkey.toBase58(),
    governingTokenMint: entry.account.governingTokenMint.toBase58(),
    governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
    governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
    governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
  } satisfies GovernanceMembershipRecord));
  const mintIds = Array.from(new Set(membershipRecords.map((entry) => entry.governingTokenMint)));
  const mintInfos = mintIds.length ? await connection.getMultipleAccountsInfo(mintIds.map((mint) => new PublicKey(mint))) : [];
  const balances = new Map<string, { mint: string; kind: string; amount: bigint; delegated: boolean }>();
  for (const entry of membershipRecords) {
    const mint = entry.governingTokenMint;
    const delegated = entry.governingTokenOwner !== ownerAddress;
    const key = mint + ':' + delegated;
    const balance = balances.get(key) ?? { mint, kind: mint === realmAccount.account.communityMint.toBase58() ? 'Community' : 'Council', amount: 0n, delegated };
    balance.amount += BigInt(entry.governingTokenDepositAmount);
    balances.set(key, balance);
  }
  const votingPower = Array.from(balances.values()).map((balance) => {
    const data = mintInfos[mintIds.indexOf(balance.mint)]?.data;
    if (!data || data.length < 45) return { ...balance, amount: balance.amount.toString() + ' raw units' };
    const decimals = data[44];
    const raw = balance.amount.toString().padStart(decimals + 1, '0');
    const fraction = decimals ? raw.slice(-decimals).replace(/0+$/, '') : '';
    return { ...balance, amount: (decimals ? raw.slice(0, -decimals) : raw) + (fraction ? '.' + fraction : '') };
  });
  if (governanceAccounts.length === 0) {
    return {
      daoId,
      realmName: realmAccount.account.name,
      source: 'rpc' as const,
      proposalStatus: governanceLoaded ? 'ready' as const : 'unavailable' as const,
      votingPower,
      member: membershipRecords.length > 0,
      proposals: [] as MobileGovernanceProposal[]
    };
  }

  let proposalStatus: 'ready' | 'unavailable' = 'ready';
  const proposalBatches = await mapGovernanceRpc(governanceAccounts, async (governance) => {
    try {
      return await getProposalsByGovernance(connection, programId, governance.pubkey);
    } catch {
      proposalStatus = 'unavailable';
      warnings.push(`Some proposals for ${realmAccount.account.name} could not be loaded. Retry to check voting activity.`);
      return [];
    }
  });
  const proposals = proposalBatches.flatMap((batch) => batch);
  const delegatorAddresses = membershipRecords
    .filter((record) => record.governanceDelegate === ownerAddress && record.governingTokenOwner !== ownerAddress)
    .map((record) => record.governingTokenOwner);
  const voteRecordBatches = await Promise.all(
    Array.from(new Set([ownerAddress, ...delegatorAddresses])).map((address) =>
      getVoteRecordsByVoter(connection, programId, new PublicKey(address)).catch(() => {
        voteStatusKnown = false;
        proposalStatus = 'unavailable';
        warnings.push(`Vote status for ${realmAccount.account.name} could not be checked. Refresh before voting.`);
        return [];
      })
    )
  );
  const votedOwnersByProposal = new Map<string, Set<string>>();
  for (const voteRecord of voteRecordBatches.flat()) {
    if (voteRecord.account.isRelinquished) continue;
    const proposalId = voteRecord.account.proposal.toBase58();
    const governingTokenOwner = voteRecord.account.governingTokenOwner.toBase58();
    if (!votedOwnersByProposal.has(proposalId)) {
      votedOwnersByProposal.set(proposalId, new Set<string>());
    }
    votedOwnersByProposal.get(proposalId)?.add(governingTokenOwner);
  }

  return {
    daoId,
    realmName: realmAccount.account.name,
    source: 'rpc' as const,
    proposalStatus: proposalStatus as 'ready' | 'unavailable',
    votingPower,
    member: membershipRecords.length > 0,
    proposals: proposals
      .filter((entry) => isActiveGovernanceProposalState(entry.account.state))
      .map((entry) => {
        const proposalMint = entry.account.governingTokenMint.toBase58();
        const votedOwners = votedOwnersByProposal.get(entry.pubkey.toBase58()) ?? new Set<string>();
        const voteSources = voteStatusKnown ? buildGovernanceProposalVoteSources(proposalMint, ownerAddress, membershipRecords, votedOwners) : [];
        const membership = resolveGovernanceProposalMembership(proposalMint, ownerAddress, membershipRecords);
        const votingAt = entry.account.votingAt ? entry.account.votingAt.toNumber() : null;
        const votingEndsAt =
          votingAt !== null ? votingAt + (entry.account.maxVotingTime ?? governanceAccounts.find((governance) => governance.pubkey.equals(entry.account.governance))?.account.config.baseVotingTime ?? 0) : null;
        const hasVoted = voteSources.some((source) => source.hasVoted);
        const isDelegate = membership !== null && membership.governingTokenOwner !== ownerAddress;
        const options =
          Array.isArray(entry.account.options) && entry.account.options.length > 0
            ? entry.account.options.map((option, index) => ({
                rank: index,
                label: option.label,
                voteWeight: option.voteWeight.toString(),
                voteResult: option.voteResult != null ? String(option.voteResult) : null
              }))
            : [{ rank: 0, label: 'Approve', voteWeight: entry.account.yesVotesCount?.toString() ?? '0', voteResult: null }];

        return {
          daoId,
          realmName: realmAccount.account.name,
          governanceProgramId: governanceOwner.owner,
          governanceId: entry.account.governance.toBase58(),
          proposalId: entry.pubkey.toBase58(),
          proposalName: entry.account.name,
          descriptionLink: entry.account.descriptionLink,
          state: formatProposalStateLabel(entry.account.state),
          stateCode: entry.account.state,
          draftAt: entry.account.draftAt ? entry.account.draftAt.toNumber() : null,
          votingAt,
          votingEndsAt,
          governingTokenMint: entry.account.governingTokenMint.toBase58(),
          proposalOwnerRecordId: entry.account.tokenOwnerRecord.toBase58(),
          tokenOwnerRecordId: membership?.pubkey ?? null,
          canVote: entry.account.state === ProposalState.Voting &&
            votingEndsAt !== null && votingEndsAt > Math.floor(Date.now() / 1000) && voteSources.some((source) => !source.hasVoted),
          hasVoted,
          recordedVotes: voteRecordBatches.flat().filter((record) => !record.account.isRelinquished && record.account.proposal.equals(entry.pubkey)).map((record) => ({
            governingTokenOwner: record.account.governingTokenOwner.toBase58(),
            isDelegate: record.account.governingTokenOwner.toBase58() !== ownerAddress,
            choice: describeGovernanceVote(record.account, options)
          })),
          hasDenyOption: entry.account.denyVoteWeight != null || entry.account.yesVotesCount != null,
          isDelegate,
          votingPowerType: getGovernanceProposalVotingPowerType(
            proposalMint,
            realmAccount.account.config.councilMint?.toBase58() ?? null,
            membership,
            ownerAddress
          ),
          voteSources,
          choices: options,
          yesVotes: options[0]?.voteWeight ?? '0',
          noVotes: entry.account.noVotesCount?.toString() ?? '0',
          abstainVotes: entry.account.abstainVoteWeight?.toString() ?? '0',
          denyVotes: entry.account.denyVoteWeight?.toString() ?? '0'
        } satisfies MobileGovernanceProposal;
      })
      .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0))
  };
}

export async function fetchMobileGovernanceForWallet(ownerAddress: string, trackedDaoIds: string[], proposalDaoId?: string | null): Promise<MobileGovernanceResponse> {
  const uniqueTrackedDaoIds = normalizeTrackedDaoIds(trackedDaoIds);
  const warnings: string[] = [];
  const discoveryWarnings: string[] = [];
  const connection = createGovernanceRpcReadSession(getConnection());
  const supplementalMembershipsByRealm = typeof proposalDaoId === 'string' ? new Map<string, GovernanceMembershipRecord[]>() : await discoverRpcGovernanceMembershipsForWallet(ownerAddress, discoveryWarnings, connection);
  const discoveredDaoIds = Array.from(supplementalMembershipsByRealm.keys());
  const uniqueDaoIds = (typeof proposalDaoId === 'string' ? [proposalDaoId] : Array.from(new Set([...discoveredDaoIds, ...uniqueTrackedDaoIds]))).filter((daoId) => {
    const memberships = supplementalMembershipsByRealm.get(daoId);
    return !memberships?.length || memberships.some((record) => BigInt(record.governingTokenDepositAmount) > 0n);
  });

  if (uniqueDaoIds.length === 0) {
    return {
      warnings,
      discoveryWarnings,
    trackedDaos: uniqueTrackedDaoIds,
      discoveredDaos: [],
      daos: [],
      memberDaos: 0,
      proposals: [],
      source: 'none',
      network: getNetworkLabel(),
      refreshedAt: Date.now()
    };
  }

  const results = await Promise.all(
    uniqueDaoIds.map(async (daoId) => {
      try {
        return await fetchGovernanceForDaoViaRpc(ownerAddress, daoId, warnings, supplementalMembershipsByRealm.get(daoId), connection, proposalDaoId !== null);
      } catch {
        warnings.push(`Unable to load proposals and voting power for ${daoId}.`);
        return {
          daoId,
          realmName: daoId,
          source: 'none' as const,
          member: false,
          proposals: [] as MobileGovernanceProposal[]
        };
      }
    })
  );

  const proposals = limitGovernanceProposalsForDisplay(results.flatMap((entry) => entry.proposals));
  const memberDaos = results.filter((entry) => entry.member).length;
  const source = results.some((entry) => entry.source === 'rpc') ? 'rpc' : 'none';
  const daos: MobileGovernanceResponse['daos'] = results
    .filter((entry) => entry.member)
    .map((entry): MobileGovernanceResponse['daos'][number] => ({
      daoId: entry.proposals[0]?.daoId ?? entry.daoId,
      realmName: entry.realmName ?? entry.proposals[0]?.realmName ?? entry.daoId,
      votingPower: 'votingPower' in entry ? entry.votingPower : [],
      proposalStatus: 'proposalStatus' in entry ? entry.proposalStatus : 'unavailable'
    }))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.daoId === entry.daoId) === index)
    .sort((left, right) => left.realmName.localeCompare(right.realmName));

  return {
    warnings,
    discoveryWarnings,
    trackedDaos: uniqueTrackedDaoIds,
    discoveredDaos: discoveredDaoIds,
    daos,
    memberDaos,
    proposals,
    source,
    network: getNetworkLabel(),
    refreshedAt: Date.now()
  };
}
