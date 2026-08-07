import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { normalize_path_key } from "$lib/shared/utils/path";

const log = create_logger("watcher_service");

// A self-write's own FS event arrives within milliseconds; anything later is a
// genuine external write (an agent editing on disk) and must not be swallowed.
// Paired with MAX_DELAY in src-tauri/src/features/watcher/service.rs, which
// debounces change events before emitting them. Invariant: this window must
// outlast that debounce, or a self-write's own event arrives after its
// suppression entry expired and Carbide reads its own save as an external edit.
const SUPPRESS_WINDOW_MS = 2_000;

// Rust atomic_write stages "<file>.tmp" beside the target before renaming.
const ATOMIC_WRITE_TMP_SUFFIX = ".tmp";

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
    const key = normalize_path_key(path);
    this.suppressed.set(key, Date.now());
  }

  // One-shot: an armed path swallows exactly the event for its own write. The
  // staging ".tmp" event does not consume the arming, because the real event
  // for the target path still follows it.
  is_suppressed(path: string): boolean {
    const key = normalize_path_key(path);
    if (this.is_key_suppressed(key)) {
      this.suppressed.delete(key);
      return true;
    }
    return (
      key.endsWith(ATOMIC_WRITE_TMP_SUFFIX) &&
      this.is_key_suppressed(key.slice(0, -ATOMIC_WRITE_TMP_SUFFIX.length))
    );
  }

  // Non-consuming variant for events that can precede the write's own change
  // event: atomic_write's tmp→target rename may surface as a Create, with the
  // Modify for the same path still to come.
  peek_suppressed(path: string): boolean {
    return this.is_key_suppressed(normalize_path_key(path));
  }

  private is_key_suppressed(key: string): boolean {
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
