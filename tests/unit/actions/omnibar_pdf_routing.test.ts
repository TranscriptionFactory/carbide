import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
import { create_note_routing_harness } from "../helpers/note_routing_harness";
import type { OmnibarItem } from "$lib/shared/types/search";
import { as_note_path, as_vault_id } from "$lib/shared/types/ids";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    dismiss: vi.fn(),
  },
}));

function create_harness() {
  const harness = create_note_routing_harness();

  register_omnibar_actions({
    registry: harness.registry,
    stores: harness.stores,
    services: harness.services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  } as never);

  return harness;
}

function make_note(path: string) {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").at(-1) ?? path,
    title: path,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function make_note_item(path: string): OmnibarItem {
  return {
    kind: "note",
    note: make_note(path),
    score: 1,
    snippet: undefined,
  };
}

function make_recent_note_item(path: string): OmnibarItem {
  return {
    kind: "recent_note",
    note: make_note(path),
  };
}

function make_cross_vault_item(path: string, vault_id: string): OmnibarItem {
  return {
    kind: "cross_vault_note",
    note: make_note(path),
    vault_id: as_vault_id(vault_id),
    vault_name: vault_id,
    score: 1,
    snippet: undefined,
  };
}

describe("omnibar confirm_item routing through note_open", () => {
  it("routes a note item with a .pdf path to document_open", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("docs/report.pdf"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("docs/report.pdf"),
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("routes a note item with a .sh path to document_open", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("scripts/setup.sh"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("scripts/setup.sh"),
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("opens a note item with a .md path in the editor", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("docs/guide.md"),
    );

    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("docs/guide.md"),
      false,
      { cleanup_if_missing: true },
    );
    expect(document_open).not.toHaveBeenCalled();
  });

  it("opens a note item with no recognized document extension in the editor", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("docs/readme"),
    );

    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("docs/readme"),
      false,
      { cleanup_if_missing: true },
    );
    expect(document_open).not.toHaveBeenCalled();
  });

  it("resolves linked note PDF via reference service and dispatches document_open", async () => {
    const { registry, document_open, services, resolve_linked_note_file_path } =
      create_harness();

    resolve_linked_note_file_path.mockResolvedValue(
      "/Users/abir/Zotero/storage/paper.pdf",
    );

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("@linked/zotero/paper.pdf"),
    );

    expect(resolve_linked_note_file_path).toHaveBeenCalledWith(
      as_note_path("@linked/zotero/paper.pdf"),
    );
    expect(document_open).toHaveBeenCalledWith({
      file_path: "/Users/abir/Zotero/storage/paper.pdf",
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("shell-opens a linked note that resolves to a markdown file", async () => {
    const { registry, document_open, services, resolve_linked_note_file_path } =
      create_harness();

    resolve_linked_note_file_path.mockResolvedValue("/external/notes.md");

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("@linked/zotero/notes.md"),
    );

    expect(services.shell.open_path).toHaveBeenCalledWith("/external/notes.md");
    expect(document_open).not.toHaveBeenCalled();
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("routes a recent_note item with a .pdf path to document_open", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_recent_note_item("archive/notes.pdf"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("archive/notes.pdf"),
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("routes a same-vault cross_vault_note .pdf to document_open", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_cross_vault_item("docs/report.pdf", "vault-1"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("docs/report.pdf"),
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("opens a same-vault cross_vault_note .md in the editor", async () => {
    const { registry, document_open, services } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_cross_vault_item("docs/alpha.md", "vault-1"),
    );

    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("docs/alpha.md"),
      false,
      { cleanup_if_missing: true },
    );
    expect(document_open).not.toHaveBeenCalled();
  });

  it("shows the cross-vault confirm dialog without opening for another vault", async () => {
    const { registry, document_open, services, stores } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_cross_vault_item("docs/beta.md", "vault-b"),
    );

    expect(stores.ui.cross_vault_open_confirm).toEqual({
      open: true,
      target_vault_id: as_vault_id("vault-b"),
      target_vault_name: "vault-b",
      note_path: as_note_path("docs/beta.md"),
    });
    expect(services.note.open_note).not.toHaveBeenCalled();
    expect(document_open).not.toHaveBeenCalled();
  });
});
