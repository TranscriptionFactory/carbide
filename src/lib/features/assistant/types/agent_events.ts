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
export type AgentEvent =
  | { type: "init"; session_id: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool_start";
      name: string;
      input_summary: string;
      paths: string[];
      mutating: boolean;
    }
  | {
      type: "tool_end";
      name: string;
      ok: boolean;
      result_summary?: string | null;
    }
  | { type: "done"; stats: RunStats }
  | { type: "error"; message: string };
