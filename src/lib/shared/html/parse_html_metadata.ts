export interface HtmlMetadata {
  title: string | null;
  headings: HtmlHeading[];
  links: HtmlLink[];
}

export interface HtmlHeading {
  level: number;
  text: string;
}

export interface HtmlLink {
  href: string;
  text: string;
}

export function parse_html_metadata(html: string): HtmlMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  return {
    title: extract_title(doc),
    headings: extract_headings(doc),
    links: extract_links(doc),
  };
}

function extract_title(doc: Document): string | null {
  const title_el = doc.querySelector("title");
  if (title_el?.textContent?.trim()) return title_el.textContent.trim();

  const h1 = doc.querySelector("h1");
  if (h1?.textContent?.trim()) return h1.textContent.trim();

  return null;
}

function extract_headings(doc: Document): HtmlHeading[] {
  const heading_els = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  const headings: HtmlHeading[] = [];

  for (const el of heading_els) {
    const text = el.textContent?.trim();
    if (!text) continue;
    const level = parseInt(el.tagName.slice(1), 10);
    headings.push({ level, text });
  }

  return headings;
}

function extract_links(doc: Document): HtmlLink[] {
  const anchor_els = doc.querySelectorAll("a[href]");
  const links: HtmlLink[] = [];

  for (const el of anchor_els) {
    const href = el.getAttribute("href");
    if (!href) continue;
    const text = el.textContent?.trim() ?? "";
    links.push({ href, text });
  }

  return links;
}
