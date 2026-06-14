import { describe, expect, it } from "vitest";
import { RagStore } from "$lib/features/rag";
import type { RagCitation } from "$lib/features/rag/domain/rag_types";

const citation: RagCitation = {
  index: 1,
  note_path: "notes/q.md",
  title: "Q",
};

describe("RagStore", () => {
  it("appends user and assistant messages with unique ids", () => {
    const store = new RagStore();

    const user = store.add_user_message("what is it?");
    const assistant = store.add_assistant_message("It is 42 [1].", [citation]);

    expect(store.messages).toHaveLength(2);
    expect(user.role).toBe("user");
    expect(assistant.role).toBe("assistant");
    expect(assistant.citations).toEqual([citation]);
    expect(user.id).not.toBe(assistant.id);
  });

  it("tracks loading then clears it on success", () => {
    const store = new RagStore();

    store.start_loading();
    expect(store.is_loading).toBe(true);

    store.finish_loading();
    expect(store.is_loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("sets error and stops loading", () => {
    const store = new RagStore();
    store.start_loading();

    store.set_error("model crashed");

    expect(store.error).toBe("model crashed");
    expect(store.is_loading).toBe(false);
  });

  it("start_loading clears a prior error", () => {
    const store = new RagStore();
    store.set_error("stale");

    store.start_loading();

    expect(store.error).toBeNull();
  });

  it("clear resets messages, loading, and error", () => {
    const store = new RagStore();
    store.add_user_message("q");
    store.set_error("boom");

    store.clear();

    expect(store.messages).toEqual([]);
    expect(store.error).toBeNull();
    expect(store.is_loading).toBe(false);
  });

  it("set_provider updates provider_id", () => {
    const store = new RagStore();
    store.set_provider("ollama");
    expect(store.provider_id).toBe("ollama");
  });
});
