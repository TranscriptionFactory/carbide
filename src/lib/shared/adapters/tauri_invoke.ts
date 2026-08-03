import { invoke } from "@tauri-apps/api/core";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("tauri_invoke");

const SLOW_COMMAND_MS = 250;

export async function tauri_invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!is_tauri) {
    throw new Error(`tauri_invoke called in non-Tauri environment: ${command}`);
  }

  const started_at = performance.now();
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    // Structured command errors (plain objects from Rust error types) pass
    // through untouched so adapters can map them; stringifying would flatten
    // them to "[object Object]".
    if (typeof e === "object" && e !== null && !(e instanceof Error)) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`tauri invoke failed: ${command}: ${msg}`);
  } finally {
    const duration_ms = Math.round(performance.now() - started_at);
    if (duration_ms >= SLOW_COMMAND_MS) {
      log.info("command_invoke phase=slow", { command, duration_ms });
    }
  }
}
