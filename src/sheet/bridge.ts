import type { SheetGuestMessage } from "../lib/features/document/domain/sheet_bridge";

export function post_to_host(message: SheetGuestMessage) {
  window.parent.postMessage(message, "*");
}
