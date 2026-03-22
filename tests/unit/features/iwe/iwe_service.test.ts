import { describe, expect, it, vi } from "vitest";
import { IweService } from "$lib/features/iwe/application/iwe_service";
import { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { IwePort } from "$lib/features/iwe/ports";
import type { VaultStore } from "$lib/features/vault";

function create_mock_vault_store(vault_id: string | null): VaultStore {
  return { vault: vault_id ? { id: vault_id } : null } as VaultStore;
}

function create_mock_ui_store(): UIStore {
  return new UIStore();
}

function create_mock_port(): IwePort {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    did_open: vi.fn().mockResolvedValue(undefined),
    did_change: vi.fn().mockResolvedValue(undefined),
    did_save: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue({ contents: "hover text" }),
    references: vi.fn().mockResolvedValue([]),
    definition: vi.fn().mockResolvedValue([]),
    code_actions: vi.fn().mockResolvedValue([]),
    code_action_resolve: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    workspace_symbols: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    prepare_rename: vi.fn().mockResolvedValue(null),
    completion: vi.fn().mockResolvedValue([]),
    formatting: vi.fn().mockResolvedValue([]),
    inlay_hints: vi.fn().mockResolvedValue([]),
    subscribe_diagnostics: vi.fn().mockReturnValue(() => {}),
  };
}

describe("IweService", () => {
  it("start sets status to running on success", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    await service.start();

    expect(port.start).toHaveBeenCalledWith("vault-1", "");
    expect(store.status).toBe("running");
  });

  it("start does nothing when no vault", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store(null);
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    await service.start();

    expect(port.start).not.toHaveBeenCalled();
    expect(store.status).toBe("idle");
  });

  it("start sets error on failure", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    port.start = vi.fn().mockRejectedValue(new Error("iwes not found"));
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    await service.start();

    expect(store.status).toBe("error");
    expect(store.error).toBe("iwes not found");
  });

  it("stop calls port and resets store", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.stop();

    expect(port.stop).toHaveBeenCalledWith("vault-1");
    expect(store.status).toBe("idle");
  });

  it("did_open sends notification when running", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.did_open("notes/test.md", "# Hello");

    expect(port.did_open).toHaveBeenCalledWith(
      "vault-1",
      "notes/test.md",
      "# Hello",
    );
  });

  it("did_open skips when not running", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    await service.did_open("notes/test.md", "# Hello");

    expect(port.did_open).not.toHaveBeenCalled();
  });

  it("did_change increments version", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.did_open("notes/test.md", "v1");
    await service.did_change("notes/test.md", "v2");

    expect(port.did_change).toHaveBeenCalledWith(
      "vault-1",
      "notes/test.md",
      2,
      "v2",
    );
  });

  it("hover stores result", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.hover("notes/test.md", 1, 0);

    expect(store.last_hover?.contents).toBe("hover text");
  });

  it("hover clears result on error", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    port.hover = vi.fn().mockRejectedValue(new Error("fail"));
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    store.set_hover({ contents: "old" });
    await service.hover("notes/test.md", 1, 0);

    expect(store.last_hover).toBeNull();
  });

  it("references stores results", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const refs = [
      {
        uri: "file:///test.md",
        range: {
          start_line: 0,
          start_character: 0,
          end_line: 0,
          end_character: 5,
        },
      },
    ];
    port.references = vi.fn().mockResolvedValue(refs);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.references("notes/test.md", 0, 0);

    expect(store.references).toEqual(refs);
    expect(store.loading).toBe(false);
  });

  it("code_actions stores results", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const actions = [{ title: "Extract", kind: "refactor", data: null }];
    port.code_actions = vi.fn().mockResolvedValue(actions);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.code_actions("test.md", 0, 0, 5, 0);

    expect(store.code_actions).toEqual(actions);
  });

  it("code_action_resolve reports errors in result", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    port.code_action_resolve = vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///test.md"],
      errors: ["partial failure"],
    });
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.code_action_resolve('{"title":"test"}');

    expect(store.loading).toBe(false);
  });

  it("workspace_symbols stores results", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const symbols = [
      {
        name: "Intro",
        kind: 6,
        location: {
          uri: "file:///test.md",
          range: {
            start_line: 0,
            start_character: 0,
            end_line: 5,
            end_character: 0,
          },
        },
      },
    ];
    port.workspace_symbols = vi.fn().mockResolvedValue(symbols);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.workspace_symbols("intro");

    expect(store.symbols).toEqual(symbols);
  });

  it("completion stores results", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const items = [
      { label: "[[link]]", detail: null, insert_text: "[[link]]" },
    ];
    port.completion = vi.fn().mockResolvedValue(items);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.completion("test.md", 1, 2);

    expect(store.completions).toEqual(items);
  });

  it("inlay_hints stores results", async () => {
    const store = new IweStore();
    const port = create_mock_port();
    const hints = [
      { position_line: 0, position_character: 5, label: "3 refs" },
    ];
    port.inlay_hints = vi.fn().mockResolvedValue(hints);
    const vault_store = create_mock_vault_store("vault-1");
    const service = new IweService(
      port,
      store,
      vault_store,
      create_mock_ui_store(),
    );

    store.set_status("running");
    await service.inlay_hints("test.md");

    expect(store.inlay_hints).toEqual(hints);
  });
});
