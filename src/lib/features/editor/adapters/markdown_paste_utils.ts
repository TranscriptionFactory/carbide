import { is_markdown } from "$lib/features/editor/domain/is_markdown";
import type { ClipboardSource } from "$lib/features/editor/domain/detect_clipboard_source";

type PasteMode = "markdown" | "html" | "url" | "native" | "none";

type PasteModeInput = {
  text_markdown: string;
  text_plain: string;
  text_html: string;
};

const BARE_URL_REGEX = /^https?:\/\/\S+$/;

export function looks_like_markdown(text: string): boolean {
  return is_markdown(text.trim());
}

export function is_bare_url(text: string): boolean {
  return BARE_URL_REGEX.test(text.trim());
}

export function pick_paste_mode(
  input: PasteModeInput,
  source: ClipboardSource,
): PasteMode {
  if (source === "pm-origin") return "native";
  if (input.text_markdown.trim() !== "") return "markdown";
  if (is_bare_url(input.text_plain)) return "url";
  if (source === "vscode" || source === "gfm") return "markdown";
  if (looks_like_markdown(input.text_plain)) return "markdown";
  if (input.text_html.trim() !== "") return "html";
  return "none";
}
