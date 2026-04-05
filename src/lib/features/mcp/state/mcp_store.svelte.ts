import type { McpServerStatus, McpStatusInfo } from "../ports";

export class McpStore {
  status = $state<McpServerStatus>("stopped");
  transport = $state<string | null>(null);

  get is_running(): boolean {
    return this.status === "running";
  }

  set_status(info: McpStatusInfo): void {
    this.status = info.status;
    this.transport = info.transport;
  }

  reset(): void {
    this.status = "stopped";
    this.transport = null;
  }
}
