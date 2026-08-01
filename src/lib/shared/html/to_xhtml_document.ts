export type XhtmlDocumentOptions = {
  stylesheet_href?: string;
};

export function to_xhtml_document(
  title: string,
  body_html: string,
  options?: XhtmlDocumentOptions,
): string {
  const stylesheet = options?.stylesheet_href
    ? `<link rel="stylesheet" type="text/css" href="${options.stylesheet_href}"/>`
    : "";
  const doc = new DOMParser().parseFromString(
    `<html><head><meta charset="utf-8"/><title></title>${stylesheet}</head><body>${body_html}</body></html>`,
    "text/html",
  );
  doc.title = title;
  const serialized = new XMLSerializer().serializeToString(doc);
  return `<?xml version="1.0" encoding="utf-8"?>\n${serialized}`;
}
