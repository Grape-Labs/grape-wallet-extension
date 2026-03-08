import { base64ToBytes } from '@grape/core';
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  PublicKey,
  StakeProgram,
  SystemProgram,
  Transaction,
  VersionedTransaction
} from '@solana/web3.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const PROGRAM_NAMES: Record<string, string> = {
  [SystemProgram.programId.toBase58()]: 'System Program',
  [ComputeBudgetProgram.programId.toBase58()]: 'Compute Budget Program',
  [StakeProgram.programId.toBase58()]: 'Stake Program',
  [AddressLookupTableProgram.programId.toBase58()]: 'Address Lookup Table Program',
  [TOKEN_PROGRAM_ID.toBase58()]: 'SPL Token Program',
  [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()]: 'Associated Token Program'
};

export type TransactionInstructionSummary = {
  programId: string;
  programName: string;
  accountCount: number;
  dataLength: number;
  warning?: string;
};

export type TransactionSummary = {
  feePayer?: string;
  recentBlockhash: string;
  instructionCount: number;
  instructions: TransactionInstructionSummary[];
  warnings: string[];
};

function summarizeProgram(programId: PublicKey, accountCount: number, dataLength: number): TransactionInstructionSummary {
  const base58 = programId.toBase58();
  const programName = PROGRAM_NAMES[base58] ?? 'Unknown Program';

  return {
    programId: base58,
    programName,
    accountCount,
    dataLength,
    warning: programName === 'Unknown Program' ? 'Instruction targets an unknown program.' : undefined
  };
}

export function summarizeTransaction(serialized: string): TransactionSummary {
  const raw = base64ToBytes(serialized);

  try {
    const transaction = VersionedTransaction.deserialize(raw);
    const staticKeys = transaction.message.staticAccountKeys;
    const instructions = transaction.message.compiledInstructions.map((instruction) =>
      summarizeProgram(
        staticKeys[instruction.programIdIndex],
        instruction.accountKeyIndexes.length,
        instruction.data.length
      )
    );

    const warnings = instructions.flatMap((instruction) => (instruction.warning ? [instruction.warning] : []));
    if (transaction.message.addressTableLookups.length > 0) {
      warnings.push('Address lookup tables are present. Instruction parsing may be incomplete.');
    }

    return {
      feePayer: staticKeys[0]?.toBase58(),
      recentBlockhash: transaction.message.recentBlockhash,
      instructionCount: instructions.length,
      instructions,
      warnings
    };
  } catch {
    const transaction = Transaction.from(raw);
    const instructions = transaction.instructions.map((instruction) =>
      summarizeProgram(instruction.programId, instruction.keys.length, instruction.data.length)
    );

    return {
      feePayer: transaction.feePayer?.toBase58(),
      recentBlockhash: transaction.recentBlockhash ?? 'unknown',
      instructionCount: instructions.length,
      instructions,
      warnings: instructions.flatMap((instruction) => (instruction.warning ? [instruction.warning] : []))
    };
  }
}

