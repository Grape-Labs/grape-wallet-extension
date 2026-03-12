export const MOBILE_SOLANA_DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const MOBILE_SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const MOBILE_SUI_MAINNET_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const MOBILE_SUI_DEVNET_RPC_URL = 'https://fullnode.devnet.sui.io:443';
export const MOBILE_ETHEREUM_MAINNET_RPC_URL = 'https://ethereum-rpc.publicnode.com';
export const MOBILE_ETHEREUM_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
export const MOBILE_MONAD_MAINNET_RPC_URL = 'https://rpc.monad.xyz';
export const MOBILE_MONAD_TESTNET_RPC_URL = 'https://testnet-rpc.monad.xyz';

export const MOBILE_JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';

function readPublicEnv(key: string) {
  const value = process.env[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getMobileShyftApiKey() {
  return readPublicEnv('EXPO_PUBLIC_SHYFT_API_KEY');
}

export function getMobileJupiterApiKey() {
  return readPublicEnv('EXPO_PUBLIC_JUP_API_KEY');
}

export function getMobileSolanaRpcUrl(network: 'mainnet-beta' | 'devnet' = 'mainnet-beta') {
  const custom = readPublicEnv('EXPO_PUBLIC_SOLANA_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'devnet' ? MOBILE_SOLANA_DEVNET_RPC_URL : MOBILE_SOLANA_DEFAULT_RPC_URL;
}

export function getMobileSuiRpcUrl(network: 'mainnet' | 'devnet' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_SUI_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'devnet' ? MOBILE_SUI_DEVNET_RPC_URL : MOBILE_SUI_MAINNET_RPC_URL;
}

export function getMobileEthereumRpcUrl(network: 'mainnet' | 'sepolia' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_ETHEREUM_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'sepolia' ? MOBILE_ETHEREUM_SEPOLIA_RPC_URL : MOBILE_ETHEREUM_MAINNET_RPC_URL;
}

export function getMobileMonadRpcUrl(network: 'mainnet' | 'testnet' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_MONAD_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'testnet' ? MOBILE_MONAD_TESTNET_RPC_URL : MOBILE_MONAD_MAINNET_RPC_URL;
}

export async function fetchMobileJupiterPrices(ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {} as Record<string, { usdPrice: number | null; priceChange24h: number | null }>;
  }

  const apiKey = getMobileJupiterApiKey();
  const baseUrl = apiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
  const url = new URL(`${baseUrl}/price/v3`);
  url.searchParams.set('ids', uniqueIds.join(','));

  const response = await fetch(url.toString(), {
    headers: apiKey ? { 'x-api-key': apiKey } : undefined
  });

  if (!response.ok) {
    throw new Error(`Jupiter pricing request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as Record<
    string,
    {
      usdPrice?: number;
      price?: number;
      priceChange24h?: number;
    }
  >;

  return Object.fromEntries(
    Object.entries(payload).map(([id, value]) => [
      id,
      {
        usdPrice:
          typeof value?.usdPrice === 'number'
            ? value.usdPrice
            : typeof value?.price === 'number'
              ? value.price
              : null,
        priceChange24h: typeof value?.priceChange24h === 'number' ? value.priceChange24h : null
      }
    ])
  );
}

export async function fetchMobileShyftTokenMetadata(wallet: string, network: 'mainnet-beta' | 'devnet' = 'mainnet-beta') {
  const apiKey = getMobileShyftApiKey();
  if (!apiKey) {
    return {} as Record<string, { mint: string; name?: string; symbol?: string; logoUri?: string }>;
  }

  const url = new URL('https://api.shyft.to/sol/v1/wallet/all_tokens');
  url.searchParams.set('network', network);
  url.searchParams.set('wallet', wallet);

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Shyft token request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    result?: Array<{
      address?: string;
      token_address?: string;
      mint?: string;
      name?: string;
      symbol?: string;
      image?: string;
      logoURI?: string;
      info?: {
        name?: string;
        symbol?: string;
        image?: string;
      };
    }>;
  };

  const entries = Array.isArray(payload.result) ? payload.result : [];
  return Object.fromEntries(
    entries
      .map((entry) => {
        const mint = entry.address?.trim() || entry.token_address?.trim() || entry.mint?.trim();
        if (!mint) {
          return null;
        }

        return [
          mint,
          {
            mint,
            name: entry.info?.name?.trim() || entry.name?.trim() || undefined,
            symbol: entry.info?.symbol?.trim() || entry.symbol?.trim() || undefined,
            logoUri: entry.info?.image?.trim() || entry.image?.trim() || entry.logoURI?.trim() || undefined
          }
        ] as const;
      })
      .filter((entry): entry is readonly [string, { mint: string; name?: string; symbol?: string; logoUri?: string }] => !!entry)
  );
}

export function formatUsdValue(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}
