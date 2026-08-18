<script lang="ts">
  import { onMount } from "svelte";
  import { sanitize_html_preview } from "$lib/shared/html";
  import {
    build_html_frame_bridge_script,
    parse_html_frame_message,
    type HtmlFrameHeading,
  } from "$lib/features/document/domain/html_frame_bridge";

  interface Props {
    content: string;
    theme: "light" | "dark";
    initial_scroll_top?: number;
    on_scroll_change?: (scroll_top: number) => void;
    base_url?: string | undefined;
    on_link_click?: (href: string) => void;
    on_headings_change?: (headings: HtmlFrameHeading[]) => void;
    on_active_heading_change?: (id: string | null) => void;
  }

  let {
    content,
    theme,
    initial_scroll_top = 0,
    on_scroll_change,
    base_url,
    on_link_click,
    on_headings_change,
    on_active_heading_change,
  }: Props = $props();

  let frame: HTMLIFrameElement | undefined = $state();

  const sanitized = $derived(sanitize_html_preview(content));

  const palettes = {
    dark: {
      bg: "#18181b",
      text: "#e4e4e7",
      link: "#60a5fa",
      border: "#3f3f46",
      code_bg: "#27272a",
      blockquote: "#a1a1aa",
    },
    light: {
      bg: "#ffffff",
      text: "#18181b",
      link: "#2563eb",
      border: "#e4e4e7",
      code_bg: "#f4f4f5",
      blockquote: "#71717a",
    },
  } as const;

  function handle_message(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) return;
    const message = parse_html_frame_message(event.data);
    if (!message) return;
    if (message.type === "link_click") on_link_click?.(message.href);
    else if (message.type === "scroll") on_scroll_change?.(message.scroll_top);
    else if (message.type === "headings")
      on_headings_change?.(message.headings);
    else if (message.type === "active_heading")
      on_active_heading_change?.(message.id);
  }

  export function scroll_to_heading(id: string) {
    frame?.contentWindow?.postMessage(
      { source: "carbide-host", type: "scroll_to_heading", id },
      "*",
    );
  }

  export function scroll_to_fragment(fragment: string) {
    frame?.contentWindow?.postMessage(
      { source: "carbide-host", type: "scroll_to_fragment", fragment },
      "*",
    );
  }

  onMount(() => {
    window.addEventListener("message", handle_message);
    return () => {
      window.removeEventListener("message", handle_message);
    };
  });

  const srcdoc = $derived.by(() => {
    const p = palettes[theme];
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${base_url ? `<base href="${base_url}">` : ""}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data: carbide-asset:; img-src data: blob: carbide-asset:; font-src data: carbide-asset:; media-src data: blob: carbide-asset:; connect-src 'none'; form-action 'none'; frame-src 'none';">
<style>
  ${sanitized.styles}
  body {
    margin: 0;
    padding: 16px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: ${p.text};
    background: ${p.bg};
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  a { color: ${p.link}; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 8px 0; }
  td, th { border: 1px solid ${p.border}; padding: 4px 8px; }
  th { background: ${p.code_bg}; }
  blockquote { border-left: 3px solid ${p.border}; margin: 8px 0; padding: 4px 12px; color: ${p.blockquote}; }
  pre { background: ${p.code_bg}; padding: 8px 12px; border-radius: 4px; overflow-x: auto; }
  code { background: ${p.code_bg}; padding: 1px 4px; border-radius: 2px; font-size: 13px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid ${p.border}; margin: 16px 0; }
  h1, h2, h3, h4, h5, h6 { margin: 16px 0 8px; }
</style>
${build_html_frame_bridge_script(initial_scroll_top)}
</head>
<body>${sanitized.body}</body>
</html>`;
  });
</script>

<div class="HtmlViewer">
  <iframe
    bind:this={frame}
    class="HtmlViewer__frame"
    sandbox="allow-scripts"
    title="HTML document preview"
    {srcdoc}
  ></iframe>
</div>

<style>
  .HtmlViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .HtmlViewer__frame {
    flex: 1;
    width: 100%;
    border: none;
    background: var(--editor-background);
  }
</style>
