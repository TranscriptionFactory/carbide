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
  private _tree_refresh_suppressed = false;

  constructor(private readonly port: WatcherPort) {}

  suppress_tree_refresh(): void {
    this._tree_refresh_suppressed = true;
  }

  resume_tree_refresh(): void {
    this._tree_refresh_suppressed = false;
  }

  get is_tree_refresh_suppressed(): boolean {
    return this._tree_refresh_suppressed;
  }

  suppress_next(path: string): void {
    const key = suppressed_path_key(path);
    this.suppressed.set(key, Date.now());
  }

  is_suppressed(path: string): boolean {
    const key = suppressed_path_key(path);
    const stamp = this.suppressed.get(key);
    if (stamp === undefined) return false;
    if (Date.now() - stamp > SUPPRESS_WINDOW_MS) {
      this.suppressed.delete(key);
      return false;
    }
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
