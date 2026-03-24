import { vi } from "vitest";
import type { ReferenceStoragePort } from "$lib/features/reference/ports";
import type { CslItem, ReferenceLibrary } from "$lib/features/reference/types";

export function make_item(id: string, overrides?: Partial<CslItem>): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
    author: [{ family: id }],
    issued: { "date-parts": [[2024]] },
    ...overrides,
  };
}

export function make_library(items: CslItem[]): ReferenceLibrary {
  return { schema_version: 1, items };
}

export function make_mock_storage(
  initial_items: CslItem[] = [],
): ReferenceStoragePort {
  let items = [...initial_items];
  return {
    load_library: vi.fn(async () => make_library(items)),
    save_library: vi.fn(async (_vault_id, library) => {
      items = library.items;
    }),
    add_item: vi.fn(async (_vault_id, item) => {
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        items[idx] = item;
      } else {
        items.push(item);
      }
      return make_library(items);
    }),
    remove_item: vi.fn(async (_vault_id, citekey) => {
      items = items.filter((i) => i.id !== citekey);
      return make_library(items);
    }),
  };
}

export function make_vault_store() {
  return { vault: { id: "test-vault", path: "/tmp/test" } } as never;
}
