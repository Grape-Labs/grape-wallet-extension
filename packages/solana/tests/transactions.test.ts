import { describe, expect, it, vi } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';

import { bytesToBase64 } from '@grape/core';

import { inspectTransaction, summarizeTransaction } from '../src/transactions';

function createSerializedTransfer() {
  const feePayer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const transaction = new Transaction({
    feePayer,
    recentBlockhash: '11111111111111111111111111111111'
  }).add(
    SystemProgram.transfer({
      fromPubkey: feePayer,
      toPubkey: recipient,
      lamports: 2_500_000_000
    })
  );

  return bytesToBase64(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  );
}

describe('transactions', () => {
  it('summarizes common system transfers with decoded details', () => {
    const serialized = createSerializedTransfer();
    const summary = summarizeTransaction(serialized);

    expect(summary.instructionCount).toBe(1);
    expect(summary.instructions[0]?.programName).toBe('System Program');
    expect(summary.instructions[0]?.title).toBe('Transfer SOL');
    expect(summary.instructions[0]?.details?.some((detail) => detail.label === 'Amount' && detail.value.includes('SOL'))).toBe(
      true
    );
    expect(summary.balanceChanges).toHaveLength(2);
    expect(summary.balanceChanges[0]?.assetLabel).toBe('SOL');
  });

  it('attaches simulation details when RPC simulation succeeds', async () => {
    const serialized = createSerializedTransfer();
    const connection = {
      getFeeForMessage: vi.fn().mockResolvedValue({
        value: 5000
      }),
      simulateTransaction: vi.fn().mockResolvedValue({
        value: {
          err: null,
          logs: ['Program 11111111111111111111111111111111 invoke [1]'],
          unitsConsumed: 5400,
          replacementBlockhash: {
            blockhash: '7fWy3s48Yk6vX7Wf6vX7Wf6vX7Wf6vX7Wf6vX7Wf6vX7'
          }
        }
      })
    } as const;

    const summary = await inspectTransaction(serialized, connection as never);

    expect(connection.getFeeForMessage).toHaveBeenCalledTimes(1);
    expect(connection.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(summary.estimatedFeeLamports).toBe(5000);
    expect(summary.simulation?.ok).toBe(true);
    expect(summary.simulation?.unitsConsumed).toBe(5400);
    expect(summary.simulation?.logs).toHaveLength(1);
  });
});
