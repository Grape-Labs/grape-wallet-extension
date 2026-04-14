export type PermissionKind =
  | 'solana:accounts'
  | 'solana:sign'
  | 'sui:accounts'
  | 'sui:sign'
  | 'monad:accounts'
  | 'monad:sign'
  | 'ethereum:accounts'
  | 'ethereum:sign';

export type OriginPermission = {
  origin: string;
  permissions: PermissionKind[];
  createdAt: number;
  updatedAt: number;
  faviconUrl?: string;
  title?: string;
};

export type PermissionsState = {
  origins: Record<string, OriginPermission>;
};

export function createPermissionsState(): PermissionsState {
  return {
    origins: {}
  };
}

export function grantPermissions(
  state: PermissionsState,
  origin: string,
  permissions: PermissionKind[],
  metadata?: Pick<OriginPermission, 'faviconUrl' | 'title'>
): PermissionsState {
  const existing = state.origins[origin];
  const timestamp = Date.now();
  const nextPermissions = Array.from(new Set([...(existing?.permissions ?? []), ...permissions]));

  return {
    origins: {
      ...state.origins,
      [origin]: {
        origin,
        permissions: nextPermissions,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        faviconUrl: metadata?.faviconUrl ?? existing?.faviconUrl,
        title: metadata?.title ?? existing?.title
      }
    }
  };
}

export function revokeOriginPermissions(state: PermissionsState, origin: string): PermissionsState {
  const nextOrigins = { ...state.origins };
  delete nextOrigins[origin];
  return {
    origins: nextOrigins
  };
}

export function hasPermission(state: PermissionsState, origin: string, permission: PermissionKind): boolean {
  return state.origins[origin]?.permissions.includes(permission) ?? false;
}

export function listPermissions(state: PermissionsState): OriginPermission[] {
  return Object.values(state.origins).sort((left, right) => right.updatedAt - left.updatedAt);
}
