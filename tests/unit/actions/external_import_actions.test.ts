import { describe, expect, it, vi } from "vitest";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_folder_actions } from "$lib/features/folder/application/folder_actions";
import { NoteService } from "$lib/features/note/application/note_service";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import type { NotePath, VaultId } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { AssetsPort } from "$lib/features/note/ports";
import type { EditorService } from "$lib/features/editor/application/editor_service";

const OP_KEY = "filetree.import_external";

function note_meta(path: string) {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").pop() ?? path,
    title: path,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function build_harness(existing_note_paths: string[] = []) {
  const registry = new ActionRegistry();
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const editor_store = new EditorStore();
  const op_store = new OpStore();

  vault_store.set_vault(create_test_vault());
  notes_store.set_notes(existing_note_paths.map(note_meta));

  const created_paths: string[] = [];
  const notes_port = create_mock_notes_port();
  notes_port.create_note = vi.fn((_vault_id: VaultId, note_path: NotePath) => {
    created_paths.push(note_path);
    return Promise.resolve(note_meta(note_path));
  });

  const write_image_asset = vi.fn().mockResolvedValue(".assets/report.pdf");
  const assets_port = {
    resolve_asset_url: vi.fn(),
    write_image_asset,
  } as unknown as AssetsPort;

  const note_service = new NoteService(
    notes_port,
    create_mock_index_port(),
    assets_port,
    vault_store,
    notes_store,
    editor_store,
    op_store,
    { flush: vi.fn(), mark_clean: vi.fn() } as unknown as EditorService,
    () => 1,
  );

  const ui = {
    editor_settings: { attachment_folder: ".assets" },
    filetree: {
      expanded_paths: new SvelteSet<string>(),
      load_states: new SvelteMap<string, never>(),
      error_messages: new SvelteMap<string, string>(),
      pagination: new SvelteMap<string, never>(),
    },
  };

  register_folder_actions({
    registry,
    stores: { ui, notes: notes_store, op: op_store } as never,
    services: { note: note_service } as never,
  } as never);

  return { registry, op_store, notes_port, created_paths, write_image_asset };
}

function markdown_file(name: string, body: string) {
  return new File([body], name, { type: "text/markdown" });
}

function binary_file(name: string, type: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

async function import_files(
  registry: ActionRegistry,
  files: File[],
  target_folder: string,
) {
  await registry.execute(ACTION_IDS.filetree_import_external_files, {
    files,
    target_folder,
  });
}

describe("filetree_import_external_files action", () => {
  it("creates dropped markdown inside the target folder", async () => {
    const { registry, created_paths } = build_harness();

    await import_files(registry, [markdown_file("spec.md", "# Spec")], "docs");

    expect(created_paths).toEqual(["docs/spec.md"]);
  });

  it("uniquifies dropped markdown against existing notes in the target folder", async () => {
    const { registry, created_paths } = build_harness(["docs/spec.md"]);

    await import_files(registry, [markdown_file("spec.md", "# Spec")], "docs");

    expect(created_paths).toEqual(["docs/spec-2.md"]);
  });

  it("anchors dropped assets to the target folder", async () => {
    const { registry, write_image_asset } = build_harness();

    await import_files(
      registry,
      [binary_file("report.pdf", "application/pdf")],
      "projects/active",
    );

    expect(write_image_asset).toHaveBeenCalledTimes(1);
    expect(write_image_asset.mock.calls[0]?.[1]).toMatchObject({
      note_path: as_note_path("projects/active/import.md"),
      custom_filename: "report.pdf",
      attachment_folder: ".assets",
      target_folder: "projects/active",
    });
  });

  it("omits the target folder for assets dropped on the vault root", async () => {
    const { registry, write_image_asset } = build_harness();

    await import_files(
      registry,
      [binary_file("report.pdf", "application/pdf")],
      "",
    );

    expect(write_image_asset.mock.calls[0]?.[1]).not.toHaveProperty(
      "target_folder",
    );
  });

  it("reports a success summary when every dropped file imports", async () => {
    const { registry, op_store } = build_harness();

    await import_files(
      registry,
      [
        markdown_file("a.md", "# A"),
        markdown_file("b.md", "# B"),
        binary_file("c.png", "image/png"),
      ],
      "",
    );

    expect(op_store.get(OP_KEY).status).toBe("success");
    expect(op_store.get(OP_KEY).message).toBe("Imported 3 files");
  });

  it("counts skipped directories in the success summary", async () => {
    const { registry, op_store } = build_harness();
    const directory = new File([], "screenshots", { type: "" });

    await import_files(
      registry,
      [markdown_file("notes.md", "# Notes"), directory],
      "docs",
    );

    expect(op_store.get(OP_KEY).status).toBe("success");
    expect(op_store.get(OP_KEY).message).toBe("Imported 1 file, skipped 1");
  });

  it("fails the operation when nothing could be imported", async () => {
    const { registry, op_store, notes_port } = build_harness();
    notes_port.create_note = vi.fn().mockRejectedValue(new Error("disk full"));

    await import_files(registry, [markdown_file("spec.md", "# Spec")], "docs");

    expect(op_store.get(OP_KEY).status).toBe("error");
    expect(op_store.get(OP_KEY).error).toBe(
      "1 dropped file(s) could not be imported",
    );
  });
});
