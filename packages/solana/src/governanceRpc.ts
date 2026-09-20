import type { Connection } from '@solana/web3.js';

// The governance SDK fans out several account-type scans per request. Limit actual
// RPC starts, not just the number of concurrently loaded DAOs.
const queues = new Map<string, Promise<void>>();
const wrappers = new WeakMap<Connection, Connection>();
const READ_METHODS = new Set(['getProgramAccounts', 'getAccountInfo', 'getMultipleAccountsInfo']);

export function createGovernanceRpcConnection(connection: Connection): Connection {
  const existing = wrappers.get(connection);
  if (existing) return existing;
  const wrapped = new Proxy(connection, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!READ_METHODS.has(String(property))) return value.bind(target);
      return async (...args: unknown[]) => {
        const endpoint = target.rpcEndpoint;
        const previous = queues.get(endpoint) ?? Promise.resolve();
        const next = previous.then(() => new Promise<void>((resolve) => setTimeout(resolve, 180)));
        queues.set(endpoint, next);
        void next.then(() => { if (queues.get(endpoint) === next) queues.delete(endpoint); });
        await previous;
        return value.apply(target, args);
      };
    }
  });
  wrappers.set(connection, wrapped);
  wrappers.set(wrapped, wrapped);
  return wrapped;
}

/** Share identical reads only within one refresh, never across votes or refreshes. */
export function createGovernanceRpcReadSession(connection: Connection): Connection {
  const paced = createGovernanceRpcConnection(connection);
  const reads = new Map<string, Promise<unknown>>();
  const session = new Proxy(paced, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function' || !READ_METHODS.has(String(property))) return value;
      return (...args: unknown[]) => {
        const key = String(property) + ':' + JSON.stringify(args);
        const existing = reads.get(key);
        if (existing) return existing;
        const pending = Promise.resolve().then(() => value(...args));
        reads.set(key, pending);
        void pending.catch(() => { if (reads.get(key) === pending) reads.delete(key); });
        return pending;
      };
    }
  });
  wrappers.set(session, session);
  return session;
}
