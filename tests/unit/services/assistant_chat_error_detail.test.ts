import { afterEach, describe, expect, it, vi } from "vitest";
import { create_chat_seam } from "../helpers/assistant_chat_seam";
import type {
  AssistantChatStreamEvent,
  AssistantUserError,
  RunOutcome,
  RunStarter,
} from "$lib/features/assistant";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const provider: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
  model: "does-not-exist",
};

const search = {
  search_blocks: vi.fn().mockResolvedValue([]),
  hybrid_search: vi.fn().mockResolvedValue([
    {
      note: {
        id: "1",
        path: "notes/q.md",
        name: "q",
        title: "Q",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 100,
        file_type: "md",
      },
      score: 0.9,
      source: "both",
    },
  ]),
};
const notes = { read_note: vi.fn().mockResolvedValue({ markdown: "Body." }) };

// The kernel's error event carries only the humanized message; the raw
// provider text reaches callsites through the run outcome.
function failing_run(error: AssistantUserError): RunStarter {
  return {
    start(_spec, sink) {
      const outcome: RunOutcome = { status: "error", error, text: "" };
      sink?.on_event("run-1", { type: "error", message: error.message });
      sink?.on_end?.("run-1", outcome);
      return Promise.resolve({
        id: "run-1",
        stop: () => {},
        outcome: Promise.resolve(outcome),
      });
    },
  };
}

async function error_event_of(
  error: AssistantUserError,
): Promise<AssistantChatStreamEvent | undefined> {
  const chat = create_chat_seam({
    search,
    notes,
    run_starter: failing_run(error),
  }).chat;
  const events: AssistantChatStreamEvent[] = [];
  for await (const event of chat.query({
    question: "q",
    provider_config: provider,
  })) {
    events.push(event);
  }
  return events.find((event) => event.type === "error");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat failure detail", () => {
  it("forwards the raw provider text alongside the humanized message", async () => {
    const event = await error_event_of({
      message: "Claude Code request failed — see logs for details.",
      detail: "There's an issue with the selected model (does-not-exist).",
    });

    expect(event).toEqual({
      type: "error",
      error: "Claude Code request failed — see logs for details.",
      detail: "There's an issue with the selected model (does-not-exist).",
    });
  });

  it("omits the detail when it only repeats the message", async () => {
    const event = await error_event_of({
      message: "Ask needs an open vault.",
      detail: "Ask needs an open vault.",
    });

    expect(event).toEqual({ type: "error", error: "Ask needs an open vault." });
  });

  it("writes the detail into the webview log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await error_event_of({
      message: "Claude Code request failed — see logs for details.",
      detail: "model_not_found: does-not-exist",
    });

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "[assistant_chat_service] Chat stream failed Claude Code request failed — see logs for details. detail=model_not_found: does-not-exist",
      );
    });
  });
});
