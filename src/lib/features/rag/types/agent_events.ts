export type AgentPermissionMode = "safe" | "power";

export type AgentDoneStats = {
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
};

// Mirrors the Rust AgentEvent enum: internally tagged with `type`,
// snake_case variants, like AiStreamEvent in src-tauri stream.rs.
export type AgentEvent =
  | { type: "init"; session_id: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; input_summary: string }
  | { type: "tool_end"; name: string; ok: boolean }
  | { type: "done"; stats: AgentDoneStats }
  | { type: "error"; message: string };
