import { describe, expect, it } from "vitest";
import { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";

describe("IweStore", () => {
  it("starts with idle status", () => {
    const store = new IweStore();
    expect(store.status).toBe("idle");
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("set_status clears error when not error", () => {
    const store = new IweStore();
    store.set_error("something broke");
    expect(store.status).toBe("error");
    expect(store.error).toBe("something broke");

    store.set_status("running");
    expect(store.status).toBe("running");
    expect(store.error).toBeNull();
  });

  it("set_error sets status to error", () => {
    const store = new IweStore();
    store.set_status("running");
    store.set_error("crash");
    expect(store.status).toBe("error");
    expect(store.error).toBe("crash");
  });

  it("set_hover stores hover result", () => {
    const store = new IweStore();
    store.set_hover({ contents: "hello" });
    expect(store.last_hover?.contents).toBe("hello");

    store.set_hover(null);
    expect(store.last_hover).toBeNull();
  });

  it("set_references stores references", () => {
    const store = new IweStore();
    const refs = [
      {
        uri: "file:///test.md",
        range: {
          start_line: 0,
          start_character: 0,
          end_line: 0,
          end_character: 5,
        },
      },
    ];
    store.set_references(refs);
    expect(store.references).toEqual(refs);
  });

  it("set_code_actions stores actions", () => {
    const store = new IweStore();
    const actions = [
      {
        title: "Extract Section",
        kind: "refactor",
        data: null,
        raw_json: "{}",
      },
    ];
    store.set_code_actions(actions);
    expect(store.code_actions).toEqual(actions);
  });

  it("set_symbols stores symbols", () => {
    const store = new IweStore();
    const symbols = [
      {
        name: "Introduction",
        kind: 6,
        location: {
          uri: "file:///test.md",
          range: {
            start_line: 0,
            start_character: 0,
            end_line: 5,
            end_character: 0,
          },
        },
      },
    ];
    store.set_symbols(symbols);
    expect(store.symbols).toEqual(symbols);
  });

  it("set_completions stores completion items", () => {
    const store = new IweStore();
    const items = [
      { label: "[[link]]", detail: "note link", insert_text: "[[link]]" },
    ];
    store.set_completions(items);
    expect(store.completions).toEqual(items);
  });

  it("set_inlay_hints stores hints", () => {
    const store = new IweStore();
    const hints = [
      { position_line: 1, position_character: 0, label: "ref: 3" },
    ];
    store.set_inlay_hints(hints);
    expect(store.inlay_hints).toEqual(hints);
  });

  it("set_loading toggles loading state", () => {
    const store = new IweStore();
    store.set_loading(true);
    expect(store.loading).toBe(true);
    store.set_loading(false);
    expect(store.loading).toBe(false);
  });

  it("reset clears all state", () => {
    const store = new IweStore();
    store.set_status("running");
    store.set_hover({ contents: "test" });
    store.set_references([
      {
        uri: "file:///x.md",
        range: {
          start_line: 0,
          start_character: 0,
          end_line: 0,
          end_character: 0,
        },
      },
    ]);
    store.set_code_actions([
      { title: "X", kind: null, data: null, raw_json: "{}" },
    ]);
    store.set_loading(true);
    store.set_error("err");

    store.reset();

    expect(store.status).toBe("idle");
    expect(store.last_hover).toBeNull();
    expect(store.references).toEqual([]);
    expect(store.code_actions).toEqual([]);
    expect(store.symbols).toEqual([]);
    expect(store.completions).toEqual([]);
    expect(store.inlay_hints).toEqual([]);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });
});
