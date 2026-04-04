import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { HotkeyConfig, HotkeyOverride } from "$lib/features/hotkey";

function get_registered_action_ids(registry: ActionRegistry): Set<string> {
  return new Set(registry.get_all().map((action) => action.id));
}

export function filter_registered_hotkey_config(
  registry: ActionRegistry,
  config: HotkeyConfig,
  excluded_action_ids?: ReadonlySet<string>,
): HotkeyConfig {
  const registered_action_ids = get_registered_action_ids(registry);
  return {
    bindings: config.bindings.filter(
      (binding) =>
        registered_action_ids.has(binding.action_id) &&
        !excluded_action_ids?.has(binding.action_id),
    ),
  };
}

export function filter_registered_hotkey_overrides(
  registry: ActionRegistry,
  overrides: HotkeyOverride[],
  excluded_action_ids?: ReadonlySet<string>,
): HotkeyOverride[] {
  const registered_action_ids = get_registered_action_ids(registry);
  return overrides.filter(
    (override) =>
      registered_action_ids.has(override.action_id) &&
      !excluded_action_ids?.has(override.action_id),
  );
}
