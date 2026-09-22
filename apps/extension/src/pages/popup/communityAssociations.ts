// Service addresses are independent identifiers. Only explicitly known mappings
// may connect a governance realm to a reputation or verification space.
const GRAPE_REALM = 'By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip';
const REALM_SPACES: Record<string, { reputation: string; verification: string }> = {
  [GRAPE_REALM]: { reputation: GRAPE_REALM, verification: GRAPE_REALM }
};

export function communitySpaceIds(id: string, isGovernanceRealm: boolean) {
  return isGovernanceRealm
    ? REALM_SPACES[id] ?? { reputation: null, verification: null }
    : { reputation: id, verification: id };
}
