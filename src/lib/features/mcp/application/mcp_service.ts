import type { McpPort } from "../ports";
import type { McpStore } from "../state/mcp_store.svelte";

export class McpService {
  constructor(
    private readonly port: McpPort,
    private readonly store: McpStore,
  ) {}

  async start(): Promise<void> {
    try {
      const info = await this.port.start();
      this.store.set_status(info);
    } catch {
      this.store.reset();
    }
  }

  async stop(): Promise<void> {
    try {
      await this.port.stop();
    } catch {
      // swallow — best-effort shutdown
    } finally {
      this.store.reset();
    }
  }

  async refresh_status(): Promise<void> {
    try {
      const info = await this.port.get_status();
      this.store.set_status(info);
    } catch {
      this.store.reset();
    }
  }
}
