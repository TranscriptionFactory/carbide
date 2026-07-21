import { describe, expect, it } from "vitest";
import { AiStore } from "$lib/features/ai";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

describe("AiStore", () => {
  it("opens dialog with a fresh execution state", () => {
    const store = new AiStore();

    store.open_dialog("claude", {
      kind: "note",
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });

    expect(store.dialog.open).toBe(true);
    expect(store.dialog.provider_id).toBe("claude");
    expect(store.dialog.prompt).toBe("");
    expect(store.dialog.result).toBeNull();
  });

  it("preserves provider across close", () => {
    const store = new AiStore();
    store.open_dialog("ollama", {
      kind: "note",
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
    expect(store.dialog.provider_id).toBe("ollama");
  });

  it("keeps streaming reasoning separate from output and stores it on the turn", () => {
    const store = new AiStore();
    store.open_dialog("ollama", {
      kind: "note",
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });

    store.start_execution();
    store.set_streaming_reasoning("thinking...");
    store.set_streaming_text("partial answer");
    store.finish_execution({ success: true, output: "answer", error: null });

    const turn = store.dialog.turns.at(-1);
    expect(turn?.reasoning).toBe("thinking...");
    expect(turn?.result?.output).toBe("answer");
    expect(store.dialog.streaming_reasoning).toBeNull();
    expect(store.dialog.streaming_text).toBeNull();
  });

  it("clears streaming reasoning on the next execution", () => {
    const store = new AiStore();
    store.open_dialog("ollama", {
      kind: "note",
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });

    store.start_execution();
    store.set_streaming_reasoning("old thoughts");
    store.finish_execution({ success: true, output: "one", error: null });
    store.start_execution();
    store.finish_execution({ success: true, output: "two", error: null });

    const turn = store.dialog.turns.at(-1);
    expect(turn?.reasoning).toBeUndefined();
  });

  it("updates target and clears stale result", () => {
    const store = new AiStore();
    store.open_dialog("claude", {
      kind: "note",
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
      kind: "note",
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
      provider_id: "claude",
      target: "full_note",
      prompt: "Tighten this note",
      status: "completed",
      result: { success: true, output: "# Updated", error: null },
    });
  });

  function open_demo(store: AiStore) {
    store.open_dialog("claude", {
      kind: "note",
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# Demo"),
      selection: null,
      target: "full_note",
    });
  }

  it("keeps completed turns across close and reopen", () => {
    const store = new AiStore();
    open_demo(store);
    store.set_prompt("First question");
    store.start_execution();
    store.finish_execution({ success: true, output: "Answer", error: null });

    store.close_dialog();
    expect(store.dialog.turns).toHaveLength(1);

    open_demo(store);
    expect(store.dialog.turns).toHaveLength(1);
    expect(store.dialog.turns[0]?.prompt).toBe("First question");
    expect(store.dialog.result).toBeNull();
  });

  it("drops pending turns when the dialog closes mid-execution", () => {
    const store = new AiStore();
    open_demo(store);
    store.set_prompt("Slow question");
    store.start_execution();

    store.close_dialog();

    expect(store.dialog.turns).toHaveLength(0);
  });

  it("continues turn ids after reopen without collisions", () => {
    const store = new AiStore();
    open_demo(store);
    store.start_execution();
    store.finish_execution({ success: true, output: "one", error: null });
    store.close_dialog();

    open_demo(store);
    store.start_execution();
    store.finish_execution({ success: true, output: "two", error: null });

    const ids = store.dialog.turns.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hydrates persisted turns and resumes id sequence", () => {
    const store = new AiStore();
    store.hydrate_turns([
      {
        id: 4,
        provider_id: "claude",
        target: "full_note",
        mode: "ask",
        prompt: "old question",
        status: "completed",
        result: { success: true, output: "old answer", error: null },
      },
    ]);

    expect(store.dialog.turns).toHaveLength(1);
    expect(store.dialog.next_turn_id).toBe(5);

    open_demo(store);
    store.start_execution();
    expect(store.dialog.turns.at(-1)?.id).toBe(5);
  });

  it("preserves an in-flight pending turn when hydration lands mid-execution", () => {
    const store = new AiStore();
    open_demo(store);
    store.set_prompt("In-flight question");
    store.start_execution();

    store.hydrate_turns([
      {
        id: 1,
        provider_id: "claude",
        target: "full_note",
        mode: "ask",
        prompt: "old question",
        status: "completed",
        result: { success: true, output: "old answer", error: null },
      },
    ]);

    expect(store.dialog.turns).toHaveLength(2);
    expect(store.dialog.turns.at(-1)).toMatchObject({
      prompt: "In-flight question",
      status: "pending",
    });
    const ids = store.dialog.turns.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);

    store.finish_execution({ success: true, output: "fresh", error: null });
    expect(store.dialog.turns.at(-1)).toMatchObject({
      status: "completed",
      result: { success: true, output: "fresh", error: null },
    });
    expect(store.dialog.turns[0]?.result?.output).toBe("old answer");
  });

  it("does not overwrite an already-completed turn on finish_execution", () => {
    const store = new AiStore();
    store.hydrate_turns([
      {
        id: 1,
        provider_id: "claude",
        target: "full_note",
        mode: "ask",
        prompt: "historical question",
        status: "completed",
        result: { success: true, output: "historical answer", error: null },
      },
    ]);

    store.finish_execution({ success: false, output: "", error: "boom" });

    expect(store.dialog.is_executing).toBe(false);
    expect(store.dialog.turns[0]).toMatchObject({
      status: "completed",
      result: { success: true, output: "historical answer", error: null },
    });
  });

  it("clears all turns and resets the id sequence", () => {
    const store = new AiStore();
    open_demo(store);
    store.start_execution();
    store.finish_execution({ success: true, output: "one", error: null });

    store.clear_turns();

    expect(store.dialog.turns).toHaveLength(0);
    expect(store.dialog.next_turn_id).toBe(1);
  });
});
