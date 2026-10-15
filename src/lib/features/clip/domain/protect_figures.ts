// Readability's conditional cleaning drops image grids (link density, img/p
// ratio) and every <button>, which removes most figures on figure-heavy
// pages. Figures are stashed before extraction, Readability sees a caption-only
// placeholder (so scoring and candidate selection still apply), and the
// original subtree is restored afterwards with a lighter, figure-aware cleanup.

import { absolutize } from "$lib/features/clip/domain/localize_images";

const SLOT_ATTR = "data-carbide-figure-slot";
const SVG_NS = "http://www.w3.org/2000/svg";
const MEDIA_SELECTOR = "img, svg, picture, video";
const CONTROL_SELECTOR = "button, input, select, textarea";
const LAZY_SOURCES: Array<
  [selector: string, attr: string, lazy_attrs: string[]]
> = [
  ["img", "src", ["data-src", "data-original", "data-lazy-src"]],
  ["image", "href", ["data-lazy-href", "data-href", "data-src"]],
];
const URL_ATTRS: Array<[selector: string, attr: string]> = [
  ["a", "href"],
  ["img", "src"],
  ["image", "href"],
  ["image", "xlink:href"],
];

function is_hidden(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true;
  // Inline SVG graphics are routinely aria-hidden while visible.
  if (el.getAttribute("aria-hidden") === "true" && el.namespaceURI !== SVG_NS) {
    return true;
  }
  const style = el.getAttribute("style") ?? "";
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
    style,
  );
}

function remove_hidden(figure: Element): void {
  for (const el of figure.querySelectorAll("*")) {
    if (is_hidden(el)) el.remove();
  }
}

function remove_controls(figure: Element): void {
  for (const control of figure.querySelectorAll(CONTROL_SELECTOR)) {
    const holds_media =
      control.tagName === "BUTTON" && control.querySelector(MEDIA_SELECTOR);
    if (holds_media) control.replaceWith(...control.childNodes);
    else control.remove();
  }
}

function promote_lazy_sources(figure: Element): void {
  for (const [selector, attr, lazy_attrs] of LAZY_SOURCES) {
    for (const el of figure.querySelectorAll(selector)) {
      const current = el.getAttribute(attr) ?? "";
      if (current && !current.startsWith("data:")) continue;
      const lazy = lazy_attrs
        .map((name) => el.getAttribute(name))
        .find(Boolean);
      if (lazy) el.setAttribute(attr, lazy);
    }
  }
}

function absolutize_urls(figure: Element, base_url: string): void {
  for (const [selector, attr] of URL_ATTRS) {
    for (const el of figure.querySelectorAll(selector)) {
      const value = el.getAttribute(attr);
      if (!value || value.startsWith("#")) continue;
      const absolute = absolutize(value, base_url);
      if (absolute) el.setAttribute(attr, absolute);
    }
  }
}

function clean_figure(figure: Element, base_url: string): void {
  remove_hidden(figure);
  remove_controls(figure);
  promote_lazy_sources(figure);
  absolutize_urls(figure, base_url);
}

export function stash_figures(doc: Document): Element[] {
  const figures = [...doc.body.querySelectorAll("figure")].filter(
    (figure) => !figure.parentElement?.closest("figure") && !is_hidden(figure),
  );
  return figures.map((figure, index) => {
    const slot = doc.createElement("figure");
    slot.setAttribute(SLOT_ATTR, String(index));
    const caption = figure.querySelector(":scope > figcaption");
    if (caption) slot.append(caption.cloneNode(true));
    figure.replaceWith(slot);
    return figure;
  });
}

export function restore_figures(
  content_html: string,
  stashed: Element[],
  base_url: string,
): string {
  if (stashed.length === 0) return content_html;
  const doc = new DOMParser().parseFromString(content_html, "text/html");
  for (const slot of doc.body.querySelectorAll(`[${SLOT_ATTR}]`)) {
    const figure = stashed[Number(slot.getAttribute(SLOT_ATTR))];
    if (!figure) {
      slot.remove();
      continue;
    }
    clean_figure(figure, base_url);
    slot.replaceWith(figure);
  }
  return doc.body.innerHTML;
}
