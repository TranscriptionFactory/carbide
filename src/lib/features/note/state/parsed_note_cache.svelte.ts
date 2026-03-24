import { SvelteMap } from "svelte/reactivity";
import type { ParsedNoteDto } from "$lib/generated/bindings";

export class ParsedNoteCache {
  private cache = new SvelteMap<string, ParsedNoteDto>();

  set(file_path: string, parsed: ParsedNoteDto): void {
    this.cache.set(file_path, parsed);
  }

  get(file_path: string): ParsedNoteDto | undefined {
    return this.cache.get(file_path);
  }

  invalidate(file_path: string): void {
    this.cache.delete(file_path);
  }

  clear(): void {
    this.cache.clear();
  }
}
