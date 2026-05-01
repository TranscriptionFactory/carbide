import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export function render_lsp_markdown(content: string): string {
  return md.render(content);
}

export function attach_lsp_link_handler(
  container: HTMLElement,
  on_internal: (path: string) => void,
  on_external: (url: string) => void,
): void {
  container.addEventListener("click", (e) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (
      href.endsWith(".md") ||
      (!href.startsWith("http://") && !href.startsWith("https://"))
    ) {
      on_internal(href);
    } else {
      on_external(href);
    }
  });
}
