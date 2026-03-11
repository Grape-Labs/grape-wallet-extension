import './ledger-polyfills';
import Eth from '@ledgerhq/hw-app-eth';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import { Buffer } from 'buffer';
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  serializeTransaction,
  type Address,
  type Hex
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';

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

const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

export async function requestEthereumLedgerAccounts(input: {
  network: EthereumLedgerNetwork;
  startIndex?: number;
  count?: number;
  customRpcUrl?: string | null;
}): Promise<EthereumLedgerDiscoveredAccount[]> {
  ensureLedgerRuntimeGlobals();
  const startIndex = input.startIndex ?? 0;
  const count = input.count ?? ETHEREUM_LEDGER_ACCOUNT_SCAN_BATCH_SIZE;
  const transport = await TransportWebHID.request();

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
    customRpcUrl?: string | null;
  }
): Promise<Hex> {
  ensureLedgerRuntimeGlobals();
  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new Error('Ledger device not found. Connect it and authorize Grape first.');
  }

  try {
    const chain = network === 'sepolia' ? sepolia : mainnet;
    const client = createPublicClient({
      chain,
      transport: http(resolveEthereumLedgerRpcUrl(network, input.customRpcUrl))
    });
    const eth = new Eth(transport);
    const account = await eth.getAddress(derivationPath, false, false, String(chain.id));
    const request = await client.prepareTransactionRequest({
      account: account.address as Address,
      to: input.to as Address,
      value: input.value ?? 0n,
      data: input.data
    });
    const serializableRequest = { ...request };
    delete (serializableRequest as { chain?: unknown }).chain;
    const unsigned = serializeTransaction(serializableRequest as never);
    const signature = await eth.signTransaction(derivationPath, stripHexPrefix(unsigned), null);
    const serialized = serializeTransaction(serializableRequest as never, {
      r: ensureHex(signature.r),
      s: ensureHex(signature.s),
      v: BigInt(ensureHex(signature.v))
    });

    return client.sendRawTransaction({
      serializedTransaction: serialized
    });
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
