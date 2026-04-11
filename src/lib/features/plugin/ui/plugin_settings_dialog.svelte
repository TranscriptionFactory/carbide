<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { PluginSettingSchema } from "../ports";

  interface Props {
    plugin_id: string;
    plugin_name: string;
    plugin_version: string;
    settings_schema: PluginSettingSchema[];
    on_close: () => void;
  }

  const {
    plugin_id,
    plugin_name,
    plugin_version,
    settings_schema,
    on_close,
  }: Props = $props();

  const { stores, services } = use_app_context();

  let open = $state(true);
  let draft_values = $state<Record<string, string>>({});

  function current_value(schema: PluginSettingSchema): unknown {
    const current = stores.plugin_settings.get_setting(plugin_id, schema.key);
    if (current !== undefined) {
      return current;
    }

    if (schema.default !== undefined) {
      return schema.default;
    }

    if (schema.type === "boolean") {
      return false;
    }

    return "";
  }

  function value_as_text(value: unknown): string {
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  }

  function field_id(key: string): string {
    return `${plugin_id}-${key}`;
  }

  function text_value(schema: PluginSettingSchema): string {
    return draft_values[schema.key] ?? value_as_text(current_value(schema));
  }

  function selected_option_label(schema: PluginSettingSchema): string {
    const selected = text_value(schema);
    return (
      schema.options?.find((option) => option.value === selected)?.label ??
      selected ??
      ""
    );
  }

  function update_text_setting(schema: PluginSettingSchema, value: string) {
    draft_values = { ...draft_values, [schema.key]: value };
    void services.plugin_settings.set_setting(plugin_id, schema.key, value);
  }

  function update_number_draft(schema: PluginSettingSchema, value: string) {
    draft_values = { ...draft_values, [schema.key]: value };
  }

  function clamp_number(value: number, schema: PluginSettingSchema): number {
    let result = value;
    if (schema.min !== undefined && result < schema.min) result = schema.min;
    if (schema.max !== undefined && result > schema.max) result = schema.max;
    return result;
  }

  function commit_number_setting(schema: PluginSettingSchema) {
    const raw = text_value(schema).trim();
    const fallback = value_as_text(current_value(schema));

    if (raw.length === 0) {
      const fallback_number = Number(fallback);
      const next_value =
        typeof schema.default === "number"
          ? schema.default
          : Number.isFinite(fallback_number)
            ? fallback_number
            : 0;
      draft_values = {
        ...draft_values,
        [schema.key]: value_as_text(next_value),
      };
      void services.plugin_settings.set_setting(
        plugin_id,
        schema.key,
        next_value,
      );
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      draft_values = { ...draft_values, [schema.key]: fallback };
      return;
    }

    const clamped = clamp_number(parsed, schema);
    draft_values = { ...draft_values, [schema.key]: String(clamped) };
    void services.plugin_settings.set_setting(plugin_id, schema.key, clamped);
  }

  function update_boolean_setting(
    schema: PluginSettingSchema,
    checked: boolean,
  ) {
    void services.plugin_settings.set_setting(plugin_id, schema.key, checked);
  }

  function update_select_setting(
    schema: PluginSettingSchema,
    value: string | undefined,
  ) {
    if (!value) return;
    draft_values = { ...draft_values, [schema.key]: value };
    void services.plugin_settings.set_setting(plugin_id, schema.key, value);
  }

  function handle_open_change(value: boolean) {
    open = value;
    if (!value) on_close();
  }

  $effect(() => {
    const _plugin_id = plugin_id;
    const next_values: Record<string, string> = {};

    for (const schema of settings_schema) {
      if (schema.type === "boolean") {
        continue;
      }
      next_values[schema.key] = value_as_text(current_value(schema));
    }

    draft_values = next_values;
  });
</script>

<Dialog.Root {open} onOpenChange={handle_open_change}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="text-base">Plugin Settings</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        <span class="font-medium text-foreground">{plugin_name}</span>
        <span class="mx-1">v{plugin_version}</span>
        settings save automatically to
        <code>.carbide/plugin_settings.json</code>.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 py-2">
      {#if settings_schema.length === 0}
        <div class="rounded-md border border-dashed bg-muted/20 p-4">
          <p class="text-sm text-muted-foreground">
            This plugin has not registered any settings yet.
          </p>
        </div>
      {:else}
        {#each settings_schema as schema (schema.key)}
          <div class="rounded-md border bg-muted/20 p-3">
            <div
              class={schema.type === "textarea"
                ? "flex flex-col gap-3"
                : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"}
            >
              <div class="space-y-1">
                <label
                  class="text-sm font-medium text-foreground"
                  for={field_id(schema.key)}
                >
                  {schema.label}
                </label>
                {#if schema.description}
                  <p class="text-xs text-muted-foreground">
                    {schema.description}
                  </p>
                {/if}
              </div>

              <div class={schema.type === "textarea" ? "" : "sm:w-64"}>
                {#if schema.type === "boolean"}
                  <div class="flex justify-end pt-1">
                    <Switch.Root
                      checked={Boolean(current_value(schema))}
                      aria-label={schema.label}
                      onCheckedChange={(checked: boolean) =>
                        update_boolean_setting(schema, checked)}
                    />
                  </div>
                {:else if schema.type === "select" && schema.options}
                  <Select.Root
                    type="single"
                    value={text_value(schema)}
                    onValueChange={(value: string | undefined) =>
                      update_select_setting(schema, value)}
                  >
                    <Select.Trigger id={field_id(schema.key)} class="w-full">
                      <span data-slot="select-value">
                        {selected_option_label(schema)}
                      </span>
                    </Select.Trigger>
                    <Select.Content>
                      {#each schema.options as option (option.value)}
                        <Select.Item value={option.value}
                          >{option.label}</Select.Item
                        >
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {:else if schema.type === "textarea"}
                  <Textarea
                    id={field_id(schema.key)}
                    name={schema.key}
                    rows={4}
                    placeholder={schema.placeholder}
                    value={text_value(schema)}
                    oninput={(event) => {
                      const value = (event.currentTarget as HTMLTextAreaElement)
                        .value;
                      update_text_setting(schema, value);
                    }}
                  />
                {:else}
                  <Input
                    id={field_id(schema.key)}
                    name={schema.key}
                    type={schema.type === "number" ? "number" : "text"}
                    placeholder={schema.placeholder}
                    min={schema.type === "number" ? schema.min : undefined}
                    max={schema.type === "number" ? schema.max : undefined}
                    value={text_value(schema)}
                    oninput={(event) => {
                      const value = (event.currentTarget as HTMLInputElement)
                        .value;
                      if (schema.type === "number") {
                        update_number_draft(schema, value);
                        return;
                      }
                      update_text_setting(schema, value);
                    }}
                    onblur={() => {
                      if (schema.type === "number") {
                        commit_number_setting(schema);
                      }
                    }}
                  />
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <Dialog.Footer>
      <Button onclick={on_close}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
