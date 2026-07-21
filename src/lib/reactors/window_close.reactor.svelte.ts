import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("window_close_reactor");

export function create_window_close_reactor(
  on_close_requested: () => void,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen("window-close-requested", () => {
    if (cancelled) return;
    log.info("Received window-close-requested event");
    on_close_requested();
  }).then((fn) => {
    if (cancelled) {
      try {
        void Promise.resolve(fn()).catch(() => {});
      } catch {
        // Listener may already have been unregistered
      }
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      try {
        void Promise.resolve(fn()).catch(() => {});
      } catch {
        // Listener may already have been unregistered
      }
    }
  };
}
