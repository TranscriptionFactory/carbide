<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import CsvViewer from "$lib/features/document/ui/csv_viewer.svelte";
  import {
    create_sheet_bridge,
    sheet_delimiter_for_path,
    type SheetTheme,
  } from "$lib/features/document/domain/sheet_bridge";

  interface Props {
    content: string;
    file_path: string;
    theme: SheetTheme;
    on_change: (text: string) => void;
    on_save_requested: () => void;
  }

  let { content, file_path, theme, on_change, on_save_requested }: Props =
    $props();

  let iframe: SandboxedIframe | undefined = $state();
  let load_error = $state<string | null>(null);

  const src = "carbide-sheet://localhost/index.html";
  const origin = "carbide-sheet://localhost";

  const bridge = create_sheet_bridge({
    content: () => content,
    delimiter: () => sheet_delimiter_for_path(file_path),
    theme: () => theme,
    post: (message) => iframe?.post_message(message),
    on_change: (text) => on_change(text),
    on_save_requested: () => on_save_requested(),
    on_load_failed: (reason) => {
      load_error = reason;
    },
  });

  $effect(() => {
    void theme;
    bridge.sync_theme();
  });
</script>

{#if load_error}
  <div class="flex h-full flex-col">
    <p class="border-b px-3 py-1 text-xs text-muted-foreground">
      Spreadsheet editor failed to load ({load_error}); showing read-only view.
    </p>
    <CsvViewer
      {content}
      delimiter={sheet_delimiter_for_path(file_path) ?? ""}
    />
  </div>
{:else}
  <SandboxedIframe
    bind:this={iframe}
    {src}
    {origin}
    title="Spreadsheet"
    on_message={bridge.handle_message}
    sandbox="allow-scripts allow-same-origin"
    csp=""
    visible={true}
    class="h-full w-full border-none"
  />
{/if}
