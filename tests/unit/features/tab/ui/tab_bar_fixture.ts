import { vi } from "vitest";
import type { AppContext } from "$lib/app/di/create_app_context";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { Tab } from "$lib/features/tab/types/tab";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";
import TabBar from "$lib/features/tab/ui/tab_bar.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export function install_dom_stubs() {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  if (typeof globalThis.CSS === "undefined") {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

export function make_note_tab(
  id: string,
  overrides?: Partial<{
    title: string;
    is_pinned: boolean;
    is_dirty: boolean;
    pane: "primary" | "secondary";
    note_path: string;
  }>,
): Tab {
  return {
    id,
    title: overrides?.title ?? id,
    is_pinned: overrides?.is_pinned ?? false,
    is_dirty: overrides?.is_dirty ?? false,
    pane: overrides?.pane ?? "primary",
    kind: "note",
    note_path: (overrides?.note_path ?? `${id}.md`) as NotePath,
  };
}

export function make_note_meta(path: string): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path,
    title: path,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: "md",
  };
}

export function render_tab_bar(options: {
  tabs: Tab[];
  active_tab_id?: string | null;
  notes?: NoteMeta[];
  starred_paths?: string[];
}) {
  const stores = create_app_stores();
  stores.tab.tabs = options.tabs;
  stores.tab.active_tab_id =
    options.active_tab_id !== undefined
      ? options.active_tab_id
      : (options.tabs[0]?.id ?? null);
  stores.notes.notes = options.notes ?? [];
  stores.notes.starred_paths = options.starred_paths ?? [];

  const execute = vi.fn().mockResolvedValue(undefined);
  const app_context = {
    stores,
    action_registry: { execute },
  } as unknown as Partial<AppContext>;

  const view = render_with_app_context(TabBar, { app_context, props: {} });

  return { ...view, stores, execute };
}

export function get_by_testid(testid: string): HTMLElement | null {
  const element = document.body.querySelector(`[data-testid="${testid}"]`);
  return element instanceof HTMLElement ? element : null;
}

export function get_all_by_testid(testid: string): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll(`[data-testid="${testid}"]`),
  ).filter((el): el is HTMLElement => el instanceof HTMLElement);
}
