export * from "./types";
export * from "./ports";
export * from "./adapters/task_tauri_adapter";
export * from "./state/task_store.svelte";
export * from "./application/task_service";
export { default as TaskPanel } from "./ui/task_panel.svelte";
export { default as QuickCaptureDialog } from "./ui/quick_capture_dialog.svelte";

import { TaskTauriAdapter } from "./adapters/task_tauri_adapter";
import type { TaskPort } from "./ports";

export function create_task_tauri_adapter(): TaskPort {
  return new TaskTauriAdapter();
}
