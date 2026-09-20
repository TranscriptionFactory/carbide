import type { TrustLevel } from "$lib/features/document";

export type HtmlRenderMode = "safe" | "live";

/**
 * App-level hooks for the in-note HTML surfaces. `null` means the surface runs
 * the app without a trust store (tests, headless) — read that as "never live".
 */
export type InlineHtmlTrustConfig = {
  get_level: ((path: string) => Promise<TrustLevel>) | null;
  request: ((path: string) => Promise<boolean>) | null;
};

export function create_inline_html_trust_config(): InlineHtmlTrustConfig {
  return { get_level: null, request: null };
}

export function trust_allows_live(level: TrustLevel): boolean {
  return level === "live" || level === "live+net";
}

/* The markdown token records what the author asked for; trust is what the vault
   owner granted. A shared note carrying `live` must not execute without both. */
export function effective_html_mode(
  preference: HtmlRenderMode,
  level: TrustLevel,
): HtmlRenderMode {
  return preference === "live" && trust_allows_live(level) ? "live" : "safe";
}
