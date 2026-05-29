<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import type { Theme } from "$lib/shared/types/theme";
  import { build_theme_style_block } from "$lib/features/document/domain/html_theme_vars";

  interface Props {
    content: string;
    theme: Theme;
    allow_network?: boolean;
  }

  let { content, theme, allow_network = false }: Props = $props();

  const csp = $derived.by(() => {
    const connect = allow_network ? "*" : "'none'";
    return [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:" + (allow_network ? " https: http:" : ""),
      "font-src data:" + (allow_network ? " https: http:" : ""),
      "media-src data: blob:" + (allow_network ? " https: http:" : ""),
      `connect-src ${connect}`,
    ].join("; ");
  });

  const srcdoc = $derived.by(() => {
    const theme_style = build_theme_style_block(theme);
    const meta_csp = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    if (/<head[\s>]/i.test(content)) {
      return content.replace(
        /<head([^>]*)>/i,
        `<head$1>${meta_csp}${theme_style}`,
      );
    }
    if (/<html[\s>]/i.test(content)) {
      return content.replace(
        /<html([^>]*)>/i,
        `<html$1><head>${meta_csp}${theme_style}</head>`,
      );
    }
    return `<!DOCTYPE html><html><head>${meta_csp}${theme_style}</head><body>${content}</body></html>`;
  });
</script>

<div class="HtmlLiveRenderer">
  <SandboxedIframe
    {srcdoc}
    {csp}
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
