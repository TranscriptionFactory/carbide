// Figures marked by the capture webview (figure_snapshot.js) are shown as
// their rendered snapshot; the original elements stay in a collapsed
// <details> so their text and images remain in the clip.

const MARKER_ATTR = "data-carbide-snapshot";
const SNAPSHOT_URL_BASE = "https://snapshot.carbide.invalid/";

export function snapshot_url(index: number): string {
  return `${SNAPSHOT_URL_BASE}figure-${String(index)}.png`;
}

function replace_with_snapshot(figure: Element, src: string): void {
  const doc = figure.ownerDocument;
  const caption = figure.querySelector(":scope > figcaption");
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  summary.textContent = "Figure elements";
  details.append(summary);
  for (const child of [...figure.childNodes]) {
    if (child !== caption) details.append(child);
  }
  const img = doc.createElement("img");
  img.setAttribute("src", src);
  img.setAttribute("alt", caption?.textContent?.trim() || "Figure snapshot");
  figure.append(img);
  if (caption) figure.append(caption);
  figure.append(details);
}

export function apply_figure_snapshots(
  html: string,
  sources: ReadonlyMap<number, string>,
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const figures = doc.body.querySelectorAll(`[${MARKER_ATTR}]`);
  if (figures.length === 0) return html;
  for (const figure of figures) {
    const src = sources.get(Number(figure.getAttribute(MARKER_ATTR)));
    figure.removeAttribute(MARKER_ATTR);
    if (src !== undefined) replace_with_snapshot(figure, src);
  }
  return doc.body.innerHTML;
}
