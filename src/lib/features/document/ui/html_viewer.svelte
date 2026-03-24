<script lang="ts">
  import { sanitize_html } from "$lib/shared/html";

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  const sanitized = $derived(sanitize_html(content));

  const srcdoc = $derived(
    `<!DOCTYPE html>
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
    color: #e4e4e7;
    background: #18181b;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  a { color: #60a5fa; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 8px 0; }
  td, th { border: 1px solid #3f3f46; padding: 4px 8px; }
  th { background: #27272a; }
  blockquote { border-left: 3px solid #3f3f46; margin: 8px 0; padding: 4px 12px; color: #a1a1aa; }
  pre { background: #27272a; padding: 8px 12px; border-radius: 4px; overflow-x: auto; }
  code { background: #27272a; padding: 1px 4px; border-radius: 2px; font-size: 13px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #3f3f46; margin: 16px 0; }
  h1, h2, h3, h4, h5, h6 { margin: 16px 0 8px; }
</style>
</head>
<body>${sanitized}</body>
</html>`,
  );
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
