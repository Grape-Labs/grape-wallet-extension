import { getMobileSolanaRpcUrl } from './config';

const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';
const DEFAULT_GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
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
  choices: MobileGovernanceProposalChoice[];
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  denyVotes: string;
};

export type MobileGovernanceResponse = {
  trackedDaos: string[];
  discoveredDaos: string[];
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

const GOVERNANCE_OWNERS: GovernanceOwner[] = [
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

async function fetchGovernanceGraphql<T>(query: string): Promise<T> {
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
    throw new Error(`Governance GraphQL request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
  }

  if (!payload.data) {
    throw new Error('Governance GraphQL response did not include data.');
  }

  return payload.data;
}

function buildGovernanceRealmQuery(namespace: string, daoId: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceRealm {
      ${namespace}_RealmV2(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
      }
      ${namespace}_RealmV1(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
      }
    }
  `;
}

function buildGovernanceOwnerRecordsQuery(namespace: string, owner: string) {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceOwnerRecords {
      ${namespace}_TokenOwnerRecordV2(
        limit: 5000,
        where: {
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 5000,
        where: {
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
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
        limit: 200,
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
        limit: 200,
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

function buildGovernanceAccountsQuery(namespace: string, daoId: string) {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceAccounts {
      ${namespace}_GovernanceV2(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
      }
      ${namespace}_GovernanceV1(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
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
        maxVotingTime
        name
        yesVotesCount
        noVotesCount
      }
    }
  `;
}

function buildGovernanceVoteRecordsQuery(namespace: string, owner: string) {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceVotesByOwner {
      ${namespace}_VoteRecordV2(limit: 5000, where: {governingTokenOwner: {_eq: "${escapedOwner}"}}) {
        proposal
      }
      ${namespace}_VoteRecordV1(limit: 5000, where: {governingTokenOwner: {_eq: "${escapedOwner}"}}) {
        proposal
      }
    }
  `;
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
    communityMint
  };
}

function normalizeGovernanceMembershipRecords(data: Record<string, unknown>, namespace: string): GovernanceMembershipRecord[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  return rows
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
}

function normalizeGovernanceOwnerDaoIds(data: Record<string, unknown>, namespace: string) {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  return Array.from(
    new Set(
      rows
        .map((row) => {
          const realm = typeof row.realm === 'string' ? row.realm : '';
          const deposit = parseGovernanceBigIntString(row.governingTokenDepositAmount);
          return realm && BigInt(deposit) > BigInt(0) ? realm : '';
        })
        .filter(Boolean)
    )
  );
}

async function discoverGovernanceDaosForWallet(ownerAddress: string) {
  const discovered = await Promise.all(
    getGovernanceNamespaces().map(async ({ namespace }) => {
      try {
        const data = await fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceOwnerRecordsQuery(namespace, ownerAddress));
        return normalizeGovernanceOwnerDaoIds(data, namespace);
      } catch {
        return [] as string[];
      }
    })
  );

  return Array.from(new Set(discovered.flat()));
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
      return pubkey && realm ? ({ pubkey, realm } satisfies GovernanceProgramAccount) : null;
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
    (row) => row.pubkey && row.governance && row.governingTokenMint && row.tokenOwnerRecord && isActiveGovernanceProposalState(row.state)
  );
}

function normalizeGovernanceVoteProposalIds(data: Record<string, unknown>, namespace: string) {
  const rows = [
    ...(Array.isArray(data[`${namespace}_VoteRecordV2`]) ? (data[`${namespace}_VoteRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_VoteRecordV1`]) ? (data[`${namespace}_VoteRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  return new Set(
    rows
      .map((row) => (typeof row.proposal === 'string' ? row.proposal : ''))
      .filter(Boolean)
  );
}

async function fetchGovernanceForDaoViaGraphql(ownerAddress: string, daoId: string) {
  const governanceOwner = findGovernanceOwnerByDao(daoId);
  const namespace = governanceOwner.name;

  const [realmData, membershipData, governanceData, voteData] = await Promise.all([
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmQuery(namespace, daoId)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceMembershipQuery(namespace, daoId, ownerAddress)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceAccountsQuery(namespace, daoId)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceVoteRecordsQuery(namespace, ownerAddress))
  ]);

  const realm = normalizeGovernanceRealmInfo(realmData, namespace, daoId);
  const membershipRecords = normalizeGovernanceMembershipRecords(membershipData, namespace);
  const governanceAccounts = normalizeGovernanceAccounts(governanceData, namespace);
  const votedProposalIds = normalizeGovernanceVoteProposalIds(voteData, namespace);
  if (!realm || membershipRecords.length === 0 || governanceAccounts.length === 0) {
    return { source: 'shyft' as const, member: membershipRecords.length > 0, proposals: [] as MobileGovernanceProposal[] };
  }

  const proposalData = await fetchGovernanceGraphql<Record<string, unknown>>(
    buildGovernanceProposalsQuery(
      namespace,
      governanceAccounts.map((entry) => entry.pubkey)
    )
  );
  const proposalRows = normalizeGovernanceProposalRows(proposalData, namespace);
  const membershipByMint = new Map(membershipRecords.map((entry) => [entry.governingTokenMint, entry] as const));
  const soleMembership = membershipRecords[0];

  const proposals = proposalRows
    .map((proposal) => {
      const membership = membershipByMint.get(proposal.governingTokenMint) ?? soleMembership ?? null;
      const votingEndsAt =
        proposal.votingAt !== null && proposal.maxVotingTime !== null
          ? proposal.votingAt + proposal.maxVotingTime
          : null;
      const hasVoted = votedProposalIds.has(proposal.pubkey);
      const delegatedAway =
        membership?.governanceDelegate !== null &&
        membership?.governanceDelegate !== undefined &&
        membership.governanceDelegate !== ownerAddress;
      const canVote =
        proposal.state === loadSplGovernanceModule().ProposalState.Voting &&
        !!membership &&
        BigInt(membership.governingTokenDepositAmount) > BigInt(0) &&
        !delegatedAway &&
        !hasVoted;

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
        choices: proposal.options,
        yesVotes: proposal.yesVotes,
        noVotes: proposal.noVotes,
        abstainVotes: proposal.abstainVotes,
        denyVotes: proposal.denyVotes
      } satisfies MobileGovernanceProposal;
    })
    .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0));

  return {
    source: 'shyft' as const,
    member: membershipRecords.length > 0,
    proposals
  };
}

async function fetchGovernanceForDaoViaRpc(ownerAddress: string, daoId: string) {
  const { PublicKey } = loadSolanaWeb3Module();
  const { getAllGovernances, getAllProposals, getRealm, getTokenOwnerRecordsByOwner, getVoteRecordsByVoter } = loadSplGovernanceModule();
  const governanceOwner = findGovernanceOwnerByDao(daoId);
  const programId = new PublicKey(governanceOwner.owner);
  const realmPk = new PublicKey(daoId);
  const owner = new PublicKey(ownerAddress);
  const connection = getConnection();

  const [realmAccount, tokenOwnerRecords, governanceAccounts, voteRecords] = await Promise.all([
    getRealm(connection, realmPk),
    getTokenOwnerRecordsByOwner(connection, programId, owner).catch(() => []),
    getAllGovernances(connection, programId, realmPk).catch(() => []),
    getVoteRecordsByVoter(connection, programId, owner).catch(() => [])
  ]);

  const realmTokenOwnerRecords = tokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId);
  if (realmTokenOwnerRecords.length === 0 || governanceAccounts.length === 0) {
    return { source: 'rpc' as const, member: realmTokenOwnerRecords.length > 0, proposals: [] as MobileGovernanceProposal[] };
  }

  const proposalBatches = await getAllProposals(connection, programId, realmPk).catch(() => []);
  const proposals = proposalBatches.flatMap((batch) => batch);
  const membershipByMint = new Map(
    realmTokenOwnerRecords.map((entry) => [
      entry.account.governingTokenMint.toBase58(),
      {
        pubkey: entry.pubkey.toBase58(),
        governingTokenMint: entry.account.governingTokenMint.toBase58(),
        governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
        governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
        governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
      } satisfies GovernanceMembershipRecord
    ] as const)
  );
  const soleMembership = realmTokenOwnerRecords[0];
  const votedProposalIds = new Set(voteRecords.map((entry) => entry.account.proposal.toBase58()));
  const { ProposalState } = loadSplGovernanceModule();

  return {
    source: 'rpc' as const,
    member: realmTokenOwnerRecords.length > 0,
    proposals: proposals
      .filter((entry) => isActiveGovernanceProposalState(entry.account.state))
      .map((entry) => {
        const membership =
          membershipByMint.get(entry.account.governingTokenMint.toBase58()) ??
          (soleMembership
            ? {
                pubkey: soleMembership.pubkey.toBase58(),
                governingTokenMint: soleMembership.account.governingTokenMint.toBase58(),
                governingTokenOwner: soleMembership.account.governingTokenOwner.toBase58(),
                governanceDelegate: soleMembership.account.governanceDelegate?.toBase58() ?? null,
                governingTokenDepositAmount: soleMembership.account.governingTokenDepositAmount.toString()
              }
            : null);
        const votingAt = entry.account.votingAt ? entry.account.votingAt.toNumber() : null;
        const votingEndsAt =
          votingAt !== null && entry.account.maxVotingTime !== null ? votingAt + entry.account.maxVotingTime : null;
        const hasVoted = votedProposalIds.has(entry.pubkey.toBase58());
        const delegatedAway =
          membership?.governanceDelegate !== null &&
          membership?.governanceDelegate !== undefined &&
          membership.governanceDelegate !== ownerAddress;
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
          canVote:
            entry.account.state === ProposalState.Voting &&
            !!membership &&
            BigInt(membership.governingTokenDepositAmount) > BigInt(0) &&
            !delegatedAway &&
            !hasVoted,
          hasVoted,
          hasDenyOption: entry.account.denyVoteWeight !== undefined,
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
  const discoveredDaoIds = await discoverGovernanceDaosForWallet(ownerAddress);
  const uniqueDaoIds = Array.from(new Set([...discoveredDaoIds, ...uniqueTrackedDaoIds]));

  if (uniqueDaoIds.length === 0) {
    return {
      trackedDaos: uniqueTrackedDaoIds,
      discoveredDaos: [],
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
        return await fetchGovernanceForDaoViaGraphql(ownerAddress, daoId);
      } catch {
        try {
          return await fetchGovernanceForDaoViaRpc(ownerAddress, daoId);
        } catch {
          return {
            source: 'none' as const,
            member: false,
            proposals: [] as MobileGovernanceProposal[]
          };
        }
      }
    })
  );

  const proposals = results
    .flatMap((entry) => entry.proposals)
    .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0))
    .slice(0, 50);
  const memberDaos = results.filter((entry) => entry.member).length;
  const source = results.some((entry) => entry.source === 'shyft')
    ? 'shyft'
    : results.some((entry) => entry.source === 'rpc')
      ? 'rpc'
      : 'none';

  return {
    trackedDaos: uniqueTrackedDaoIds,
    discoveredDaos: discoveredDaoIds,
    memberDaos,
    proposals,
    source,
    network: getNetworkLabel(),
    refreshedAt: Date.now()
  };
}

