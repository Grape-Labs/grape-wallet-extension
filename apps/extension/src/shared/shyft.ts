import type { WalletActivityAction, WalletActivityItem } from './models';

const SHYFT_BASE_URL = 'https://api.shyft.to/sol/v1';
const SHYFT_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function getShyftApiKey(): string | undefined {
  return import.meta.env.VITE_GRAPE_SHYFT_API_KEY?.trim() || undefined;
}

type ShyftWalletTokenEntry = {
  address?: string;
  token_address?: string;
  mint?: string;
  balance?: number;
  name?: string;
  symbol?: string;
  image?: string;
  logoURI?: string;
  info?: {
    decimals?: number;
    name?: string;
    symbol?: string;
    image?: string;
    metadata_uri?: string;
  };
};

type ShyftResponse = {
  success?: boolean;
  message?: string;
  result?: unknown;
};

export type ShyftTokenMetadata = {
  mint: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
};

type ShyftCollectionItem = {
  collection_id?: string;
  collectionId?: string;
  collection_address?: string;
  address?: string;
  collection_name?: string;
  symbol?: string;
  name?: string;
  image?: string;
  image_uri?: string;
  imageUrl?: string;
  logoURI?: string;
  nft_count?: number;
  count?: number;
  collection?: {
    address?: string;
    name?: string;
    symbol?: string;
    image?: string;
    image_uri?: string;
    imageUrl?: string;
    logoURI?: string;
  };
  items?: Array<{
    mint?: string;
    nft_address?: string;
    name?: string;
    symbol?: string;
    image?: string;
    image_uri?: string;
    imageUrl?: string;
  }>;
  nfts?: Array<{
    mint?: string;
    nft_address?: string;
    name?: string;
    symbol?: string;
    image?: string;
    image_uri?: string;
    imageUrl?: string;
  }>;
};

export type ShyftCollectionMetadata = {
  id: string;
  name: string;
  symbol?: string;
  imageUri?: string;
  itemCount: number;
  items: Array<{
    mint: string;
    name?: string;
    symbol?: string;
    imageUri?: string;
  }>;
};

export type ShyftStakeAccount = {
  address: string;
  lamports: number;
  delegatedLamports: number;
  state: string;
  voter: string | null;
  staker: string | null;
  withdrawer: string | null;
};

type ShyftTransactionProtocol = {
  address?: string;
  name?: string;
};

type ShyftTransactionAction = {
  type?: string;
  info?: Record<string, unknown>;
  source_protocol?: ShyftTransactionProtocol;
  parent_protocol?: ShyftTransactionProtocol;
};

type ShyftTransactionEntry = {
  signature?: string;
  signatures?: string[];
  timestamp?: string | number;
  status?: string | boolean;
  type?: string;
  fee?: string | number;
  fee_payer?: string;
  feePayer?: string;
  signers?: string[];
  protocol?: ShyftTransactionProtocol;
  actions?: ShyftTransactionAction[];
};

function getShyftHeaders(): Record<string, string> | undefined {
  const apiKey = getShyftApiKey();
  return apiKey ? { 'x-api-key': apiKey } : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function extractMint(entry: ShyftWalletTokenEntry): string | undefined {
  return normalizeString(entry.address) ?? normalizeString(entry.token_address) ?? normalizeString(entry.mint);
}

function normalizeEntry(entry: ShyftWalletTokenEntry): ShyftTokenMetadata | null {
  const mint = extractMint(entry);
  if (!mint) {
    return null;
  }

  const info = entry.info ?? {};

  return {
    mint,
    name: normalizeString(info.name) ?? normalizeString(entry.name),
    symbol: normalizeString(info.symbol) ?? normalizeString(entry.symbol),
    logoUri: normalizeString(info.image) ?? normalizeString(entry.image) ?? normalizeString(entry.logoURI)
  };
}

export function hasShyftApiKey(): boolean {
  return !!getShyftApiKey();
}

function normalizeImage(entry: {
  image?: string;
  image_uri?: string;
  imageUrl?: string;
  logoURI?: string;
}): string | undefined {
  return (
    normalizeString(entry.image) ??
    normalizeString(entry.image_uri) ??
    normalizeString(entry.imageUrl) ??
    normalizeString(entry.logoURI)
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchShyftJsonWithRetry(url: URL, init?: RequestInit, maxAttempts = 3): Promise<ShyftResponse> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, init);

    if (response.ok) {
      return (await response.json()) as ShyftResponse;
    }

    lastStatus = response.status;
    if (!SHYFT_RETRYABLE_STATUS_CODES.has(response.status) || attempt === maxAttempts) {
      throw new Error(`Shyft request failed with ${response.status}.`);
    }

    await delay(250 * attempt);
  }

  throw new Error(`Shyft request failed with ${lastStatus ?? 'unknown status'}.`);
}

export async function fetchShyftWalletTokens(
  network: 'mainnet-beta' | 'devnet',
  wallet: string
): Promise<Record<string, ShyftTokenMetadata>> {
  if (!getShyftApiKey()) {
    return {};
  }

  const url = new URL(`${SHYFT_BASE_URL}/wallet/all_tokens`);
  url.searchParams.set('network', network);
  url.searchParams.set('wallet', wallet);

  const payload = await fetchShyftJsonWithRetry(url, {
    headers: getShyftHeaders()
  });
  const entries = Array.isArray(payload.result) ? payload.result : [];

  return Object.fromEntries(
    entries
      .map((entry) => normalizeEntry((entry ?? {}) as ShyftWalletTokenEntry))
      .filter((entry): entry is ShyftTokenMetadata => !!entry)
      .map((entry) => [entry.mint, entry] as const)
  );
}

function normalizeCollectibleItem(
  item: {
    mint?: string;
    nft_address?: string;
    name?: string;
    symbol?: string;
    image?: string;
    image_uri?: string;
    imageUrl?: string;
  }
): { mint: string; name?: string; symbol?: string; imageUri?: string } | null {
  const mint = normalizeString(item.mint) ?? normalizeString(item.nft_address);
  if (!mint) {
    return null;
  }

  return {
    mint,
    name: normalizeString(item.name),
    symbol: normalizeString(item.symbol),
    imageUri: normalizeImage(item)
  };
}

function normalizeCollection(entry: ShyftCollectionItem): ShyftCollectionMetadata | null {
  const nestedCollection = entry.collection ?? {};
  const id =
    normalizeString(entry.collection_id) ??
    normalizeString(entry.collectionId) ??
    normalizeString(entry.collection_address) ??
    normalizeString(entry.address) ??
    normalizeString(nestedCollection.address);
  const name =
    normalizeString(entry.name) ??
    normalizeString(entry.collection_name) ??
    normalizeString(nestedCollection.name) ??
    normalizeString(entry.symbol);

  if (!id || !name) {
    return null;
  }

  const items = (Array.isArray(entry.items) ? entry.items : Array.isArray(entry.nfts) ? entry.nfts : [])
    .map((item) => normalizeCollectibleItem(item))
    .filter((item): item is { mint: string; name?: string; symbol?: string; imageUri?: string } => !!item);

  return {
    id,
    name,
    symbol: normalizeString(entry.symbol) ?? normalizeString(nestedCollection.symbol),
    imageUri: normalizeImage(entry) ?? normalizeImage(nestedCollection),
    itemCount:
      typeof entry.nft_count === 'number'
        ? entry.nft_count
        : typeof entry.count === 'number'
          ? entry.count
          : items.length,
    items
  };
}

function parseNumberish(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatTypeLabel(value: string | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    return 'Activity';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return parseTimestampMs(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function normalizeStatus(value: unknown): WalletActivityItem['status'] {
  if (typeof value === 'boolean') {
    return value ? 'success' : 'failed';
  }

  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  if (normalized.includes('success')) {
    return 'success';
  }

  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'failed';
  }

  return 'unknown';
}

function extractStringFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeString(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractAmountFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString(undefined, {
        maximumFractionDigits: value >= 1 ? 4 : 6
      });
    }
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric.toLocaleString(undefined, {
          maximumFractionDigits: numeric >= 1 ? 4 : 6
        });
      }
      return value.trim();
    }
  }

  return null;
}

function extractActionAsset(record: Record<string, unknown>): string | null {
  return extractStringFromRecord(record, [
    'symbol',
    'token_symbol',
    'tokenSymbol',
    'asset_symbol',
    'assetSymbol',
    'currency',
    'currency_symbol',
    'currencySymbol',
    'mint_symbol',
    'mintSymbol',
    'name'
  ]);
}

function normalizeActivityAction(action: ShyftTransactionAction): WalletActivityAction {
  const info = typeof action.info === 'object' && action.info ? action.info : {};
  const protocolName =
    normalizeString(action.source_protocol?.name) ??
    normalizeString(action.parent_protocol?.name) ??
    null;

  return {
    type: normalizeString(action.type) ?? 'unknown',
    label: formatTypeLabel(normalizeString(action.type) ?? 'unknown'),
    amount: extractAmountFromRecord(info, [
      'amount',
      'amount_in',
      'amount_out',
      'in_amount',
      'out_amount',
      'deposit_amount',
      'withdraw_amount',
      'payment_amount',
      'value',
      'ui_amount',
      'uiAmount'
    ]),
    asset: extractActionAsset(info),
    address: extractStringFromRecord(info, [
      'address',
      'mint',
      'token_address',
      'tokenAddress',
      'receiver',
      'recipient',
      'destination',
      'to',
      'to_address',
      'toAddress',
      'seller',
      'buyer',
      'owner',
      'account'
    ]),
    protocolName
  };
}

function buildActivityDescription(entry: ShyftTransactionEntry, actions: WalletActivityAction[]): string {
  const baseType = formatTypeLabel(normalizeString(entry.type) ?? 'activity');
  const protocolName =
    normalizeString(entry.protocol?.name) ??
    actions.find((action) => action.protocolName)?.protocolName ??
    null;
  const action = actions[0];
  const amountLabel =
    action?.amount && action?.asset ? `${action.amount} ${action.asset}` : action?.amount ?? action?.asset ?? null;

  if (amountLabel && protocolName) {
    return `${baseType} • ${amountLabel} • ${protocolName}`;
  }

  if (amountLabel) {
    return `${baseType} • ${amountLabel}`;
  }

  if (protocolName) {
    return `${baseType} • ${protocolName}`;
  }

  return baseType;
}

function extractTransactionEntries(payload: ShyftResponse): ShyftTransactionEntry[] {
  if (Array.isArray(payload.result)) {
    return payload.result as ShyftTransactionEntry[];
  }

  const result =
    payload.result as
      | {
          transactions?: unknown;
          history?: unknown;
          txs?: unknown;
          result?: {
            transactions?: unknown;
            history?: unknown;
            txs?: unknown;
          };
        }
      | undefined;

  if (Array.isArray(result?.transactions)) {
    return result.transactions as ShyftTransactionEntry[];
  }

  if (Array.isArray(result?.history)) {
    return result.history as ShyftTransactionEntry[];
  }

  if (Array.isArray(result?.txs)) {
    return result.txs as ShyftTransactionEntry[];
  }

  if (Array.isArray(result?.result?.transactions)) {
    return result.result.transactions as ShyftTransactionEntry[];
  }

  if (Array.isArray(result?.result?.history)) {
    return result.result.history as ShyftTransactionEntry[];
  }

  if (Array.isArray(result?.result?.txs)) {
    return result.result.txs as ShyftTransactionEntry[];
  }

  return [];
}

function normalizeTransactionEntry(entry: ShyftTransactionEntry): WalletActivityItem | null {
  const signature =
    normalizeString(entry.signature) ??
    (Array.isArray(entry.signatures) ? normalizeString(entry.signatures[0]) : undefined);
  if (!signature) {
    return null;
  }

  const actions = (Array.isArray(entry.actions) ? entry.actions : []).map(normalizeActivityAction);
  const protocolName = normalizeString(entry.protocol?.name) ?? actions.find((action) => action.protocolName)?.protocolName ?? null;
  const protocolAddress = normalizeString(entry.protocol?.address) ?? null;
  const fee = parseNumberish(entry.fee);

  return {
    signature,
    timestamp: parseTimestampMs(entry.timestamp),
    status: normalizeStatus(entry.status),
    type: normalizeString(entry.type) ?? 'activity',
    description: buildActivityDescription(entry, actions),
    feeSol: Number.isFinite(fee) ? fee : null,
    feePayer: normalizeString(entry.fee_payer) ?? normalizeString(entry.feePayer) ?? null,
    protocolName,
    protocolAddress,
    signers: Array.isArray(entry.signers) ? entry.signers.map((signer) => normalizeString(signer)).filter((signer): signer is string => !!signer) : [],
    actions
  };
}

function normalizeStakeAccount(account: Record<string, unknown>): ShyftStakeAccount | null {
  const address =
    normalizeString(account.stakeAccountAddress) ??
    normalizeString(account.stake_account_address) ??
    normalizeString(account.stake_account) ??
    normalizeString(account.address) ??
    normalizeString(account.account) ??
    normalizeString(account.stake_pubkey);

  if (!address) {
    return null;
  }

  const rawBalance = account.lamports ?? account.balance ?? account.total_amount ?? 0;
  const rawDelegated =
    account.delegated_lamports ??
    account.delegated_stake ??
    account.delegated_amount ??
    account.active_amount ??
    0;
  const authorized =
    typeof account.authorized === 'object' && account.authorized
      ? (account.authorized as { staker?: unknown; withdrawer?: unknown })
      : undefined;
  const toLamports = (value: number) => (Number.isInteger(value) ? value : Math.round(value * 1_000_000_000));

  return {
    address,
    lamports: toLamports(parseNumberish(rawBalance)),
    delegatedLamports: toLamports(parseNumberish(rawDelegated)),
    state: normalizeString(account.state) ?? normalizeString(account.status) ?? 'unknown',
    voter:
      normalizeString(account.voter) ??
      normalizeString(account.voter_address) ??
      normalizeString(account.vote_account) ??
      normalizeString(account.voteAccountAddress) ??
      normalizeString(account.vote_account_address) ??
      null,
    staker:
      normalizeString(account.staker) ??
      normalizeString(authorized?.staker) ??
      normalizeString(account.stakeAuthorityAddress) ??
      normalizeString(account.stake_authority_address) ??
      null,
    withdrawer:
      normalizeString(account.withdrawer) ??
      normalizeString(authorized?.withdrawer) ??
      normalizeString(account.withdrawAuthorityAddress) ??
      normalizeString(account.withdraw_authority_address) ??
      null
  };
}

function extractCollectionEntries(payload: ShyftResponse): ShyftCollectionItem[] {
  if (Array.isArray(payload.result)) {
    return payload.result as ShyftCollectionItem[];
  }

  const result = payload.result as { collections?: unknown; result?: { collections?: unknown } } | undefined;
  if (Array.isArray(result?.collections)) {
    return result.collections as ShyftCollectionItem[];
  }

  if (Array.isArray(result?.result?.collections)) {
    return result.result.collections as ShyftCollectionItem[];
  }

  return [];
}

export async function fetchShyftCollections(
  network: 'mainnet-beta' | 'devnet',
  walletAddress: string
): Promise<ShyftCollectionMetadata[]> {
  if (!getShyftApiKey()) {
    return [];
  }

  const url = new URL(`${SHYFT_BASE_URL}/wallet/collections`);
  url.searchParams.set('network', network);
  url.searchParams.set('wallet_address', walletAddress);

  const payload = await fetchShyftJsonWithRetry(url, {
    headers: getShyftHeaders()
  });
  const entries = extractCollectionEntries(payload);

  return entries
    .map((entry) => normalizeCollection((entry ?? {}) as ShyftCollectionItem))
    .filter((entry): entry is ShyftCollectionMetadata => !!entry)
    .sort((left, right) => right.itemCount - left.itemCount);
}

export async function fetchShyftStakeAccounts(
  network: 'mainnet-beta' | 'devnet',
  walletAddress: string
): Promise<ShyftStakeAccount[]> {
  if (!getShyftApiKey()) {
    return [];
  }

  const pageSize = 10;
  const maxPages = 20;
  const rows: ShyftStakeAccount[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${SHYFT_BASE_URL}/wallet/stake_accounts`);
    url.searchParams.set('network', network);
    url.searchParams.set('wallet_address', walletAddress);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(pageSize));

    const payload = await fetchShyftJsonWithRetry(url, {
      headers: getShyftHeaders()
    });
    const pageItems = Array.isArray(payload.result)
      ? payload.result
      : Array.isArray((payload.result as { stake_accounts?: unknown } | undefined)?.stake_accounts)
        ? ((payload.result as { stake_accounts?: unknown }).stake_accounts as unknown[])
        : [];

    rows.push(
      ...pageItems
        .map((account) => normalizeStakeAccount((account ?? {}) as Record<string, unknown>))
        .filter((account): account is ShyftStakeAccount => !!account)
    );

    if (pageItems.length < pageSize) {
      break;
    }
  }

  const deduped = new Map<string, ShyftStakeAccount>();
  rows.forEach((row) => {
    deduped.set(row.address, row);
  });

  return Array.from(deduped.values()).sort((left, right) => right.lamports - left.lamports);
}

export async function fetchShyftTransactionHistory(
  network: 'mainnet-beta' | 'devnet',
  walletAddress: string,
  limit = 30
): Promise<WalletActivityItem[]> {
  if (!getShyftApiKey()) {
    return [];
  }

  const url = new URL(`${SHYFT_BASE_URL}/transaction/history`);
  url.searchParams.set('network', network);
  url.searchParams.set('account', walletAddress);
  url.searchParams.set('tx_num', String(limit));
  url.searchParams.set('enable_raw', 'false');
  url.searchParams.set('enable_events', 'true');

  const payload = await fetchShyftJsonWithRetry(url, {
    headers: getShyftHeaders()
  });
  const entries = extractTransactionEntries(payload);

  return entries
    .map((entry) => normalizeTransactionEntry((entry ?? {}) as ShyftTransactionEntry))
    .filter((entry): entry is WalletActivityItem => !!entry)
    .sort((left, right) => right.timestamp - left.timestamp);
}
