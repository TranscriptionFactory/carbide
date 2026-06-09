<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import type { Theme } from "$lib/shared/types/theme";
  import { build_theme_style_block } from "$lib/features/document/domain/html_theme_vars";
  import { build_live_html_document } from "$lib/features/document/domain/html_live_document";
  import {
    prerender_html_mermaid,
    prerender_html_math,
  } from "$lib/features/document/domain/html_live_prerender";
  import { get_inlined_katex_css } from "$lib/features/document/domain/katex_inline_css";

  interface Props {
    content: string;
    theme: Theme;
    allow_network?: boolean;
    asset_root?: string;
    initial_scroll_top?: number;
    on_scroll_change?: (scroll_top: number) => void;
  }

  let {
    content,
    theme,
    allow_network = false,
    asset_root,
    initial_scroll_top = 0,
    on_scroll_change,
  }: Props = $props();

  let src = $state<string | null>(null);

  $effect(() => {
    const current_content = content;
    const theme_block = build_theme_style_block(theme);
    const network = allow_network;
    const root = asset_root;
    let cancelled = false;
    let registered_url: string | null = null;

    (async () => {
      const with_mermaid = await prerender_html_mermaid(current_content);
      if (cancelled) return;
      const { html: with_math, had_math } = prerender_html_math(with_mermaid);
      const katex_css = had_math
        ? `<style>${await get_inlined_katex_css()}</style>`
        : "";
      if (cancelled) return;
      const doc = build_live_html_document({
        content: with_math,
        theme_style: katex_css + theme_block,
        allow_network: network,
      });
      const url = await invoke<string>("html_live_register", {
        html: doc,
        assetRoot: root ?? null,
      });
      if (cancelled) {
        void invoke("html_live_release", { url });
        return;
      }
      registered_url = url;
      src = url;
    })().catch((err) => {
      console.error("html live render failed", err);
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
