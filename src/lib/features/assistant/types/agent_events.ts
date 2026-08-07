import type { RunStats } from "$lib/features/assistant/types/run";

// Mirrors the Rust AgentEvent enum at src-tauri/src/features/ai/agent_stream.rs:
// internally tagged with `type`, snake_case variants, like AiStreamEvent in
// src-tauri stream.rs. The mirror is hand-maintained — there is no codegen link
// — so a change to either side has to be made on both.
//
// `done` carries RunStats rather than a second declaration of the same three
// fields. Rust's AgentRunStats declares all three as required and this side has
// always declared them optional; that looseness is preserved deliberately,
// because a mirror that over-promises is the one that breaks at runtime.

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolLocation = { path: string; line?: number };

export type ToolContent =
  | { kind: "diff"; path: string; old_text: string | null; new_text: string }
  | { kind: "text"; text: string };

export type ToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export type PermissionOptionSpec = {
  option_id: string;
  label: string;
  kind: PermissionOptionKind;
};

export type AgentEvent =
  | { type: "init"; session_id: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool_start";
      id: string;
      name: string;
      kind: ToolKind;
      input_summary: string;
      paths: string[];
      mutating: boolean;
      locations: ToolLocation[];
    }
  | {
      type: "tool_update";
      id: string;
      status: ToolCallStatus;
      content: ToolContent[];
      paths: string[];
    }
  | {
      type: "tool_end";
      id: string;
      name: string;
      ok: boolean;
      result_summary?: string | null;
      paths: string[];
      mutating: boolean;
    }
  | {
      type: "permission_request";
      request_id: string;
      tool_call_id?: string | null;
      name: string;
      kind: ToolKind;
      input_summary: string;
      paths: string[];
      mutating: boolean;
      options: PermissionOptionSpec[];
    }
  | {
      type: "permission_resolved";
      request_id: string;
      outcome: string;
      auto: boolean;
    }
  | { type: "done"; stats: RunStats }
  | { type: "error"; message: string };
