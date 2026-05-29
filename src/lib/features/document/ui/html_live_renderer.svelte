<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import type { Theme } from "$lib/shared/types/theme";
  import { build_theme_style_block } from "$lib/features/document/domain/html_theme_vars";
  import { build_live_html_document } from "$lib/features/document/domain/html_live_document";

  interface Props {
    content: string;
    theme: Theme;
    allow_network?: boolean;
  }

  let { content, theme, allow_network = false }: Props = $props();

  const doc = $derived(
    build_live_html_document({
      content,
      theme_style: build_theme_style_block(theme),
      allow_network,
    }),
  );

  let blob_url = $state<string | null>(null);

  $effect(() => {
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    blob_url = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  });
</script>

<div class="HtmlLiveRenderer">
  {#if blob_url}
    <SandboxedIframe
      src={blob_url}
      title="HTML live preview"
      sandbox="allow-scripts"
      class="HtmlLiveRenderer__frame"
      visible
    />
  {/if}
</div>

<style>
  .HtmlLiveRenderer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  :global(.HtmlLiveRenderer__frame) {
    flex: 1;
    width: 100%;
    border: none;
    background: var(--background);
  }
</style>
