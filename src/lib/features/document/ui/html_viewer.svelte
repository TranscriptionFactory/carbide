<script lang="ts">
  import { sanitize_html } from "$lib/shared/html";

  interface Props {
    content: string;
    theme: "light" | "dark";
  }

  let { content, theme }: Props = $props();

  const sanitized = $derived(sanitize_html(content));

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

  const srcdoc = $derived.by(() => {
    const p = palettes[theme];
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:;">
<style>
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
</head>
<body>${sanitized}</body>
</html>`;
  });
</script>

<div class="HtmlViewer">
  <iframe
    class="HtmlViewer__frame"
    sandbox="allow-same-origin"
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
    background: var(--background);
  }
</style>
