import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("watcher_service");

const SUPPRESS_WINDOW_MS = 2000;

function suppressed_path_key(path: string): string {
  return path.toLowerCase();
}

export class WatcherService {
  private unsubscribe: (() => void) | null = null;
  private suppressed = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly port: WatcherPort) {}

  suppress_next(path: string): void {
    const key = suppressed_path_key(path);
    const existing = this.suppressed.get(key);
    if (existing !== undefined) clearTimeout(existing);
    this.suppressed.set(
      key,
      setTimeout(() => this.suppressed.delete(key), SUPPRESS_WINDOW_MS),
    );
  }

  is_suppressed(path: string): boolean {
    return this.suppressed.has(suppressed_path_key(path));
  }

  async start(vault_id: VaultId): Promise<void> {
    await this.stop();
    try {
      await this.port.watch_vault(vault_id);
    } catch (error) {
      log.from_error("Failed to start vault watcher", error);
    }
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      await this.port.unwatch_vault();
    } catch (error) {
      log.from_error("Failed to stop vault watcher", error);
    }
  }

  subscribe(handler: (event: VaultFsEvent) => void): () => void {
    this.unsubscribe?.();
    const unsub = this.port.subscribe_fs_events(handler);
    this.unsubscribe = unsub;
    return unsub;
  }
}
