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

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
};

export type McpToolResult = {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
};

export interface McpPort {
  start(): Promise<McpStatusInfo>;
  stop(): Promise<void>;
  get_status(): Promise<McpStatusInfo>;
  setup_claude_desktop(): Promise<McpSetupResult>;
  setup_claude_code(vault_id: string): Promise<McpSetupResult>;
  regenerate_token(): Promise<string>;
  get_setup_status(): Promise<McpSetupStatus>;
  list_tool_definitions(): Promise<McpToolDefinition[]>;
  call_tool(
    tool_name: string,
    tool_arguments?: Record<string, unknown>,
  ): Promise<McpToolResult>;
}
