import type { HotkeyOverride } from "$lib/features/hotkey/types/hotkey_config";

// merge_config silently ignores overrides for action ids that no longer
// exist, so renaming an action orphans any persisted override for it — the
// user's binding (or deliberate unbind) would vanish without this rename.
export const RENAMED_ACTION_IDS: Record<string, string> = {
  "ai.open_assistant": "assistant.open_panel",
};

export type HotkeyOverridesMigration = {
  overrides: HotkeyOverride[];
  changed: boolean;
};

export function migrate_hotkey_overrides(
  overrides: HotkeyOverride[],
): HotkeyOverridesMigration {
  let changed = false;
  const migrated: HotkeyOverride[] = [];
  for (const override of overrides) {
    const successor = RENAMED_ACTION_IDS[override.action_id];
    if (!successor) {
      migrated.push(override);
      continue;
    }
    changed = true;
    // A user override already recorded against the successor id wins; the
    // renamed entry is dropped rather than duplicated.
    if (overrides.some((other) => other.action_id === successor)) continue;
    // key survives verbatim — including null, a deliberate unbind.
    migrated.push({ ...override, action_id: successor });
  }
  return { overrides: migrated, changed };
}
