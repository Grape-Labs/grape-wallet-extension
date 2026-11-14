import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { requestRouteJson } from './routeRequest';

function validAddress(address: string, label: string): string {
  try { if (bs58.decode(address.trim()).length === 32) return address.trim(); } catch { /* Report the field below. */ }
  throw new Error(`${label} is not a valid Solana address. Refresh the selected account or asset.`);
}

export async function solanaSwapRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await requestRouteJson<{ result?: T; error?: { message?: string } }>(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (response.error || response.result === undefined) throw new Error(response.error?.message || 'Solana balance or fee is unavailable.');
  return response.result;
}

/** Resolve holdings by owner/mint, without requiring cached token-account metadata. */
export async function readSolanaSwapBalance(url: string, walletAddress: string, mint?: string): Promise<bigint> {
  const owner = validAddress(walletAddress, 'Wallet');
  if (mint === undefined) {
    const result = await solanaSwapRpc<{ value: number }>(url, 'getBalance', [owner, { commitment: 'confirmed' }]);
    if (!Number.isSafeInteger(result.value) || result.value < 0) throw new Error('SOL balance is unavailable.');
    return BigInt(result.value);
  }
  const result = await solanaSwapRpc<{ value: Array<{ account: { data: { parsed?: { info?: { state?: string; tokenAmount?: { amount?: string } } } } } }> }>(url, 'getTokenAccountsByOwner', [owner, { mint: validAddress(mint, 'Token mint') }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  if (!Array.isArray(result.value)) throw new Error('Token balance is unavailable.');
  return result.value.reduce((total, entry) => {
    const info = entry.account.data.parsed?.info;
    const amount = info?.tokenAmount?.amount;
    if (!amount || !/^\d+$/.test(amount)) throw new Error('Token balance could not be decoded.');
    return info?.state === 'frozen' ? total : total + BigInt(amount);
  }, 0n);
}

/** Extract the wire message without constructing PublicKey/BN objects on Hermes. */
export function getSolanaWireMessage(serialized: string, walletAddress: string): string {
  const bytes = Buffer.from(serialized, 'base64');
  let offset = 0;
  function shortLength() {
    let length = 0;
    for (let index = 0; index < 3; index++) {
      if (offset >= bytes.length) throw new Error('Route transaction is truncated.');
      const byte = bytes[offset++];
      length |= (byte & 0x7f) << (index * 7);
      if (!(byte & 0x80)) return length;
    }
    throw new Error('Route transaction length is invalid.');
  }
  const signatures = shortLength();
  offset += signatures * 64;
  const messageStart = offset;
  if (offset >= bytes.length) throw new Error('Route transaction is truncated.');
  if (bytes[offset] & 0x80) {
    if (bytes[offset++] !== 0x80) throw new Error('Unsupported route transaction version.');
  }
  const requiredSignatures = bytes[offset];
  offset += 3;
  const accounts = shortLength();
  if (!signatures || signatures !== requiredSignatures || !accounts || offset + accounts * 32 + 32 > bytes.length) throw new Error('Route transaction message is invalid.');
  const payer = bs58.encode(bytes.subarray(offset, offset + 32));
  if (payer !== validAddress(walletAddress, 'Wallet')) throw new Error('Route fee payer does not match this wallet.');
  return bytes.subarray(messageStart).toString('base64');
}
