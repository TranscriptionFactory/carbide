import { describe, expect, it } from "vitest";
import { create_smart_block_registry } from "$lib/features/smart_blocks";
import type {
  SmartBlockHandler,
  SmartBlockInstance,
} from "$lib/features/smart_blocks";

function fake_handler(type: string): SmartBlockHandler {
  return {
    type,
    create(): SmartBlockInstance {
      return {
        dom: { nodeType: 1 } as unknown as HTMLElement,
        update() {},
        destroy() {},
      };
    },
  };
}

describe("smart_block_registry", () => {
  it("has() is false and get() is undefined for an unregistered type", () => {
    const registry = create_smart_block_registry();
    expect(registry.has("tasks")).toBe(false);
    expect(registry.get("tasks")).toBeUndefined();
  });

  it("registers a handler retrievable by its type", () => {
    const registry = create_smart_block_registry();
    const handler = fake_handler("tasks");
    registry.register(handler);
    expect(registry.has("tasks")).toBe(true);
    expect(registry.get("tasks")).toBe(handler);
  });

  it("keeps distinct handlers per type", () => {
    const registry = create_smart_block_registry();
    const tasks = fake_handler("tasks");
    const query = fake_handler("query");
    registry.register(tasks);
    registry.register(query);
    expect(registry.get("tasks")).toBe(tasks);
    expect(registry.get("query")).toBe(query);
    expect(registry.has("base")).toBe(false);
  });
});
