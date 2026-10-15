// Injected into the clip capture/render webview. Marks <figure>s whose look
// depends on page CSS (positioned overlays, canvas, CSS backgrounds) so Rust
// can snapshot them; the marker survives into the captured outerHTML.
(() => {
  const ATTR = "data-carbide-snapshot";
  const MAX_FIGURES = 40;
  const MIN_SIDE = 8;

  const is_visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= MIN_SIDE && rect.height >= MIN_SIDE;
  };

  const depends_on_css = (el) => {
    if (el.tagName === "CANVAS") return true;
    const style = getComputedStyle(el);
    if (style.position === "absolute" || style.position === "fixed")
      return true;
    return /url\(/.test(style.backgroundImage);
  };

  const is_composite = (figure) =>
    [...figure.querySelectorAll("*")].some(
      (el) => depends_on_css(el) && is_visible(el),
    );

  const content_rect = (figure) => {
    const rects = [...figure.children]
      .filter((child) => child.tagName !== "FIGCAPTION" && is_visible(child))
      .map((child) => child.getBoundingClientRect());
    if (rects.length === 0) return figure.getBoundingClientRect();
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const images_ready = (figure) =>
    [...figure.querySelectorAll("img")].every((img) => img.complete);

  window.__carbide_snapshot = {
    detect() {
      const figures = [...document.querySelectorAll("figure")]
        .filter((figure) => !figure.parentElement?.closest("figure"))
        .filter((figure) => is_visible(figure) && is_composite(figure))
        .slice(0, MAX_FIGURES);
      figures.forEach((figure, index) =>
        figure.setAttribute(ATTR, String(index)),
      );
      return figures.length;
    },
    prepare(index) {
      const figure = document.querySelector(`figure[${ATTR}="${index}"]`);
      if (!figure) return null;
      for (const img of figure.querySelectorAll('img[loading="lazy"]')) {
        img.loading = "eager";
      }
      figure.scrollIntoView({ block: "start" });
      const rect = content_rect(figure);
      return {
        ready: images_ready(figure),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
      };
    },
  };
})();
