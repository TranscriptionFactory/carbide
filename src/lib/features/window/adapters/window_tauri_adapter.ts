import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { WindowPort } from "../ports";
import {
  compute_title,
  serialize_window_init,
  type WindowInit,
} from "../domain/window_types";

let window_counter = 0;

export function create_window_tauri_adapter(): WindowPort {
  return {
    async open_window(init: WindowInit): Promise<void> {
      const label = `${init.kind}-${String(++window_counter)}`;
      const url_params = new URLSearchParams({
        init: serialize_window_init(init),
      });

      const width = init.kind === "viewer" ? 900 : 1000;
      const height = 700;

      new WebviewWindow(label, {
        url: `/?${url_params.toString()}`,
        title: compute_title(init),
        width,
        height,
        decorations: true,
      });
    },
  };
}
