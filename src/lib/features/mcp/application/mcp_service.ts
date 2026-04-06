import type { McpPort, McpSetupResult } from "../ports";
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

  async setup_claude_desktop(): Promise<McpSetupResult> {
    const result = await this.port.setup_claude_desktop();
    await this.refresh_setup_status();
    return result;
  }

  async setup_claude_code(vault_id: string): Promise<McpSetupResult> {
    const result = await this.port.setup_claude_code(vault_id);
    await this.refresh_setup_status();
    return result;
  }

  async regenerate_token(): Promise<string> {
    return this.port.regenerate_token();
  }

  async refresh_setup_status(): Promise<void> {
    try {
      const status = await this.port.get_setup_status();
      this.store.set_setup_status(status);
    } catch {
      // non-critical
    }
  }
}
