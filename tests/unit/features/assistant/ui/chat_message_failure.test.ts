/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { AssistantMessage } from "$lib/features/assistant";
import RagMessageView from "$lib/features/assistant/ui/chat_message.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

afterEach(() => {
  document.body.innerHTML = "";
});

function render(message: AssistantMessage) {
  const stores = create_app_stores();
  return render_with_app_context(RagMessageView, {
    app_context: { stores } as unknown as Partial<AppContext>,
    props: { message },
  });
}

describe("rag_message failure marker", () => {
  it("marks a textless turn that failed after running tools", () => {
    const { target, cleanup } = render({
      id: "a1",
      role: "assistant",
      content: "",
      citations: [],
      tool_events: [
        {
          name: "read_note",
          input_summary: '{"path":"clips/scraped.md"}',
          ok: true,
        },
      ],
      error: "blocked by the provider",
    });

    expect(target.textContent).toContain("Failed: blocked by the provider");
    expect(target.textContent).toContain("read_note");
    cleanup();
  });

  it("shows no failure marker on a turn that succeeded", () => {
    const { target, cleanup } = render({
      id: "a2",
      role: "assistant",
      content: "All good.",
      citations: [],
    });

    expect(target.textContent).not.toContain("Failed:");
    cleanup();
  });
});
