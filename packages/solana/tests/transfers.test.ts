import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import {
  TOKEN_PROGRAM_ID,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createRevokeInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  encodeBurnCheckedData,
  encodeTransferCheckedData,
  TOKEN_AUTHORITY_TYPES,
  getAssociatedTokenAddress,
  parseDecimalAmount
} from '../src/transfers';

describe('transfer helpers', () => {
  it('parses decimal UI amounts into base units', () => {
    expect(parseDecimalAmount('1.5', 9)).toBe(1_500_000_000n);
    expect(parseDecimalAmount('42', 6)).toBe(42_000_000n);
    expect(() => parseDecimalAmount('0.0000001', 6)).toThrow(/at most 6 decimal places/i);
  });

  it('encodes transfer checked instruction payloads', () => {
    expect(Array.from(encodeTransferCheckedData(123n, 6))).toEqual([12, 123, 0, 0, 0, 0, 0, 0, 0, 6]);
  });

  it('encodes burn and authority maintenance instructions', () => {
    expect(Array.from(encodeBurnCheckedData(55n, 6))).toEqual([15, 55, 0, 0, 0, 0, 0, 0, 0, 6]);

    const owner = new PublicKey('7tCjotf5gGQ3U7P9C5iUKZx7PFrf7CAnr7Lq5M2vXy4V');
    const mint = new PublicKey('So11111111111111111111111111111111111111112');
    const account = getAssociatedTokenAddress(owner, mint, TOKEN_PROGRAM_ID);
    const recipient = new PublicKey('6QWeT6FpJrm8AF1btu6WH2k2Xhq6t5vbheKVfQavmeoZ');

    expect(Array.from(createRevokeInstruction(account, owner, TOKEN_PROGRAM_ID).data)).toEqual([5]);
    expect(Array.from(createCloseAccountInstruction(account, recipient, owner, TOKEN_PROGRAM_ID).data)).toEqual([9]);
    expect(createBurnCheckedInstruction(account, mint, owner, 55n, 6, TOKEN_PROGRAM_ID).data[0]).toBe(15);

    const authorityInstruction = createSetAuthorityInstruction(
      mint,
      owner,
      TOKEN_PROGRAM_ID,
      TOKEN_AUTHORITY_TYPES.freezeAccount,
      recipient
    );

    expect(authorityInstruction.data[0]).toBe(6);
    expect(authorityInstruction.data[1]).toBe(TOKEN_AUTHORITY_TYPES.freezeAccount);
    expect(authorityInstruction.data[2]).toBe(1);
  });

  it('derives deterministic token accounts and transfer instructions', () => {
    const owner = new PublicKey('7tCjotf5gGQ3U7P9C5iUKZx7PFrf7CAnr7Lq5M2vXy4V');
    const recipient = new PublicKey('6QWeT6FpJrm8AF1btu6WH2k2Xhq6t5vbheKVfQavmeoZ');
    const mint = new PublicKey('So11111111111111111111111111111111111111112');
    const sourceAta = getAssociatedTokenAddress(owner, mint, TOKEN_PROGRAM_ID);
    const destinationAta = getAssociatedTokenAddress(recipient, mint, TOKEN_PROGRAM_ID);
    const instruction = createTransferCheckedInstruction(
      sourceAta,
      mint,
      destinationAta,
      owner,
      250_000_000n,
      9,
      TOKEN_PROGRAM_ID
    );

    expect(sourceAta.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(destinationAta.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(sourceAta.equals(destinationAta)).toBe(false);
    expect(instruction.programId.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
    expect(instruction.keys).toHaveLength(4);
    expect(instruction.keys[0]?.pubkey.equals(sourceAta)).toBe(true);
    expect(instruction.keys[2]?.pubkey.equals(destinationAta)).toBe(true);
    expect(Array.from(instruction.data)).toEqual(Array.from(encodeTransferCheckedData(250_000_000n, 9)));
  });
});
