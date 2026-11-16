import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { bytes32, ed25519DerivationMessage } from '@heliuslabs/spr/keypair';
import { LocalKeys } from '@heliuslabs/spr';
import { privacyRpcUrl, privacySolAmount, preparePrivacyTransaction, withPrivacyWallet, privacyTransactionIdentity, signPrivacyTransaction, inspectPrivacyTransaction } from './privacy';
import { signMessageBytes } from './signing';
import { base64ToBytes } from '@grape/core';
import { getTransactionDecoder } from '@solana/kit';

describe('Privacy Rings configuration and amount boundaries', () => {
  it('normalizes a method endpoint while enforcing network and destination', () => {
    expect(privacyRpcUrl('https://devnet.helius-rpc.com/v1/spr/getUserRecords?api-key=test', 'devnet')).toBe('https://devnet.helius-rpc.com/?api-key=test');
    for (const endpoint of ['https://mainnet.helius-rpc.com/?api-key=test', 'http://devnet.helius-rpc.com/?api-key=test', 'https://devnet.helius-rpc.com.evil.test/?api-key=test', 'https://devnet.helius-rpc.com/']) {
      expect(() => privacyRpcUrl(endpoint, 'devnet')).toThrow();
    }
  });
  it('converts lamports without floating point or silent rounding', () => {
    expect(privacySolAmount('0.000000001')).toBe(1n);
    expect(privacySolAmount('1.123456789')).toBe(1_123_456_789n);
    for (const amount of ['0', '-1', '1e2', '0.0000000001', 'NaN', '18446744074']) expect(() => privacySolAmount(amount)).toThrow();
  });
  it('rejects a devnet endpoint when preparing a mainnet transaction', async () => {
    await expect(preparePrivacyTransaction({ network: 'mainnet-beta', endpoint: 'https://devnet.helius-rpc.com/?api-key=test', owner: '', seed: new Uint8Array(), action: 'deposit', amount: '1' })).rejects.toThrow('selected network');
  });
  it('builds an unsigned mainnet registration against the selected mainnet RPC', async () => {
    const signer = Keypair.fromSeed(new Uint8Array(32).fill(11));
    const requests: string[] = [];
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toContain('https://mainnet.helius-rpc.com/');
      const request = JSON.parse(String(init?.body)) as { id: string; method: string };
      requests.push(request.method);
      const value = request.method === 'getAccountInfo' ? null
        : request.method === 'getBalance' ? 1_000_000_000
        : request.method === 'getFeeForMessage' ? 5000
        : request.method === 'simulateTransaction' ? { err: null, accounts: [{ lamports: 999_995_000, owner: '11111111111111111111111111111111', data: ['', 'base64'], executable: false, rentEpoch: 0, space: 0 }] }
        : { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 500 };
      return Response.json({ jsonrpc: '2.0', id: request.id, result: { context: { slot: 100 }, value } });
    });
    try {
      const wire = await preparePrivacyTransaction({ network: 'mainnet-beta', endpoint: 'https://mainnet.helius-rpc.com/?api-key=test', owner: signer.publicKey.toBase58(), seed: signer.secretKey.slice(0, 32), action: 'register' });
      expect(privacyTransactionIdentity(wire)).toMatchObject({ owner: signer.publicKey.toBase58(), version: 1 });
      const unsigned = getTransactionDecoder().decode(base64ToBytes(wire));
      expect(Object.values(unsigned.signatures).every(signature => signature === null || signature.every(byte => byte === 0))).toBe(true);
      const signed = await signPrivacyTransaction(wire, signer.secretKey.slice(0, 32), signer.publicKey.toBase58());
      const decoded = getTransactionDecoder().decode(base64ToBytes(signed.transaction));
      const signature = Object.values(decoded.signatures)[0];
      expect(signature).not.toBeNull();
      expect(nacl.sign.detached.verify(new Uint8Array(decoded.messageBytes), new Uint8Array(signature!), signer.publicKey.toBytes())).toBe(true);
      const estimate = await inspectPrivacyTransaction('https://mainnet.helius-rpc.com/?api-key=test', wire, signer.publicKey.toBase58());
      expect(estimate).toMatchObject({ debitLamports: 5000, feeLamports: 5000 });
      expect(requests).toContain('getAccountInfo');
      expect(requests).toContain('getLatestBlockhash');
      expect(requests).not.toContain('sendTransaction');
    } finally { fetch.mockRestore(); }
  });
});

describe('Privacy identity recovery and signing isolation', () => {
  const seed = new Uint8Array(32).fill(7);
  const signer = Keypair.fromSeed(seed);
  const input = { seed, owner: signer.publicKey.toBase58(), endpoint: 'https://devnet.helius-rpc.com/?api-key=test', network: 'devnet' as const };

  it('recovers the canonical shielded identity from the existing Solana signer', async () => {
    const recover = () => withPrivacyWallet(input, async ({ keypair, client }) => {
      const signature = nacl.sign.detached(ed25519DerivationMessage(bytes32(signer.publicKey.toBytes())), signer.secretKey);
      const expected = LocalKeys.fromDerivationSeed({ solanaPublicKey: keypair.shieldedAddress().solanaAddress(), derivationSeed: signature }, client.proofService);
      try {
        expect(keypair.shieldedAddress().toBytes()).toEqual(expected.address().toBytes());
        return keypair.shieldedAddress().toBytes();
      } finally { expected.destroy(); signature.fill(0); }
    });
    expect(await recover()).toEqual(await recover());
    expect(seed).toEqual(new Uint8Array(32).fill(7));
  });
  it('rejects both raw and offchain-encoded derivation messages from public message signing', () => {
    for (const message of [new TextEncoder().encode('TSPP/derive/v1'), ed25519DerivationMessage(bytes32(signer.publicKey.toBytes()))]) {
      expect(() => signMessageBytes(message, signer)).toThrow('cannot be signed');
    }
    const message = new TextEncoder().encode('Sign in to Grape');
    expect(nacl.sign.detached.verify(message, signMessageBytes(message, signer), signer.publicKey.toBytes())).toBe(true);
  });
  it('rejects a seed belonging to another account', async () => {
    await expect(withPrivacyWallet({ ...input, owner: Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey.toBase58() }, async () => true)).rejects.toThrow('does not match');
  });
});
