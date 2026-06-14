import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_smart_block_actions } from "$lib/features/smart_blocks";
import type { EditorService } from "$lib/features/editor";

function setup() {
  const registry = new ActionRegistry();
  const insert_text = vi.fn();
  const editor = { insert_text } as unknown as EditorService;
  register_smart_block_actions(registry, editor);
  return { registry, insert_text };
}

describe("register_smart_block_actions", () => {
  it("inserts a valid base scaffold that renders at the cursor", async () => {
    const { registry, insert_text } = setup();
    await registry.execute(ACTION_IDS.smart_block_insert_base);
    expect(insert_text).toHaveBeenCalledTimes(1);
    const inserted = insert_text.mock.calls[0]?.[0] as string;
    expect(inserted.startsWith("```base\n")).toBe(true);
    expect(inserted).toContain("view: table");
    expect(inserted).toContain("query:");
  });

  it("inserts a query scaffold", async () => {
    const { registry, insert_text } = setup();
    await registry.execute(ACTION_IDS.smart_block_insert_query);
    expect(insert_text.mock.calls[0]?.[0]).toMatch(/^```query\n/);
  });

  it("inserts a backlinks scaffold", async () => {
    const { registry, insert_text } = setup();
    await registry.execute(ACTION_IDS.smart_block_insert_backlinks);
    expect(insert_text.mock.calls[0]?.[0]).toBe("```backlinks\n```");
  });
});
