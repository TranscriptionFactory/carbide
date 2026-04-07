import { describe, it, expect, vi } from "vitest";
import { apply_workspace_edit_result } from "$lib/features/lsp/application/apply_workspace_edit_result";
import type { WorkspaceEditDeps } from "$lib/features/lsp/application/apply_workspace_edit_result";
import type { MarkdownLspWorkspaceEditResult } from "$lib/features/markdown_lsp";
import type { MarkdownText } from "$lib/shared/types/ids";

function create_deps() {
  const open_note = vi.fn().mockResolvedValue({ status: "opened" });
  const sync_visual_from_markdown = vi.fn();
  const sync_visual_from_markdown_diff = vi.fn().mockReturnValue(true);
  const mark_clean = vi.fn();
  const set_markdown = vi.fn();
  const set_dirty = vi.fn();
  const find_tab_by_path = vi.fn().mockReturnValue(null);
  const close_tab = vi.fn();
  const invalidate_cache = vi.fn();
  const execute = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn();
  const suppress_next = vi.fn();
  const read_note_content = vi
    .fn<(path: string) => Promise<MarkdownText>>()
    .mockResolvedValue("# Updated\nNew content" as MarkdownText);
  const editor_store = {
    open_note: null,
    set_markdown,
    set_dirty,
  } as unknown as WorkspaceEditDeps["editor_store"];

  return {
    deps: {
      note_service: {
        open_note,
      } as unknown as WorkspaceEditDeps["note_service"],
      editor_service: {
        sync_visual_from_markdown,
        sync_visual_from_markdown_diff,
        mark_clean,
      } as unknown as WorkspaceEditDeps["editor_service"],
      editor_store,
      tab_store: {
        find_tab_by_path,
        close_tab,
      } as unknown as WorkspaceEditDeps["tab_store"],
      tab_service: {
        invalidate_cache,
      } as unknown as WorkspaceEditDeps["tab_service"],
      action_registry: {
        execute,
      } as unknown as WorkspaceEditDeps["action_registry"],
      op_store: { fail } as unknown as WorkspaceEditDeps["op_store"],
      watcher_service: {
        suppress_next,
      } as unknown as WorkspaceEditDeps["watcher_service"],
      is_vault_mode: () => true,
      uri_to_path: (uri: string) => {
        const prefix = "file:///vault/";
        if (!uri.startsWith(prefix)) return null;
        return uri.slice(prefix.length);
      },
      read_note_content,
    } satisfies WorkspaceEditDeps,
    editor_store,
    mocks: {
      open_note,
      sync_visual_from_markdown,
      sync_visual_from_markdown_diff,
      mark_clean,
      set_markdown,
      set_dirty,
      find_tab_by_path,
      close_tab,
      invalidate_cache,
      execute,
      fail,
      suppress_next,
      read_note_content,
    },
  };
}

describe("apply_workspace_edit_result", () => {
  it("does nothing for empty result", async () => {
    const { deps, mocks } = create_deps();
    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.open_note).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.suppress_next).not.toHaveBeenCalled();
  });

  it("applies content via diff-based editor sync for undoable open file update", async () => {
    const { deps, editor_store, mocks } = create_deps();
    editor_store.open_note = {
      meta: { id: "notes/test.md", path: "notes/test.md" },
    } as WorkspaceEditDeps["editor_store"]["open_note"];

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.read_note_content).toHaveBeenCalledWith("notes/test.md");
    expect(mocks.sync_visual_from_markdown_diff).toHaveBeenCalledWith(
      "# Updated\nNew content",
    );
    expect(mocks.sync_visual_from_markdown).not.toHaveBeenCalled();
    expect(mocks.set_markdown).toHaveBeenCalledWith(
      "notes/test.md",
      "# Updated\nNew content",
    );
    expect(mocks.mark_clean).toHaveBeenCalled();
    expect(mocks.open_note).not.toHaveBeenCalled();
  });

  it("falls back to set_markdown when diff-based sync returns false", async () => {
    const { deps, editor_store, mocks } = create_deps();
    mocks.sync_visual_from_markdown_diff.mockReturnValue(false);
    editor_store.open_note = {
      meta: { id: "notes/test.md", path: "notes/test.md" },
    } as WorkspaceEditDeps["editor_store"]["open_note"];

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.sync_visual_from_markdown_diff).toHaveBeenCalledWith(
      "# Updated\nNew content",
    );
    expect(mocks.sync_visual_from_markdown).toHaveBeenCalledWith(
      "# Updated\nNew content",
    );
  });

  it("falls back to force_reload when read_note_content fails", async () => {
    const { deps, editor_store, mocks } = create_deps();
    editor_store.open_note = {
      meta: { id: "notes/test.md", path: "notes/test.md" },
    } as WorkspaceEditDeps["editor_store"]["open_note"];
    mocks.read_note_content.mockRejectedValue(new Error("read failed"));

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.open_note).toHaveBeenCalledWith("notes/test.md", false, {
      force_reload: true,
    });
  });

  it("invalidates background tab cache for modified non-open file", async () => {
    const { deps, editor_store, mocks } = create_deps();
    editor_store.open_note = {
      meta: { path: "notes/other.md" },
    } as WorkspaceEditDeps["editor_store"]["open_note"];
    mocks.find_tab_by_path.mockReturnValue({ id: "tab-1" });

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.open_note).not.toHaveBeenCalled();
    expect(mocks.invalidate_cache).toHaveBeenCalledWith("notes/test.md");
  });

  it("suppresses watcher for all affected paths", async () => {
    const { deps, mocks } = create_deps();

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: ["file:///vault/notes/new.md"],
      files_deleted: ["file:///vault/notes/old.md"],
      files_modified: ["file:///vault/notes/changed.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.suppress_next).toHaveBeenCalledWith("notes/changed.md");
    expect(mocks.suppress_next).toHaveBeenCalledWith("notes/new.md");
    expect(mocks.suppress_next).toHaveBeenCalledWith("notes/old.md");
  });

  it("closes tab for deleted files and reconciles workspace", async () => {
    const { deps, mocks } = create_deps();
    mocks.find_tab_by_path.mockReturnValue({ id: "tab-1" });

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: ["file:///vault/notes/removed.md"],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.close_tab).toHaveBeenCalledWith("tab-1");
    expect(mocks.execute).toHaveBeenCalledWith("folder.refresh_tree");
  });

  it("reconciles workspace with index sync when files are created", async () => {
    const { deps, mocks } = create_deps();

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: ["file:///vault/notes/new.md"],
      files_deleted: [],
      files_modified: [],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.execute).toHaveBeenCalledWith("folder.refresh_tree");
    expect(mocks.execute).toHaveBeenCalledWith(
      "vault.sync_index_paths",
      expect.objectContaining({
        changed_paths: ["notes/new.md"],
        removed_paths: [],
      }),
    );
  });

  it("reports errors via op_store", async () => {
    const { deps, mocks } = create_deps();

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: ["Failed to write file"],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.fail).toHaveBeenCalledWith(
      "workspace_edit",
      expect.stringContaining("Failed to write file"),
    );
  });

  it("ignores URIs that do not match vault path", async () => {
    const { deps, editor_store, mocks } = create_deps();
    editor_store.open_note = {
      meta: { path: "notes/test.md" },
    } as WorkspaceEditDeps["editor_store"]["open_note"];

    const result: MarkdownLspWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///other-vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(mocks.open_note).not.toHaveBeenCalled();
    expect(mocks.suppress_next).not.toHaveBeenCalled();
  });
});
