export type HostMessage =
  | { type: "init_sheet"; text: string; delimiter: string }
  | { type: "get_text" }
  | { type: "theme_sync"; theme: "light" | "dark" };

export type GuestMessage =
  | { type: "ready" }
  | { type: "sheet_changed" }
  | { type: "text_response"; text: string }
  | { type: "save_requested" }
  | { type: "load_failed"; reason: string };

export function post_to_host(message: GuestMessage) {
  window.parent.postMessage(message, "*");
}
