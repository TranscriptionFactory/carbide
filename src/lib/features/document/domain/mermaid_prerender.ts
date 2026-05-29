interface PrerenderOptions {
  theme?: "default" | "dark";
  id_prefix?: string;
}

export async function prerender_mermaid_codes(
  codes: Iterable<string>,
  options: PrerenderOptions = {},
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const unique: string[] = [];
  for (const raw of codes) {
    const code = raw.trim();
    if (!code || cache.has(code)) continue;
    cache.set(code, "");
    unique.push(code);
  }
  if (unique.length === 0) {
    cache.clear();
    return cache;
  }

  try {
    const mermaid = await import("mermaid");
    mermaid.default.initialize({
      startOnLoad: false,
      theme: options.theme ?? "default",
      securityLevel: "strict",
    });
    const prefix = options.id_prefix ?? "mermaid";
    let i = 0;
    for (const code of unique) {
      try {
        await mermaid.default.parse(code);
        const { svg } = await mermaid.default.render(
          `${prefix}-${String(i++)}`,
          code,
        );
        cache.set(code, svg);
      } catch {
        cache.delete(code);
      }
    }
  } catch {
    cache.clear();
  }

  for (const [k, v] of cache) if (!v) cache.delete(k);
  return cache;
}
