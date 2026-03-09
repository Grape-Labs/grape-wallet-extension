const SHYFT_BASE_URL = 'https://api.shyft.to/sol/v1';

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
    image?: string;
    image_uri?: string;
    imageUrl?: string;
  }>;
  nfts?: Array<{
    mint?: string;
    nft_address?: string;
    name?: string;
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
    imageUri?: string;
  }>;
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

  const response = await fetch(url, {
    headers: getShyftHeaders()
  });

  if (!response.ok) {
    throw new Error(`Shyft wallet token request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as ShyftResponse;
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
    image?: string;
    image_uri?: string;
    imageUrl?: string;
  }
): { mint: string; name?: string; imageUri?: string } | null {
  const mint = normalizeString(item.mint) ?? normalizeString(item.nft_address);
  if (!mint) {
    return null;
  }

  return {
    mint,
    name: normalizeString(item.name),
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
    .filter((item): item is { mint: string; name?: string; imageUri?: string } => !!item);

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

  const response = await fetch(url, {
    headers: getShyftHeaders()
  });

  if (!response.ok) {
    throw new Error(`Shyft wallet collections request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as ShyftResponse;
  const entries = extractCollectionEntries(payload);

  return entries
    .map((entry) => normalizeCollection((entry ?? {}) as ShyftCollectionItem))
    .filter((entry): entry is ShyftCollectionMetadata => !!entry)
    .sort((left, right) => right.itemCount - left.itemCount);
}
