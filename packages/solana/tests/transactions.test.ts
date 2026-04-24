import { describe, expect, it, vi } from 'vitest';
import bs58 from 'bs58';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

import { bytesToBase64 } from '@grape/core';

import { inspectTransaction, summarizeTransaction } from '../src/transactions';
import { createTransferCheckedInstruction, TOKEN_PROGRAM_ID } from '../src/transfers';

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

function createSerializedTokenTransfer() {
  const owner = Keypair.generate().publicKey;
  const destinationOwner = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const sourceAta = findAssociatedTokenAddress(owner, mint);
  const destinationAta = findAssociatedTokenAddress(destinationOwner, mint);
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: '11111111111111111111111111111111'
  }).add(createTransferCheckedInstruction(sourceAta, mint, destinationAta, owner, 1_250_000n, 6, TOKEN_PROGRAM_ID));

  return {
    owner,
    serialized: bytesToBase64(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })
    )
  };
}

function createSerializedGovernanceDeposit() {
  const owner = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;
  const data = Buffer.alloc(9);
  data[0] = 1;
  data.writeBigUInt64LE(42n, 1);
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: '11111111111111111111111111111111'
  }).add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data
  }));

  return {
    owner,
    serialized: bytesToBase64(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })
    )
  };
}

function createSerializedGovernanceWithdraw() {
  const owner = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: '11111111111111111111111111111111'
  }).add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([2])
  }));

  return {
    serialized: bytesToBase64(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      })
    )
  };
}

function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  )[0];
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

  it('attributes outgoing token transfers to the signing wallet', () => {
    const { owner, serialized } = createSerializedTokenTransfer();
    const summary = summarizeTransaction(serialized);

    expect(summary.balanceChanges.some((change) => change.account === owner.toBase58() && change.direction === 'out')).toBe(true);
  });

  it('decodes governance deposits into wallet impact details', () => {
    const { owner, serialized } = createSerializedGovernanceDeposit();
    const summary = summarizeTransaction(serialized);

    expect(summary.instructions[0]?.programName).toBe('SPL Governance Program');
    expect(summary.instructions[0]?.title).toBe('Deposit governing tokens');
    expect(summary.balanceChanges.some((change) => change.account === owner.toBase58() && change.direction === 'out')).toBe(true);
  });

  it('decodes governance withdrawals into readable instruction details', () => {
    const { serialized } = createSerializedGovernanceWithdraw();
    const summary = summarizeTransaction(serialized);

    expect(summary.instructions[0]?.programName).toBe('SPL Governance Program');
    expect(summary.instructions[0]?.title).toBe('Withdraw governing tokens');
  });

  it('merges simulated inner token transfers into balance changes', async () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const destinationOwner = Keypair.generate().publicKey;
    const sourceAta = findAssociatedTokenAddress(owner, mint);
    const destinationAta = findAssociatedTokenAddress(destinationOwner, mint);
    const transfer = createTransferCheckedInstruction(sourceAta, mint, destinationAta, owner, 1_250_000n, 6, TOKEN_PROGRAM_ID);
    const serialized = createSerializedTransfer();
    const connection = {
      getFeeForMessage: vi.fn().mockResolvedValue({
        value: 5000
      }),
      simulateTransaction: vi.fn().mockResolvedValue({
        value: {
          err: null,
          logs: ['Program JUP invoke [1]'],
          unitsConsumed: 123456,
          innerInstructions: [
            {
              index: 0,
              instructions: [
                {
                  programId: TOKEN_PROGRAM_ID,
                  accounts: transfer.keys.map((key) => key.pubkey),
                  data: bs58.encode(transfer.data)
                }
              ]
            }
          ]
        }
      })
    } as const;

    const summary = await inspectTransaction(serialized, connection as never);

    expect(summary.balanceChanges.some((change) => change.account === owner.toBase58() && change.direction === 'out')).toBe(true);
    expect(summary.balanceChanges.some((change) => change.account === destinationAta.toBase58() && change.direction === 'in')).toBe(true);
  });
});
