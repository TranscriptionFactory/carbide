import { SvelteMap } from "svelte/reactivity";

export class BaseCountsStore {
  private counts = new SvelteMap<string, number>();

  get(view_path: string): number | undefined {
    return this.counts.get(view_path);
  }

  set_many(entries: Iterable<[string, number]>) {
    const next = new Map(entries);
    for (const key of this.counts.keys()) {
      if (!next.has(key)) this.counts.delete(key);
    }
    for (const [key, value] of next) {
      this.counts.set(key, value);
    }
  }

  clear() {
    this.counts.clear();
  }
}
