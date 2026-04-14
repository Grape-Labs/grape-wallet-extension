import type { VaultSecret } from '@grape/core';
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseEther,
  parseAbi,
  parseUnits,
  type Address,
  type Hex
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export const MONAD_DERIVATION_PATH = `m/44'/60'/0'/0/0`;
export const DEFAULT_MONAD_NETWORK = 'mainnet';
export const MONAD_MAINNET_RPC_URL = 'https://rpc.monad.xyz';
export const MONAD_MAINNET_CHAIN = {
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [MONAD_MAINNET_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://monadexplorer.com'
    }
  }
} as const;
export const MONAD_TESTNET_RPC_URL = 'https://testnet-rpc.monad.xyz';
export const MONAD_TESTNET_CHAIN = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [MONAD_TESTNET_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com'
    }
  },
  testnet: true
} as const;

export type MonadNetwork = 'mainnet' | 'testnet';
export type MonadTokenPreview = {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: string;
  rawAmount: string;
};

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)'
]);

export type DerivedMonadAccount = {
  mnemonic: string;
  derivationPath: string;
  address: string;
};

export type ImportedMonadPrivateKeyAccount = {
  secretKey: string;
  derivationPath: 'imported-private-key';
  address: string;
};

export function deriveMonadAccount0(mnemonic: string): DerivedMonadAccount {
  const account = mnemonicToAccount(mnemonic, {
    path: MONAD_DERIVATION_PATH
  });
  return {
    mnemonic,
    derivationPath: MONAD_DERIVATION_PATH,
    address: account.address
  };
}

export function validateMonadAddress(address: string): boolean {
  return isAddress(address.trim());
}

export function validateMonadPrivateKey(privateKey: string): boolean {
  try {
    importMonadPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

export function importMonadPrivateKey(privateKey: string): ImportedMonadPrivateKeyAccount {
  const normalizedPrivateKey = normalizeHexPrivateKey(privateKey);
  const account = privateKeyToAccount(normalizedPrivateKey);
  return {
    secretKey: normalizedPrivateKey,
    derivationPath: 'imported-private-key',
    address: account.address
  };
}

export function resolveMonadVaultSecret(secret: VaultSecret) {
  if (secret.kind === 'mnemonic') {
    return mnemonicToAccount(secret.mnemonic, {
      path: MONAD_DERIVATION_PATH
    });
  }

  if (secret.kind === 'private-key') {
    return privateKeyToAccount(normalizeHexPrivateKey(secret.secretKey));
  }

  throw new Error('Auth tokens cannot be used as Monad software signers.');
}

export function getMonadRpcUrl(network: MonadNetwork, customRpcUrl?: string | null): string {
  const trimmed = customRpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }

  return network === 'testnet' ? MONAD_TESTNET_RPC_URL : MONAD_MAINNET_RPC_URL;
}

export function createMonadPublicClient(network: MonadNetwork, customRpcUrl?: string | null) {
  return createPublicClient({
    chain: network === 'testnet' ? MONAD_TESTNET_CHAIN : MONAD_MAINNET_CHAIN,
    transport: http(getMonadRpcUrl(network, customRpcUrl))
  });
}

export async function getMonadHoldings(
  client: ReturnType<typeof createMonadPublicClient>,
  owner: string
): Promise<{
  totalWei: bigint;
  formatted: string;
}> {
  const totalWei = await client.getBalance({
    address: owner as Address
  });

  return {
    totalWei,
    formatted: formatEther(totalWei)
  };
}

export async function getMonadTokenPreview(
  client: ReturnType<typeof createMonadPublicClient>,
  owner: string,
  tokenAddress: string
): Promise<MonadTokenPreview> {
  const address = tokenAddress.trim();
  if (!isAddress(address)) {
    throw new Error('Token contract address is invalid.');
  }

  const [decimals, symbolResult, nameResult, rawAmount] = await Promise.all([
    client.readContract({
      address: address as Address,
      abi: ERC20_ABI,
      functionName: 'decimals'
    }),
    client
      .readContract({
        address: address as Address,
        abi: ERC20_ABI,
        functionName: 'symbol'
      })
      .catch(() => 'TOKEN'),
    client
      .readContract({
        address: address as Address,
        abi: ERC20_ABI,
        functionName: 'name'
      })
      .catch(() => 'Custom token'),
    client.readContract({
      address: address as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner as Address]
    })
  ]);

  return {
    tokenAddress: address,
    decimals,
    symbol: symbolResult,
    name: nameResult,
    rawAmount: rawAmount.toString(),
    amount: formatUnits(rawAmount, decimals)
  };
}

export async function sendMonad(
  network: MonadNetwork,
  secret: VaultSecret,
  input: { recipient: string; amountEther: string; customRpcUrl?: string | null }
): Promise<Hex> {
  const account = resolveMonadVaultSecret(secret);
  const walletClient = createWalletClient({
    account,
    chain: network === 'testnet' ? MONAD_TESTNET_CHAIN : MONAD_MAINNET_CHAIN,
    transport: http(getMonadRpcUrl(network, input.customRpcUrl))
  });

  return walletClient.sendTransaction({
    account,
    chain: network === 'testnet' ? MONAD_TESTNET_CHAIN : MONAD_MAINNET_CHAIN,
    to: input.recipient as Address,
    value: parseEther(input.amountEther)
  });
}

export async function sendMonadToken(
  network: MonadNetwork,
  secret: VaultSecret,
  input: {
    recipient: string;
    amount: string;
    tokenAddress: string;
    decimals: number;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  const account = resolveMonadVaultSecret(secret);
  const chain = network === 'testnet' ? MONAD_TESTNET_CHAIN : MONAD_MAINNET_CHAIN;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getMonadRpcUrl(network, input.customRpcUrl))
  });

  return walletClient.writeContract({
    account,
    chain,
    address: input.tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [input.recipient as Address, parseUnits(input.amount, input.decimals)]
  });
}

export async function sendMonadTransactionRequest(
  network: MonadNetwork,
  secret: VaultSecret,
  input: {
    to: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  if (!isAddress(input.to.trim())) {
    throw new Error('Bridge transaction target is invalid.');
  }

  const account = resolveMonadVaultSecret(secret);
  const chain = network === 'testnet' ? MONAD_TESTNET_CHAIN : MONAD_MAINNET_CHAIN;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getMonadRpcUrl(network, input.customRpcUrl))
  });

  const transactionRequest = {
    account,
    chain,
    to: input.to.trim() as Address,
    data: input.data?.trim() ? (input.data.trim() as Hex) : undefined,
    value: normalizeBigIntValue(input.value),
    gas: normalizeBigIntValue(input.gas),
    nonce: normalizeNumberValue(input.nonce)
  } as {
    account: typeof account;
    chain: typeof chain;
    to: Address;
    data?: Hex;
    value?: bigint;
    gas?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  };

  const gasPrice = normalizeBigIntValue(input.gasPrice);
  const maxFeePerGas = normalizeBigIntValue(input.maxFeePerGas);
  const maxPriorityFeePerGas = normalizeBigIntValue(input.maxPriorityFeePerGas);
  if (gasPrice !== undefined) {
    transactionRequest.gasPrice = gasPrice;
  }
  if (maxFeePerGas !== undefined) {
    transactionRequest.maxFeePerGas = maxFeePerGas;
  }
  if (maxPriorityFeePerGas !== undefined) {
    transactionRequest.maxPriorityFeePerGas = maxPriorityFeePerGas;
  }

  return walletClient.sendTransaction(transactionRequest as never);
}

function normalizeHexPrivateKey(privateKey: string): Hex {
  const normalized = privateKey.trim();
  const withPrefix = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error('Monad private key must be a 32-byte hex string.');
  }
  return withPrefix.toLowerCase() as Hex;
}

function normalizeBigIntValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return BigInt(trimmed);
}

function normalizeNumberValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return Number(BigInt(trimmed));
}

export * from './provider';
