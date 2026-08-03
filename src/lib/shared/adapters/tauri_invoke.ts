import { invoke } from "@tauri-apps/api/core";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("tauri_invoke");

const SLOW_COMMAND_MS = 250;

function log_if_slow(command: string, started_at: number): void {
  const duration_ms = Math.round(performance.now() - started_at);
  if (duration_ms >= SLOW_COMMAND_MS) {
    log.info("command_invoke phase=slow", { command, duration_ms });
  }
}

/**
 * Timing only — errors pass through exactly as `invoke` threw them.
 *
 * The generated bindings import this as their invoke, so the ~170 commands that
 * never touch `tauri_invoke` (including the ones that hung: list_folder_contents,
 * read_note, list_notes) still get per-command attribution. It deliberately does
 * not reshape errors, because the bindings' own try/catch distinguishes structured
 * Rust errors from `Error`s and must keep seeing them unchanged.
 */
export async function timed_invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const started_at = performance.now();
  try {
    return await invoke<T>(command, args);
  } finally {
    log_if_slow(command, started_at);
  }
}

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
    log_if_slow(command, started_at);
  }
}
