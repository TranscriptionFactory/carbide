export function format_wait_elapsed(elapsed_ms: number): string {
  const total_seconds = Math.max(0, Math.floor(elapsed_ms / 1000));
  if (total_seconds < 60) return `${String(total_seconds)}s`;
  const minutes = Math.floor(total_seconds / 60);
  const seconds = total_seconds % 60;
  return `${String(minutes)}m ${String(seconds).padStart(2, "0")}s`;
}
