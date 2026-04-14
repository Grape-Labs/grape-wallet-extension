import { describe, expect, it } from 'vitest';

import { createPermissionsState, grantPermissions, hasPermission, listPermissions, revokeOriginPermissions } from '../src/permissions';

describe('permissions', () => {
  it('grants and revokes per-origin permissions', () => {
    const initial = createPermissionsState();
    const granted = grantPermissions(initial, 'https://example.com', ['solana:accounts', 'sui:accounts', 'monad:sign'], {
      title: 'Example'
    });

    expect(hasPermission(granted, 'https://example.com', 'solana:accounts')).toBe(true);
    expect(hasPermission(granted, 'https://example.com', 'sui:accounts')).toBe(true);
    expect(hasPermission(granted, 'https://example.com', 'monad:sign')).toBe(true);
    expect(listPermissions(granted)).toHaveLength(1);

    const revoked = revokeOriginPermissions(granted, 'https://example.com');
    expect(hasPermission(revoked, 'https://example.com', 'solana:accounts')).toBe(false);
    expect(hasPermission(revoked, 'https://example.com', 'sui:accounts')).toBe(false);
    expect(hasPermission(revoked, 'https://example.com', 'monad:sign')).toBe(false);
  });
});
