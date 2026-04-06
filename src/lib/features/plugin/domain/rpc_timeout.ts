export class RpcTimeoutError extends Error {
  constructor(
    public readonly method: string,
    public readonly timeout_ms: number,
  ) {
    super(`RPC call "${method}" timed out after ${timeout_ms}ms`);
    this.name = "RpcTimeoutError";
  }
}

const FS_METHODS = new Set([
  "vault.read",
  "vault.create",
  "vault.modify",
  "vault.delete",
  "vault.list",
]);

const DEFAULT_TIMEOUT_MS = 5_000;
const FS_TIMEOUT_MS = 30_000;

export function get_rpc_timeout(method: string): number {
  return FS_METHODS.has(method) ? FS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export function with_timeout<T>(
  promise: Promise<T>,
  method: string,
  timeout_ms?: number,
): Promise<T> {
  const ms = timeout_ms ?? get_rpc_timeout(method);
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new RpcTimeoutError(method, ms)), ms);
    }),
  ]);
}
