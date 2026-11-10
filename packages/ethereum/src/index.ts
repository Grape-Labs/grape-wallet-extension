import type { VaultSecret } from '@grape/core';
import {
  createPublicClient,
  encodeFunctionData,
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
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
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
  input: { recipient: string; amountEther: string; gas?: bigint; gasPrice?: bigint; customRpcUrl?: string | null }
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
    gas: input.gas, gasPrice: input.gasPrice,
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
    gas?: bigint; gasPrice?: bigint; customRpcUrl?: string | null;
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
    gas: input.gas, gasPrice: input.gasPrice,
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
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
    waitForReceipt?: boolean;
    approval?: { tokenAddress: string; spender: string; amount: string };
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

  if (input.approval) {
    const { tokenAddress, spender, amount } = input.approval;
    if (!isAddress(tokenAddress) || !isAddress(spender) || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      throw new Error('Swap token approval details are invalid. Request a new quote.');
    }
    const publicClient = createEthereumPublicClient(network, input.customRpcUrl);
    const allowance = await publicClient.readContract({
      address: tokenAddress as Address, abi: ERC20_ABI, functionName: 'allowance',
      args: [account.address, spender as Address]
    });
    const approve = async (value: bigint) => {
      const hash = await walletClient.writeContract({
        account, chain, address: tokenAddress as Address, abi: ERC20_ABI,
        functionName: 'approve', args: [spender as Address, value]
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Token approval failed. The swap was not submitted.');
    };
    if (allowance < BigInt(amount)) {
      if (allowance > 0n) await approve(0n);
      await approve(BigInt(amount));
    }
  }

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

  const hash = await walletClient.sendTransaction(transactionRequest as never);
  if (input.waitForReceipt) {
    const receipt = await createEthereumPublicClient(network, input.customRpcUrl).waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`Swap transaction reverted (${hash}). Refresh the quote before trying again.`);
    }
  }
  return hash;
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

function normalizeNumberValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return Number(BigInt(trimmed));
}

/** Read-only transfer estimate. Uses integer units and reserves a bounded gas budget. */
export async function estimateEvmTransfer(client: ReturnType<typeof createEthereumPublicClient>, input: {
  sender: string; recipient: string; amount: string; tokenAddress?: string; decimals: number; maximum?: boolean; chargeGasLimit?: boolean;
}) {
  if (!isAddress(input.sender) || !isAddress(input.recipient)) throw new Error('Enter a valid recipient address.');
  if (!input.maximum && (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input.amount) || (input.amount.split('.')[1]?.length ?? 0) > input.decimals)) throw new Error('Amount has invalid precision.');
  const account = input.sender as Address;
  const recipient = input.recipient as Address;
  const token = input.tokenAddress as Address | undefined;
  const [balance, gasPrice, tokenBalance] = await Promise.all([
    client.getBalance({ address: account, blockTag: 'pending' }), client.getGasPrice(),
    token ? client.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }) : Promise.resolve(0n)
  ]);
  let amount = input.maximum ? (token ? tokenBalance : 1n) : parseUnits(input.amount, input.decimals);
  const request = () => ({ account, to: token ?? recipient, value: token ? 0n : amount,
    data: token ? encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [recipient, amount] }) : undefined });
  if (gasPrice <= 0n) throw new Error('Network fee unavailable. Try again.');
  const price = gasPrice;
  let estimatedGas = await client.estimateGas(request());
  let gas = (estimatedGas * 120n + 99n) / 100n;
  if (input.maximum && !token) {
    amount = balance - gas * price;
    if (amount <= 0n) throw new Error('Insufficient balance after network fees.');
    estimatedGas = await client.estimateGas(request());
    gas = (estimatedGas * 120n + 99n) / 100n;
    amount = balance - gas * price;
    if (amount <= 0n || await client.estimateGas(request()) > gas) throw new Error('Gas estimate changed. Try Max again.');
  }
  if (gas <= 0n || amount <= 0n || balance < (token ? 0n : amount) + gas * price || (token && tokenBalance < amount)) throw new Error('Insufficient balance for amount and network fees.');
  return { amount: formatUnits(amount, input.decimals), fee: formatEther((input.chargeGasLimit ? gas : estimatedGas) * price), reserve: formatEther(gas * price), gas, gasPrice: price };
}

/** Estimate an executable route, including native value beyond its quoted input. */
export async function estimateEvmRoute(client: ReturnType<typeof createEthereumPublicClient>, input: {
  sender: string; to: string; data?: string; value?: string; nativeAmountRaw: bigint; chargeGasLimit?: boolean;
}) {
  if (!isAddress(input.sender) || !isAddress(input.to)) throw new Error('Invalid route address.');
  const value = BigInt(input.value || '0');
  if (value < 0n || input.nativeAmountRaw < 0n) throw new Error('Invalid route amount.');
  const [balance, gasPrice, estimatedGas] = await Promise.all([
    client.getBalance({ address: input.sender as Address, blockTag: 'pending' }), client.getGasPrice(),
    client.estimateGas({ account: input.sender as Address, to: input.to as Address, data: input.data as Hex | undefined, value })
  ]);
  if (gasPrice <= 0n || estimatedGas <= 0n) throw new Error('Network fee unavailable.');
  const gas = (estimatedGas * 120n + 99n) / 100n;
  if (balance < value + gas * gasPrice) throw new Error('Insufficient native balance for route and network fees.');
  const extraValue = value > input.nativeAmountRaw ? value - input.nativeAmountRaw : 0n;
  return { gas, gasPrice, feeWei: (input.chargeGasLimit ? gas : estimatedGas) * gasPrice, reserveWei: gas * gasPrice + extraValue };
}
