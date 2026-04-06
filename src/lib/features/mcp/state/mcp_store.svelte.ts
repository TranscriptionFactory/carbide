import type { McpServerStatus, McpStatusInfo, McpSetupStatus } from "../ports";

export class McpStore {
  status = $state<McpServerStatus>("stopped");
  transport = $state<string | null>(null);
  setup_status = $state<McpSetupStatus | null>(null);

  get is_running(): boolean {
    return this.status === "running";
  }

  set_status(info: McpStatusInfo): void {
    this.status = info.status;
    this.transport = info.transport;
  }

  set_setup_status(status: McpSetupStatus): void {
    this.setup_status = status;
  }

  reset(): void {
    this.status = "stopped";
    this.transport = null;
  }
}
