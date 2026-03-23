import { is_tauri } from "$lib/shared/utils/detect_platform";
import { run_auto_update_check } from "$lib/app/orchestration/app_actions";

const LAST_CHECK_KEY = "carbide:last_update_check";
const SKIPPED_VERSION_KEY = "carbide:skipped_update_version";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

export function should_check(): boolean {
  try {
    const last = localStorage.getItem(LAST_CHECK_KEY);
    if (!last) return true;
    const elapsed = Date.now() - new Date(last).getTime();
    if (Number.isNaN(elapsed)) return true;
    return elapsed > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function mark_checked(): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
  } catch {}
}

export function is_version_skipped(version: string): boolean {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY) === version;
  } catch {
    return false;
  }
}

export function skip_version(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {}
}

export function create_update_check_reactor(): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!is_tauri) return;
      if (!should_check()) return;

      const handle = setTimeout(() => {
        mark_checked();
        void run_auto_update_check(is_version_skipped, skip_version);
      }, STARTUP_DELAY_MS);

      return () => clearTimeout(handle);
    });
  });
}
