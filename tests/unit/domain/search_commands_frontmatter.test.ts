import { describe, expect, it } from "vitest";
import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
import { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

describe("command palette: toggle_frontmatter", () => {
  it("is registered in COMMANDS_REGISTRY", () => {
    const cmd = COMMANDS_REGISTRY.find((c) => c.id === "toggle_frontmatter");
    expect(cmd).toBeDefined();
    expect(cmd!.label).toBe("Toggle Properties");
  });

  it("maps to the correct action ID", () => {
    expect(COMMAND_TO_ACTION_ID["toggle_frontmatter"]).toBe(
      ACTION_IDS.editor_toggle_frontmatter,
    );
  });
});
