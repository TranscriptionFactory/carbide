import { parse as parse_yaml } from "yaml";
import { find_frontmatter_span } from "$lib/shared/domain/frontmatter_parser";
import type { EditorWidthMode } from "$lib/shared/types/editor_settings";

export const WIDTH_FRONTMATTER_KEY = "_width";

const OPENING_FENCE = /^---[ \t]*\n/;

export function read_frontmatter_width_mode(
  markdown: string,
): EditorWidthMode | null {
  const span = find_frontmatter_span(markdown);
  if (!span) return null;
  try {
    const parsed: unknown = parse_yaml(span.yaml);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = (parsed as Record<string, unknown>)[WIDTH_FRONTMATTER_KEY];
    return value === "normal" || value === "wide" ? value : null;
  } catch {
    return null;
  }
}

export function can_write_width_frontmatter(markdown: string): boolean {
  if (!OPENING_FENCE.test(markdown)) return true;
  const span = find_frontmatter_span(markdown);
  // opening fence without a closing fence — writing would stack a second block
  if (!span) return false;
  if (span.yaml.trim() === "") return true;
  try {
    const parsed: unknown = parse_yaml(span.yaml);
    return (
      parsed === null || (typeof parsed === "object" && !Array.isArray(parsed))
    );
  } catch {
    return false;
  }
}

export function resolve_width_mode(
  transient: EditorWidthMode | undefined,
  markdown: string | null | undefined,
  app_default: EditorWidthMode,
): EditorWidthMode {
  if (transient) return transient;
  if (markdown) {
    const from_frontmatter = read_frontmatter_width_mode(markdown);
    if (from_frontmatter) return from_frontmatter;
  }
  return app_default;
}
