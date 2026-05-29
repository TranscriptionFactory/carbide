<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import type { Theme } from "$lib/shared/types/theme";
  import { build_theme_style_block } from "$lib/features/document/domain/html_theme_vars";
  import {
    build_live_html_document,
    build_html_data_url,
  } from "$lib/features/document/domain/html_live_document";

  interface Props {
    content: string;
    theme: Theme;
    allow_network?: boolean;
  }

  let { content, theme, allow_network = false }: Props = $props();

  const src = $derived(
    build_html_data_url(
      build_live_html_document({
        content,
        theme_style: build_theme_style_block(theme),
        allow_network,
      }),
    ),
  );
</script>

<div class="HtmlLiveRenderer">
  <SandboxedIframe
    {src}
    title="HTML live preview"
    sandbox="allow-scripts"
    class="HtmlLiveRenderer__frame"
    visible
  />
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
