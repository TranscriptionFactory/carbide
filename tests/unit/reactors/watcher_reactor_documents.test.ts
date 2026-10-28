/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create_watcher_reactor } from "$lib/reactors/watcher.reactor.svelte";
import { DocumentService, DocumentStore } from "$lib/features/document";
import { WatcherService } from "$lib/features/watcher/application/watcher_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_mock_watcher_port } from "../helpers/mock_ports";
import { create_test_vault } from "../helpers/test_fixtures";
import { flush_effects } from "../helpers/tauri_event_mock";

const FILE_PATH = "data/sheet.csv";
const TAB_ID = "tab-1";

function asset_event(vault_id: string, asset_path: string) {
  return { type: "asset_changed", vault_id, asset_path } as const;
}

function mount() {
  const vault_store = new VaultStore();
  const vault = create_test_vault();
  vault_store.set_vault(vault);
  const document_store = new DocumentStore();
  const watcher_port = create_mock_watcher_port();
  const watcher_service = new WatcherService(watcher_port);
  const disk = { content: "a,b\n1,2\n" };
  const document_port = {
    open_buffer: vi.fn(),
    read_buffer_window: vi.fn(),
    close_buffer: vi.fn(),
    resolve_asset_url: vi.fn(),
    read_file: vi.fn(async () => disk.content),
    write_file: vi.fn(async (_: string, __: string, content: string) => {
      disk.content = content;
    }),
    delete_file: vi.fn(),
  };
  const document_service = new DocumentService(
    document_port,
    vault_store,
    document_store,
    () => 1,
    3,
    undefined,
    undefined,
    undefined,
    (path) => {
      watcher_service.suppress_next(path);
    },
  );

  const unmount = create_watcher_reactor(
    vault_store,
    new EditorStore(),
    new TabStore(),
    { mark_conflict: vi.fn(), invalidate_cache: vi.fn() } as never,
    { invalidate_asset_cache: vi.fn() } as never,
    watcher_service,
    { execute: vi.fn() } as never,
    { invalidate_cache: vi.fn().mockResolvedValue(undefined) } as never,
    vi.fn().mockResolvedValue(undefined),
    document_service,
  );

  return {
    vault_id: vault.id,
    document_store,
    document_service,
    document_port,
    watcher_port,
    disk,
    unmount,
  };
}

async function open_csv(t: ReturnType<typeof mount>, tab_id = TAB_ID) {
  await t.document_service.open_document(tab_id, FILE_PATH, "csv");
  t.document_port.read_file.mockClear();
}

describe("watcher_reactor document tabs", () => {
  let current: ReturnType<typeof mount> | null = null;

  afterEach(() => {
    current?.unmount();
    current = null;
  });

  it("reloads a clean document tab and bumps its revision", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t);

    t.disk.content = "a,b\n9,9\n";
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH));
    await flush_effects();

    const state = t.document_store.get_content_state(TAB_ID);
    expect(state?.content).toBe("a,b\n9,9\n");
    expect(state?.is_dirty).toBe(false);
    expect(state?.revision).toBe(1);
  });

  it("reloads a background tab as well", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t, "tab-bg");
    await open_csv(t, "tab-fg");

    t.disk.content = "x\n";
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH.toUpperCase()));
    await flush_effects();

    expect(t.document_store.get_content_state("tab-bg")?.content).toBe("x\n");
  });

  it("raises a conflict instead of reloading a dirty tab", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t);
    t.document_store.set_edited_content(TAB_ID, "mine\n");

    t.disk.content = "theirs\n";
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH));
    await flush_effects();

    const state = t.document_store.get_content_state(TAB_ID);
    expect(t.document_store.has_conflict(TAB_ID)).toBe(true);
    expect(state?.edited_content).toBe("mine\n");
    expect(state?.revision).toBe(0);
    expect(t.document_port.read_file).not.toHaveBeenCalled();
  });

  it("swallows the echo of its own save", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t);
    t.document_store.set_edited_content(TAB_ID, "saved\n");

    await t.document_service.save(TAB_ID);
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH));
    await flush_effects();

    expect(t.document_store.has_conflict(TAB_ID)).toBe(false);
    expect(t.document_port.read_file).not.toHaveBeenCalled();
    expect(t.document_store.get_content_state(TAB_ID)?.revision).toBe(0);
  });

  it("does not remount when a later echo carries identical content", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t);
    t.document_store.set_edited_content(TAB_ID, "saved\n");

    await t.document_service.save(TAB_ID);
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH));
    t.watcher_port._emit(asset_event(t.vault_id, FILE_PATH));
    await flush_effects();

    expect(t.document_store.get_content_state(TAB_ID)?.revision).toBe(0);
    expect(t.document_store.has_conflict(TAB_ID)).toBe(false);
  });

  it("ignores changes to unrelated paths", async () => {
    const t = (current = mount());
    await flush_effects();
    await open_csv(t);

    t.watcher_port._emit(asset_event(t.vault_id, "data/other.csv"));
    await flush_effects();

    expect(t.document_port.read_file).not.toHaveBeenCalled();
  });
});
