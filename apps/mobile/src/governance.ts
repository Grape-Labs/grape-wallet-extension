import { getMobileSolanaRpcUrl } from './config';

const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';
const DEFAULT_GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const GOVERNANCE_PROGRAM_VERSION_V1 = 1;
const GOVERNANCE_PROGRAM_VERSION_V2 = 2;
const GOVERNANCE_PROGRAM_VERSION_V3 = 3;
const GOVERNANCE_GRAPHQL_URL = 'https://grape.shyft.to/v1/graphql/';

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

type GovernanceProgramAccount = {
  pubkey: string;
  realm: string;
  baseVotingTime: number | null;
};

type GovernanceProposalRecord = {
  pubkey: string;
  governance: string;
  governingTokenMint: string;
  tokenOwnerRecord: string;
  state: number;
  descriptionLink: string | null;
  name: string;
  draftAt: number | null;
  votingAt: number | null;
  maxVotingTime: number | null;
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  denyVotes: string;
  options: MobileGovernanceProposalChoice[];
  hasDenyOption: boolean;
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
  trackedDaos: string[];
  discoveredDaos: string[];
  daos: Array<{
    daoId: string;
    realmName: string;
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

const GOVERNANCE_REALM_DIRECTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE = 1000;
const GRAPHQL_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
let governanceRealmDirectoryCache:
  | {
      expiresAt: number;
      realms: GovernanceRealmInfo[];
    }
  | null = null;

function loadSolanaWeb3Module() {
  return require('@solana/web3.js') as typeof import('@solana/web3.js');
}

function loadSplGovernanceModule() {
  return require('@solana/spl-governance') as typeof import('@solana/spl-governance');
}

function getConnection() {
  const { Connection } = loadSolanaWeb3Module();
  return new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
}

function getNetworkLabel() {
  return getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK).includes('devnet') ? 'devnet' : 'mainnet-beta';
}

function findGovernanceOwnerByDao(daoId: string): GovernanceOwner {
  return (
    GOVERNANCE_OWNERS.find((entry) => entry.dao === daoId) ?? {
      owner: DEFAULT_GOVERNANCE_PROGRAM_ID,
      name: DEFAULT_GOVERNANCE_PROGRAM_ID,
      dao: daoId
    }
  );
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

function escapeGraphqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGovernanceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^0x/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGovernanceBigIntString(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value)).toString();
  }
  if (typeof value !== 'string') {
    return '0';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '0';
  }
  try {
    return BigInt(trimmed).toString();
  } catch {
    try {
      return BigInt(`0x${trimmed.replace(/^0x/i, '')}`).toString();
    } catch {
      return '0';
    }
  }
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

function isRecentGovernanceProposal(referenceTimestamp: number | null, recentWindowSeconds = 60 * 60 * 24 * 30) {
  if (!referenceTimestamp || referenceTimestamp <= 0) {
    return false;
  }

  return referenceTimestamp >= Math.floor(Date.now() / 1000) - recentWindowSeconds;
}

function shouldDisplayGovernanceProposal(input: {
  stateCode: number;
  draftAt: number | null;
  votingAt: number | null;
  maxVotingTime?: number | null;
}) {
  const { ProposalState } = loadSplGovernanceModule();
  const votingEndsAt =
    input.votingAt !== null && input.maxVotingTime !== null && input.maxVotingTime !== undefined
      ? input.votingAt + input.maxVotingTime
      : null;

  if (input.stateCode === ProposalState.Voting) {
    if (!votingEndsAt) {
      return true;
    }
    return isRecentGovernanceProposal(votingEndsAt, 60 * 60 * 24 * 7);
  }

  if (isActiveGovernanceProposalState(input.stateCode)) {
    return true;
  }

  return isRecentGovernanceProposal(votingEndsAt ?? input.votingAt ?? input.draftAt);
}

function compareGovernanceProposalDisplayOrder(left: MobileGovernanceProposal, right: MobileGovernanceProposal) {
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

async function fetchGovernanceGraphql<T>(query: string): Promise<T> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(GOVERNANCE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip'
      },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    if (!response.ok) {
      lastStatus = response.status;
      if (!GRAPHQL_RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
        throw new Error(`GraphQL request failed with ${response.status}.`);
      }
      await delay(250 * attempt);
      continue;
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
    }

    if (!payload.data) {
      throw new Error('GraphQL response did not include data.');
    }

    return payload.data;
  }

  throw new Error(`GraphQL request failed with ${lastStatus ?? 'unknown status'}.`);
}

function buildGovernanceRealmQuery(namespace: string, daoId: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceRealm {
      ${namespace}_RealmV2(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
        config
      }
      ${namespace}_RealmV1(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
        config
      }
    }
  `;
}

function buildGovernanceRealmDirectoryQuery(namespace: string, offset = 0) {
  return `
    query GovernanceRealmDirectory {
      ${namespace}_RealmV2(limit: ${GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE}, offset: ${offset}) {
        pubkey
        name
        communityMint
        config
      }
      ${namespace}_RealmV1(limit: ${GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE}, offset: ${offset}) {
        pubkey
        name
        communityMint
        config
      }
    }
  `;
}

function buildGovernanceDirectMemberQuery(namespace: string, owner: string, offset = 0) {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceDirectMembers {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        offset: ${offset},
        where: { governingTokenOwner: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        offset: ${offset},
        where: { governingTokenOwner: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceDelegateQuery(namespace: string, owner: string, offset = 0) {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceDelegateRecords {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        offset: ${offset},
        where: { governanceDelegate: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        offset: ${offset},
        where: { governanceDelegate: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceMembershipQuery(namespace: string, daoId: string, owner: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceScopedDirectMembershipQuery(namespace: string, daoId: string, owner: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceScopedDirectMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governingTokenOwner: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governingTokenOwner: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceScopedDelegateMembershipQuery(namespace: string, daoId: string, owner: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceScopedDelegateMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governanceDelegate: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governanceDelegate: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceAccountsQuery(namespace: string, daoId: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceAccounts {
      ${namespace}_GovernanceV2(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
        config
      }
      ${namespace}_GovernanceV1(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
        config
      }
    }
  `;
}

function buildGovernanceProposalsQuery(namespace: string, governanceIds: string[]) {
  const ids = governanceIds.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query GovernanceProposals {
      ${namespace}_ProposalV2(
        limit: 500,
        order_by: {draftAt: desc},
        where: {governance: {_in: [${ids}]}}
      ) {
        pubkey
        governance
        governingTokenMint
        tokenOwnerRecord
        state
        descriptionLink
        draftAt
        votingAt
        maxVotingTime
        name
        options
        denyVoteWeight
        abstainVoteWeight
      }
      ${namespace}_ProposalV1(
        limit: 500,
        order_by: {draftAt: desc},
        where: {governance: {_in: [${ids}]}}
      ) {
        pubkey
        governance
        governingTokenMint
        tokenOwnerRecord
        state
        descriptionLink
        draftAt
        votingAt
        name
        yesVotesCount
        noVotesCount
      }
    }
  `;
}

function buildGovernanceVoteRecordsQuery(namespace: string, owners: string[]) {
  const ownerList = owners.map((owner) => `"${escapeGraphqlString(owner)}"`).join(', ');
  return `
    query GovernanceVotesByOwner {
      ${namespace}_VoteRecordV2(limit: 5000, where: {governingTokenOwner: {_in: [${ownerList}]}}) {
        proposal
        governingTokenOwner
      }
      ${namespace}_VoteRecordV1(limit: 5000, where: {governingTokenOwner: {_in: [${ownerList}]}}) {
        proposal
        governingTokenOwner
      }
    }
  `;
}

function buildEmptyGovernanceMembershipResponse(namespace: string): Record<string, unknown> {
  return {
    [`${namespace}_TokenOwnerRecordV2`]: [],
    [`${namespace}_TokenOwnerRecordV1`]: []
  };
}

function normalizeGovernanceRealmInfo(data: Record<string, unknown>, namespace: string, daoId: string): GovernanceRealmInfo | null {
  const v2 = Array.isArray(data[`${namespace}_RealmV2`]) ? (data[`${namespace}_RealmV2`] as Array<Record<string, unknown>>) : [];
  const v1 = Array.isArray(data[`${namespace}_RealmV1`]) ? (data[`${namespace}_RealmV1`] as Array<Record<string, unknown>>) : [];
  const row = v2[0] ?? v1[0];
  if (!row) {
    return null;
  }

  const communityMint = typeof row.communityMint === 'string' ? row.communityMint : null;
  if (!communityMint) {
    return null;
  }

  return {
    daoId,
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `DAO ${daoId.slice(0, 4)}`,
    communityMint,
    councilMint:
      typeof (row.config as Record<string, unknown> | undefined)?.councilMint === 'string'
        ? ((row.config as Record<string, unknown>).councilMint as string)
        : null
  };
}

function normalizeGovernanceRealmDirectoryEntries(data: Record<string, unknown>, namespace: string): GovernanceRealmInfo[] {
  const v2 = Array.isArray(data[`${namespace}_RealmV2`]) ? (data[`${namespace}_RealmV2`] as Array<Record<string, unknown>>) : [];
  const v1 = Array.isArray(data[`${namespace}_RealmV1`]) ? (data[`${namespace}_RealmV1`] as Array<Record<string, unknown>>) : [];
  const rows = [...v2, ...v1];

  const normalized = rows
    .map((row) => {
      const daoId = typeof row.pubkey === 'string' ? row.pubkey : null;
      const communityMint = typeof row.communityMint === 'string' ? row.communityMint : null;
      if (!daoId || !communityMint) {
        return null;
      }

      return {
        daoId,
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `DAO ${daoId.slice(0, 4)}`,
        communityMint,
        councilMint:
          typeof (row.config as Record<string, unknown> | undefined)?.councilMint === 'string'
            ? ((row.config as Record<string, unknown>).councilMint as string)
            : null
      } satisfies GovernanceRealmInfo;
    })
    .filter((entry): entry is GovernanceRealmInfo => !!entry);

  return Array.from(new Map(normalized.map((entry) => [entry.daoId, entry] as const)).values());
}

async function fetchGovernanceRealmDirectory(): Promise<GovernanceRealmInfo[]> {
  if (governanceRealmDirectoryCache && governanceRealmDirectoryCache.expiresAt > Date.now()) {
    return governanceRealmDirectoryCache.realms;
  }

  const realms = (
    await Promise.all(
      getGovernanceNamespaces().map(async ({ namespace }) => {
        const collected: GovernanceRealmInfo[] = [];
        let offset = 0;

        while (true) {
          let page: Record<string, unknown>;
          try {
            page = await fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmDirectoryQuery(namespace, offset));
          } catch {
            break;
          }

          const pageV2 = Array.isArray(page[`${namespace}_RealmV2`]) ? (page[`${namespace}_RealmV2`] as Array<Record<string, unknown>>) : [];
          const pageV1 = Array.isArray(page[`${namespace}_RealmV1`]) ? (page[`${namespace}_RealmV1`] as Array<Record<string, unknown>>) : [];
          const pageRealms = normalizeGovernanceRealmDirectoryEntries(page, namespace);
          collected.push(...pageRealms);

          if (pageV2.length < GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE && pageV1.length < GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE) {
            break;
          }
          offset += GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE;
        }

        return collected;
      })
    )
  )
    .flat()
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.daoId === entry.daoId) === index);

  governanceRealmDirectoryCache = {
    expiresAt: Date.now() + GOVERNANCE_REALM_DIRECTORY_CACHE_TTL_MS,
    realms
  };

  return realms;
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

function normalizeGovernanceMembershipRecords(data: Record<string, unknown>, namespace: string): GovernanceMembershipRecord[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const normalized = rows
    .map((row) => {
      const pubkey = typeof row.pubkey === 'string' ? row.pubkey : null;
      const governingTokenMint = typeof row.governingTokenMint === 'string' ? row.governingTokenMint : null;
      const governingTokenOwner = typeof row.governingTokenOwner === 'string' ? row.governingTokenOwner : null;
      if (!pubkey || !governingTokenMint || !governingTokenOwner) {
        return null;
      }

      return {
        pubkey,
        governingTokenMint,
        governingTokenOwner,
        governanceDelegate: typeof row.governanceDelegate === 'string' ? row.governanceDelegate : null,
        governingTokenDepositAmount: parseGovernanceBigIntString(row.governingTokenDepositAmount)
      } satisfies GovernanceMembershipRecord;
    })
    .filter((entry): entry is GovernanceMembershipRecord => !!entry);

  return Array.from(new Map(normalized.map((entry) => [entry.pubkey, entry] as const)).values());
}

function normalizeGovernanceOwnerDaoIds(data: Record<string, unknown>, namespace: string, ownerAddress: string) {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const directDaoIds = new Set<string>();
  const delegateDaoIds = new Set<string>();

  for (const row of rows) {
    const realm = typeof row.realm === 'string' ? row.realm : '';
    if (!realm) continue;

    const deposit = parseGovernanceBigIntString(row.governingTokenDepositAmount);
    if (BigInt(deposit) <= BigInt(0)) continue;

    const isDelegate = typeof row.governanceDelegate === 'string' && row.governanceDelegate === ownerAddress;
    const isDirect = typeof row.governingTokenOwner === 'string' && row.governingTokenOwner === ownerAddress;

    if (isDelegate && !isDirect) {
      delegateDaoIds.add(realm);
    } else if (isDirect) {
      directDaoIds.add(realm);
    }
  }

  for (const daoId of directDaoIds) {
    delegateDaoIds.delete(daoId);
  }

  return {
    directDaoIds: Array.from(directDaoIds),
    delegateDaoIds: Array.from(delegateDaoIds)
  };
}

async function discoverGovernanceDaosForWallet(ownerAddress: string) {
  const discovered = await Promise.all(
    getGovernanceNamespaces().map(async ({ namespace }) => {
      try {
        const loadPagedTokenOwnerRows = async (queryBuilder: (offset: number) => string) => {
          const mergedV2: Array<Record<string, unknown>> = [];
          const mergedV1: Array<Record<string, unknown>> = [];

          for (let offset = 0; offset < 10000; offset += 1000) {
            const page = await fetchGovernanceGraphql<Record<string, unknown>>(queryBuilder(offset));
            const pageV2 = Array.isArray(page[`${namespace}_TokenOwnerRecordV2`])
              ? (page[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>)
              : [];
            const pageV1 = Array.isArray(page[`${namespace}_TokenOwnerRecordV1`])
              ? (page[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>)
              : [];

            mergedV2.push(...pageV2);
            mergedV1.push(...pageV1);

            if (pageV2.length < 1000 && pageV1.length < 1000) {
              break;
            }
          }

          return {
            [`${namespace}_TokenOwnerRecordV2`]: mergedV2,
            [`${namespace}_TokenOwnerRecordV1`]: mergedV1
          } satisfies Record<string, unknown>;
        };

        const [directData, delegateData] = await Promise.all([
          loadPagedTokenOwnerRows((offset) => buildGovernanceDirectMemberQuery(namespace, ownerAddress, offset)),
          loadPagedTokenOwnerRows((offset) => buildGovernanceDelegateQuery(namespace, ownerAddress, offset))
        ]);

        const mergedData: Record<string, unknown> = {
          [`${namespace}_TokenOwnerRecordV2`]: [
            ...(Array.isArray(directData[`${namespace}_TokenOwnerRecordV2`]) ? (directData[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
            ...(Array.isArray(delegateData[`${namespace}_TokenOwnerRecordV2`]) ? (delegateData[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : [])
          ],
          [`${namespace}_TokenOwnerRecordV1`]: [
            ...(Array.isArray(directData[`${namespace}_TokenOwnerRecordV1`]) ? (directData[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : []),
            ...(Array.isArray(delegateData[`${namespace}_TokenOwnerRecordV1`]) ? (delegateData[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
          ]
        };

        const { directDaoIds, delegateDaoIds } = normalizeGovernanceOwnerDaoIds(mergedData, namespace, ownerAddress);
        return [...directDaoIds, ...delegateDaoIds];
      } catch {
        return [] as string[];
      }
    })
  );

  return Array.from(new Set(discovered.flat()));
}

async function discoverRpcGovernanceMembershipsForWallet(ownerAddress: string) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getTokenOwnerRecordsByOwner, getGovernanceAccounts, TokenOwnerRecord, MemcmpFilter } = loadSplGovernanceModule();
  const owner = new PublicKey(ownerAddress);
  const connection = getConnection();
  const membershipsByRealm = new Map<string, GovernanceMembershipRecord[]>();
  const allProgramIds = Array.from(new Set([DEFAULT_GOVERNANCE_PROGRAM_ID, ...GOVERNANCE_OWNERS.map((entry) => entry.owner)]));

  const [torResults, delegateTorResults] = await Promise.all([
    Promise.allSettled(
      allProgramIds.map((programId) => getTokenOwnerRecordsByOwner(connection, new PublicKey(programId), owner))
    ),
    Promise.allSettled(
      allProgramIds.map((programId) =>
        getGovernanceAccounts(connection, new PublicKey(programId), TokenOwnerRecord, [
          new MemcmpFilter(122, owner.toBuffer())
        ]).catch(() => [])
      )
    )
  ]);

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
    if (ownerResult.status === 'fulfilled') {
      for (const entry of ownerResult.value) {
        addMembership(entry);
      }
    }

    const delegateResult = delegateTorResults[index];
    if (delegateResult.status === 'fulfilled') {
      for (const entry of delegateResult.value) {
        addMembership(entry);
      }
    }
  }

  return membershipsByRealm;
}

function normalizeGovernanceAccounts(data: Record<string, unknown>, namespace: string): GovernanceProgramAccount[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_GovernanceV2`]) ? (data[`${namespace}_GovernanceV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_GovernanceV1`]) ? (data[`${namespace}_GovernanceV1`] as Array<Record<string, unknown>>) : [])
  ];

  return rows
    .map((row) => {
      const pubkey = typeof row.pubkey === 'string' ? row.pubkey : null;
      const realm = typeof row.realm === 'string' ? row.realm : null;
      const baseVotingTimeRaw = (row.config as Record<string, unknown> | undefined)?.baseVotingTime;
      return pubkey && realm
        ? ({
            pubkey,
            realm,
            baseVotingTime: parseGovernanceNumber(baseVotingTimeRaw)
          } satisfies GovernanceProgramAccount)
        : null;
    })
    .filter((entry): entry is GovernanceProgramAccount => !!entry);
}

function normalizeGovernanceProposalRows(data: Record<string, unknown>, namespace: string): GovernanceProposalRecord[] {
  const v2Rows = Array.isArray(data[`${namespace}_ProposalV2`]) ? (data[`${namespace}_ProposalV2`] as Array<Record<string, unknown>>) : [];
  const v1Rows = Array.isArray(data[`${namespace}_ProposalV1`]) ? (data[`${namespace}_ProposalV1`] as Array<Record<string, unknown>>) : [];

  const mappedV2 = v2Rows.map((row) => {
    const options = Array.isArray(row.options)
      ? row.options.map((option, index) => {
          const item = option as Record<string, unknown>;
          return {
            rank: index,
            label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : `Option ${index + 1}`,
            voteWeight: parseGovernanceBigIntString(item.voteWeight),
            voteResult: typeof item.voteResult === 'string' ? item.voteResult : null
          };
        })
      : [];

    return {
      pubkey: typeof row.pubkey === 'string' ? row.pubkey : '',
      governance: typeof row.governance === 'string' ? row.governance : '',
      governingTokenMint: typeof row.governingTokenMint === 'string' ? row.governingTokenMint : '',
      tokenOwnerRecord: typeof row.tokenOwnerRecord === 'string' ? row.tokenOwnerRecord : '',
      state: parseGovernanceNumber(row.state) ?? -1,
      descriptionLink: typeof row.descriptionLink === 'string' ? row.descriptionLink : null,
      name: typeof row.name === 'string' ? row.name : 'Untitled proposal',
      draftAt: parseGovernanceNumber(row.draftAt),
      votingAt: parseGovernanceNumber(row.votingAt),
      maxVotingTime: parseGovernanceNumber(row.maxVotingTime),
      yesVotes: options[0]?.voteWeight ?? '0',
      noVotes: '0',
      abstainVotes: parseGovernanceBigIntString(row.abstainVoteWeight),
      denyVotes: parseGovernanceBigIntString(row.denyVoteWeight),
      options,
      hasDenyOption: row.denyVoteWeight !== undefined && row.denyVoteWeight !== null
    } satisfies GovernanceProposalRecord;
  });

  const mappedV1 = v1Rows.map((row) => ({
    pubkey: typeof row.pubkey === 'string' ? row.pubkey : '',
    governance: typeof row.governance === 'string' ? row.governance : '',
    governingTokenMint: typeof row.governingTokenMint === 'string' ? row.governingTokenMint : '',
    tokenOwnerRecord: typeof row.tokenOwnerRecord === 'string' ? row.tokenOwnerRecord : '',
    state: parseGovernanceNumber(row.state) ?? -1,
    descriptionLink: typeof row.descriptionLink === 'string' ? row.descriptionLink : null,
    name: typeof row.name === 'string' ? row.name : 'Untitled proposal',
    draftAt: parseGovernanceNumber(row.draftAt),
    votingAt: parseGovernanceNumber(row.votingAt),
    maxVotingTime: parseGovernanceNumber(row.maxVotingTime),
    yesVotes: parseGovernanceBigIntString(row.yesVotesCount),
    noVotes: parseGovernanceBigIntString(row.noVotesCount),
    abstainVotes: '0',
    denyVotes: '0',
    options: [{ rank: 0, label: 'Approve', voteWeight: parseGovernanceBigIntString(row.yesVotesCount), voteResult: null }],
    hasDenyOption: true
  } satisfies GovernanceProposalRecord));

  return [...mappedV2, ...mappedV1].filter(
    (row) =>
      row.pubkey &&
      row.governance &&
      row.governingTokenMint &&
      row.tokenOwnerRecord &&
      shouldDisplayGovernanceProposal({
        stateCode: row.state,
        draftAt: row.draftAt,
        votingAt: row.votingAt,
        maxVotingTime: row.maxVotingTime
      })
  );
}

function normalizeGovernanceVoteOwnersByProposal(data: Record<string, unknown>, namespace: string) {
  const rows = [
    ...(Array.isArray(data[`${namespace}_VoteRecordV2`]) ? (data[`${namespace}_VoteRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_VoteRecordV1`]) ? (data[`${namespace}_VoteRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const votesByProposal = new Map<string, Set<string>>();
  for (const row of rows) {
    const proposal = typeof row.proposal === 'string' ? row.proposal : '';
    const governingTokenOwner = typeof row.governingTokenOwner === 'string' ? row.governingTokenOwner : '';
    if (!proposal || !governingTokenOwner) {
      continue;
    }
    if (!votesByProposal.has(proposal)) {
      votesByProposal.set(proposal, new Set<string>());
    }
    votesByProposal.get(proposal)?.add(governingTokenOwner);
  }

  return votesByProposal;
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
        return !membership.governanceDelegate || membership.governanceDelegate === ownerAddress;
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

async function fetchGovernanceForDaoViaGraphql(
  ownerAddress: string,
  daoId: string,
  supplementalMemberships?: GovernanceMembershipRecord[]
) {
  const governanceOwner = findGovernanceOwnerByDao(daoId);
  const namespace = governanceOwner.name;

  const [realmData, directMembershipData, delegateMembershipData, governanceData] = await Promise.all([
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmQuery(namespace, daoId)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceScopedDirectMembershipQuery(namespace, daoId, ownerAddress)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceScopedDelegateMembershipQuery(namespace, daoId, ownerAddress)).catch(
      () => buildEmptyGovernanceMembershipResponse(namespace)
    ),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceAccountsQuery(namespace, daoId))
  ]);

  const realm = normalizeGovernanceRealmInfo(realmData, namespace, daoId);
  const membershipRecords = Array.from(
    new Map(
      [
        ...normalizeGovernanceMembershipRecords(directMembershipData, namespace),
        ...normalizeGovernanceMembershipRecords(delegateMembershipData, namespace),
        ...(supplementalMemberships ?? [])
      ].map((entry) => [entry.pubkey, entry] as const)
    ).values()
  );
  const governanceAccounts = normalizeGovernanceAccounts(governanceData, namespace);
  const effectiveGovernanceAccounts = governanceAccounts;
  if (!realm || effectiveGovernanceAccounts.length === 0) {
    return {
      daoId,
      realmName: realm?.name ?? daoId,
      source: 'shyft' as const,
      member: membershipRecords.length > 0,
      proposals: [] as MobileGovernanceProposal[]
    };
  }

  const delegatorAddresses = membershipRecords
    .filter((record) => record.governanceDelegate === ownerAddress && record.governingTokenOwner !== ownerAddress)
    .map((record) => record.governingTokenOwner);
  const voteQueryAddresses = Array.from(new Set([ownerAddress, ...delegatorAddresses]));

  const [proposalData, voteData] = await Promise.all([
    fetchGovernanceGraphql<Record<string, unknown>>(
      buildGovernanceProposalsQuery(
        namespace,
        effectiveGovernanceAccounts.map((entry) => entry.pubkey)
      )
    ),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceVoteRecordsQuery(namespace, voteQueryAddresses))
  ]);
  const proposalRows = normalizeGovernanceProposalRows(proposalData, namespace);
  const effectiveProposalRows = proposalRows;
  const votedOwnersByProposal = normalizeGovernanceVoteOwnersByProposal(voteData, namespace);
  const { ProposalState } = loadSplGovernanceModule();
  const governanceConfigById = new Map(effectiveGovernanceAccounts.map((entry) => [entry.pubkey, entry] as const));

  const proposals = effectiveProposalRows
    .map((proposal) => {
      const votedOwners = votedOwnersByProposal.get(proposal.pubkey) ?? new Set<string>();
      const voteSources = buildGovernanceProposalVoteSources(
        proposal.governingTokenMint,
        ownerAddress,
        membershipRecords,
        votedOwners
      );
      const membership = resolveGovernanceProposalMembership(proposal.governingTokenMint, ownerAddress, membershipRecords);
      const governanceConfig = governanceConfigById.get(proposal.governance);
      const resolvedVotingTime =
        proposal.maxVotingTime !== null && proposal.maxVotingTime !== undefined
          ? proposal.maxVotingTime
          : governanceConfig?.baseVotingTime ?? null;
      const votingEndsAt =
        proposal.votingAt !== null && resolvedVotingTime !== null
          ? proposal.votingAt + resolvedVotingTime
          : null;
      const hasVoted = voteSources.some((source) => source.hasVoted);
      const isDelegate = membership !== null && membership.governingTokenOwner !== ownerAddress;
      const canVote = proposal.state === ProposalState.Voting && voteSources.some((source) => !source.hasVoted);

      return {
        daoId,
        realmName: realm.name,
        governanceProgramId: governanceOwner.owner,
        governanceId: proposal.governance,
        proposalId: proposal.pubkey,
        proposalName: proposal.name,
        descriptionLink: proposal.descriptionLink,
        state: formatProposalStateLabel(proposal.state),
        stateCode: proposal.state,
        draftAt: proposal.draftAt,
        votingAt: proposal.votingAt,
        votingEndsAt,
        governingTokenMint: proposal.governingTokenMint,
        proposalOwnerRecordId: proposal.tokenOwnerRecord,
        tokenOwnerRecordId: membership?.pubkey ?? null,
        canVote,
        hasVoted,
        hasDenyOption: proposal.hasDenyOption,
        isDelegate,
        votingPowerType: getGovernanceProposalVotingPowerType(
          proposal.governingTokenMint,
          realm.councilMint,
          membership,
          ownerAddress
        ),
        voteSources,
        choices: proposal.options,
        yesVotes: proposal.yesVotes,
        noVotes: proposal.noVotes,
        abstainVotes: proposal.abstainVotes,
        denyVotes: proposal.denyVotes
      } satisfies MobileGovernanceProposal;
    })
    .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0));

  return {
    daoId,
    realmName: realm.name,
    source: 'shyft' as const,
    member: membershipRecords.length > 0,
    proposals
  };
}

async function fetchGovernanceForDaoViaRpc(ownerAddress: string, daoId: string) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getAllGovernances, getAllProposals, getRealm, getTokenOwnerRecordsByOwner, getVoteRecordsByVoter, getGovernanceAccounts, TokenOwnerRecord, MemcmpFilter, ProposalState } = loadSplGovernanceModule();
  const governanceOwner = findGovernanceOwnerByDao(daoId);
  const programId = new PublicKey(governanceOwner.owner);
  const realmPk = new PublicKey(daoId);
  const owner = new PublicKey(ownerAddress);
  const connection = getConnection();

  const [realmAccount, tokenOwnerRecords, delegatedTokenOwnerRecords, governanceAccounts] = await Promise.all([
    getRealm(connection, realmPk),
    getTokenOwnerRecordsByOwner(connection, programId, owner).catch(() => []),
    getGovernanceAccounts(connection, programId, TokenOwnerRecord, [new MemcmpFilter(122, owner.toBuffer())]).catch(() => []),
    getAllGovernances(connection, programId, realmPk).catch(() => []),
  ]);

  const realmTokenOwnerRecords = [
    ...tokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId),
    ...delegatedTokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId)
  ].filter((entry, index, allEntries) => allEntries.findIndex((candidate) => candidate.pubkey.equals(entry.pubkey)) === index);
  if (realmTokenOwnerRecords.length === 0 || governanceAccounts.length === 0) {
    return {
      daoId,
      realmName: realmAccount.account.name,
      source: 'rpc' as const,
      member: realmTokenOwnerRecords.length > 0,
      proposals: [] as MobileGovernanceProposal[]
    };
  }

  const proposalBatches = await getAllProposals(connection, programId, realmPk).catch(() => []);
  const proposals = proposalBatches.flatMap((batch) => batch);
  const membershipRecords = realmTokenOwnerRecords.map((entry) => ({
    pubkey: entry.pubkey.toBase58(),
    governingTokenMint: entry.account.governingTokenMint.toBase58(),
    governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
    governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
    governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
  } satisfies GovernanceMembershipRecord));
  const delegatorAddresses = membershipRecords
    .filter((record) => record.governanceDelegate === ownerAddress && record.governingTokenOwner !== ownerAddress)
    .map((record) => record.governingTokenOwner);
  const voteRecordBatches = await Promise.all(
    Array.from(new Set([ownerAddress, ...delegatorAddresses])).map((address) =>
      getVoteRecordsByVoter(connection, programId, new PublicKey(address)).catch(() => [])
    )
  );
  const votedOwnersByProposal = new Map<string, Set<string>>();
  for (const voteRecord of voteRecordBatches.flat()) {
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
    member: realmTokenOwnerRecords.length > 0,
    proposals: proposals
      .filter((entry) => isActiveGovernanceProposalState(entry.account.state))
      .map((entry) => {
        const proposalMint = entry.account.governingTokenMint.toBase58();
        const votedOwners = votedOwnersByProposal.get(entry.pubkey.toBase58()) ?? new Set<string>();
        const voteSources = buildGovernanceProposalVoteSources(proposalMint, ownerAddress, membershipRecords, votedOwners);
        const membership = resolveGovernanceProposalMembership(proposalMint, ownerAddress, membershipRecords);
        const votingAt = entry.account.votingAt ? entry.account.votingAt.toNumber() : null;
        const votingEndsAt =
          votingAt !== null && entry.account.maxVotingTime !== null ? votingAt + entry.account.maxVotingTime : null;
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
            : [{ rank: 0, label: 'Approve', voteWeight: entry.account.yesVotesCount.toString(), voteResult: null }];

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
          canVote: entry.account.state === ProposalState.Voting && voteSources.some((source) => !source.hasVoted),
          hasVoted,
          hasDenyOption: entry.account.denyVoteWeight !== undefined,
          isDelegate,
          votingPowerType: getGovernanceProposalVotingPowerType(
            proposalMint,
            realmAccount.account.config.councilMint?.toBase58() ?? null,
            membership,
            ownerAddress
          ),
          voteSources,
          choices: options,
          yesVotes: entry.account.yesVotesCount.toString(),
          noVotes: entry.account.noVotesCount.toString(),
          abstainVotes: entry.account.abstainVoteWeight?.toString() ?? '0',
          denyVotes: entry.account.denyVoteWeight?.toString() ?? '0'
        } satisfies MobileGovernanceProposal;
      })
      .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0))
  };
}

export async function fetchMobileGovernanceForWallet(ownerAddress: string, trackedDaoIds: string[]): Promise<MobileGovernanceResponse> {
  const uniqueTrackedDaoIds = normalizeTrackedDaoIds(trackedDaoIds);
  const supplementalMembershipsByRealm = await discoverRpcGovernanceMembershipsForWallet(ownerAddress).catch(
    () => new Map<string, GovernanceMembershipRecord[]>()
  );
  const discoveredDaoIds = Array.from(
    new Set([
      ...(await discoverGovernanceDaosForWallet(ownerAddress)),
      ...supplementalMembershipsByRealm.keys()
    ])
  );
  const uniqueDaoIds = Array.from(new Set([...discoveredDaoIds, ...uniqueTrackedDaoIds]));

  if (uniqueDaoIds.length === 0) {
    return {
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
        return await fetchGovernanceForDaoViaGraphql(
          ownerAddress,
          daoId,
          supplementalMembershipsByRealm.get(daoId)
        );
      } catch {
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
  const source = results.some((entry) => entry.source === 'shyft') ? 'shyft' : 'none';
  const daos: MobileGovernanceResponse['daos'] = results
    .filter((entry) => entry.member)
    .map((entry) => ({
      daoId: entry.proposals[0]?.daoId ?? entry.daoId,
      realmName: entry.realmName ?? entry.proposals[0]?.realmName ?? entry.daoId
    }))
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.daoId === entry.daoId) === index)
    .sort((left, right) => left.realmName.localeCompare(right.realmName));

  return {
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
