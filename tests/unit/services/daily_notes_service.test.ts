import { describe, it, expect, vi } from "vitest";
import { DailyNotesService } from "$lib/features/daily_notes/application/daily_notes_service";
import { VaultStore } from "$lib/features/vault";
import { NotesStore } from "$lib/features/note";
import type { NotesPort } from "$lib/features/note";
import { create_test_vault } from "../helpers/test_fixtures";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

function make_notes_port_mock(): NotesPort {
  return {
    create_note: vi.fn().mockImplementation((_vid: unknown, path: string) => ({
      id: path as NoteId,
      path: path as NotePath,
      name: path.split("/").pop()?.replace(".md", "") ?? "",
      title: "",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    })),
    create_folder: vi.fn().mockResolvedValue(undefined),
    list_notes: vi.fn(),
    list_folders: vi.fn(),
    read_note: vi.fn(),
    write_note: vi.fn(),
    write_and_index_note: vi.fn(),
    rename_note: vi.fn(),
    delete_note: vi.fn(),
    rename_folder: vi.fn(),
    delete_folder: vi.fn(),
    list_folder_contents: vi.fn(),
    get_file_info: vi.fn(),
    list_files: vi.fn(),
  } as unknown as NotesPort;
}

function make_service() {
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const notes_port = make_notes_port_mock();
  const now_ms = () => 1745452800000;

  const service = new DailyNotesService(
    notes_port,
    vault_store,
    notes_store,
    now_ms,
  );

  return { service, vault_store, notes_store, notes_port };
}

describe("DailyNotesService", () => {
  it("returns null when no vault is active", async () => {
    const { service } = make_service();
    const result = await service.ensure_daily_note(
      "Journal",
      "%Y-%m-%d",
      new Date(2026, 3, 23),
    );
    expect(result).toBeNull();
  });

  it("creates note when it does not exist", async () => {
    const { service, vault_store } = make_service();
    vault_store.vault = create_test_vault();

    const result = await service.ensure_daily_note(
      "Journal",
      "%Y-%m-%d",
      new Date(2026, 3, 23),
    );

    expect(result).toBe("Journal/2026/2026-04-23.md");
  });

  it("returns existing path without creating", async () => {
    const { service, vault_store, notes_store } = make_service();
    vault_store.vault = create_test_vault();
    notes_store.add_note({
      id: "Journal/2026/2026-04-23.md" as NoteId,
      path: "Journal/2026/2026-04-23.md" as NotePath,
      name: "2026-04-23",
      title: "2026-04-23",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    });

    const result = await service.ensure_daily_note(
      "Journal",
      "%Y-%m-%d",
      new Date(2026, 3, 23),
    );

    expect(result).toBe("Journal/2026/2026-04-23.md");
  });
});
