import { describe, expect, it, vi } from "vitest";
import { MetadataService } from "$lib/features/metadata/application/metadata_service";
import { MetadataStore } from "$lib/features/metadata/state/metadata_store.svelte";
import type { MetadataPort } from "$lib/features/metadata/ports";
import type { VaultStore } from "$lib/features/vault";

function create_mock_vault_store(vault_id: string | null): VaultStore {
  return { vault: vault_id ? { id: vault_id } : null } as VaultStore;
}

function create_mock_port(
  metadata = { properties: [], tags: [] },
): MetadataPort {
  return {
    get_note_metadata: vi.fn().mockResolvedValue(metadata),
  };
}

describe("MetadataService", () => {
  it("refreshes metadata for a note", async () => {
    const store = new MetadataStore();
    const metadata = {
      properties: [{ key: "title", value: "Test", type: "string" }],
      tags: [{ tag: "svelte", source: "frontmatter" as const }],
    };
    const port = create_mock_port(metadata);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new MetadataService(port, store, vault_store);

    await service.refresh("notes/test.md");

    expect(port.get_note_metadata).toHaveBeenCalledWith(
      "vault-1",
      "notes/test.md",
    );
    expect(store.properties).toEqual(metadata.properties);
    expect(store.tags).toEqual(metadata.tags);
    expect(store.note_path).toBe("notes/test.md");
    expect(store.loading).toBe(false);
  });

  it("does nothing when no vault is active", async () => {
    const store = new MetadataStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store(null);
    const service = new MetadataService(port, store, vault_store);

    await service.refresh("notes/test.md");

    expect(port.get_note_metadata).not.toHaveBeenCalled();
  });

  it("sets error on port failure", async () => {
    const store = new MetadataStore();
    const port: MetadataPort = {
      get_note_metadata: vi.fn().mockRejectedValue(new Error("db error")),
    };
    const vault_store = create_mock_vault_store("vault-1");
    const service = new MetadataService(port, store, vault_store);

    await service.refresh("notes/test.md");

    expect(store.error).toBe("db error");
    expect(store.loading).toBe(false);
  });

  it("clears store state", () => {
    const store = new MetadataStore();
    store.set_metadata("notes/test.md", [], []);
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new MetadataService(port, store, vault_store);

    service.clear();

    expect(store.note_path).toBeNull();
    expect(store.properties).toEqual([]);
  });
});
