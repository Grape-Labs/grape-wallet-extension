import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUI_TYPE_ARG, normalizeSuiAddress } from '@mysten/sui/utils';
import type { VaultSecret } from '@grape/core';
import { getMobileSuiRpcUrl } from './config';

const DEFAULT_SUI_NETWORK = 'mainnet';
const SUI_DERIVATION_PATH = `m/44'/784'/0'/0'/0'`;

export type MobileSuiHolding = {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  rawAmount: string;
  logoUri?: string;
};

export type MobileSuiCollectible = {
  objectId: string;
  objectType: string;
  name: string;
  description?: string;
  imageUrl?: string;
};

export async function getMobileSuiCollectibles(owner: string, network: 'mainnet' | 'devnet' = DEFAULT_SUI_NETWORK): Promise<MobileSuiCollectible[]> {
  const collectibles: MobileSuiCollectible[] = [];
  let cursor: string | null = null;
  do {
    const page: { data?: any[]; hasNextPage?: boolean; nextCursor?: string | null } = await mobileSuiRpc(network, 'suix_getOwnedObjects', [
      normalizeSuiAddress(owner),
      { options: { showType: true, showContent: true, showDisplay: true } },
      cursor,
      100
    ]);
    for (const entry of page.data ?? []) {
      const object = entry.data ?? entry;
      if (typeof object.type !== 'string' || object.type.startsWith('0x2::coin::Coin<')) continue;
      const display = object.display?.data ?? {};
      const json = object.content?.fields ?? {};
      const name = mobileSuiString(display.name) ?? mobileSuiString(json.name);
      const rawImage = mobileSuiString(display.image_url) ?? mobileSuiString(display.image) ?? mobileSuiString(json.image_url) ?? mobileSuiString(json.url);
      if (!object.display && !name && !rawImage) continue;
      collectibles.push({
        objectId: object.objectId,
        objectType: object.type,
        name: name ?? object.type.split('::').at(-1) ?? 'Sui object',
        description: mobileSuiString(display.description) ?? mobileSuiString(json.description) ?? undefined,
        imageUrl: normalizeMobileSuiAssetUrl(rawImage)
      });
    }
    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor && collectibles.length < 500);
  return collectibles;
}

function mobileSuiString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeMobileSuiAssetUrl(value: string | null) {
  if (!value) return undefined;
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7)}`;
  if (value.startsWith('ar://')) return `https://arweave.net/${value.slice(5)}`;
  return value;
}

export function deriveMobileSuiAccount0(mnemonic: string) {
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, SUI_DERIVATION_PATH);
  return {
    address: keypair.toSuiAddress(),
    derivationPath: SUI_DERIVATION_PATH
  };
}

export function exportMobileSuiWalletSecret(secret: VaultSecret) {
  if (secret.kind === 'mnemonic') {
    const keypair = Ed25519Keypair.deriveKeypair(secret.mnemonic, SUI_DERIVATION_PATH);
    return {
      privateKey: keypair.getSecretKey(),
      derivationPath: SUI_DERIVATION_PATH
    };
  }

  if (secret.kind === 'private-key') {
    const imported = importMobileSuiPrivateKey(secret.secretKey);
    return {
      privateKey: imported.secretKey,
      derivationPath: imported.derivationPath
    };
  }

  throw new Error('Unsupported Sui wallet secret.');
}

export function importMobileSuiPrivateKey(privateKey: string) {
  const normalizedPrivateKey = privateKey.trim();
  const keypair = normalizedPrivateKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(normalizedPrivateKey)
    : Ed25519Keypair.fromSecretKey(decodeSuiRawPrivateKey(normalizedPrivateKey));

  return {
    secretKey: keypair.getSecretKey(),
    derivationPath: 'imported-private-key' as const,
    address: keypair.toSuiAddress()
  };
}

export function validateMobileSuiPrivateKey(privateKey: string) {
  try {
    importMobileSuiPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

export async function getMobileSuiHoldings(owner: string, network: 'mainnet' | 'devnet' = DEFAULT_SUI_NETWORK) {
  const normalizedOwner = normalizeSuiAddress(owner);
  const balances = await mobileSuiRpc<Array<{ coinType: string; totalBalance: string }>>(network, 'suix_getAllBalances', [normalizedOwner]);
  const coins: MobileSuiHolding[] = [];
  let totalMist = '0';

  for (const balance of balances) {
    if (isNativeSuiCoinType(balance.coinType)) {
      totalMist = balance.totalBalance ?? '0';
      continue;
    }

    const metadata = await mobileSuiRpc<{ decimals?: number; symbol?: string; name?: string; iconUrl?: string } | null>(
      network,
      'suix_getCoinMetadata',
      [balance.coinType]
    ).catch(() => null);
    const decimals = metadata?.decimals ?? 0;
    const amount = formatSuiAmount(balance.totalBalance ?? '0', decimals);

    coins.push({
      coinType: balance.coinType,
      symbol: metadata?.symbol ?? formatSuiCoinSymbol(balance.coinType),
      name: metadata?.name ?? formatSuiCoinSymbol(balance.coinType),
      decimals,
      amount,
      rawAmount: balance.totalBalance ?? '0',
      logoUri: metadata?.iconUrl ?? undefined
    });
  }

  return { totalMist, coins };
}

let mobileSuiRpcId = 0;

async function mobileSuiRpc<T>(network: 'mainnet' | 'devnet', method: string, params: unknown[]): Promise<T> {
  const response = await fetch(getMobileSuiRpcUrl(network), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++mobileSuiRpcId, method, params })
  });
  if (!response.ok) throw new Error(`Sui RPC request failed (${response.status}).`);
  const payload = await response.json() as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? 'Sui RPC request failed.');
  return payload.result as T;
}

export function formatMobileSuiAmount(rawAmount: string, decimals: number) {
  return formatSuiAmount(rawAmount, decimals);
}

export function getMobileSuiNetwork() {
  return DEFAULT_SUI_NETWORK;
}

export function mistToSuiLabel(mist: string) {
  return `${formatSuiAmount(mist, 9)} SUI`;
}

export function getMobileSuiSendUnsupportedMessage() {
  return 'Sui send is not available on mobile yet.';
}

function formatSuiAmount(rawAmount: string, decimals: number): string {
  const numeric = BigInt(rawAmount || '0');
  const divisor = 10n ** BigInt(decimals);
  const whole = numeric / divisor;
  const fraction = numeric % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionString}`;
}

function formatSuiCoinSymbol(coinType: string): string {
  const parts = coinType.split('::');
  return parts[parts.length - 1] ?? 'COIN';
}

function isNativeSuiCoinType(coinType: string): boolean {
  return normalizeSuiCoinType(coinType) === normalizeSuiCoinType(SUI_TYPE_ARG);
}

function normalizeSuiCoinType(coinType: string): string {
  const parts = coinType.trim().split('::');
  if (parts.length !== 3) {
    return coinType.trim().toLowerCase();
  }

  return `${normalizeSuiAddress(parts[0])}::${parts[1].toLowerCase()}::${parts[2].toUpperCase()}`;
}

function decodeSuiRawPrivateKey(privateKey: string): Uint8Array {
  const trimmed = privateKey.trim();
  if (!trimmed) {
    throw new Error('Sui private key is required.');
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('Sui private key array is invalid.');
    }

    const bytes = Uint8Array.from(parsed);
    if (bytes.length !== 32) {
      throw new Error('Sui private key must decode to 32 bytes.');
    }
    return bytes;
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    if (trimmed.length % 2 !== 0) {
      throw new Error('Hex private key must have an even number of characters.');
    }

    if (trimmed.length !== 64) {
      throw new Error('Sui private key must decode to 32 bytes.');
    }

    const bytes = new Uint8Array(trimmed.length / 2);
    for (let index = 0; index < trimmed.length; index += 2) {
      bytes[index / 2] = Number.parseInt(trimmed.slice(index, index + 2), 16);
    }
    return bytes;
  }

  try {
    const decoded = Uint8Array.from(Buffer.from(trimmed, 'base64'));
    if (decoded.length !== 32) {
      throw new Error('Sui private key must decode to 32 bytes.');
    }
    return decoded;
  } catch {
    throw new Error('Sui private key must be suiprivkey, base64, 64-char hex, or JSON byte array.');
  }
}
