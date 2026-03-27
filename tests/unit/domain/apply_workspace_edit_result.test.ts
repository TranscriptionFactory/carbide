import { describe, it, expect, vi, beforeEach } from "vitest";
import { apply_workspace_edit_result } from "$lib/features/lsp/application/apply_workspace_edit_result";
import type { MarksmanWorkspaceEditResult } from "$lib/features/marksman";

function create_deps() {
  return {
    note_service: {
      open_note: vi.fn().mockResolvedValue({ status: "opened" }),
    } as any,
    editor_store: {
      open_note: null as any,
    } as any,
    tab_store: {
      find_tab_by_path: vi.fn().mockReturnValue(null),
      close_tab: vi.fn(),
    } as any,
    action_registry: {
      execute: vi.fn().mockResolvedValue(undefined),
    } as any,
    op_store: {
      fail: vi.fn(),
    } as any,
    uri_to_path: (uri: string) => {
      const prefix = "file:///vault/";
      if (!uri.startsWith(prefix)) return null;
      return uri.slice(prefix.length);
    },
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
  });

  it("reloads currently open file when modified", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = { meta: { path: "notes/test.md" } };

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

  it("does not reload file that is not currently open", async () => {
    const deps = create_deps();
    deps.editor_store.open_note = { meta: { path: "notes/other.md" } };

    const result: MarksmanWorkspaceEditResult = {
      files_created: [],
      files_deleted: [],
      files_modified: ["file:///vault/notes/test.md"],
      errors: [],
    };

    await apply_workspace_edit_result(result, deps);

    expect(deps.note_service.open_note).not.toHaveBeenCalled();
  });

  it("closes tab for deleted files and refreshes tree", async () => {
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

  it("refreshes filetree when files are created", async () => {
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
  });
});
