import { parent_folder_path } from "$lib/shared/utils/path";

export type HtmlLinkTarget =
  | { kind: "external"; url: string }
  | { kind: "fragment"; fragment: string }
  | { kind: "vault"; path: string; fragment?: string };

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function normalize_relative_path(base_file: string, target: string): string | null {
  const input = target.startsWith("/")
    ? target.slice(1)
    : `${parent_folder_path(base_file)}/${target}`;
  const output: string[] = [];
  for (const part of input.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (output.length === 0) return null;
      output.pop();
    } else {
      output.push(part);
    }
  }
  return output.join("/") || null;
}

export function classify_html_link(href: string, base_file: string): HtmlLinkTarget | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) {
    const fragment = decodeURIComponent(trimmed.slice(1));
    return fragment ? { kind: "fragment", fragment } : null;
  }
  try {
    const url = new URL(trimmed);
    return EXTERNAL_PROTOCOLS.has(url.protocol)
      ? { kind: "external", url: trimmed }
      : null;
  } catch {
    const hash = trimmed.indexOf("#");
    const raw_path = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
    const raw_fragment = hash >= 0 ? trimmed.slice(hash + 1) : "";
    const query = raw_path.indexOf("?");
    const path = normalize_relative_path(
      base_file,
      decodeURIComponent(query >= 0 ? raw_path.slice(0, query) : raw_path),
    );
    if (!path) return null;
    const fragment = raw_fragment ? decodeURIComponent(raw_fragment) : undefined;
    return fragment ? { kind: "vault", path, fragment } : { kind: "vault", path };
  }
}
