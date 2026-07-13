import { describe, expect, it, vi } from "vitest";
import { DslSuggestController } from "$lib/components/ui/dsl_suggest.svelte";
import type {
  DslSuggestResult,
  DslSuggestProvider,
} from "$lib/shared/types/dsl_suggestion";

function make_controller(result: DslSuggestResult) {
  const apply = vi.fn();
  const provider: DslSuggestProvider = () => result;
  const controller = new DslSuggestController({
    provider,
    get_ctx: () => ({}),
    apply,
  });
  return { controller, apply };
}

function key(k: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: k,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("DslSuggestController", () => {
  it("populates items and opens on non-empty result", () => {
    const { controller } = make_controller({
      from: 0,
      items: [
        { label: "#tag", insert: "#tag" },
        { label: "#todo", insert: "#todo" },
      ],
    });
    controller.update("#t");
    expect(controller.open).toBe(true);
    expect(controller.items).toHaveLength(2);
    expect(controller.from).toBe(0);
    expect(controller.selected_index).toBe(0);
  });

  it("closes on empty result", () => {
    const { controller } = make_controller({ from: 0, items: [] });
    controller.update("xyz");
    expect(controller.open).toBe(false);
    expect(controller.items).toHaveLength(0);
  });

  it("clamps arrow navigation at bounds", () => {
    const { controller } = make_controller({
      from: 0,
      items: [
        { label: "a", insert: "a" },
        { label: "b", insert: "b" },
      ],
    });
    controller.update("");
    controller.keydown(key("ArrowUp"));
    expect(controller.selected_index).toBe(0);
    controller.keydown(key("ArrowDown"));
    expect(controller.selected_index).toBe(1);
    controller.keydown(key("ArrowDown"));
    expect(controller.selected_index).toBe(1);
  });

  it("accepts selected item on Enter and calls apply with from + insert", () => {
    const { controller, apply } = make_controller({
      from: 3,
      items: [
        { label: "first", insert: "first" },
        { label: "second", insert: "second" },
      ],
    });
    controller.update("foobar");
    controller.keydown(key("ArrowDown"));
    const handled = controller.keydown(key("Enter"));
    expect(handled).toBe(true);
    expect(apply).toHaveBeenCalledWith(3, "second");
    expect(controller.open).toBe(false);
  });

  it("closes on Escape and leaves subsequent Enter unhandled", () => {
    const { controller, apply } = make_controller({
      from: 0,
      items: [{ label: "a", insert: "a" }],
    });
    controller.update("a");
    expect(controller.keydown(key("Escape"))).toBe(true);
    expect(controller.open).toBe(false);
    expect(controller.keydown(key("Enter"))).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts the single item on Tab", () => {
    const { controller, apply } = make_controller({
      from: 2,
      items: [{ label: "only", insert: "only" }],
    });
    controller.update("on");
    const handled = controller.keydown(key("Tab"));
    expect(handled).toBe(true);
    expect(apply).toHaveBeenCalledWith(2, "only");
  });

  it("inserts longest common prefix on Tab with multiple items", () => {
    const { controller, apply } = make_controller({
      from: 0,
      items: [
        { label: "status", insert: "status" },
        { label: "state", insert: "state" },
      ],
    });
    controller.update("st");
    const handled = controller.keydown(key("Tab"));
    expect(handled).toBe(true);
    expect(apply).toHaveBeenCalledWith(0, "stat");
  });

  it("returns false on Tab when LCP does not extend the partial", () => {
    const { controller, apply } = make_controller({
      from: 0,
      items: [
        { label: "apple", insert: "apple" },
        { label: "banana", insert: "banana" },
      ],
    });
    controller.update("");
    const handled = controller.keydown(key("Tab"));
    expect(handled).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("returns false for keydown when closed", () => {
    const { controller } = make_controller({ from: 0, items: [] });
    controller.update("xyz");
    expect(controller.keydown(key("ArrowDown"))).toBe(false);
  });

  it("accept splices via the apply callback", () => {
    const { controller, apply } = make_controller({
      from: 5,
      items: [
        { label: "x", insert: "x-insert" },
        { label: "y", insert: "y-insert" },
      ],
    });
    controller.update("hello");
    controller.accept(1);
    expect(apply).toHaveBeenCalledWith(5, "y-insert");
    expect(controller.open).toBe(false);
  });
});
