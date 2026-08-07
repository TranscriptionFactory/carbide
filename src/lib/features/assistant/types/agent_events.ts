import type { AgentEvent as GeneratedAgentEvent } from "$lib/generated/bindings";
import type { RunStats } from "$lib/features/assistant/types/run";

// The event vocabulary is specta-generated from the Rust AgentEvent enum
// (src-tauri/src/features/ai/agent_stream.rs) — one source, no hand mirror.
export type {
  PermissionOptionKind,
  PermissionOptionSpec,
  ToolCallStatus,
  ToolContent,
  ToolKind,
  ToolLocation,
} from "$lib/generated/bindings";

// `done` carries RunStats rather than the generated AgentRunStats: Rust
// declares all three fields required and this side has always declared them
// optional; that looseness is preserved deliberately, because a mirror that
// over-promises is the one that breaks at runtime.
export type AgentEvent =
  | Exclude<GeneratedAgentEvent, { type: "done" }>
  | { type: "done"; stats: RunStats };
