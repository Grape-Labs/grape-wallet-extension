import './runtime-polyfills';

import { Buffer } from 'buffer';
import bs58 from 'bs58';

import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  type ParsedInnerInstruction,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
  PublicKey,
  StakeProgram,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction
} from '@solana/web3.js';

import { parseSerializedTransaction } from './signing';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const PROGRAM_NAMES: Record<string, string> = {
  [SystemProgram.programId.toBase58()]: 'System Program',
  [ComputeBudgetProgram.programId.toBase58()]: 'Compute Budget Program',
  [StakeProgram.programId.toBase58()]: 'Stake Program',
  [AddressLookupTableProgram.programId.toBase58()]: 'Address Lookup Table Program',
  [TOKEN_PROGRAM_ID.toBase58()]: 'SPL Token Program',
  [TOKEN_2022_PROGRAM_ID.toBase58()]: 'Token-2022 Program',
  [MEMO_PROGRAM_ID.toBase58()]: 'Memo Program',
  [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()]: 'Associated Token Program'
};

export type TransactionInstructionDetail = {
  label: string;
  value: string;
  address?: boolean;
};

export type TransactionInstructionSummary = {
  programId: string;
  programName: string;
  accountCount: number;
  dataLength: number;
  accounts?: string[];
  title?: string;
  details?: TransactionInstructionDetail[];
  warning?: string;
};

export type TransactionSimulationSummary = {
  attempted: boolean;
  ok: boolean;
  error?: string;
  unitsConsumed?: number | null;
  logs: string[];
};

export type TransactionBalanceChange = {
  account: string;
  direction: 'in' | 'out';
  amount: string;
  rawAmount: string;
  decimals: number;
  assetLabel: string;
  assetAddress?: string;
};

export type TransactionSummary = {
  feePayer?: string;
  recentBlockhash: string;
  instructionCount: number;
  instructions: TransactionInstructionSummary[];
  warnings: string[];
  estimatedFeeLamports?: number | null;
  balanceChanges: TransactionBalanceChange[];
  simulation?: TransactionSimulationSummary;
};

type ResolvedInstruction = {
  programId: PublicKey;
  keys: Array<PublicKey | null>;
  data: Uint8Array;
};

type BalanceChangeAggregate = {
  account: string;
  assetLabel: string;
  assetAddress?: string;
  decimals: number;
  amount: bigint;
};

type GovernanceInstructionSummary = {
  title: string;
  details: TransactionInstructionDetail[];
};

function formatUiAmount(rawAmount: bigint, decimals = 0): string {
  if (decimals <= 0) {
    return rawAmount.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = rawAmount / divisor;
  const fraction = rawAmount % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionText}`;
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    return 0;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, true);
}

function readU64Le(bytes: Uint8Array, offset: number): bigint {
  if (offset + 8 > bytes.length) {
    return 0n;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true);
}

function accountLabel(account: PublicKey | null | undefined): string {
  return account?.toBase58() ?? 'Lookup table account';
}

function addBalanceChange(
  changes: Map<string, BalanceChangeAggregate>,
  account: PublicKey | null | undefined,
  assetLabel: string,
  decimals: number,
  delta: bigint,
  assetAddress?: string
) {
  if (!account || delta === 0n) {
    return;
  }

  const key = [account.toBase58(), assetLabel, assetAddress ?? '', decimals.toString()].join(':');
  const current = changes.get(key);

  if (current) {
    current.amount += delta;
    return;
  }

  changes.set(key, {
    account: account.toBase58(),
    assetLabel,
    assetAddress,
    decimals,
    amount: delta
  });
}

function finalizeBalanceChanges(changes: Map<string, BalanceChangeAggregate>): TransactionBalanceChange[] {
  return Array.from(changes.values())
    .filter((change) => change.amount !== 0n)
    .sort((left, right) => {
      const leftAbs = left.amount < 0n ? -left.amount : left.amount;
      const rightAbs = right.amount < 0n ? -right.amount : right.amount;
      if (leftAbs === rightAbs) {
        return left.account.localeCompare(right.account);
      }
      return rightAbs > leftAbs ? 1 : -1;
    })
    .map((change) => ({
      account: change.account,
      direction: change.amount < 0n ? 'out' : 'in',
      amount: formatUiAmount(change.amount < 0n ? -change.amount : change.amount, change.decimals),
      rawAmount: (change.amount < 0n ? -change.amount : change.amount).toString(),
      decimals: change.decimals,
      assetLabel: change.assetLabel,
      assetAddress: change.assetAddress
    }));
}

function mergeBalanceChanges(
  existing: TransactionBalanceChange[],
  next: TransactionBalanceChange[]
): TransactionBalanceChange[] {
  const changes = new Map<string, BalanceChangeAggregate>();

  for (const change of [...existing, ...next]) {
    const signedAmount = BigInt(change.rawAmount) * (change.direction === 'out' ? -1n : 1n);
    const key = [change.account, change.assetLabel, change.assetAddress ?? '', change.decimals.toString()].join(':');
    const current = changes.get(key);

    if (current) {
      current.amount += signedAmount;
      continue;
    }

    changes.set(key, {
      account: change.account,
      assetLabel: change.assetLabel,
      assetAddress: change.assetAddress,
      decimals: change.decimals,
      amount: signedAmount
    });
  }

  return finalizeBalanceChanges(changes);
}

function isSystemProgramKey(account: PublicKey | null | undefined): boolean {
  return account?.equals(SystemProgram.programId) ?? false;
}

function isTokenProgramKey(account: PublicKey | null | undefined): boolean {
  return (account?.equals(TOKEN_PROGRAM_ID) ?? false) || (account?.equals(TOKEN_2022_PROGRAM_ID) ?? false);
}

function summarizeGovernanceInstruction(instruction: ResolvedInstruction): GovernanceInstructionSummary | null {
  const opcode = instruction.data[0];

  if (opcode === 1 && instruction.keys.length >= 9 && isSystemProgramKey(instruction.keys[7]) && isTokenProgramKey(instruction.keys[8])) {
    const amount = instruction.data.length >= 9 ? readU64Le(instruction.data, 1).toString() : 'Unknown';
    return {
      title: 'Deposit governing tokens',
      details: [
        { label: 'Realm', value: accountLabel(instruction.keys[0]), address: true },
        { label: 'Holding account', value: accountLabel(instruction.keys[1]), address: true },
        { label: 'Source', value: accountLabel(instruction.keys[2]), address: true },
        { label: 'Owner', value: accountLabel(instruction.keys[3]), address: true },
        { label: 'Source authority', value: accountLabel(instruction.keys[4]), address: true },
        { label: 'Amount', value: amount }
      ]
    };
  }

  if (opcode === 2 && instruction.keys.length >= 6 && isTokenProgramKey(instruction.keys[5])) {
    return {
      title: 'Withdraw governing tokens',
      details: [
        { label: 'Realm', value: accountLabel(instruction.keys[0]), address: true },
        { label: 'Holding account', value: accountLabel(instruction.keys[1]), address: true },
        { label: 'Destination', value: accountLabel(instruction.keys[2]), address: true },
        { label: 'Owner', value: accountLabel(instruction.keys[3]), address: true }
      ]
    };
  }

  return null;
}

function summarizeBalanceChanges(instructions: ResolvedInstruction[]): TransactionBalanceChange[] {
  const changes = new Map<string, BalanceChangeAggregate>();

  for (const instruction of instructions) {
    const programId = instruction.programId.toBase58();

    if (programId === SystemProgram.programId.toBase58()) {
      try {
        const decoded = SystemInstruction.decodeInstructionType(
          new TransactionInstruction({
            programId: instruction.programId,
            keys: instruction.keys.map((pubkey) => ({
              pubkey: pubkey ?? SystemProgram.programId,
              isSigner: false,
              isWritable: false
            })),
            data: Buffer.from(instruction.data)
          })
        );

        if (decoded === 'Transfer') {
          const transfer = SystemInstruction.decodeTransfer(
            new TransactionInstruction({
              programId: instruction.programId,
              keys: instruction.keys.map((pubkey) => ({
                pubkey: pubkey ?? SystemProgram.programId,
                isSigner: false,
                isWritable: false
              })),
              data: Buffer.from(instruction.data)
            })
          );
          addBalanceChange(changes, transfer.fromPubkey, 'SOL', 9, -BigInt(transfer.lamports));
          addBalanceChange(changes, transfer.toPubkey, 'SOL', 9, BigInt(transfer.lamports));
        } else if (decoded === 'Create') {
          const created = SystemInstruction.decodeCreateAccount(
            new TransactionInstruction({
              programId: instruction.programId,
              keys: instruction.keys.map((pubkey) => ({
                pubkey: pubkey ?? SystemProgram.programId,
                isSigner: false,
                isWritable: false
              })),
              data: Buffer.from(instruction.data)
            })
          );
          addBalanceChange(changes, created.fromPubkey, 'SOL', 9, -BigInt(created.lamports));
          addBalanceChange(changes, created.newAccountPubkey, 'SOL', 9, BigInt(created.lamports));
        }
      } catch {
        // Ignore undecodable system instructions.
      }

      continue;
    }

    if (programId === TOKEN_PROGRAM_ID.toBase58() || programId === TOKEN_2022_PROGRAM_ID.toBase58()) {
      const tag = instruction.data[0];

      if (tag === 3 || tag === 12) {
        const amount = readU64Le(instruction.data, 1);
        const decimals = tag === 12 ? (instruction.data[9] ?? 0) : 0;
        const mintAddress = tag === 12 ? accountLabel(instruction.keys[1]) : undefined;
        const authorityIndex = tag === 12 ? 3 : 2;
        const destinationIndex = tag === 12 ? 2 : 1;
        addBalanceChange(changes, instruction.keys[authorityIndex] ?? instruction.keys[0], 'Token', decimals, -amount, mintAddress);
        addBalanceChange(changes, instruction.keys[destinationIndex], 'Token', decimals, amount, mintAddress);
        continue;
      }

      if (tag === 7 || tag === 14) {
        const amount = readU64Le(instruction.data, 1);
        const decimals = tag === 14 ? (instruction.data[9] ?? 0) : 0;
        const mintAddress = accountLabel(instruction.keys[0]);
        addBalanceChange(changes, instruction.keys[1], 'Token', decimals, amount, mintAddress);
        continue;
      }

      if (tag === 8 || tag === 15) {
        const amount = readU64Le(instruction.data, 1);
        const decimals = tag === 15 ? (instruction.data[9] ?? 0) : 0;
        const mintAddress = accountLabel(instruction.keys[1]);
        addBalanceChange(changes, instruction.keys[2] ?? instruction.keys[0], 'Token', decimals, -amount, mintAddress);
      }
    }

    const governanceInstruction = summarizeGovernanceInstruction(instruction);
    if (governanceInstruction?.title === 'Deposit governing tokens') {
      if (instruction.data.length >= 9) {
        addBalanceChange(
          changes,
          instruction.keys[4] ?? instruction.keys[3],
          'Governance token',
          0,
          -readU64Le(instruction.data, 1)
        );
      }
      continue;
    }
  }

  return finalizeBalanceChanges(changes);
}

function summarizeParsedTokenInstruction(
  instruction: ParsedInstruction,
  changes: Map<string, BalanceChangeAggregate>
) {
  const parsed = instruction.parsed;
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed) || !('info' in parsed)) {
    return;
  }

  const type = typeof parsed.type === 'string' ? parsed.type : '';
  const info = parsed.info;
  if (!info || typeof info !== 'object') {
    return;
  }

  if (type === 'transferChecked') {
    const amount = typeof info.tokenAmount === 'object' && info.tokenAmount && 'amount' in info.tokenAmount ? BigInt(String(info.tokenAmount.amount)) : 0n;
    const decimals =
      typeof info.tokenAmount === 'object' && info.tokenAmount && 'decimals' in info.tokenAmount
        ? Number(info.tokenAmount.decimals)
        : 0;
    const mintAddress = typeof info.mint === 'string' ? info.mint : undefined;
    addBalanceChange(
      changes,
      typeof info.authority === 'string' ? new PublicKey(info.authority) : undefined,
      'Token',
      decimals,
      -amount,
      mintAddress
    );
    addBalanceChange(
      changes,
      typeof info.destination === 'string' ? new PublicKey(info.destination) : undefined,
      'Token',
      decimals,
      amount,
      mintAddress
    );
    return;
  }

  if (type === 'mintToChecked') {
    const amount = typeof info.tokenAmount === 'object' && info.tokenAmount && 'amount' in info.tokenAmount ? BigInt(String(info.tokenAmount.amount)) : 0n;
    const decimals =
      typeof info.tokenAmount === 'object' && info.tokenAmount && 'decimals' in info.tokenAmount
        ? Number(info.tokenAmount.decimals)
        : 0;
    addBalanceChange(
      changes,
      typeof info.account === 'string' ? new PublicKey(info.account) : undefined,
      'Token',
      decimals,
      amount,
      typeof info.mint === 'string' ? info.mint : undefined
    );
    return;
  }

  if (type === 'burnChecked') {
    const amount = typeof info.tokenAmount === 'object' && info.tokenAmount && 'amount' in info.tokenAmount ? BigInt(String(info.tokenAmount.amount)) : 0n;
    const decimals =
      typeof info.tokenAmount === 'object' && info.tokenAmount && 'decimals' in info.tokenAmount
        ? Number(info.tokenAmount.decimals)
        : 0;
    addBalanceChange(
      changes,
      typeof info.authority === 'string' ? new PublicKey(info.authority) : undefined,
      'Token',
      decimals,
      -amount,
      typeof info.mint === 'string' ? info.mint : undefined
    );
  }
}

function summarizeSimulationInnerBalanceChanges(innerInstructions?: ParsedInnerInstruction[] | null): TransactionBalanceChange[] {
  if (!innerInstructions?.length) {
    return [];
  }

  const changes = new Map<string, BalanceChangeAggregate>();

  for (const group of innerInstructions) {
    for (const instruction of group.instructions) {
      const programId = instruction.programId.toBase58();

      if ('parsed' in instruction) {
        if (programId === TOKEN_PROGRAM_ID.toBase58() || programId === TOKEN_2022_PROGRAM_ID.toBase58()) {
          summarizeParsedTokenInstruction(instruction as ParsedInstruction, changes);
        }
        continue;
      }

      const partiallyDecoded = instruction as PartiallyDecodedInstruction;
      let data: Uint8Array;
      try {
        data = bs58.decode(partiallyDecoded.data);
      } catch {
        continue;
      }

      const resolved: ResolvedInstruction = {
        programId: partiallyDecoded.programId,
        keys: partiallyDecoded.accounts.map((account) => new PublicKey(account)),
        data
      };

      for (const change of summarizeBalanceChanges([resolved])) {
        addBalanceChange(
          changes,
          new PublicKey(change.account),
          change.assetLabel,
          change.decimals,
          BigInt(change.rawAmount) * (change.direction === 'out' ? -1n : 1n),
          change.assetAddress
        );
      }
    }
  }

  return finalizeBalanceChanges(changes);
}

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

function buildResolvedInstructions(serialized: string): {
  feePayer?: string;
  recentBlockhash: string;
  instructions: ResolvedInstruction[];
  warnings: string[];
} {
  const parsed = parseSerializedTransaction(serialized);

  if (parsed.kind === 'legacy') {
    return {
      feePayer: parsed.transaction.feePayer?.toBase58(),
      recentBlockhash: parsed.transaction.recentBlockhash ?? 'unknown',
      instructions: parsed.transaction.instructions.map((instruction) => ({
        programId: instruction.programId,
        keys: instruction.keys.map((key) => key.pubkey),
        data: instruction.data
      })),
      warnings: []
    };
  }

  const staticKeys = parsed.transaction.message.staticAccountKeys;
  const warnings =
    parsed.transaction.message.addressTableLookups.length > 0
      ? ['Address lookup tables are present. Some account decoding may be incomplete.']
      : [];

  return {
    feePayer: staticKeys[0]?.toBase58(),
    recentBlockhash: parsed.transaction.message.recentBlockhash,
    instructions: parsed.transaction.message.compiledInstructions.map((instruction) => ({
      programId: staticKeys[instruction.programIdIndex] ?? SystemProgram.programId,
      keys: instruction.accountKeyIndexes.map((index) => staticKeys[index] ?? null),
      data: instruction.data
    })),
    warnings
  };
}

function summarizeSystemInstruction(instruction: TransactionInstruction): Pick<TransactionInstructionSummary, 'title' | 'details'> {
  try {
    const type = SystemInstruction.decodeInstructionType(instruction);

    switch (type) {
      case 'Transfer': {
        const decoded = SystemInstruction.decodeTransfer(instruction);
        return {
          title: 'Transfer SOL',
          details: [
            { label: 'From', value: decoded.fromPubkey.toBase58(), address: true },
            { label: 'To', value: decoded.toPubkey.toBase58(), address: true },
            { label: 'Amount', value: `${formatUiAmount(BigInt(decoded.lamports), 9)} SOL` }
          ]
        };
      }
      case 'Create': {
        const decoded = SystemInstruction.decodeCreateAccount(instruction);
        return {
          title: 'Create account',
          details: [
            { label: 'Payer', value: decoded.fromPubkey.toBase58(), address: true },
            { label: 'New account', value: decoded.newAccountPubkey.toBase58(), address: true },
            { label: 'Lamports', value: formatUiAmount(BigInt(decoded.lamports), 9) },
            { label: 'Space', value: decoded.space.toString() },
            { label: 'Owner', value: decoded.programId.toBase58(), address: true }
          ]
        };
      }
      case 'Assign': {
        const decoded = SystemInstruction.decodeAssign(instruction);
        return {
          title: 'Assign account owner',
          details: [
            { label: 'Account', value: decoded.accountPubkey.toBase58(), address: true },
            { label: 'Program', value: decoded.programId.toBase58(), address: true }
          ]
        };
      }
      default:
        return {
          title: type.replace(/([A-Z])/g, ' $1').trim()
        };
    }
  } catch {
    return {};
  }
}

function summarizeTokenInstruction(instruction: ResolvedInstruction): Pick<TransactionInstructionSummary, 'title' | 'details' | 'warning'> {
  const tag = instruction.data[0];

  switch (tag) {
    case 3:
      return {
        title: 'Transfer token',
        details: [
          { label: 'Source', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Destination', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[2]), address: true },
          { label: 'Amount', value: readU64Le(instruction.data, 1).toString() }
        ]
      };
    case 12:
      return {
        title: 'Transfer token (checked)',
        details: [
          { label: 'Source', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Mint', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Destination', value: accountLabel(instruction.keys[2]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[3]), address: true },
          { label: 'Amount', value: formatUiAmount(readU64Le(instruction.data, 1), instruction.data[9] ?? 0) }
        ]
      };
    case 4:
    case 13:
      return {
        title: 'Approve delegate',
        details: [
          { label: 'Source', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Delegate', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[tag === 13 ? 3 : 2]), address: true }
        ]
      };
    case 5:
      return {
        title: 'Revoke delegate',
        details: [
          { label: 'Source', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[1]), address: true }
        ]
      };
    case 6: {
      const authorityType = instruction.data[1];
      return {
        title: 'Set authority',
        details: [
          { label: 'Target', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Authority type', value: ['Mint tokens', 'Freeze account', 'Account owner', 'Close account'][authorityType] ?? 'Unknown' },
          { label: 'Current authority', value: accountLabel(instruction.keys[1]), address: true }
        ]
      };
    }
    case 7:
    case 14:
      return {
        title: 'Mint token',
        details: [
          { label: 'Mint', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Destination', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[2]), address: true },
          {
            label: 'Amount',
            value:
              tag === 14
                ? formatUiAmount(readU64Le(instruction.data, 1), instruction.data[9] ?? 0)
                : readU64Le(instruction.data, 1).toString()
          }
        ]
      };
    case 8:
    case 15:
      return {
        title: 'Burn token',
        details: [
          { label: 'Account', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Mint', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[2]), address: true },
          {
            label: 'Amount',
            value:
              tag === 15
                ? formatUiAmount(readU64Le(instruction.data, 1), instruction.data[9] ?? 0)
                : readU64Le(instruction.data, 1).toString()
          }
        ]
      };
    case 9:
      return {
        title: 'Close token account',
        details: [
          { label: 'Account', value: accountLabel(instruction.keys[0]), address: true },
          { label: 'Destination', value: accountLabel(instruction.keys[1]), address: true },
          { label: 'Authority', value: accountLabel(instruction.keys[2]), address: true }
        ]
      };
    case 17:
      return {
        title: 'Sync wrapped SOL',
        details: [{ label: 'Account', value: accountLabel(instruction.keys[0]), address: true }]
      };
    default:
      return {
        title: 'Token instruction',
        warning: 'Instruction could not be decoded fully. Review the program ID and accounts carefully.'
      };
  }
}

function summarizeAssociatedTokenInstruction(instruction: ResolvedInstruction): Pick<TransactionInstructionSummary, 'title' | 'details'> {
  const opcode = instruction.data[0] ?? 0;
  return {
    title: opcode === 1 ? 'Create associated token account (idempotent)' : 'Create associated token account',
    details: [
      { label: 'Payer', value: accountLabel(instruction.keys[0]), address: true },
      { label: 'Account', value: accountLabel(instruction.keys[1]), address: true },
      { label: 'Owner', value: accountLabel(instruction.keys[2]), address: true },
      { label: 'Mint', value: accountLabel(instruction.keys[3]), address: true }
    ]
  };
}

function summarizeComputeBudgetInstruction(instruction: ResolvedInstruction): Pick<TransactionInstructionSummary, 'title' | 'details'> {
  switch (instruction.data[0]) {
    case 1:
      return {
        title: 'Request heap frame',
        details: [{ label: 'Bytes', value: readU32Le(instruction.data, 1).toString() }]
      };
    case 2:
      return {
        title: 'Set compute unit limit',
        details: [{ label: 'Units', value: readU32Le(instruction.data, 1).toString() }]
      };
    case 3:
      return {
        title: 'Set compute unit price',
        details: [{ label: 'Micro-lamports', value: readU64Le(instruction.data, 1).toString() }]
      };
    default:
      return {
        title: 'Compute budget instruction'
      };
  }
}

function summarizeMemoInstruction(instruction: ResolvedInstruction): Pick<TransactionInstructionSummary, 'title' | 'details'> {
  try {
    return {
      title: 'Memo',
      details: [{ label: 'Message', value: new TextDecoder().decode(instruction.data) }]
    };
  } catch {
    return {
      title: 'Memo',
      details: [{ label: 'Message', value: 'Binary memo' }]
    };
  }
}

function summarizeInstruction(instruction: ResolvedInstruction): TransactionInstructionSummary {
  const base = summarizeProgram(instruction.programId, instruction.keys.length, instruction.data.length);
  const programId = instruction.programId.toBase58();
  let decoded: Pick<TransactionInstructionSummary, 'title' | 'details' | 'warning'> = {};
  let programName = base.programName;
  let warning = base.warning;

  if (programId === SystemProgram.programId.toBase58()) {
    decoded = summarizeSystemInstruction(
      new TransactionInstruction({
        programId: instruction.programId,
        keys: instruction.keys.map((pubkey) => ({
          pubkey: pubkey ?? SystemProgram.programId,
          isSigner: false,
          isWritable: false
        })),
        data: Buffer.from(instruction.data)
      })
    );
  } else if (programId === TOKEN_PROGRAM_ID.toBase58() || programId === TOKEN_2022_PROGRAM_ID.toBase58()) {
    decoded = summarizeTokenInstruction(instruction);
  } else if (programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
    decoded = summarizeAssociatedTokenInstruction(instruction);
  } else if (programId === ComputeBudgetProgram.programId.toBase58()) {
    decoded = summarizeComputeBudgetInstruction(instruction);
  } else if (programId === MEMO_PROGRAM_ID.toBase58()) {
    decoded = summarizeMemoInstruction(instruction);
  } else {
    const governanceInstruction = summarizeGovernanceInstruction(instruction);
    if (governanceInstruction) {
      decoded = governanceInstruction;
      programName = 'SPL Governance Program';
      warning = undefined;
    }
  }

  return {
    ...base,
    programName,
    accounts: instruction.keys.map((key) => accountLabel(key)),
    ...decoded,
    warning: decoded.warning ?? warning
  };
}

function formatSimulationError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    return JSON.stringify(error);
  }
  return 'Simulation failed.';
}

export function summarizeTransaction(serialized: string): TransactionSummary {
  const resolved = buildResolvedInstructions(serialized);
  const instructions = resolved.instructions.map((instruction) => summarizeInstruction(instruction));

  return {
    feePayer: resolved.feePayer,
    recentBlockhash: resolved.recentBlockhash,
    instructionCount: instructions.length,
    instructions,
    warnings: [...resolved.warnings, ...instructions.flatMap((instruction) => (instruction.warning ? [instruction.warning] : []))],
    balanceChanges: summarizeBalanceChanges(resolved.instructions)
  };
}

export async function inspectTransaction(serialized: string, connection: Connection): Promise<TransactionSummary> {
  const summary = summarizeTransaction(serialized);
  const parsed = parseSerializedTransaction(serialized);

  try {
    const message = parsed.kind === 'versioned' ? parsed.transaction.message : parsed.transaction.compileMessage();
    const fee = await connection.getFeeForMessage(message, 'processed');
    summary.estimatedFeeLamports = fee.value ?? null;
  } catch {
    summary.estimatedFeeLamports = null;
  }

  try {
    const response =
      parsed.kind === 'versioned'
        ? await connection.simulateTransaction(parsed.transaction, {
            commitment: 'processed',
            innerInstructions: true,
            replaceRecentBlockhash: true,
            sigVerify: false
          })
        : await (
            connection as Connection & {
              simulateTransaction: (
                transaction: typeof parsed.transaction,
                config: {
                  commitment: 'processed';
                  innerInstructions: true;
                  replaceRecentBlockhash: true;
                  sigVerify: false;
                }
              ) => Promise<{
                value: {
                  err: unknown;
                  logs?: string[];
                  innerInstructions?: ParsedInnerInstruction[] | null;
                  unitsConsumed?: number;
                };
              }>;
            }
          ).simulateTransaction(parsed.transaction, {
            commitment: 'processed',
            innerInstructions: true,
            replaceRecentBlockhash: true,
            sigVerify: false
          });
    const simulationBalanceChanges = summarizeSimulationInnerBalanceChanges(response.value.innerInstructions);
    if (simulationBalanceChanges.length > 0) {
      summary.balanceChanges = mergeBalanceChanges(summary.balanceChanges, simulationBalanceChanges);
    }
    summary.simulation = {
      attempted: true,
      ok: !response.value.err,
      error: response.value.err ? formatSimulationError(response.value.err) : undefined,
      unitsConsumed: response.value.unitsConsumed ?? null,
      logs: response.value.logs?.slice(0, 12) ?? []
    };
  } catch (error) {
    summary.simulation = {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : 'Simulation could not be completed.',
      logs: []
    };
    summary.warnings.push('Simulation could not be completed on the selected RPC.');
  }

  return summary;
}
