import { describe, expect, it } from "vitest";
import { AiStore, DEFAULT_OLLAMA_MODEL } from "$lib/features/ai";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

describe("AiStore", () => {
  it("opens dialog with a fresh execution state", () => {
    const store = new AiStore();
    store.set_ollama_model("mistral:7b");

    store.open_dialog("claude", {
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });

    expect(store.dialog.open).toBe(true);
    expect(store.dialog.provider).toBe("claude");
    expect(store.dialog.prompt).toBe("");
    expect(store.dialog.result).toBeNull();
    expect(store.dialog.ollama_model).toBe("mistral:7b");
  });

  it("tracks execution and preserves ollama model across close", () => {
    const store = new AiStore();
    store.set_ollama_model(DEFAULT_OLLAMA_MODEL);
    store.open_dialog("ollama", {
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });

    store.start_execution();
    store.finish_execution({ success: true, output: "# Updated", error: null });
    store.close_dialog();

    expect(store.dialog.open).toBe(false);
    expect(store.dialog.result).toBeNull();
    expect(store.dialog.ollama_model).toBe(DEFAULT_OLLAMA_MODEL);
  });

  it("updates target and clears stale result", () => {
    const store = new AiStore();
    store.open_dialog("claude", {
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: {
        text: "Demo",
        start: 2,
        end: 6,
      },
      target: "full_note",
    });
    store.finish_execution({ success: true, output: "# Updated", error: null });

    store.set_target("selection");

    expect(store.dialog.context?.target).toBe("selection");
    expect(store.dialog.result).toBeNull();
  });

  it("records conversation turns for executions", () => {
    const store = new AiStore();
    store.open_dialog("claude", {
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });
    store.set_prompt("Tighten this note");

    store.start_execution();
    store.finish_execution({ success: true, output: "# Updated", error: null });

    expect(store.dialog.turns).toHaveLength(1);
    expect(store.dialog.turns[0]).toMatchObject({
      provider: "claude",
      target: "full_note",
      prompt: "Tighten this note",
      status: "completed",
      result: { success: true, output: "# Updated", error: null },
    });
  });
});
