// Shared asset-localization seam: also the designated primitive for
// snapshot-on-trust (carbide/plans/2026-06-24_live_html_remote_scripts_plan.md)
// and Tier-3 self-contained export
// (carbide/plans/2026-05-29_html_doc_parity_plan.md).

export const DEFAULT_MAX_IMAGES = 20;

function absolutize(src: string, base_url: string): string | null {
  try {
    const url = new URL(src, base_url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function plan_image_localization(
  html: string,
  base_url: string,
  max: number = DEFAULT_MAX_IMAGES,
): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const img of doc.body.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const absolute = absolutize(src, base_url);
    if (!absolute || seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
    if (urls.length >= max) break;
  }
  return urls;
}

export function rewrite_image_srcs(
  html: string,
  base_url: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of doc.body.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const absolute = absolutize(src, base_url);
    const local = absolute ? mapping.get(absolute) : undefined;
    if (local === undefined) continue;
    img.setAttribute("src", local);
    // ponytail: srcset variants dropped in favor of the localized src;
    // add hi-dpi variant selection if fuzzy images become a complaint.
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }
  return doc.body.innerHTML;
}
