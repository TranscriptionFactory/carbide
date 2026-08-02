import { describe, expect, it } from "vitest";
import { AssistantSessionService } from "$lib/features/assistant";
import { create_test_assistant_session_persistence_adapter } from "../../adapters/test_assistant_session_persistence_adapter";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_aborting_run_starter } from "../helpers/aborting_run_starter";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RunEvent } from "$lib/features/assistant";

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "cli", command: "ollama", args: ["run", "{model}"] },
  model: "qwen3:8b",
};

const exchange = [
  { id: "u", role: "user" as const, content: "hi", citations: [] },
  { id: "a", role: "assistant" as const, content: "hello", citations: [] },
];

function make_service(starter: unknown) {
  return new AssistantSessionService(
    create_test_assistant_session_persistence_adapter(),
    starter as never,
  );
}

describe("AssistantSessionService.generate_title", () => {
  it("ignores reasoning chunks when accumulating the title", async () => {
    const starter = create_test_run_starter((): RunEvent[] => [
      { type: "reasoning", text: "Pondering titles" },
      { type: "text", text: "Meeting Notes" },
      { type: "done" },
    ]);

    const title = await make_service(starter).generate_title(
      provider,
      exchange,
    );

    expect(title).toBe("Meeting Notes");
  });

  // Half a title is still a plausible-looking title, which is why a stopped
  // run used to rename the chat to whatever arrived first.
  it("returns nothing when the run is stopped mid-title", async () => {
    const starter = create_aborting_run_starter([
      { type: "text", text: "Meeting" },
    ]);

    const title = await make_service(starter).generate_title(
      provider,
      exchange,
    );

    expect(title).toBeNull();
  });
});
