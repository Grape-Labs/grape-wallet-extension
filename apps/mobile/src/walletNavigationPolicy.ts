export const WALLET_TAB_ROUTES = ['home', 'activity', 'discover', 'settings'] as const;
export const WALLET_STACK_ROUTES = ['tabs', 'asset', 'assetActivity', 'send', 'swap', 'bridge', 'rebalance', 'receive', 'governance'] as const;
export type WalletTab = typeof WALLET_TAB_ROUTES[number];
export const isWalletTab = (name: string): name is WalletTab => (WALLET_TAB_ROUTES as readonly string[]).includes(name);

/** Defer route removal during signing; the final destination supersedes intermediate closes. */
export function createDeferredWalletNavigation() {
  let pending: (() => void) | null = null;
  return {
    request(action: () => void, blocked: boolean) {
      if (blocked) pending = action;
      else { pending = null; action(); }
    },
    flush(blocked: boolean) {
      if (blocked || !pending) return;
      const action = pending;
      pending = null;
      action();
    },
    clear() { pending = null; }
  };
}
