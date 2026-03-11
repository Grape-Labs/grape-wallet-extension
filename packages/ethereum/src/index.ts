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
import { mainnet, sepolia } from 'viem/chains';

export const ETHEREUM_DERIVATION_PATH = `m/44'/60'/0'/0/0`;
export const DEFAULT_ETHEREUM_NETWORK = 'mainnet';
export const DEFAULT_ETHEREUM_MAINNET_RPC_URL = 'https://ethereum-rpc.publicnode.com';
export const DEFAULT_ETHEREUM_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

export type EthereumNetwork = 'mainnet' | 'sepolia';
export type EthereumTokenPreview = {
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

export type DerivedEthereumAccount = {
  mnemonic: string;
  derivationPath: string;
  address: string;
};

export type ImportedEthereumPrivateKeyAccount = {
  secretKey: string;
  derivationPath: 'imported-private-key';
  address: string;
};

export function deriveEthereumAccount0(mnemonic: string): DerivedEthereumAccount {
  const account = mnemonicToAccount(mnemonic, {
    path: ETHEREUM_DERIVATION_PATH
  });
  return {
    mnemonic,
    derivationPath: ETHEREUM_DERIVATION_PATH,
    address: account.address
  };
}

export function validateEthereumAddress(address: string): boolean {
  return isAddress(address.trim());
}

export function validateEthereumPrivateKey(privateKey: string): boolean {
  try {
    importEthereumPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

export function importEthereumPrivateKey(privateKey: string): ImportedEthereumPrivateKeyAccount {
  const normalizedPrivateKey = normalizeHexPrivateKey(privateKey);
  const account = privateKeyToAccount(normalizedPrivateKey);
  return {
    secretKey: normalizedPrivateKey,
    derivationPath: 'imported-private-key',
    address: account.address
  };
}

export function resolveEthereumVaultSecret(secret: VaultSecret) {
  if (secret.kind === 'mnemonic') {
    return mnemonicToAccount(secret.mnemonic, {
      path: ETHEREUM_DERIVATION_PATH
    });
  }

  if (secret.kind === 'private-key') {
    return privateKeyToAccount(normalizeHexPrivateKey(secret.secretKey));
  }

  throw new Error('Auth tokens cannot be used as Ethereum software signers.');
}

export function getEthereumRpcUrl(network: EthereumNetwork, customRpcUrl?: string | null): string {
  const trimmed = customRpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }

  return network === 'sepolia' ? DEFAULT_ETHEREUM_SEPOLIA_RPC_URL : DEFAULT_ETHEREUM_MAINNET_RPC_URL;
}

export function createEthereumPublicClient(network: EthereumNetwork, customRpcUrl?: string | null) {
  return createPublicClient({
    chain: network === 'sepolia' ? sepolia : mainnet,
    transport: http(getEthereumRpcUrl(network, customRpcUrl))
  });
}

export async function getEthereumHoldings(
  client: ReturnType<typeof createEthereumPublicClient>,
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

export async function getEthereumTokenPreview(
  client: ReturnType<typeof createEthereumPublicClient>,
  owner: string,
  tokenAddress: string
): Promise<EthereumTokenPreview> {
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

export async function sendEthereum(
  network: EthereumNetwork,
  secret: VaultSecret,
  input: { recipient: string; amountEther: string; customRpcUrl?: string | null }
): Promise<Hex> {
  const account = resolveEthereumVaultSecret(secret);
  const chain = network === 'sepolia' ? sepolia : mainnet;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getEthereumRpcUrl(network, input.customRpcUrl))
  });

  return walletClient.sendTransaction({
    account,
    chain,
    to: input.recipient as Address,
    value: parseEther(input.amountEther)
  });
}

export async function sendEthereumToken(
  network: EthereumNetwork,
  secret: VaultSecret,
  input: {
    recipient: string;
    amount: string;
    tokenAddress: string;
    decimals: number;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  const account = resolveEthereumVaultSecret(secret);
  const chain = network === 'sepolia' ? sepolia : mainnet;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getEthereumRpcUrl(network, input.customRpcUrl))
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

export async function sendEthereumTransactionRequest(
  network: EthereumNetwork,
  secret: VaultSecret,
  input: {
    to: string;
    data?: string;
    value?: string;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  if (!isAddress(input.to.trim())) {
    throw new Error('Bridge transaction target is invalid.');
  }

  const account = resolveEthereumVaultSecret(secret);
  const chain = network === 'sepolia' ? sepolia : mainnet;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getEthereumRpcUrl(network, input.customRpcUrl))
  });

  return walletClient.sendTransaction({
    account,
    chain,
    to: input.to.trim() as Address,
    data: input.data?.trim() ? (input.data.trim() as Hex) : undefined,
    value: normalizeBigIntValue(input.value)
  });
}

function normalizeHexPrivateKey(privateKey: string): Hex {
  const normalized = privateKey.trim();
  const withPrefix = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error('Ethereum private key must be a 32-byte hex string.');
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
