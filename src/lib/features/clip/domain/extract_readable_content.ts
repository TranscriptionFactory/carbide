import { Readability } from "@mozilla/readability";

export type ReadableContent = {
  title: string | null;
  content_html: string;
};

function parse_with_base(html: string, base_url: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.setAttribute("href", base_url);
  doc.head.insertBefore(base, doc.head.firstChild);
  return doc;
}

export function extract_readable_content(
  html: string,
  base_url: string,
): ReadableContent {
  const doc = parse_with_base(html, base_url);
  const doc_title = doc.title.trim() || null;

  let article: {
    title?: string | null | undefined;
    content?: string | null | undefined;
  } | null = null;
  try {
    article = new Readability(doc).parse();
  } catch {
    article = null;
  }
  if (article?.content) {
    return {
      title: (article.title ?? "").trim() || doc_title,
      content_html: article.content,
    };
  }

  const fallback = parse_with_base(html, base_url);
  return { title: doc_title, content_html: fallback.body.innerHTML };
}
