import { SvelteSet } from "svelte/reactivity";
import type { OutlineHeading } from "../types/outline";

export class OutlineStore {
  headings = $state<OutlineHeading[]>([]);
  active_heading_id = $state<string | null>(null);
  collapsed_ids = $state(new SvelteSet<string>());

  private collapsed_map = new Map<string, Set<string>>();
  private current_note_path: string | null = null;

  set_headings(headings: OutlineHeading[], note_path?: string) {
    if (
      note_path &&
      this.current_note_path &&
      note_path !== this.current_note_path
    ) {
      this.collapsed_map.set(
        this.current_note_path,
        new Set(this.collapsed_ids),
      );
    }

    this.headings = headings;

    if (note_path) {
      this.current_note_path = note_path;
      const saved = this.collapsed_map.get(note_path);
      if (saved) {
        const valid_ids = new Set(headings.map((h) => h.id));
        this.collapsed_ids = new SvelteSet(
          [...saved].filter((id) => valid_ids.has(id)),
        );
        return;
      }
    }

    const valid_ids = new Set(headings.map((h) => h.id));
    for (const id of this.collapsed_ids) {
      if (!valid_ids.has(id)) {
        this.collapsed_ids.delete(id);
      }
    }
  }

  set_active_heading(id: string | null) {
    this.active_heading_id = id;
  }

  toggle_collapsed(id: string) {
    if (this.collapsed_ids.has(id)) {
      this.collapsed_ids.delete(id);
    } else {
      this.collapsed_ids.add(id);
    }
  }

  find_heading_by_fragment(fragment: string): OutlineHeading | undefined {
    const normalized = fragment.toLowerCase();
    const exact = this.headings.find(
      (h) => h.text.toLowerCase() === normalized,
    );
    if (exact) return exact;

    const slug = normalized.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    return this.headings.find((h) => {
      const h_slug = h.text
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "");
      return h_slug === slug;
    });
  }

  clear() {
    if (this.current_note_path) {
      this.collapsed_map.set(
        this.current_note_path,
        new Set(this.collapsed_ids),
      );
    }
    this.headings = [];
    this.active_heading_id = null;
    this.collapsed_ids = new SvelteSet<string>();
    this.current_note_path = null;
  }
}
