import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiMessage, ToolSelector } from "$lib/features/ai";
// An agent turn replays tool calls and tool results, which the text channel's
// AiMessage cannot express — it has no "tool" role. Same import direction as
// the AgentEvent one the transport already carries.
import type { AgentHistoryMessage } from "$lib/features/rag";

export type RunId = string;

// The one sentinel the Rust side emits for a cancelled run, on both the
// streaming and the blocking channel (`pipeline::ABORTED_ERROR`). It is a
// cancellation ack, never an error to show anyone.
export const ABORTED_ERROR = "aborted";

export type RunKind = "inline" | "note" | "chat" | "agent" | "background";

export type RunStatus =
  | "starting"
  | "streaming"
  | "stopping"
  | "done"
  | "error"
  | "aborted";

export type AssistantUserError = { message: string; detail: string };

export type RunStats = {
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
};

export type RunEvent =
  | { type: "session"; provider_session_id: string }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
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
  // Raw provider text. The kernel is the only humanization choke point (I1),
  // because it is the only layer that knows which provider produced this.
  | { type: "error"; message: string }
  | { type: "done"; stats?: RunStats };

export type RunRequest =
  | {
      mode: "text";
      system_prompt: string;
      messages: AiMessage[];
      model?: string;
      // A CLI provider whose args carry {output_file} cannot stream, so the
      // transport runs it one-shot instead. These are that call's parameters;
      // a streaming transport ignores them.
      note_path?: string;
      timeout_seconds?: number | null;
    }
  | {
      mode: "agent";
      prompt: string;
      toolset: ToolSelector;
      history: AgentHistoryMessage[];
      resume_session_id?: string;
      backend: "harness" | "native";
    };

export type RunOrigin = {
  note_path?: string;
  session_id?: string;
};

export type RunSpec = {
  kind: RunKind;
  label: string;
  request: RunRequest;
  provider?: AiProviderConfig;
  origin?: RunOrigin;
};

export type RunRecord = {
  id: RunId;
  kind: RunKind;
  label: string;
  status: RunStatus;
  started_at: number;
  provider_id: string | null;
  provider_session_id: string | null;
  origin: RunOrigin;
  error: AssistantUserError | null;
  stats: RunStats | null;
};

export type RunOutcome =
  | { status: "done"; text: string; stats: RunStats | null }
  | { status: "error"; error: AssistantUserError; text: string }
  | { status: "aborted"; text: string };

export type RunHandle = {
  id: RunId;
  stop: () => void;
  outcome: Promise<RunOutcome>;
};

export type RunSink = {
  on_event: (run_id: RunId, event: RunEvent) => void;
  // An aborted run produces no terminal event, so a sink that owns transcript
  // state needs this to close the transcript out. Always fires exactly once,
  // after the last on_event and before the run's awaiter resumes.
  on_end?: (run_id: RunId, outcome: RunOutcome) => void;
};

export type RunStarter = {
  start: (spec: RunSpec, sink?: RunSink) => Promise<RunHandle>;
};
