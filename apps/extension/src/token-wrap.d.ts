declare module '@solana-program/token-wrap' {
  import type { Address, Instruction, Rpc, TransactionSigner } from '@solana/kit';

  export const TOKEN_WRAP_PROGRAM_ADDRESS: Address;

  export function findWrappedMintPda(input: {
    unwrappedMint: Address;
    wrappedTokenProgram: Address;
  }): Promise<readonly [Address, number]>;

  export function fetchMaybeBackpointerFromSeeds(
    rpc: Rpc<any>,
    input: { wrappedMint: Address }
  ): Promise<{ exists: false; address: Address } | { exists: true; address: Address; data: { unwrappedMint: Address } }>;

  export function createMint(input: {
    rpc: Rpc<any>;
    unwrappedMint: Address;
    wrappedTokenProgram: Address;
    payer: TransactionSigner;
    idempotent?: boolean;
  }): Promise<{ wrappedMint: Address; backpointer: Address; ixs: Instruction[] }>;

  export function createEscrowAccount(input: {
    rpc: Rpc<any>;
    payer: TransactionSigner;
    unwrappedMint: Address;
    wrappedTokenProgram: Address;
  }): Promise<{ kind: 'already_exists'; account: unknown } | { kind: 'instructions_to_create'; address: Address; ixs: Instruction[] }>;

  export function singleSignerWrap(input: {
    rpc: Rpc<any>;
    payer: TransactionSigner;
    unwrappedTokenAccount: Address;
    wrappedTokenProgram: Address;
    amount: bigint;
    unwrappedMint?: Address;
    unwrappedTokenProgram?: Address;
    recipientWrappedTokenAccount?: Address;
  }): Promise<{ ixs: Instruction[]; recipientWrappedTokenAccount: Address; escrowAccount: Address; amount: bigint }>;

  export function singleSignerUnwrap(input: {
    rpc: Rpc<any>;
    payer: TransactionSigner;
    wrappedTokenAccount: Address;
    amount: bigint;
    recipientUnwrappedToken: Address;
    unwrappedMint?: Address;
    wrappedTokenProgram?: Address;
    unwrappedTokenProgram?: Address;
  }): Promise<{ ixs: Instruction[]; recipientUnwrappedToken: Address; amount: bigint }>;
}
