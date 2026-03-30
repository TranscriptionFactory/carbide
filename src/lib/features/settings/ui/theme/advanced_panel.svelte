<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Download from "@lucide/svelte/icons/download";
  import Upload from "@lucide/svelte/icons/upload";
  import type { Theme } from "$lib/shared/types/theme";
  import type { EditorSettings } from "$lib/shared/types/editor_settings";
  import OverrideSummary from "./override_summary.svelte";
  import JsonAnnotatedView from "./json_annotated_view.svelte";
  import CssTokenReference from "./css_token_reference.svelte";
  import EditorTuningPanel from "./editor_tuning_panel.svelte";

  type Props = {
    theme: Theme;
    disabled?: boolean;
    editor_settings: EditorSettings;
    on_update: (theme: Theme) => void;
    on_reset_color: (key: keyof Theme) => void;
    on_import: (theme: Theme) => void;
    on_editor_update: <K extends keyof EditorSettings>(
      key: K,
      value: EditorSettings[K],
    ) => void;
  };

  let {
    theme,
    disabled = false,
    editor_settings,
    on_update,
    on_reset_color,
    on_import,
    on_editor_update,
  }: Props = $props();

  let active_tab: "overrides" | "json" | "tokens" | "editor" =
    $state("overrides");
  let json_view_mode: "annotated" | "raw" = $state("annotated");
  let json_text = $state("");
  let json_error = $state("");
  let file_input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (active_tab === "json") {
      json_text = JSON.stringify(theme, null, 2);
      json_error = "";
    }
  });

  function handle_add_override(token: string, value: string) {
    on_update({
      ...theme,
      token_overrides: { ...theme.token_overrides, [token]: value },
    });
  }

  function handle_remove_override(token: string) {
    const { [token]: _, ...rest } = theme.token_overrides;
    on_update({ ...theme, token_overrides: rest });
  }

  function apply_json() {
    try {
      const parsed = JSON.parse(json_text) as Record<string, unknown>;
      if (typeof parsed.id !== "string" || typeof parsed.name !== "string") {
        json_error = "Missing required fields: id, name";
        return;
      }
      if (parsed.color_scheme !== "dark" && parsed.color_scheme !== "light") {
        json_error = "color_scheme must be 'dark' or 'light'";
        return;
      }
      json_error = "";
      on_update(parsed as unknown as Theme);
    } catch (e) {
      json_error = `Invalid JSON: ${(e as Error).message}`;
    }
  }

  function export_theme() {
    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handle_import() {
    file_input?.click();
  }

  async function handle_file_selected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.name !== "string") {
        json_error = "Invalid theme file: missing name";
        return;
      }
      on_import({
        ...parsed,
        id: crypto.randomUUID(),
        is_builtin: false,
      } as unknown as Theme);
    } catch (e) {
      json_error = `Import failed: ${(e as Error).message}`;
    }
    input.value = "";
  }
</script>

<div class="AdvancedPanel">
  <div class="AdvancedPanel__tabs">
    <button
      type="button"
      class="AdvancedPanel__tab"
      class:AdvancedPanel__tab--active={active_tab === "overrides"}
      onclick={() => {
        active_tab = "overrides";
      }}
    >
      Overrides
    </button>
    <button
      type="button"
      class="AdvancedPanel__tab"
      class:AdvancedPanel__tab--active={active_tab === "json"}
      onclick={() => {
        active_tab = "json";
      }}
    >
      JSON
    </button>
    <button
      type="button"
      class="AdvancedPanel__tab"
      class:AdvancedPanel__tab--active={active_tab === "tokens"}
      onclick={() => {
        active_tab = "tokens";
      }}
    >
      Tokens
    </button>
    <button
      type="button"
      class="AdvancedPanel__tab"
      class:AdvancedPanel__tab--active={active_tab === "editor"}
      onclick={() => {
        active_tab = "editor";
      }}
    >
      Editor
    </button>
  </div>

  {#if active_tab === "editor"}
    <EditorTuningPanel {editor_settings} on_update={on_editor_update} />
  {:else if active_tab === "overrides"}
    <OverrideSummary {theme} {disabled} on_reset={on_reset_color} />

    <div class="AdvancedPanel__io-row">
      <Button variant="outline" size="sm" onclick={export_theme}>
        <Download />
        Export
      </Button>
      <Button variant="outline" size="sm" onclick={handle_import}>
        <Upload />
        Import
      </Button>
      <input
        bind:this={file_input}
        type="file"
        accept=".json"
        class="sr-only"
        onchange={handle_file_selected}
      />
    </div>
  {:else if active_tab === "tokens"}
    <CssTokenReference
      {theme}
      on_add_override={handle_add_override}
      on_remove_override={handle_remove_override}
    />
  {:else}
    <div class="AdvancedPanel__json-subtabs">
      <button
        type="button"
        class="AdvancedPanel__json-subtab"
        class:AdvancedPanel__json-subtab--active={json_view_mode ===
          "annotated"}
        onclick={() => {
          json_view_mode = "annotated";
        }}
      >
        Annotated
      </button>
      <button
        type="button"
        class="AdvancedPanel__json-subtab"
        class:AdvancedPanel__json-subtab--active={json_view_mode === "raw"}
        onclick={() => {
          json_view_mode = "raw";
        }}
      >
        Raw
      </button>
    </div>

    {#if json_view_mode === "annotated"}
      <JsonAnnotatedView {theme} {on_update} />
    {:else}
      <textarea
        class="AdvancedPanel__json"
        bind:value={json_text}
        rows={16}
        {disabled}
        spellcheck={false}
      ></textarea>
      {#if json_error}
        <span class="AdvancedPanel__error">{json_error}</span>
      {/if}
      <div class="AdvancedPanel__json-actions">
        <Button size="sm" onclick={apply_json} {disabled}>Apply JSON</Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .AdvancedPanel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .AdvancedPanel__tabs {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.375rem);
    overflow: hidden;
  }

  .AdvancedPanel__tab {
    flex: 1;
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: all 100ms ease;
  }

  .AdvancedPanel__tab:last-child {
    border-right: none;
  }

  .AdvancedPanel__tab:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .AdvancedPanel__tab--active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .AdvancedPanel__tab--active:hover {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .AdvancedPanel__io-row {
    display: flex;
    gap: var(--space-2);
  }

  :global(.AdvancedPanel__io-row svg) {
    width: 14px;
    height: 14px;
  }

  .AdvancedPanel__json {
    width: 100%;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-xs);
    line-height: 1.5;
    background: var(--muted);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    padding: var(--space-3);
    resize: vertical;
    tab-size: 2;
  }

  .AdvancedPanel__json:focus {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }

  .AdvancedPanel__error {
    font-size: var(--text-xs);
    color: var(--destructive);
  }

  .AdvancedPanel__json-actions {
    display: flex;
    justify-content: flex-end;
  }

  .AdvancedPanel__json-subtabs {
    display: flex;
    gap: 0;
    align-self: flex-start;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    overflow: hidden;
  }

  .AdvancedPanel__json-subtab {
    padding: var(--space-1) var(--space-2-5);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: all 80ms ease;
  }

  .AdvancedPanel__json-subtab:last-child {
    border-right: none;
  }

  .AdvancedPanel__json-subtab:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .AdvancedPanel__json-subtab--active {
    background: var(--muted);
    color: var(--foreground);
  }
</style>
