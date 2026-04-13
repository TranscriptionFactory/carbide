import type { TaskListEmbed } from "../types";

export function parse_embed_config(body: string): TaskListEmbed | null {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^list:\s*(.+)$/i);
    if (match) {
      const list_name = match[1]!.trim();
      if (list_name) return { list_name };
    }
  }
  return null;
}
