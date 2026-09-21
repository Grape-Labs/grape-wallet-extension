import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ZCASH_DERIVATION_PATH,
  ZcashIndexerClient,
  buildZcashTransparentTransaction,
  deriveZcashAccount,
  importZcashPrivateKey,
  isValidZcashTransparentAddress,
  parseZecAmount
} from '../src/index';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Zcash transparent accounts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('derives the standard BIP44 Zcash account deterministically', () => {
    const account = deriveZcashAccount(TEST_MNEMONIC);

    expect(account.derivationPath).toBe(ZCASH_DERIVATION_PATH);
    expect(account.address).toBe('t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F');
    expect(account.publicKey).toBe('03db98d8f87716269ed31879aef19bdadbc869a9ea67729e36332d023b916cbcc9');
    expect(isValidZcashTransparentAddress(account.address, 'mainnet')).toBe(true);
    expect(isValidZcashTransparentAddress(account.address, 'testnet')).toBe(false);
  });

  it('imports the derived private key back to the same address', () => {
    const account = deriveZcashAccount(TEST_MNEMONIC);
    expect(importZcashPrivateKey(account.privateKey).address).toBe(account.address);
  });

  it('parses exact decimal ZEC amounts without floating-point rounding', () => {
    expect(parseZecAmount('1.00000001')).toBe(100_000_001);
    expect(parseZecAmount('0.00000001')).toBe(1);
    expect(() => parseZecAmount('1.000000001')).toThrow(/8 decimal places/);
    expect(() => parseZecAmount('0')).toThrow(/outside the supported range/);
  });

  it('constructs and signs a current transparent transaction', () => {
    const account = deriveZcashAccount(TEST_MNEMONIC);
    const transaction = buildZcashTransparentTransaction({
      account,
      recipient: account.address,
      amountZat: 100_000,
      chainTipHeight: 3_500_000,
      utxos: [{
        txid: '11'.repeat(32),
        outputIndex: 0,
        valueZat: 200_000,
        scriptHex: `76a914${'00'.repeat(20)}88ac`,
        height: 3_499_990
      }]
    });

    expect(transaction.rawTransactionHex).toMatch(/^[0-9a-f]+$/);
    expect(transaction.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(transaction.feeZat).toBe(10_000);
  });

  it('loads balances, UTXOs, and activity from a Blockbook-compatible indexer', async () => {
    const account = deriveZcashAccount(TEST_MNEMONIC);
    const responses = [
      { balance: '12000', unconfirmedBalance: '-1000' },
      [{ txid: '22'.repeat(32), vout: 1, value: '12000', height: 3_490_000 }],
      { blockbook: { bestHeight: 3_490_100, inSync: true, initialSync: false } },
      {
        transactions: [{
          txid: '33'.repeat(32),
          height: 3_490_000,
          blockTime: 1_700_000_000,
          confirmations: 101,
          vin: [],
          vout: [{ addresses: [account.address], value: '12000' }]
        }]
      }
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));
    const client = new ZcashIndexerClient({ baseUrl: 'https://indexer.example' });

    const snapshot = await client.getAddress(account.address);
    const activity = await client.getActivity(account.address, 1);

    expect(snapshot).toMatchObject({
      confirmedBalanceZat: 12_000,
      unconfirmedBalanceZat: 11_000,
      chainTipHeight: 3_490_100,
      stale: false
    });
    expect(snapshot.utxos).toHaveLength(1);
    expect(activity).toEqual([expect.objectContaining({ valueZat: 12_000, direction: 'received' })]);
  });

  it('requires an explicit testnet indexer instead of querying mainnet', () => {
    expect(() => new ZcashIndexerClient({ network: 'testnet' })).toThrow(/testnet Blockbook/);
  });
});
