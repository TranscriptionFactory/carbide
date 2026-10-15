// Shared asset-localization seam: also the designated primitive for
// snapshot-on-trust (private/carbide/plans/2026-06-24_live_html_remote_scripts_plan.md)
// and Tier-3 self-contained export
// (private/carbide/plans/2026-05-29_html_doc_parity_plan.md).

export const DEFAULT_MAX_IMAGES = 500;

export type ImageLocalizationPlan = {
  urls: string[];
  skipped: number;
};

type ImageRef = { element: Element; attr: string };

const SVG_IMAGE_ATTRS = ["href", "xlink:href"];

export function absolutize(src: string, base_url: string): string | null {
  try {
    const url = new URL(src, base_url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function collect_image_refs(doc: Document): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const element of doc.body.querySelectorAll("img[src], svg image")) {
    const attrs =
      element.tagName.toLowerCase() === "img" ? ["src"] : SVG_IMAGE_ATTRS;
    for (const attr of attrs) {
      if (element.getAttribute(attr)) refs.push({ element, attr });
    }
  }
  return refs;
}

export function plan_image_localization(
  html: string,
  base_url: string,
  max: number = DEFAULT_MAX_IMAGES,
): ImageLocalizationPlan {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const unique = new Set<string>();
  for (const { element, attr } of collect_image_refs(doc)) {
    const absolute = absolutize(element.getAttribute(attr) ?? "", base_url);
    if (absolute) unique.add(absolute);
  }
  const urls = [...unique];
  return { urls: urls.slice(0, max), skipped: Math.max(0, urls.length - max) };
}

export function rewrite_image_srcs(
  html: string,
  base_url: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const { element, attr } of collect_image_refs(doc)) {
    const absolute = absolutize(element.getAttribute(attr) ?? "", base_url);
    const local = absolute ? mapping.get(absolute) : undefined;
    if (local === undefined) continue;
    element.setAttribute(attr, local);
    // ponytail: srcset variants dropped in favor of the localized src;
    // add hi-dpi variant selection if fuzzy images become a complaint.
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
  }
  return doc.body.innerHTML;
}
