export const GRAPE_VERIFICATION_REQUIRED_DAO_ID = 'By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip';

export type AccessSessionState = {
  granted: boolean;
  requiredDaoId: string;
  grantedAt: number | null;
  lastCheckedAt: number | null;
  qualifyingWalletPublicKey?: string;
};

export type VerificationAccessIdentity = {
  daoId: string;
  verified: boolean;
  expiresAt?: number | null;
};

function normalizeVerificationExpiryMs(expiresAt?: number | null): number | null {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }

  return expiresAt >= 1_000_000_000_000 ? expiresAt : expiresAt * 1000;
}

export function hasRequiredGrapeVerificationAccess(
  identities: VerificationAccessIdentity[],
  now = Date.now(),
  requiredDaoId = GRAPE_VERIFICATION_REQUIRED_DAO_ID
): boolean {
  return identities.some((identity) => {
    if (identity.daoId !== requiredDaoId || !identity.verified) {
      return false;
    }

    const expiresAtMs = normalizeVerificationExpiryMs(identity.expiresAt);
    return expiresAtMs === null || expiresAtMs > now;
  });
}

/** Seed Grape once for existing installations without replacing tracked spaces. */
export function seedGrapeCommunitySpaces(value: string[] | null | undefined, defaultsApplied = false): string[] {
  const spaces = Array.isArray(value) ? value : [];
  return Array.from(new Set([
    ...spaces.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean),
    ...(defaultsApplied ? [] : [GRAPE_VERIFICATION_REQUIRED_DAO_ID])
  ]));
}
