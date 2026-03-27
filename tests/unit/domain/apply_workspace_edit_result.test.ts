import { describe, it, expect, vi, beforeEach } from "vitest";
import { apply_workspace_edit_result } from "$lib/features/lsp/application/apply_workspace_edit_result";
import type { MarksmanWorkspaceEditResult } from "$lib/features/marksman";

function create_deps() {
  return {
    note_service: {
      open_note: vi.fn().mockResolvedValue({ status: "opened" }),
    } as any,
    editor_service: {
      sync_visual_from_markdown: vi.fn(),
    } as any,
    editor_store: {
      open_note: null as any,
      set_markdown: vi.fn(),
      set_dirty: vi.fn(),
    } as any,
    tab_store: {
      find_tab_by_path: vi.fn().mockReturnValue(null),
      close_tab: vi.fn(),
    } as any,
    tab_service: {
      invalidate_cache: vi.fn(),
    } as any,
    action_registry: {
      execute: vi.fn().mockResolvedValue(undefined),
    } as any,
    op_store: {
      fail: vi.fn(),
    } as any,
    watcher_service: {
      suppress_next: vi.fn(),
    } as any,
    is_vault_mode: () => true,
    uri_to_path: (uri: string) => {
      const prefix = "file:///vault/";
      if (!uri.startsWith(prefix)) return null;
      return uri.slice(prefix.length);
    },
    read_note_content: vi
      .fn()
      .mockResolvedValue("# Updated\nNew content" as any),
  };
}

describe("apply_workspace_edit_result", () => {
  it("does nothing for empty result", async () => {
    const deps = create_deps();
    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.note_service.open_note).not.toHaveBeenCalled();
    expect(deps.action_registry.execute).not.toHaveBeenCalled();
    expect(deps.op_store.fail).not.toHaveBeenCalled();
    expect(deps.watcher_service.suppress_next).not.toHaveBeenCalled();
  });

  it("applies content via editor session for undo-able open file update", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = {
      meta: { id: "notes/test.md", path: "notes/test.md" },
    };

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.read_note_content).toHaveBeenCalledWith("notes/test.md");
    expect(deps.editor_service.sync_visual_from_markdown).toHaveBeenCalledWith(
      "# Updated\nNew content",
    );
    expect(deps.editor_store.set_markdown).toHaveBeenCalledWith(
      "notes/test.md",
      "# Updated\nNew content",
    );
    expect(deps.editor_store.set_dirty).toHaveBeenCalledWith(
      "notes/test.md",
      false,
    );
    expect(deps.note_service.open_note).not.toHaveBeenCalled();
  });

  it("falls back to force_reload when read_note_content fails", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = {
      meta: { id: "notes/test.md", path: "notes/test.md" },
    };
    deps.read_note_content.mockRejectedValue(new Error("read failed"));

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.note_service.open_note).toHaveBeenCalledWith(
      "notes/test.md",
      false,
      { force_reload: true },
    );
  });

  it("invalidates background tab cache for modified non-open file", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = { meta: { path: "notes/other.md" } };
    deps.tab_store.find_tab_by_path.mockReturnValue({ id: "tab-1" });

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.note_service.open_note).not.toHaveBeenCalled();
    expect(deps.tab_service.invalidate_cache).toHaveBeenCalledWith(
      "notes/test.md",
    );
  });

  it("suppresses watcher for all affected paths", async () => {
    const deps = create_deps();

    const result: MarksmanWorkspaceEditResult = {
      files_created: ["file:///vault/notes/new.md"],
      files_deleted: ["file:///vault/notes/old.md"],
      files_modified: ["file:///vault/notes/changed.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.watcher_service.suppress_next).toHaveBeenCalledWith(
      "notes/changed.md",
    );
    expect(deps.watcher_service.suppress_next).toHaveBeenCalledWith(
      "notes/new.md",
    );
    expect(deps.watcher_service.suppress_next).toHaveBeenCalledWith(
      "notes/old.md",
    );
  });

  it("closes tab for deleted files and reconciles workspace", async () => {
    const deps = create_deps();
    deps.tab_store.find_tab_by_path.mockReturnValue({ id: "tab-1" });

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: ["file:///vault/notes/removed.md"],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.tab_store.close_tab).toHaveBeenCalledWith("tab-1");
    expect(deps.action_registry.execute).toHaveBeenCalledWith(
      "folder.refresh_tree",
    );
  });

  it("reconciles workspace with index sync when files are created", async () => {
    const deps = create_deps();

    const result: MarksmanWorkspaceEditResult = {
      files_created: ["file:///vault/notes/new.md"],
      files_deleted: [],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.action_registry.execute).toHaveBeenCalledWith(
      "folder.refresh_tree",
    );
    expect(deps.action_registry.execute).toHaveBeenCalledWith(
      "vault.sync_index_paths",
      expect.objectContaining({
        changed_paths: ["notes/new.md"],
        removed_paths: [],
      }),
    );
  });

  it("reports errors via op_store", async () => {
    const deps = create_deps();

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: ["Failed to write file"],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.op_store.fail).toHaveBeenCalledWith(
      "workspace_edit",
      expect.stringContaining("Failed to write file"),
    );
  });

  it("ignores URIs that do not match vault path", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = { meta: { path: "notes/test.md" } };

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///other-vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.note_service.open_note).not.toHaveBeenCalled();
    expect(deps.watcher_service.suppress_next).not.toHaveBeenCalled();
  });
});
