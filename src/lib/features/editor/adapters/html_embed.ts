export type WebEmbedAttrs = {
  src: string;
  title: string;
  width: string;
  height: string;
  align: string;
};

export type VideoAttrs = {
  src: string;
  poster: string;
  width: string;
  height: string;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
};

export type ParsedHtmlEmbed =
  | ({ kind: "web_embed" } & WebEmbedAttrs)
  | ({ kind: "video" } & VideoAttrs);

const IFRAME_RE = /^<iframe\b([^>]*?)\s*(?:\/>|>\s*<\/iframe>)$/i;
const VIDEO_RE = /^<video\b([^>]*?)\s*(?:\/>|>\s*<\/video>)$/i;
const ATTR_RE =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parse_attrs(source: string): Map<string, string | true> {
  const attrs = new Map<string, string | true>();
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(source)) !== null) {
    const name = match[1];
    if (!name) continue;
    const value = match[2] ?? match[3] ?? match[4];
    attrs.set(name.toLowerCase(), value === undefined ? true : value);
  }
  return attrs;
}

function str(value: string | true | undefined): string {
  return typeof value === "string" ? value : "";
}

export function parse_html_embed(raw_in: string): ParsedHtmlEmbed | null {
  const raw = raw_in.trim();

  const iframe = IFRAME_RE.exec(raw);
  if (iframe) {
    const attrs = parse_attrs(iframe[1] ?? "");
    const src = str(attrs.get("src"));
    if (!src) return null;
    return {
      kind: "web_embed",
      src,
      title: str(attrs.get("title")),
      width: str(attrs.get("width")),
      height: str(attrs.get("height")),
      align: str(attrs.get("data-align")) || "center",
    };
  }

  const video = VIDEO_RE.exec(raw);
  if (video) {
    const attrs = parse_attrs(video[1] ?? "");
    const src = str(attrs.get("src"));
    if (!src) return null;
    return {
      kind: "video",
      src,
      poster: str(attrs.get("poster")),
      width: str(attrs.get("width")),
      height: str(attrs.get("height")),
      controls: attrs.has("controls"),
      autoplay: attrs.has("autoplay"),
      loop: attrs.has("loop"),
      muted: attrs.has("muted"),
    };
  }

  return null;
}

export function serialize_web_embed(attrs: WebEmbedAttrs): string {
  let out = `<iframe src="${attrs.src}"`;
  if (attrs.title) out += ` title="${attrs.title}"`;
  if (attrs.width) out += ` width="${attrs.width}"`;
  if (attrs.height) out += ` height="${attrs.height}"`;
  if (attrs.align && attrs.align !== "center")
    out += ` data-align="${attrs.align}"`;
  return `${out}></iframe>`;
}

export function serialize_video(attrs: VideoAttrs): string {
  let out = `<video src="${attrs.src}"`;
  if (attrs.poster) out += ` poster="${attrs.poster}"`;
  if (attrs.width) out += ` width="${attrs.width}"`;
  if (attrs.height) out += ` height="${attrs.height}"`;
  if (attrs.controls) out += ` controls`;
  if (attrs.autoplay) out += ` autoplay`;
  if (attrs.loop) out += ` loop`;
  if (attrs.muted) out += ` muted`;
  return `${out}></video>`;
}
