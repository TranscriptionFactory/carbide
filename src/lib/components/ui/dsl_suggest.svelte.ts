import { longest_common_prefix } from "$lib/shared/utils/longest_common_prefix";
import type {
  DslContext,
  DslSuggestion,
  DslSuggestProvider,
} from "$lib/shared/types/dsl_suggestion";

const MAX_ITEMS = 20;

type Options = {
  provider: DslSuggestProvider;
  get_ctx: () => DslContext;
  apply: (from: number, insert: string) => void;
};

export class DslSuggestController {
  items = $state<DslSuggestion[]>([]);
  selected_index = $state(0);
  open = $state(false);
  from = $state(0);

  private provider: DslSuggestProvider;
  private get_ctx: () => DslContext;
  private apply_insert: (from: number, insert: string) => void;
  private partial = "";

  constructor({ provider, get_ctx, apply }: Options) {
    this.provider = provider;
    this.get_ctx = get_ctx;
    this.apply_insert = apply;
  }

  update(text_before_cursor: string) {
    const result = this.provider(text_before_cursor, this.get_ctx());
    this.items = result.items.slice(0, MAX_ITEMS);
    this.from = result.from;
    this.partial = text_before_cursor.slice(result.from);
    this.selected_index = 0;
    this.open = result.items.length > 0;
  }

  keydown(e: KeyboardEvent): boolean {
    if (!this.open) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selected_index = Math.min(
        this.selected_index + 1,
        this.items.length - 1,
      );
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selected_index = Math.max(this.selected_index - 1, 0);
      return true;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      this.accept(this.selected_index);
      return true;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return true;
    }

    if (e.key === "Tab" && !e.shiftKey) {
      if (this.items.length === 1) {
        e.preventDefault();
        this.accept(0);
        return true;
      }
      const lcp = longest_common_prefix(this.items.map((i) => i.insert));
      if (lcp.length > this.partial.length) {
        e.preventDefault();
        this.apply_insert(this.from, lcp);
        return true;
      }
      return false;
    }

    return false;
  }

  accept(i: number) {
    const item = this.items[i];
    if (!item) return;
    this.apply_insert(this.from, item.insert);
    this.close();
  }

  close() {
    this.open = false;
  }
}
