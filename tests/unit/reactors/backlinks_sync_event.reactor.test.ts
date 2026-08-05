/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { create_backlinks_sync_reactor } from "$lib/reactors/backlinks_sync.reactor.svelte";
import { METADATA_REFRESH_DEBOUNCE_MS } from "$lib/reactors/metadata_changed";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { LinksStore } from "$lib/features/links/state/links_store.svelte";
import { MarkdownLspStore } from "$lib/features/markdown_lsp/state/markdown_lsp_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";
import {
  capture_tauri_listen,
  flush_effects,
} from "../helpers/tauri_event_mock";

async function drain_debounce() {
  await vi.advanceTimersByTimeAsync(METADATA_REFRESH_DEBOUNCE_MS);
  await flush_effects();
}

function setup() {
  const captured = capture_tauri_listen(vi.mocked(listen));

  const editor_store = new EditorStore();
  const ui_store = new UIStore();
  const markdown_lsp_store = new MarkdownLspStore();
  const links_store = new LinksStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
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
    vault_store,
  );

  return {
    editor_store,
    ui_store,
    vault_store,
    links_service,
    unmount,
    unlisten: captured.unlisten,
    emit: (overrides?: Record<string, unknown>) => {
      captured.emit({
        event_type: "upsert",
        vault_id: vault_store.vault?.id,
        path: "a.md",
        ...overrides,
      });
    },
  };
}

const note = create_test_note("docs/a", "a");

describe("backlinks_sync reactor index-commit refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reloads the open note's links when an index commit lands and the panel is open", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(create_open_note_state(note));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush_effects();
    links_service.load_note_links.mockClear();

    emit();
    await drain_debounce();

    expect(links_service.load_note_links).toHaveBeenCalledWith(note.path);

    unmount();
  });

  it("coalesces an event burst into one reload", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(create_open_note_state(note));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush_effects();
    links_service.load_note_links.mockClear();

    for (let i = 0; i < 5; i += 1) {
      emit({ path: `note-${String(i)}.md` });
    }
    await drain_debounce();

    expect(links_service.load_note_links).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("ignores commits from another vault", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(create_open_note_state(note));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush_effects();
    links_service.load_note_links.mockClear();

    emit({ vault_id: "some-other-vault" });
    await drain_debounce();

    expect(links_service.load_note_links).not.toHaveBeenCalled();

    unmount();
  });

  it("does not reload while the panel is closed, but reloads on reopen", async () => {
    const { editor_store, ui_store, links_service, unmount, emit } = setup();
    editor_store.set_open_note(create_open_note_state(note));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush_effects();
    ui_store.context_rail_open = false;
    await flush_effects();
    links_service.load_note_links.mockClear();

    emit();
    await drain_debounce();
    expect(links_service.load_note_links).not.toHaveBeenCalled();

    ui_store.context_rail_open = true;
    await flush_effects();
    expect(links_service.load_note_links).toHaveBeenCalledWith(note.path);

    unmount();
  });

  it("ignores commits when no note is open", async () => {
    const { links_service, unmount, emit } = setup();
    await flush_effects();
    links_service.load_note_links.mockClear();

    emit();
    await drain_debounce();

    expect(links_service.load_note_links).not.toHaveBeenCalled();

    unmount();
  });

  it("stops listening after unmount", async () => {
    const { editor_store, ui_store, links_service, unmount, unlisten, emit } =
      setup();
    editor_store.set_open_note(create_open_note_state(note));
    ui_store.context_rail_open = true;
    ui_store.context_rail_tab = "links";
    await flush_effects();
    links_service.load_note_links.mockClear();

    unmount();
    expect(unlisten).toHaveBeenCalled();

    emit();
    await drain_debounce();
    expect(links_service.load_note_links).not.toHaveBeenCalled();
  });
});
