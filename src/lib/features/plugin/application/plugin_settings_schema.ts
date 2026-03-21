import type { PluginSettingSchema } from "../ports";

export function merge_plugin_settings_schema(
  manifest_schema: PluginSettingSchema[] | undefined,
  runtime_schema: PluginSettingSchema[] | undefined,
): PluginSettingSchema[] {
  const merged = [...(manifest_schema ?? [])];
  const seen = new Set(merged.map((schema) => schema.key));

  for (const schema of runtime_schema ?? []) {
    if (seen.has(schema.key)) {
      continue;
    }

    merged.push(schema);
    seen.add(schema.key);
  }

  return merged;
}
