import type { WindowInit } from "./domain/window_types";

export interface WindowPort {
  open_window(init: WindowInit): Promise<void>;
}
