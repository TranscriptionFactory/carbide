import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("watcher_service");

export class WatcherService {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly port: WatcherPort) {}

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
