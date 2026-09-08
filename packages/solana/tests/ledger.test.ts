import { describe, expect, it } from 'vitest';

import { getSolanaLedgerDerivationCandidates } from '../src/ledger';

describe('Solana Ledger derivation discovery', () => {
  it('includes the root path before both indexed path families', () => {
    expect(getSolanaLedgerDerivationCandidates(0, 2).map((candidate) => candidate.derivationPath)).toEqual([
      `44'/501'`,
      `44'/501'/0'`,
      `44'/501'/0'/0'`,
      `44'/501'/1'`,
      `44'/501'/1'/0'`
    ]);
  });

  it('does not repeat the root path in a later paginated range', () => {
    expect(getSolanaLedgerDerivationCandidates(16, 1).map((candidate) => candidate.derivationPath)).toEqual([
      `44'/501'/16'`,
      `44'/501'/16'/0'`
    ]);
  });
});
