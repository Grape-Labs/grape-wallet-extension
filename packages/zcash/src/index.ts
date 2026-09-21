import { Buffer } from 'buffer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import bs58check from 'bs58check';
import bitcoinjsZcash, { type ZcashJsNetwork } from '@exodus/bitcoinjs-lib-zcash';

const { Transaction, address: zcashAddress, script: zcashScript } = bitcoinjsZcash;

export type ZcashNetwork = 'mainnet' | 'testnet';

export const ZCASH_DECIMALS = 8;
export const ZCASH_DERIVATION_PATH = "m/44'/133'/0'/0/0";
export const DEFAULT_ZCASH_INDEXER_URL = 'https://gemnodes.com/zcash';

const MAINNET: ZcashJsNetwork = {
  messagePrefix: '\u0018Zcash Signed Message:\n',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x1cb8,
  scriptHash: 0x1cbd,
  wif: 0x80
};

const TESTNET: ZcashJsNetwork = {
  messagePrefix: '\u0018Zcash Signed Message:\n',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x1d25,
  scriptHash: 0x1cba,
  wif: 0xef
};

const BRANCH_NU5 = 0xc2d6d0b4;
const BRANCH_NU6 = 0xc8e71055;
const BRANCH_NU6_1 = 0x4dec4df0;
const BRANCH_NU6_2 = 0x5437f330;
const BRANCH_NU6_3 = 0x37a5165b;
const ACTIVATION_NU6 = 2_726_400;
const ACTIVATION_NU6_1 = 3_146_400;
const ACTIVATION_NU6_2 = 3_364_600;
const ACTIVATION_NU6_3 = 3_428_143;
const TESTNET_ACTIVATION_NU6 = 2_976_000;
const TESTNET_ACTIVATION_NU6_1 = 3_536_500;
const TESTNET_ACTIVATION_NU6_2 = 4_052_000;
const TESTNET_ACTIVATION_NU6_3 = 4_134_000;
const ZIP_317_MIN_FEE_ZAT = 10_000;
const ZIP_317_MARGINAL_FEE_ZAT = 5_000;
const DUST_ZAT = 1_000;

export type ZcashAccount = {
  address: string;
  publicKey: string;
  privateKey: string;
  derivationPath: string;
};

export type ZcashUtxo = {
  txid: string;
  outputIndex: number;
  valueZat: number;
  scriptHex: string;
  height: number | null;
};

export type ZcashAddressSnapshot = {
  confirmedBalanceZat: number;
  unconfirmedBalanceZat: number;
  utxos: ZcashUtxo[];
  chainTipHeight: number | null;
  stale: boolean;
};

export type ZcashActivity = {
  txid: string;
  height: number | null;
  timestamp: number | null;
  valueZat: number | null;
  direction: 'sent' | 'received' | 'self' | 'unknown';
  confirmations: number | null;
};

function getNetwork(network: ZcashNetwork): ZcashJsNetwork {
  return network === 'testnet' ? TESTNET : MAINNET;
}

function hash160(input: Uint8Array): Uint8Array {
  return ripemd160(sha256(input));
}

function normalizePrivateKey(input: string, network: ZcashNetwork): Uint8Array {
  const value = input.trim();
  const hex = value.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Uint8Array.from(Buffer.from(hex, 'hex'));
  }

  const decoded = bs58check.decode(value);
  const expectedPrefix = getNetwork(network).wif;
  if (decoded[0] !== expectedPrefix || (decoded.length !== 33 && decoded.length !== 34)) {
    throw new Error('Private key is not a Zcash transparent key for this network.');
  }
  if (decoded.length === 34 && decoded[33] !== 1) {
    throw new Error('Unsupported Zcash private key encoding.');
  }
  return decoded.slice(1, 33);
}

function accountFromPrivateKey(privateKey: Uint8Array, network: ZcashNetwork, derivationPath: string): ZcashAccount {
  if (!secp256k1.utils.isValidPrivateKey(privateKey)) {
    throw new Error('Invalid Zcash private key.');
  }
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const address = zcashAddress.toBase58Check(Buffer.from(hash160(publicKey)), getNetwork(network).pubKeyHash);
  return {
    address,
    publicKey: Buffer.from(publicKey).toString('hex'),
    privateKey: Buffer.from(privateKey).toString('hex'),
    derivationPath
  };
}

export function deriveZcashAccount(
  mnemonic: string,
  network: ZcashNetwork = 'mainnet',
  derivationPath = ZCASH_DERIVATION_PATH
): ZcashAccount {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic.trim().normalize('NFKD')));
  const child = root.derive(derivationPath);
  if (!child.privateKey) {
    throw new Error('Could not derive the Zcash account.');
  }
  return accountFromPrivateKey(child.privateKey, network, derivationPath);
}

export function importZcashPrivateKey(privateKey: string, network: ZcashNetwork = 'mainnet'): ZcashAccount {
  return accountFromPrivateKey(normalizePrivateKey(privateKey, network), network, 'imported');
}

export function isValidZcashTransparentAddress(value: string, network: ZcashNetwork = 'mainnet'): boolean {
  try {
    const parsed = zcashAddress.fromBase58Check(value.trim());
    const selected = getNetwork(network);
    return parsed.version === selected.pubKeyHash || parsed.version === selected.scriptHash;
  } catch {
    return false;
  }
}

export function parseZecAmount(amount: string): number {
  const normalized = amount.trim();
  if (!/^(?:\d+)(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error('Enter a valid ZEC amount with no more than 8 decimal places.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  const value = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('ZEC amount is outside the supported range.');
  }
  return Number(value);
}

function safeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function signedInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readFirst(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

export class ZcashIndexerClient {
  readonly baseUrl: string;
  readonly network: ZcashNetwork;

  constructor(options: { baseUrl?: string; network?: ZcashNetwork } = {}) {
    this.network = options.network ?? 'mainnet';
    const configuredBaseUrl = options.baseUrl?.trim();
    if (!configuredBaseUrl && this.network === 'testnet') {
      throw new Error('Configure a Zcash testnet Blockbook indexed API before using testnet.');
    }
    this.baseUrl = (configuredBaseUrl || DEFAULT_ZCASH_INDEXER_URL).replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const problem = record(payload);
      const nestedError = record(problem.error);
      throw new Error(String(nestedError.message ?? problem.detail ?? problem.title ?? problem.error ?? `Zcash service failed with ${response.status}.`));
    }
    return payload as T;
  }

  async getAddress(address: string): Promise<ZcashAddressSnapshot> {
    if (!isValidZcashTransparentAddress(address, this.network)) throw new Error('Invalid transparent Zcash address.');
    const [addressPayload, rawUtxos, infoPayload] = await Promise.all([
      this.request<Record<string, unknown>>(`/api/v2/address/${encodeURIComponent(address)}?details=basic`),
      this.request<unknown[]>(`/api/v2/utxo/${encodeURIComponent(address)}`),
      this.request<Record<string, unknown>>('/api/')
    ]);
    const data = record(addressPayload);
    const scriptHex = zcashAddress.toOutputScript(address, getNetwork(this.network)).toString('hex');
    const utxos = (Array.isArray(rawUtxos) ? rawUtxos : []).map((entry): ZcashUtxo | null => {
      const item = record(entry);
      const txid = String(readFirst(item, ['txid', 'transaction_id', 'transactionId']) ?? '').trim();
      const outputIndex = safeInteger(readFirst(item, ['output_index', 'outputIndex', 'vout', 'index']));
      const valueZat = safeInteger(readFirst(item, ['value_zat', 'valueZat', 'satoshis', 'zatoshis', 'value']));
      const height = safeInteger(readFirst(item, ['height', 'block_height', 'blockHeight']));
      if (!/^[0-9a-f]{64}$/i.test(txid) || outputIndex === null || valueZat === null) return null;
      return { txid, outputIndex, valueZat, scriptHex, height };
    }).filter((entry): entry is ZcashUtxo => entry !== null);
    const confirmedBalanceZat = safeInteger(readFirst(data, ['balance', 'confirmedBalanceZat']))
      ?? utxos.reduce((sum, entry) => sum + entry.valueZat, 0);
    const mempoolDelta = signedInteger(readFirst(data, ['unconfirmedBalance', 'mempoolDeltaZat'])) ?? 0;
    const blockbook = record(infoPayload.blockbook);
    return {
      confirmedBalanceZat,
      unconfirmedBalanceZat: Math.max(0, confirmedBalanceZat + mempoolDelta),
      utxos,
      chainTipHeight: safeInteger(readFirst(blockbook, ['bestHeight', 'bestheight'])),
      stale: blockbook.inSync === false || blockbook.initialSync === true
    };
  }

  async getActivity(address: string, limit = 30): Promise<ZcashActivity[]> {
    if (!isValidZcashTransparentAddress(address, this.network)) throw new Error('Invalid transparent Zcash address.');
    const data = await this.request<Record<string, unknown>>(
      `/api/v2/address/${encodeURIComponent(address)}?details=txs&pageSize=${Math.max(1, Math.min(100, limit))}`
    );
    const rows = data.transactions;
    return (Array.isArray(rows) ? rows : []).map((entry): ZcashActivity | null => {
      const item = record(entry);
      const txid = String(readFirst(item, ['txid', 'transaction_id', 'transactionId']) ?? '').trim();
      if (!/^[0-9a-f]{64}$/i.test(txid)) return null;
      const sumOwned = (values: unknown) => (Array.isArray(values) ? values : []).reduce((sum, rawValue) => {
        const value = record(rawValue);
        const addresses = Array.isArray(value.addresses) ? value.addresses.map(String) : [];
        return addresses.includes(address) ? sum + (safeInteger(value.value) ?? 0) : sum;
      }, 0);
      const valueZat = sumOwned(item.vout) - sumOwned(item.vin);
      const direction: ZcashActivity['direction'] = valueZat < 0
        ? 'sent'
        : valueZat > 0
          ? 'received'
          : 'self';
      const unix = safeInteger(readFirst(item, ['blockTime', 'timestamp', 'time']));
      return {
        txid,
        height: safeInteger(readFirst(item, ['height', 'block_height', 'blockHeight'])),
        timestamp: unix === null ? null : unix < 10_000_000_000 ? unix * 1000 : unix,
        valueZat,
        direction,
        confirmations: safeInteger(item.confirmations)
      };
    }).filter((entry): entry is ZcashActivity => entry !== null);
  }

  async broadcast(rawTransactionHex: string): Promise<string> {
    const envelope = await this.request<Record<string, unknown>>('/api/v2/sendtx/', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: rawTransactionHex
    });
    const txid = String(readFirst(envelope, ['result', 'txid']) ?? '').trim();
    if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error('Zcash broadcaster did not return a transaction id.');
    return txid;
  }
}

function branchForHeight(height: number, network: ZcashNetwork): { version: 0x80000005 | 0x80000006; groupId: number; branchId: number } {
  const activations = network === 'testnet'
    ? { nu6: TESTNET_ACTIVATION_NU6, nu6_1: TESTNET_ACTIVATION_NU6_1, nu6_2: TESTNET_ACTIVATION_NU6_2, nu6_3: TESTNET_ACTIVATION_NU6_3 }
    : { nu6: ACTIVATION_NU6, nu6_1: ACTIVATION_NU6_1, nu6_2: ACTIVATION_NU6_2, nu6_3: ACTIVATION_NU6_3 };
  if (height >= activations.nu6_3) return { version: 0x80000006, groupId: Transaction.V6_VERSION_GROUP_ID, branchId: BRANCH_NU6_3 };
  if (height >= activations.nu6_2) return { version: 0x80000005, groupId: Transaction.V5_VERSION_GROUP_ID, branchId: BRANCH_NU6_2 };
  if (height >= activations.nu6_1) return { version: 0x80000005, groupId: Transaction.V5_VERSION_GROUP_ID, branchId: BRANCH_NU6_1 };
  if (height >= activations.nu6) return { version: 0x80000005, groupId: Transaction.V5_VERSION_GROUP_ID, branchId: BRANCH_NU6 };
  return { version: 0x80000005, groupId: Transaction.V5_VERSION_GROUP_ID, branchId: BRANCH_NU5 };
}

function conventionalFee(inputCount: number, outputCount: number): number {
  return Math.max(ZIP_317_MIN_FEE_ZAT, ZIP_317_MARGINAL_FEE_ZAT * Math.max(inputCount, outputCount));
}

function selectUtxos(utxos: ZcashUtxo[], amountZat: number): { selected: ZcashUtxo[]; feeZat: number; changeZat: number } {
  const selected: ZcashUtxo[] = [];
  let total = 0;
  for (const utxo of [...utxos].sort((a, b) => b.valueZat - a.valueZat)) {
    selected.push(utxo);
    total += utxo.valueZat;
    let feeZat = conventionalFee(selected.length, 2);
    let changeZat = total - amountZat - feeZat;
    if (changeZat >= DUST_ZAT) return { selected, feeZat, changeZat };
    feeZat = conventionalFee(selected.length, 1);
    changeZat = total - amountZat - feeZat;
    if (changeZat >= 0 && changeZat < DUST_ZAT) return { selected, feeZat: total - amountZat, changeZat: 0 };
  }
  throw new Error('Insufficient ZEC after the network fee.');
}

export function buildZcashTransparentTransaction(input: {
  account: ZcashAccount;
  recipient: string;
  amountZat: number;
  utxos: ZcashUtxo[];
  chainTipHeight: number;
  network?: ZcashNetwork;
}): { rawTransactionHex: string; txid: string; feeZat: number } {
  const network = input.network ?? 'mainnet';
  if (!isValidZcashTransparentAddress(input.recipient, network)) throw new Error('Recipient must be a transparent Zcash address.');
  if (!Number.isSafeInteger(input.chainTipHeight) || input.chainTipHeight <= 0) throw new Error('A current Zcash chain height is required to sign.');
  const selection = selectUtxos(input.utxos, input.amountZat);
  const consensus = branchForHeight(input.chainTipHeight, network);
  const tx = new Transaction();
  tx.version = consensus.version;
  tx.nVersionGroupId = consensus.groupId;
  tx.consensusBranchId = consensus.branchId;
  tx.expiryHeight = input.chainTipHeight + 40;
  const prevOuts = selection.selected.map((utxo) => ({ script: Buffer.from(utxo.scriptHex, 'hex'), value: utxo.valueZat }));
  selection.selected.forEach((utxo) => tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.outputIndex));
  tx.addOutput(zcashAddress.toOutputScript(input.recipient, getNetwork(network)), input.amountZat);
  if (selection.changeZat > 0) tx.addOutput(zcashAddress.toOutputScript(input.account.address, getNetwork(network)), selection.changeZat);

  const privateKey = Buffer.from(input.account.privateKey, 'hex');
  const publicKey = Buffer.from(input.account.publicKey, 'hex');
  selection.selected.forEach((_utxo, index) => {
    const digest = tx.hashForZcashV5V6(index, prevOuts, Transaction.SIGHASH_ALL);
    const signature = secp256k1.sign(digest, privateKey, { lowS: true, prehash: false });
    const der = Buffer.from(signature.toDERRawBytes());
    tx.setInputScript(index, zcashScript.compile([Buffer.concat([der, Buffer.from([Transaction.SIGHASH_ALL])]), publicKey]));
  });
  return { rawTransactionHex: tx.toHex(), txid: tx.getId(), feeZat: selection.feeZat };
}

export async function sendZcashTransparent(input: {
  client: ZcashIndexerClient;
  account: ZcashAccount;
  recipient: string;
  amount: string;
}): Promise<{ txid: string; feeZat: number }> {
  const snapshot = await input.client.getAddress(input.account.address);
  if (snapshot.chainTipHeight === null) throw new Error('Zcash indexer did not provide a chain height.');
  const built = buildZcashTransparentTransaction({
    account: input.account,
    recipient: input.recipient,
    amountZat: parseZecAmount(input.amount),
    utxos: snapshot.utxos,
    chainTipHeight: snapshot.chainTipHeight,
    network: input.client.network
  });
  const txid = await input.client.broadcast(built.rawTransactionHex);
  return { txid, feeZat: built.feeZat };
}
