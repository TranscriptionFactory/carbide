export type SheetTheme = "light" | "dark";

export type SheetGuestMessage =
  | { type: "ready" }
  | { type: "sheet_changed" }
  | { type: "text_response"; text: string }
  | { type: "save_requested" }
  | { type: "load_failed"; reason: string };

export type SheetHostMessage =
  | { type: "init_sheet"; text: string; delimiter: string | null }
  | { type: "get_text" }
  | { type: "theme_sync"; theme: SheetTheme };

export function sheet_delimiter_for_path(file_path: string): string | null {
  return file_path.toLowerCase().endsWith(".tsv") ? "\t" : null;
}

export function parse_sheet_message(data: unknown): SheetGuestMessage | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
    case "sheet_changed":
    case "save_requested":
      return { type: msg.type };
    case "text_response":
      return typeof msg.text === "string"
        ? { type: "text_response", text: msg.text }
        : null;
    case "load_failed":
      return {
        type: "load_failed",
        reason: typeof msg.reason === "string" ? msg.reason : "unknown",
      };
    default:
      return null;
  }
}

export type SheetBridgeInput = {
  content: () => string;
  delimiter: () => string | null;
  theme: () => SheetTheme;
  post: (message: SheetHostMessage) => void;
  on_change: (text: string) => void;
  on_save_requested: () => void;
  on_load_failed: (reason: string) => void;
};

export type SheetBridge = {
  handle_message: (data: unknown) => void;
  sync_theme: () => void;
};

export function create_sheet_bridge(input: SheetBridgeInput): SheetBridge {
  let is_ready = false;
  let save_after_text = false;

  return {
    handle_message(data) {
      const msg = parse_sheet_message(data);
      if (!msg) return;
      switch (msg.type) {
        case "ready":
          is_ready = true;
          input.post({
            type: "init_sheet",
            text: input.content(),
            delimiter: input.delimiter(),
          });
          input.post({ type: "theme_sync", theme: input.theme() });
          break;
        case "sheet_changed":
          input.post({ type: "get_text" });
          break;
        case "save_requested":
          save_after_text = true;
          input.post({ type: "get_text" });
          break;
        case "text_response":
          input.on_change(msg.text);
          if (save_after_text) {
            save_after_text = false;
            input.on_save_requested();
          }
          break;
        case "load_failed":
          input.on_load_failed(msg.reason);
          break;
      }
    },
    sync_theme() {
      if (is_ready) input.post({ type: "theme_sync", theme: input.theme() });
    },
  };
}
