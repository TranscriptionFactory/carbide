import { describe, expect, it } from "vitest";
import { migrate_hotkey_overrides } from "$lib/features/hotkey/domain/hotkey_overrides_migration";

describe("migrate_hotkey_overrides", () => {
  it("renames a persisted override for a retired action id in place", () => {
    const result = migrate_hotkey_overrides([
      { action_id: "ai.open_assistant", key: "CmdOrCtrl+Alt+A" },
    ]);

    expect(result.changed).toBe(true);
    expect(result.overrides).toEqual([
      { action_id: "assistant.open_panel", key: "CmdOrCtrl+Alt+A" },
    ]);
  });

  it("preserves key: null — a deliberate unbind survives the rename", () => {
    const result = migrate_hotkey_overrides([
      { action_id: "ai.open_assistant", key: null },
    ]);

    expect(result.overrides).toEqual([
      { action_id: "assistant.open_panel", key: null },
    ]);
  });

  it("lets an existing successor entry win on collision", () => {
    const result = migrate_hotkey_overrides([
      { action_id: "ai.open_assistant", key: "CmdOrCtrl+Alt+A" },
      { action_id: "assistant.open_panel", key: "CmdOrCtrl+Alt+B" },
    ]);

    expect(result.changed).toBe(true);
    expect(result.overrides).toEqual([
      { action_id: "assistant.open_panel", key: "CmdOrCtrl+Alt+B" },
    ]);
  });

  it("leaves unknown action ids untouched and reports no change", () => {
    const overrides = [
      { action_id: "note.request_save", key: "CmdOrCtrl+Alt+S" },
    ];

    const result = migrate_hotkey_overrides(overrides);

    expect(result.changed).toBe(false);
    expect(result.overrides).toEqual(overrides);
  });

  it("is idempotent: migrating a migrated set changes nothing", () => {
    const first = migrate_hotkey_overrides([
      { action_id: "ai.open_assistant", key: "CmdOrCtrl+Alt+A" },
    ]);

    const second = migrate_hotkey_overrides(first.overrides);

    expect(second.changed).toBe(false);
    expect(second.overrides).toEqual(first.overrides);
  });
});
