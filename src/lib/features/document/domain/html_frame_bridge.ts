export type HtmlFrameHeading = {
  id: string;
  level: number;
  text: string;
};

export type HtmlFrameMessage =
  | { source: "carbide-html"; type: "link_click"; href: string }
  | { source: "carbide-html"; type: "scroll"; scroll_top: number }
  | { source: "carbide-html"; type: "headings"; headings: HtmlFrameHeading[] }
  | { source: "carbide-html"; type: "active_heading"; id: string | null }
  | { source: "carbide-html"; type: "runtime_error"; message: string };

const MAX_STRING_LENGTH = 4096;
const MAX_HEADINGS = 1000;

function bounded_string(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH;
}

export function parse_html_frame_message(
  value: unknown,
): HtmlFrameMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.source !== "carbide-html") return null;

  if (record.type === "link_click" && bounded_string(record.href)) {
    return { source: "carbide-html", type: "link_click", href: record.href };
  }
  if (
    record.type === "scroll" &&
    typeof record.scroll_top === "number" &&
    Number.isFinite(record.scroll_top) &&
    record.scroll_top >= 0
  ) {
    return {
      source: "carbide-html",
      type: "scroll",
      scroll_top: record.scroll_top,
    };
  }
  if (
    record.type === "active_heading" &&
    (record.id === null || bounded_string(record.id))
  ) {
    return {
      source: "carbide-html",
      type: "active_heading",
      id: record.id,
    };
  }
  if (record.type === "runtime_error" && bounded_string(record.message)) {
    return {
      source: "carbide-html",
      type: "runtime_error",
      message: record.message,
    };
  }
  if (record.type !== "headings" || !Array.isArray(record.headings))
    return null;
  if (record.headings.length > MAX_HEADINGS) return null;
  const headings: HtmlFrameHeading[] = [];
  for (const item of record.headings) {
    if (!item || typeof item !== "object") return null;
    const heading = item as Record<string, unknown>;
    if (
      !bounded_string(heading.id) ||
      !bounded_string(heading.text) ||
      typeof heading.level !== "number" ||
      !Number.isInteger(heading.level) ||
      heading.level < 1 ||
      heading.level > 6
    )
      return null;
    headings.push({ id: heading.id, text: heading.text, level: heading.level });
  }
  return { source: "carbide-html", type: "headings", headings };
}

export function build_html_frame_bridge_script(initial_scroll_top = 0): string {
  const scroll_top = Math.max(0, Math.floor(initial_scroll_top));
  return `<script>(() => {
  const send = (message) => parent.postMessage({ source: "carbide-html", ...message }, "*");
  const headings = () => Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el, index) => {
    const id = el.id ? el.id + "--carbide-" + index : "carbide-heading-" + index;
    el.dataset.carbideHeadingId = id;
    return { id, level: Number(el.tagName.slice(1)), text: (el.textContent || "").trim().slice(0, 4096) };
  });
  const reportHeadings = () => send({ type: "headings", headings: headings().slice(0, 1000) });
  let scrollTimer;
  const reportScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const top = document.scrollingElement?.scrollTop || 0;
      send({ type: "scroll", scroll_top: top });
      const visible = Array.from(document.querySelectorAll("[data-carbide-heading-id]")).filter((el) => el.getBoundingClientRect().top <= 80).pop();
      send({ type: "active_heading", id: visible?.dataset.carbideHeadingId || null });
    }, 100);
  };
  addEventListener("DOMContentLoaded", () => {
    reportHeadings();
    requestAnimationFrame(() => { scrollTo(0, ${String(scroll_top)}); reportScroll(); });
  });
  addEventListener("scroll", reportScroll, { passive: true });
  addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    event.preventDefault();
    send({ type: "link_click", href: anchor.getAttribute("href") || "" });
  }, true);
  addEventListener("error", (event) => send({ type: "runtime_error", message: String(event.message || "HTML runtime error").slice(0, 4096) }));
  addEventListener("unhandledrejection", (event) => send({ type: "runtime_error", message: String(event.reason || "Unhandled rejection").slice(0, 4096) }));
  addEventListener("message", (event) => {
    if (event.data?.source !== "carbide-host") return;
    if (event.data.type === "scroll_to_heading") {
      document.querySelector('[data-carbide-heading-id="' + CSS.escape(String(event.data.id)) + '"]')?.scrollIntoView({ block: "start" });
    } else if (event.data.type === "scroll_to_fragment") {
      document.getElementById(String(event.data.fragment))?.scrollIntoView({ block: "start" });
    }
  });
})();</script>`;
}
