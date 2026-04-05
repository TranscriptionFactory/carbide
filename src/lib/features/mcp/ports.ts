export type McpServerStatus = "stopped" | "running";

export type McpStatusInfo = {
  status: McpServerStatus;
  transport: string | null;
};

export interface McpPort {
  start(): Promise<McpStatusInfo>;
  stop(): Promise<void>;
  get_status(): Promise<McpStatusInfo>;
}
