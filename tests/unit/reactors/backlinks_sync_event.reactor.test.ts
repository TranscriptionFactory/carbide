/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { create_backlinks_sync_reactor } from "$lib/reactors/backlinks_sync.reactor.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { LinksStore } from "$lib/features/links/state/links_store.svelte";
import { MarkdownLspStore } from "$lib/features/markdown_lsp/state/markdown_lsp_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

const mock_listen = vi.mocked(listen);

function open_note_state(path: string) {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path,
      title: path,
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty: false,
  };
}

async function flush() {
  flushSync();
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function setup() {
  let handler: ((event: { payload: unknown }) => void) | undefined;
  const unlisten = vi.fn();
  mock_listen.mockImplementation((_name, fn) => {
    handler = fn as (event: { payload: unknown }) => void;
    return Promise.resolve(unlisten);
  });

  const editor_store = new EditorStore();
  const ui_store = new UIStore();
  const markdown_lsp_store = new MarkdownLspStore();
  const links_store = new LinksStore();
  const links_service = {
    clear: vi.fn(),
    load_note_links: vi.fn().mockResolvedValue(undefined),
  };

  const unmount = create_backlinks_sync_reactor(
    editor_store,
    ui_store,
    markdown_lsp_store,
    links_store,
    links_service as never,
  );

  return {
    editor_store,
    ui_store,
    links_service,
    unmount,
    unlisten,
    emit: () =>
      handler?.({
        payload: { event_type: "upsert", vault_id: "v1", path: "a.md" },
      }),
  };
}

describe("backlinks_sync reactor index-commit refresh", () => {
  it("reloads the open note's links when an index commit lands and the panel is open", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(open_note_state("docs/a.md"));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush();
    links_service.load_note_links.mockClear();

    emit();
    await flush();

    expect(links_service.load_note_links).toHaveBeenCalledWith(
      as_note_path("docs/a.md"),
    );

    unmount();
  });

  it("does not reload while the panel is closed, but reloads on reopen", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(open_note_state("docs/a.md"));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush();
    ui_store.context_rail_open = false;
    await flush();
    links_service.load_note_links.mockClear();

    emit();
    await flush();
    expect(links_service.load_note_links).not.toHaveBeenCalled();

    ui_store.context_rail_open = true;
    await flush();
    expect(links_service.load_note_links).toHaveBeenCalledWith(
      as_note_path("docs/a.md"),
    );

    unmount();
  });

  it("ignores commits when no note is open", async () => {
    const { links_service, unmount, emit } = setup();
    await flush();
    links_service.load_note_links.mockClear();

    emit();
    await flush();

    expect(links_service.load_note_links).not.toHaveBeenCalled();

    unmount();
  });

  it("stops listening after unmount", async () => {
    const { editor_store, ui_store, links_service, unmount, unlisten, emit } =
      setup();
    editor_store.set_open_note(open_note_state("docs/a.md"));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush();
    links_service.load_note_links.mockClear();

    unmount();
    expect(unlisten).toHaveBeenCalled();

    emit();
    await flush();
    expect(links_service.load_note_links).not.toHaveBeenCalled();
  });
});
