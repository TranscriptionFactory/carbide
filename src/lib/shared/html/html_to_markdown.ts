import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { sanitize_html } from "./sanitize_html";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.use(gfm);

export function html_to_markdown(html: string): string {
  const clean = sanitize_html(html);
  return turndown.turndown(clean);
}
