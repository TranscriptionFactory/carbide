<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
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

  let src = $state<string | null>(null);

  $effect(() => {
    const current_doc = doc;
    let cancelled = false;
    let registered_url: string | null = null;

    invoke<string>("html_live_register", { html: current_doc })
      .then((url) => {
        if (cancelled) {
          void invoke("html_live_release", { url });
          return;
        }
        registered_url = url;
        src = url;
      })
      .catch((err) => {
        console.error("html_live_register failed", err);
      });

    return () => {
      cancelled = true;
      if (registered_url) {
        void invoke("html_live_release", { url: registered_url });
        registered_url = null;
      }
    };
  });
</script>

<div class="HtmlLiveRenderer">
  {#if src}
    <SandboxedIframe
      {src}
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
