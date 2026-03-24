export type ToolCapability =
  | { type: "document_sync"; debounce_ms: number; skip_draft: boolean }
  | { type: "diagnostics" }
  | { type: "completion" }
  | { type: "hover" }
  | { type: "references" }
  | { type: "definition" }
  | { type: "rename" }
  | { type: "formatting" }
  | { type: "code_actions" }
  | { type: "workspace_symbols" }
  | { type: "inlay_hints" };

export type ToolStatus =
  | { type: "not_installed" }
  | { type: "downloading"; percent: number }
  | { type: "installed"; version: string; path: string }
  | { type: "error"; message: string };

export type ToolInfo = {
  id: string;
  display_name: string;
  github_repo: string;
  version: string;
  status: ToolStatus;
  capabilities: ToolCapability[];
};

export type ToolchainEvent =
  | { type: "download_progress"; tool_id: string; percent: number }
  | { type: "install_complete"; tool_id: string; version: string; path: string }
  | { type: "install_failed"; tool_id: string; message: string };
