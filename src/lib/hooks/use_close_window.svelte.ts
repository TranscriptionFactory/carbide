import { getCurrentWindow } from "@tauri-apps/api/window";
import { is_mobile_tauri } from "$lib/shared/utils/detect_platform";

export function make_close_window_handler() {
  return (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "w") {
      event.preventDefault();
      if (is_mobile_tauri) {
        return;
      }
      void getCurrentWindow().close();
    }
  };
}
