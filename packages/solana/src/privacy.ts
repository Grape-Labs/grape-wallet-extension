import './runtime-polyfills';
import { base64ToBytes, bytesToBase64 } from '@grape/core';
import {
  address, createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey,
  getTransactionEncoder, getTransactionDecoder, getCompiledTransactionMessageDecoder,
  getBase64EncodedWireTransaction, getSignatureFromTransaction, signTransaction,
  type TransactionMessageBytesBase64,
} from '@solana/kit';
import {
  createSprClient, ShieldedKeypair, SigningKey, Wallet, LocalKeys, SOL_MINT,
  buildRegistrationTransaction, buildDepositTransaction, buildTransferTransaction,
  buildWithdrawalTransaction, getPrivateTokenBalances, syncWallet,
} from '@heliuslabs/spr';
import { bytes32 } from '@heliuslabs/spr/keypair';
import { SignedTeePolicy } from '@heliuslabs/spr/client';
import { fetchUserRecord, resolveRegisteredAddress, validateRegisteredKeypair } from '@heliuslabs/spr/wallet';
import { privacyReadFetch } from './privacyRpc';
export { initializePoseidon as initializePrivacyRuntime } from '@heliuslabs/spr/wallet';
export { privacyRateLimitMessage } from './privacyRpc';

export type PrivacyAction = 'register' | 'deposit' | 'transfer' | 'withdraw';
export type PrivacyNetwork = 'devnet' | 'mainnet-beta';
export type PrivacyBalance = { mint: string; amount: string };
export type PrivacySnapshot = { registered: boolean; balances: PrivacyBalance[] };

export function privacyTransactionIdentity(wire: string) {
  const transaction = getTransactionDecoder().decode(base64ToBytes(wire));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  return { owner: message.staticAccounts[0], blockhash: message.lifetimeToken, version: message.version };
}

/** Privacy SDK transactions use the v1 wire format, not web3.js's legacy/v0 codec. */
export async function inspectPrivacyTransaction(endpoint: string, wire: string, owner: string) {
  const transaction = getTransactionDecoder().decode(base64ToBytes(wire));
  const identity = privacyTransactionIdentity(wire);
  if (identity.owner !== owner) throw new Error('Privacy transaction fee payer does not match the selected account.');
  const rpc = (await createSprClient({ solanaRpcUrl: endpoint, fetch: privacyReadFetch,
    proverTee: SignedTeePolicy.forNetwork(new URL(endpoint).hostname === 'devnet.helius-rpc.com' ? 'devnet' : 'mainnet'),
  })).solanaRpc;
  const before = await rpc.getBalance(address(owner), { commitment: 'confirmed' }).send();
  const simulation = await rpc.simulateTransaction(getBase64EncodedWireTransaction(transaction), {
    encoding: 'base64', sigVerify: false, commitment: 'confirmed',
    accounts: { encoding: 'base64', addresses: [address(owner)] },
  }).send();
  if (simulation.value.err) throw new Error('Privacy transaction simulation failed. Check your balance and review again.');
  const fee = await rpc.getFeeForMessage(bytesToBase64(new Uint8Array(transaction.messageBytes)) as TransactionMessageBytesBase64, { commitment: 'confirmed' }).send();
  const after = simulation.value.accounts?.[0]?.lamports;
  if (fee.value === null || after === undefined) throw new Error('Unable to estimate transaction costs. Review again.');
  const debitLamports = Number(before.value > after ? before.value - after : 0n);
  const feeLamports = Number(fee.value);
  if (!Number.isSafeInteger(debitLamports) || !Number.isSafeInteger(feeLamports)) throw new Error('Transaction costs exceed the supported review range.');
  return { blockhash: identity.blockhash, debitLamports, feeLamports };
}

export async function signPrivacyTransaction(wire: string, seed: Uint8Array, owner: string) {
  if (privacyTransactionIdentity(wire).owner !== owner) throw new Error('Privacy transaction belongs to another account.');
  const signer = await createKeyPairFromPrivateKeyBytes(seed);
  if (await getAddressFromPublicKey(signer.publicKey) !== owner) throw new Error('Privacy signer does not match the selected account.');
  const signed = await signTransaction([signer], getTransactionDecoder().decode(base64ToBytes(wire)));
  return { transaction: getBase64EncodedWireTransaction(signed), signature: getSignatureFromTransaction(signed) };
}

/** Accept only Helius gateway URLs; never send privacy queries to arbitrary hosts. */
export function privacyRpcUrl(endpoint: string, network: 'devnet' | 'mainnet-beta'): string {
  const url = new URL(endpoint);
  const host = network === 'devnet' ? 'devnet.helius-rpc.com' : 'mainnet.helius-rpc.com';
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) {
    throw new Error('Use a Helius HTTPS endpoint for the selected network.');
  }
  const key = url.searchParams.get('api-key');
  if (!key) throw new Error('The Helius endpoint needs an API key.');
  const rpc = new URL(`https://${host}/`);
  rpc.searchParams.set('api-key', key);
  return rpc.toString();
}

export function privacySolAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value)) throw new Error('Enter a positive SOL amount with at most 9 decimals.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (amount <= 0n || amount > 18_446_744_073_709_551_615n) throw new Error('SOL amount is outside the supported range.');
  return amount;
}

/** Keys and decrypted wallet state live only for this operation, in the background. */
export async function withPrivacyWallet<T>(input: {
  endpoint: string;
  network: 'devnet' | 'mainnet-beta';
  seed: Uint8Array;
  owner: string;
}, use: (session: {
  client: Awaited<ReturnType<typeof createSprClient>>;
  keypair: ShieldedKeypair;
  wallet: Wallet;
  keys: LocalKeys;
}) => Promise<T>): Promise<T> {
  const client = await createSprClient({
    solanaRpcUrl: privacyRpcUrl(input.endpoint, input.network),
    fetch: privacyReadFetch,
    proverTee: SignedTeePolicy.forNetwork(input.network === 'devnet' ? 'devnet' : 'mainnet'),
  });
  const signing = SigningKey.fromEd25519Bytes(bytes32(input.seed));
  let keypair: ShieldedKeypair | undefined;
  let keys: LocalKeys | undefined;
  try {
    keypair = ShieldedKeypair.fromKeypair(signing);
    if (keypair.shieldedAddress().solanaAddress() !== input.owner) throw new Error('Privacy signer does not match the selected account.');
    keys = LocalKeys.fromKeypair(keypair, client.proofService);
    return await use({ client, keypair, keys, wallet: new Wallet({ identity: keypair.shieldedAddress() }) });
  } finally {
    keys?.destroy();
    if (keypair) keypair.destroy();
    else signing.destroy();
  }
}

export async function readPrivacyWallet(input: Parameters<typeof withPrivacyWallet>[0]): Promise<PrivacySnapshot> {
  return withPrivacyWallet(input, async ({ client, keypair, wallet, keys }) => {
    const owner = address(input.owner);
    const registered = !!await fetchUserRecord({ rpc: client, owner });
    if (!registered) return { registered: false, balances: [] };
    // Never show a misleading zero balance when another wallet registered different keys.
    await validateRegisteredKeypair({ rpc: client, owner, keypair });
    const report = await syncWallet({ client, wallet, keys });
    if (report.unparsedTransactions || report.unknownAssetIds.length || report.unknownAssetFields.length) throw new Error('Private balance sync is incomplete. Do not spend until sync succeeds.');
    return { registered, balances: getPrivateTokenBalances(wallet).map(balance => ({ mint: balance.mint, amount: balance.amount.toString() })) };
  });
}

/** Builds unsigned transactions for the selected network. Signing requires a separate review. */
export async function preparePrivacyTransaction(input: Parameters<typeof withPrivacyWallet>[0] & {
  action: PrivacyAction;
  amount?: string;
  recipient?: string;
}): Promise<string> {
  return withPrivacyWallet(input, async ({ client, keypair, wallet, keys }) => {
    const owner = address(input.owner);
    const identity = keypair.shieldedAddress();
    if (input.action === 'register') {
      const transaction = await buildRegistrationTransaction({ client, owner, address: identity });
      if (!transaction) throw new Error('This account already has a private wallet.');
      return bytesToBase64(new Uint8Array(getTransactionEncoder().encode(transaction)));
    }
    await validateRegisteredKeypair({ rpc: client, owner, keypair });
    const amount = privacySolAmount(input.amount ?? '');
    if (input.action === 'deposit') {
      // Check the exit path before accepting deposits: an incompatible prover must
      // fail before public funds move into a balance this SDK cannot spend.
      await client.checkProverProvingKeys();
      const transaction = await buildDepositTransaction({ client, feePayer: owner, recipient: identity, asset: SOL_MINT, amount });
      return bytesToBase64(new Uint8Array(getTransactionEncoder().encode(transaction)));
    }
    const recipient = address(input.recipient ?? '');
    // Fail closed: a private send must never silently become a public withdrawal.
    const destination = input.action === 'transfer' ? await resolveRegisteredAddress({ rpc: client, owner: recipient }) : undefined;
    if (input.action === 'transfer' && !destination) throw new Error('Recipient has no private wallet. Use Withdraw to send publicly.');
    const report = await syncWallet({ client, wallet, keys });
    if (report.unparsedTransactions || report.unknownAssetIds.length || report.unknownAssetFields.length) throw new Error('Private balance sync is incomplete. Do not spend until sync succeeds.');
    if (wallet.balance(SOL_MINT).amount < amount) throw new Error('Insufficient private SOL balance.');
    const params = { client, wallet, keys, feePayer: owner, asset: SOL_MINT, amount };
    const transaction = input.action === 'transfer'
      ? await buildTransferTransaction({ ...params, recipient: destination!.address })
      : await buildWithdrawalTransaction({ ...params, recipient });
    return bytesToBase64(new Uint8Array(getTransactionEncoder().encode(transaction)));
  });
}
