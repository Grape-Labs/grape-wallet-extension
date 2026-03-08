import { RpcError } from '@grape/core';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
const TRANSFER_CHECKED_INSTRUCTION = 12;

export type SolTransferInput = {
  recipient: string;
  amount: string;
};

export type SplTokenTransferInput = {
  recipient: string;
  amount: string;
  mint: string;
  decimals: number;
  programId: string;
};

export async function estimateLegacyTransactionFee(connection: Connection, transaction: Transaction): Promise<number> {
  const fee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  return fee.value ?? 0;
}

export function parseDecimalAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new RpcError('INVALID_AMOUNT', 'Amount must be a positive decimal value.');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (fractionPart.length > decimals) {
    throw new RpcError('INVALID_AMOUNT', `Amount supports at most ${decimals} decimal places.`);
  }

  const whole = BigInt(wholePart);
  const fraction = BigInt((fractionPart + '0'.repeat(decimals)).slice(0, decimals) || '0');
  const base = 10n ** BigInt(decimals);
  const amount = whole * base + fraction;

  if (amount <= 0n) {
    throw new RpcError('INVALID_AMOUNT', 'Amount must be greater than zero.');
  }

  return amount;
}

export function encodeTransferCheckedData(amount: bigint, decimals: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = TRANSFER_CHECKED_INSTRUCTION;

  let remaining = amount;
  for (let index = 0; index < 8; index += 1) {
    data[index + 1] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  data[9] = decimals;
  return data;
}

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey, tokenProgramId: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedTokenAddress: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ],
    data: Buffer.alloc(0)
  });
}

export function createTransferCheckedInstruction(
  sourceTokenAccount: PublicKey,
  mint: PublicKey,
  destinationTokenAccount: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
  tokenProgramId: PublicKey
) {
  return new TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    data: Buffer.from(encodeTransferCheckedData(amount, decimals))
  });
}

export async function buildSolTransferTransaction(
  connection: Connection,
  sender: PublicKey,
  input: SolTransferInput
): Promise<Transaction> {
  const recipient = new PublicKey(input.recipient);
  const lamports = parseDecimalAmount(input.amount, 9);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  return new Transaction({
    feePayer: sender,
    recentBlockhash: blockhash
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: Number(lamports)
    })
  );
}

export async function buildSplTokenTransferTransaction(
  connection: Connection,
  owner: PublicKey,
  input: SplTokenTransferInput
): Promise<Transaction> {
  const tokenProgramId = new PublicKey(input.programId);
  if (!TOKEN_PROGRAM_IDS.has(tokenProgramId.toBase58())) {
    throw new RpcError('UNSUPPORTED_TOKEN_PROGRAM', 'Unsupported token program.');
  }

  const mint = new PublicKey(input.mint);
  const recipient = new PublicKey(input.recipient);
  const sourceAta = getAssociatedTokenAddress(owner, mint, tokenProgramId);
  const destinationAta = getAssociatedTokenAddress(recipient, mint, tokenProgramId);
  const amount = parseDecimalAmount(input.amount, input.decimals);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash
  });

  const [sourceInfo, destinationInfo] = await Promise.all([
    connection.getAccountInfo(sourceAta, 'confirmed'),
    connection.getAccountInfo(destinationAta, 'confirmed')
  ]);

  if (!sourceInfo) {
    throw new RpcError('TOKEN_ACCOUNT_MISSING', 'No token account exists for this mint on the active account.');
  }

  if (!destinationInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(owner, destinationAta, recipient, mint, tokenProgramId)
    );
  }

  transaction.add(
    createTransferCheckedInstruction(sourceAta, mint, destinationAta, owner, amount, input.decimals, tokenProgramId)
  );

  return transaction;
}

export async function signAndSendTransaction(transaction: Transaction, keypair: Keypair, connection: Connection): Promise<string> {
  transaction.sign(keypair);
  return connection.sendRawTransaction(transaction.serialize());
}
