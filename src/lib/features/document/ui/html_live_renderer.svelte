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
  import {
    build_html_frame_bridge_script,
    parse_html_frame_message,
    type HtmlFrameHeading,
  } from "$lib/features/document/domain/html_frame_bridge";

  interface Props {
    content: string;
    theme: Theme;
    allow_network?: boolean;
    base_url?: string | undefined;
    initial_scroll_top?: number;
    on_scroll_change?: (scroll_top: number) => void;
    on_link_click?: (href: string) => void;
    on_headings_change?: (headings: HtmlFrameHeading[]) => void;
    on_active_heading_change?: (id: string | null) => void;
  }

  let {
    content,
    theme,
    allow_network = false,
    base_url,
    initial_scroll_top = 0,
    on_scroll_change,
    on_link_click,
    on_headings_change,
    on_active_heading_change,
  }: Props = $props();

  let src = $state<string | null>(null);
  let error_message = $state<string | null>(null);
  let render_generation = $state(0);
  let iframe: SandboxedIframe | undefined = $state();

  function handle_message(data: unknown) {
    const message = parse_html_frame_message(data);
    if (!message) return;
    if (message.type === "link_click") on_link_click?.(message.href);
    else if (message.type === "scroll") on_scroll_change?.(message.scroll_top);
    else if (message.type === "headings")
      on_headings_change?.(message.headings);
    else if (message.type === "active_heading")
      on_active_heading_change?.(message.id);
    else if (message.type === "runtime_error") error_message = message.message;
  }

  export function scroll_to_heading(id: string) {
    iframe?.post_message({
      source: "carbide-host",
      type: "scroll_to_heading",
      id,
    });
  }

  export function scroll_to_fragment(fragment: string) {
    iframe?.post_message({
      source: "carbide-host",
      type: "scroll_to_fragment",
      fragment,
    });
  }

  $effect(() => {
    const current_content = content;
    const theme_block = build_theme_style_block(theme);
    const network = allow_network;
    const base = base_url;
    void render_generation;
    let cancelled = false;
    let registered_url: string | null = null;
    src = null;
    error_message = null;

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
        bridge_script: build_html_frame_bridge_script(initial_scroll_top),
        base_url: base,
      });
      const url = await invoke<string>("html_live_register", {
        html: doc,
        allowNetwork: network,
      });
      if (cancelled) {
        void invoke("html_live_release", { url });
        return;
      }
      registered_url = url;
      src = url;
    })().catch((err) => {
      console.error("html live render failed", err);
      error_message = String(err);
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
      bind:this={iframe}
      {src}
      title="HTML live preview"
      sandbox="allow-scripts"
      class="HtmlLiveRenderer__frame"
      visible
      on_message={handle_message}
    />
    {#if error_message}
      <div class="HtmlLiveRenderer__runtime-error" role="alert">
        {error_message}
      </div>
    {/if}
  {:else if error_message}
    <div class="HtmlLiveRenderer__state" role="alert">
      <span>Failed to render HTML: {error_message}</span>
      <button type="button" onclick={() => (render_generation += 1)}
        >Retry</button
      >
    </div>
  {:else}
    <div class="HtmlLiveRenderer__state" role="status">Loading HTML…</div>
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

  .HtmlLiveRenderer__state {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--muted-foreground);
  }

  .HtmlLiveRenderer__runtime-error {
    padding: var(--space-1) var(--space-3);
    color: var(--destructive-foreground);
    background: var(--destructive);
    font-size: var(--text-xs);
  }
</style>
