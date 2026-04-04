import type {
  AppTarget,
  WindowInit,
} from "$lib/features/window/domain/window_types";

export type { AppTarget, WindowInit };

export interface WindowPort {
  open_window(init: WindowInit): Promise<void>;
}
