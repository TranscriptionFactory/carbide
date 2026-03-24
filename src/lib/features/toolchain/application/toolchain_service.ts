import type { ToolchainPort } from "$lib/features/toolchain/ports";
import type { ToolchainStore } from "$lib/features/toolchain/state/toolchain_store.svelte";
import type { ToolchainEvent } from "$lib/features/toolchain/types";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("toolchain_service");

export class ToolchainService {
  private unsubscribe_events: (() => void) | null = null;

  constructor(
    private readonly port: ToolchainPort,
    private readonly store: ToolchainStore,
  ) {
    this.unsubscribe_events = this.port.subscribe_events((event) => {
      this.handle_event(event);
    });
  }

  async load(): Promise<void> {
    try {
      const tools = await this.port.list_tools();
      this.store.set_tools(tools);
    } catch (e) {
      log.from_error("Failed to load tools", e);
    }
  }

  async install(tool_id: string): Promise<void> {
    this.store.update_status(tool_id, { type: "downloading", percent: 0 });
    try {
      await this.port.install(tool_id);
    } catch (e) {
      log.from_error("Failed to install tool", e);
      this.store.update_status(tool_id, {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async uninstall(tool_id: string): Promise<void> {
    try {
      await this.port.uninstall(tool_id);
      await this.load();
    } catch (e) {
      log.from_error("Failed to uninstall tool", e);
    }
  }

  async resolve(tool_id: string): Promise<string | null> {
    try {
      return await this.port.resolve(tool_id);
    } catch (e) {
      log.from_error("Failed to resolve tool path", e);
      return null;
    }
  }

  dispose(): void {
    if (this.unsubscribe_events) {
      this.unsubscribe_events();
      this.unsubscribe_events = null;
    }
  }

  private handle_event(event: ToolchainEvent): void {
    if (event.type === "download_progress") {
      this.store.update_status(event.tool_id, {
        type: "downloading",
        percent: event.percent,
      });
    } else if (event.type === "install_complete") {
      this.store.update_status(event.tool_id, {
        type: "installed",
        version: event.version,
        path: event.path,
      });
    } else if (event.type === "install_failed") {
      this.store.update_status(event.tool_id, {
        type: "error",
        message: event.message,
      });
    }
  }
}
