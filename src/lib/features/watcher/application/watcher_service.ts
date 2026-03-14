import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("watcher_service");

const SUPPRESS_WINDOW_MS = 10_000;

function suppressed_path_key(path: string): string {
  return path.toLowerCase();
}

export class WatcherService {
  private port_unsubscribe: (() => void) | null = null;
  private handlers = new Set<(event: VaultFsEvent) => void>();
  private suppressed = new Map<string, number>();
  private lifecycle = Promise.resolve();

  constructor(private readonly port: WatcherPort) {}

  suppress_next(path: string): void {
    const key = suppressed_path_key(path);
    const count = (this.suppressed.get(key) ?? 0) + 1;
    this.suppressed.set(key, count);
    setTimeout(() => {
      const current = this.suppressed.get(key);
      if (current === undefined) return;
      if (current <= 1) this.suppressed.delete(key);
      else this.suppressed.set(key, current - 1);
    }, SUPPRESS_WINDOW_MS);
  }

  is_suppressed(path: string): boolean {
    const key = suppressed_path_key(path);
    const count = this.suppressed.get(key);
    if (!count) return false;
    if (count === 1) this.suppressed.delete(key);
    else this.suppressed.set(key, count - 1);
    return true;
  }

  async start(vault_id: VaultId): Promise<void> {
    await this.run_lifecycle(async () => {
      await this.teardown_port();
      this.port_unsubscribe = this.port.subscribe_fs_events((event) => {
        for (const handler of this.handlers) {
          handler(event);
        }
      });
      try {
        await this.port.watch_vault(vault_id);
      } catch (error) {
        log.from_error("Failed to start vault watcher", error);
      }
    });
  }

  async stop(): Promise<void> {
    await this.run_lifecycle(async () => {
      await this.teardown_port();
    });
  }

  subscribe(handler: (event: VaultFsEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private run_lifecycle(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async teardown_port(): Promise<void> {
    if (this.port_unsubscribe) {
      const unsub = this.port_unsubscribe;
      this.port_unsubscribe = null;
      unsub();
    }
    try {
      await this.port.unwatch_vault();
    } catch (error) {
      log.from_error("Failed to stop vault watcher", error);
    }
  }
}
