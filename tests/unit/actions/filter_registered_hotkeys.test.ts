import { describe, expect, it } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import {
  filter_registered_hotkey_config,
  filter_registered_hotkey_overrides,
} from "$lib/app/action_registry/filter_registered_hotkeys";

function create_registry() {
  const registry = new ActionRegistry();
  registry.register({
    id: "kept",
    label: "Kept",
    execute: () => {},
  });
  registry.register({
    id: "excluded",
    label: "Excluded",
    execute: () => {},
  });
  return registry;
}

describe("filter_registered_hotkeys", () => {
  it("drops bindings for actions that are not registered", () => {
    const registry = create_registry();

    const result = filter_registered_hotkey_config(registry, {
      bindings: [
        {
          action_id: "kept",
          key: "mod+k",
          phase: "capture",
          label: "Kept",
          description: "Kept",
          category: "general",
        },
        {
          action_id: "missing",
          key: "mod+m",
          phase: "capture",
          label: "Missing",
          description: "Missing",
          category: "general",
        },
      ],
    });

    expect(result.bindings.map((binding) => binding.action_id)).toEqual([
      "kept",
    ]);
  });

  it("drops explicitly excluded bindings and overrides", () => {
    const registry = create_registry();
    const excluded_action_ids = new Set(["excluded"]);

    const config = filter_registered_hotkey_config(
      registry,
      {
        bindings: [
          {
            action_id: "kept",
            key: "mod+k",
            phase: "capture",
            label: "Kept",
            description: "Kept",
            category: "general",
          },
          {
            action_id: "excluded",
            key: "mod+e",
            phase: "capture",
            label: "Excluded",
            description: "Excluded",
            category: "general",
          },
        ],
      },
      excluded_action_ids,
    );

    const overrides = filter_registered_hotkey_overrides(
      registry,
      [
        { action_id: "kept", key: "mod+k" },
        { action_id: "excluded", key: "mod+e" },
      ],
      excluded_action_ids,
    );

    expect(config.bindings.map((binding) => binding.action_id)).toEqual([
      "kept",
    ]);
    expect(overrides).toEqual([{ action_id: "kept", key: "mod+k" }]);
  });
});
