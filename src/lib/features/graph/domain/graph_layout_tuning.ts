export const LABEL_MAX_CHARS = 28;

export function compute_tick_budget(node_count: number): number {
  return Math.max(300, Math.min(Math.round(node_count * 0.5), 500));
}

export function label_collision_radius(
  label_len: number,
  base_radius: number,
): number {
  return Math.max(base_radius, label_len * 3.3);
}

export function truncate_label(
  text: string,
  max_chars: number = LABEL_MAX_CHARS,
): string {
  return text.length > max_chars ? `${text.slice(0, max_chars)}…` : text;
}
