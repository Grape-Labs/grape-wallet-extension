import './ledger-polyfills';
import Eth from '@ledgerhq/hw-app-eth';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import { Buffer } from 'buffer';
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits,
  serializeTransaction,
  type Address,
  type Hex
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import type { sendEthereumTransactionRequest } from './index';

export const ETHEREUM_LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 12;

export type EthereumLedgerDiscoveredAccount = {
  index: number;
  publicKey: string;
  derivationPath: string;
  balanceWei: bigint;
  balanceLabel: string;
  label: string;
};

export type EthereumLedgerNetwork = 'mainnet' | 'sepolia';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);

export async function requestEthereumLedgerAccounts(input: {
  network: EthereumLedgerNetwork;
  startIndex?: number;
  count?: number;
  customRpcUrl?: string | null;
  promptForPermission?: boolean;
}): Promise<EthereumLedgerDiscoveredAccount[]> {
  ensureLedgerRuntimeGlobals();
  const startIndex = input.startIndex ?? 0;
  const count = input.count ?? ETHEREUM_LEDGER_ACCOUNT_SCAN_BATCH_SIZE;
  const transport = await openEthereumLedgerTransport(input.promptForPermission ?? true);

  try {
    const eth = new Eth(transport);
    const chain = input.network === 'sepolia' ? sepolia : mainnet;
    const client = createPublicClient({
      chain,
      transport: http(resolveEthereumLedgerRpcUrl(input.network, input.customRpcUrl))
    });

    const discovered: EthereumLedgerDiscoveredAccount[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      const index = startIndex + offset;
      const derivationPath = toEthereumLedgerDerivationPath(index);
      const account = await eth.getAddress(derivationPath, false, false, String(chain.id));
      const balanceWei = await client.getBalance({
        address: account.address as Address
      });

      discovered.push({
        index,
        publicKey: account.address,
        derivationPath,
        balanceWei,
        balanceLabel: `${formatEther(balanceWei)} ETH`,
        label: `Ledger account ${index + 1}`
      });
    }

    return discovered.sort((left, right) => {
      if (left.balanceWei === right.balanceWei) {
        return left.index - right.index;
      }
      return left.balanceWei > right.balanceWei ? -1 : 1;
    });
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function authorizeEthereumLedgerTransport(): Promise<void> {
  const transport = await openEthereumLedgerTransport(true);
  await transport.close().catch(() => undefined);
}

export async function sendEthereumWithLedger(
  network: EthereumLedgerNetwork,
  derivationPath: string,
  input: { recipient: string; amountEther: string; customRpcUrl?: string | null }
): Promise<Hex> {
  return sendEthereumLedgerTransaction(network, derivationPath, {
    to: input.recipient,
    value: parseEther(input.amountEther),
    customRpcUrl: input.customRpcUrl
  });
}

export async function sendEthereumTokenWithLedger(
  network: EthereumLedgerNetwork,
  derivationPath: string,
  input: {
    recipient: string;
    amount: string;
    tokenAddress: string;
    decimals: number;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  return sendEthereumLedgerTransaction(network, derivationPath, {
    to: input.tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [input.recipient as Address, parseUnits(input.amount, input.decimals)]
    }),
    customRpcUrl: input.customRpcUrl
  });
}

/** Sign a quoted contract call and any exact-amount token approval on Ledger. */
export async function sendEthereumTransactionRequestWithLedger(
  network: EthereumLedgerNetwork,
  derivationPath: string,
  input: Parameters<typeof sendEthereumTransactionRequest>[2] & { expectedAddress: string }
): Promise<Hex> {
  if (!isAddress(input.to) || !isAddress(input.expectedAddress)) {
    throw new Error('Invalid swap transaction or Ledger account address.');
  }
  const client = createPublicClient({
    chain: network === 'sepolia' ? sepolia : mainnet,
    transport: http(resolveEthereumLedgerRpcUrl(network, input.customRpcUrl))
  });
  const send = (transaction: { to: string; value?: bigint; data?: Hex; gas?: bigint; gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }) =>
    sendEthereumLedgerTransaction(network, derivationPath, {
      ...transaction, customRpcUrl: input.customRpcUrl, expectedAddress: input.expectedAddress, clearSign: true
    });
  const confirm = async (hash: Hex, label: string) => {
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${label} reverted (${hash}). Request a new quote before retrying.`);
  };
  if (input.approval) {
    const { tokenAddress, spender, amount } = input.approval;
    if (!isAddress(tokenAddress) || !isAddress(spender) || !/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
      throw new Error('Swap token approval details are invalid. Request a new quote.');
    }
    const allowance = await client.readContract({
      address: tokenAddress as Address, abi: ERC20_ABI, functionName: 'allowance',
      args: [input.expectedAddress as Address, spender as Address]
    });
    const approve = async (value: bigint) => {
      const hash = await send({ to: tokenAddress, data: encodeFunctionData({
        abi: ERC20_ABI, functionName: 'approve', args: [spender as Address, value]
      }) });
      await confirm(hash, 'Token approval');
    };
    if (allowance < BigInt(amount)) {
      if (allowance > 0n) await approve(0n);
      await approve(BigInt(amount));
    }
  }
  const hash = await send({
    to: input.to, data: input.data as Hex | undefined,
    value: input.value ? BigInt(input.value) : 0n,
    gas: input.gas ? BigInt(input.gas) : undefined,
    gasPrice: input.gasPrice ? BigInt(input.gasPrice) : undefined,
    maxFeePerGas: input.maxFeePerGas ? BigInt(input.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: input.maxPriorityFeePerGas ? BigInt(input.maxPriorityFeePerGas) : undefined
  });
  if (input.waitForReceipt) await confirm(hash, 'Swap transaction');
  return hash;
}

function resolveEthereumLedgerRpcUrl(network: EthereumLedgerNetwork, customRpcUrl?: string | null) {
  const trimmed = customRpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }

  return network === 'sepolia' ? 'https://ethereum-sepolia-rpc.publicnode.com' : 'https://ethereum-rpc.publicnode.com';
}

function toEthereumLedgerDerivationPath(index: number) {
  return `44'/60'/0'/0/${index}`;
}

async function sendEthereumLedgerTransaction(
  network: EthereumLedgerNetwork,
  derivationPath: string,
  input: {
    to: string;
    value?: bigint;
    data?: Hex;
    gas?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    expectedAddress?: string;
    clearSign?: boolean;
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  ensureLedgerRuntimeGlobals();
  const transport = await openEthereumLedgerTransport(false);

  try {
    const chain = network === 'sepolia' ? sepolia : mainnet;
    const client = createPublicClient({
      chain,
      transport: http(resolveEthereumLedgerRpcUrl(network, input.customRpcUrl))
    });
    const eth = new Eth(transport);
    const account = await eth.getAddress(derivationPath, false, false, String(chain.id));
    if (input.expectedAddress && account.address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
      throw new Error('The connected Ledger account does not match the selected wallet.');
    }
    const request = await client.prepareTransactionRequest({
      account: account.address as Address,
      to: input.to as Address,
      value: input.value ?? 0n,
      data: input.data,
      gas: input.gas,
      ...(input.gasPrice !== undefined
        ? { type: 'legacy' as const, gasPrice: input.gasPrice }
        : { type: 'eip1559' as const, maxFeePerGas: input.maxFeePerGas, maxPriorityFeePerGas: input.maxPriorityFeePerGas })
    });
    const serializableRequest = { ...request };
    delete (serializableRequest as { chain?: unknown }).chain;
    const unsigned = serializeTransaction(serializableRequest as never);
    const signature = input.clearSign
      ? await eth.clearSignTransaction(derivationPath, stripHexPrefix(unsigned), { erc20: true, externalPlugins: true, nft: false })
      : await eth.signTransaction(derivationPath, stripHexPrefix(unsigned), null);
    const serialized = serializeTransaction(serializableRequest as never, {
      r: ensureHex(signature.r),
      s: ensureHex(signature.s),
      v: BigInt(ensureHex(signature.v))
    });

    return client.sendRawTransaction({
      serializedTransaction: serialized
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode;
    if (input.clearSign && statusCode === 0x6985) throw new Error('Swap signing was rejected on Ledger. No further transaction was submitted.');
    if (input.clearSign && statusCode === 0x6a80) throw new Error('Ledger could not sign this contract call. Open the Ethereum app and check its contract signing settings.');
    throw error;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

function ensureLedgerRuntimeGlobals() {
  if (typeof globalThis.Buffer === 'undefined') {
    (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.Buffer === 'undefined') {
    (globalThis.window as Window & typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
}

function stripHexPrefix(value: Hex) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function ensureHex(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

async function openEthereumLedgerTransport(promptForPermission: boolean) {
  ensureLedgerRuntimeGlobals();
  if (promptForPermission) {
    return TransportWebHID.request();
  }

  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new Error('Ledger device not found. Connect it and authorize Grape first.');
  }

  return transport;
}
