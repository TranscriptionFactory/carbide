import type { ClipboardPort } from "$lib/features/clipboard/ports";

export function create_clipboard_tauri_adapter(): ClipboardPort {
  return {
    async write_text(text) {
      await navigator.clipboard.writeText(text);
    },
    async write_rich({ html, text }) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    },
  };
}
