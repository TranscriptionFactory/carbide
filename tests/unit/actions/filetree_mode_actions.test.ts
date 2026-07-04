import { describe, it, expect, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_folder_actions } from "$lib/features/folder/application/folder_actions";
import type {
  EditorSettings,
  FileTreeMode,
} from "$lib/shared/types/editor_settings";

function build_input(initial_mode: FileTreeMode | undefined) {
  const registry = new ActionRegistry();

  let editor_settings = { file_tree_mode: initial_mode } as EditorSettings;
  const set_editor_settings = vi.fn((next: EditorSettings) => {
    editor_settings = next;
  });
  const save_settings = vi.fn(async () => ({ status: "success" as const }));

  const input = {
    registry,
    stores: {
      ui: {
        get editor_settings() {
          return editor_settings;
        },
        set_editor_settings,
      },
    } as never,
    services: {
      settings: { save_settings },
    } as never,
  } as never;

  register_folder_actions(input);
  return {
    registry,
    save_settings,
    set_editor_settings,
    current_mode: () => editor_settings.file_tree_mode,
  };
}

describe("filetree_set_mode action", () => {
  it("saves and persists the target mode", async () => {
    const { registry, save_settings, set_editor_settings, current_mode } =
      build_input("tree");

    await registry.execute(ACTION_IDS.filetree_set_mode, "inbox");

    expect(save_settings).toHaveBeenCalledTimes(1);
    expect(save_settings).toHaveBeenCalledWith(
      expect.objectContaining({ file_tree_mode: "inbox" }),
    );
    expect(set_editor_settings).toHaveBeenCalledTimes(1);
    expect(current_mode()).toBe("inbox");
  });

  it("does not persist when the save fails", async () => {
    const registry = new ActionRegistry();
    const editor_settings = { file_tree_mode: "tree" } as EditorSettings;
    const set_editor_settings = vi.fn();
    const save_settings = vi.fn(async () => ({
      status: "failed" as const,
      error: "boom",
    }));

    register_folder_actions({
      registry,
      stores: {
        ui: {
          get editor_settings() {
            return editor_settings;
          },
          set_editor_settings,
        },
      } as never,
      services: { settings: { save_settings } } as never,
    } as never);

    await registry.execute(ACTION_IDS.filetree_set_mode, "drilldown");

    expect(save_settings).toHaveBeenCalledTimes(1);
    expect(set_editor_settings).not.toHaveBeenCalled();
    expect(editor_settings.file_tree_mode).toBe("tree");
  });
});

describe("filetree_toggle_mode action", () => {
  it("cycles tree -> drilldown -> inbox -> bases -> tree", async () => {
    const { registry, current_mode } = build_input("tree");

    await registry.execute(ACTION_IDS.filetree_toggle_mode);
    expect(current_mode()).toBe("drilldown");

    await registry.execute(ACTION_IDS.filetree_toggle_mode);
    expect(current_mode()).toBe("inbox");

    await registry.execute(ACTION_IDS.filetree_toggle_mode);
    expect(current_mode()).toBe("bases");

    await registry.execute(ACTION_IDS.filetree_toggle_mode);
    expect(current_mode()).toBe("tree");
  });

  it("defaults to tree when no mode is set, cycling to drilldown", async () => {
    const { registry, current_mode } = build_input(undefined);

    await registry.execute(ACTION_IDS.filetree_toggle_mode);

    expect(current_mode()).toBe("drilldown");
  });
});
