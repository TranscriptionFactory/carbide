<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import CsvViewer from "$lib/features/document/ui/csv_viewer.svelte";

  interface Props {
    content: string;
    delimiter: string;
    on_change: (text: string) => void;
    on_save_requested: () => void;
  }

  let { content, delimiter, on_change, on_save_requested }: Props = $props();

  let iframe: SandboxedIframe | undefined = $state();
  let load_error = $state<string | null>(null);
  let save_after_text = false;

  const src = "carbide-sheet://localhost/index.html";
  const origin = "carbide-sheet://localhost";

  function handle_message(data: unknown) {
    const msg = data as { type: string; [key: string]: unknown };
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;

    switch (msg.type) {
      case "ready":
        iframe?.post_message({ type: "init_sheet", text: content, delimiter });
        break;
      case "sheet_changed":
        iframe?.post_message({ type: "get_text" });
        break;
      case "save_requested":
        save_after_text = true;
        iframe?.post_message({ type: "get_text" });
        break;
      case "text_response":
        on_change(msg.text as string);
        if (save_after_text) {
          save_after_text = false;
          on_save_requested();
        }
        break;
      case "load_failed":
        load_error = msg.reason as string;
        break;
    }
  }
</script>

{#if load_error}
  <div class="flex h-full flex-col">
    <p class="border-b px-3 py-1 text-xs text-muted-foreground">
      Spreadsheet editor failed to load ({load_error}); showing read-only view.
    </p>
    <CsvViewer {content} {delimiter} />
  </div>
{:else}
  <SandboxedIframe
    bind:this={iframe}
    {src}
    {origin}
    title="Spreadsheet"
    on_message={handle_message}
    sandbox="allow-scripts allow-same-origin"
    csp=""
    visible={true}
    class="h-full w-full border-none"
  />
{/if}
