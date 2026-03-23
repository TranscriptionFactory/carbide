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
};

export type ToolchainEvent =
  | { type: "download_progress"; tool_id: string; percent: number }
  | { type: "install_complete"; tool_id: string; version: string; path: string }
  | { type: "install_failed"; tool_id: string; message: string };
