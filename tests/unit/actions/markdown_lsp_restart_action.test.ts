import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  register_iwe_actions,
  type IweActionDeps,
} from "$lib/features/markdown_lsp/application/iwe_actions";

describe("markdown LSP restart action", () => {
  it("delegates to the markdown LSP service", async () => {
    const registry = new ActionRegistry();
    const restart = vi.fn().mockResolvedValue(undefined);
    register_iwe_actions({
      registry,
      markdown_lsp_service: { restart },
    } as unknown as IweActionDeps);

    await registry.execute(ACTION_IDS.markdown_lsp_restart);

    expect(restart).toHaveBeenCalledOnce();
  });
});
