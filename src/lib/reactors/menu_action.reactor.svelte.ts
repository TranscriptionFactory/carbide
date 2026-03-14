import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("menu_action_reactor");

export function create_menu_action_reactor(
  on_menu_action: (action_id: string) => void,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<string>("menu-action", (event) => {
    if (cancelled) return;
    log.info("Received menu-action event", { action_id: event.payload });
    on_menu_action(event.payload);
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
