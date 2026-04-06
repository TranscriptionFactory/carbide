export type McpServerStatus = "stopped" | "running";

export type McpStatusInfo = {
  status: McpServerStatus;
  transport: string | null;
};

export type McpSetupStatus = {
  claudeDesktopConfigured: boolean;
  claudeCodeConfigured: boolean;
  httpPort: number;
  tokenExists: boolean;
};

export type McpSetupResult = {
  success: boolean;
  path: string;
  message: string;
};

export interface McpPort {
  start(): Promise<McpStatusInfo>;
  stop(): Promise<void>;
  get_status(): Promise<McpStatusInfo>;
  setup_claude_desktop(): Promise<McpSetupResult>;
  setup_claude_code(vault_id: string): Promise<McpSetupResult>;
  regenerate_token(): Promise<string>;
  get_setup_status(): Promise<McpSetupStatus>;
}
