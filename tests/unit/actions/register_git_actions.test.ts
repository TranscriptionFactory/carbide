import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_git_actions } from "$lib/features/git/application/git_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
  },
}));

function create_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };

  const services = {
    note: {
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "notes",
      }),
      clear_open_note: vi.fn(),
    },
    editor: {
      close_buffer: vi.fn(),
    },
    tab: {
      remove_tab: vi.fn(),
    },
    git: {
      check_repo: vi.fn().mockResolvedValue(undefined),
      init_repo: vi.fn().mockResolvedValue({ status: "initialized" }),
      refresh_status: vi.fn().mockResolvedValue(undefined),
      commit_all: vi.fn().mockResolvedValue(undefined),
      load_history: vi.fn().mockResolvedValue(undefined),
      load_more_history: vi.fn().mockResolvedValue(undefined),
      get_diff: vi
        .fn()
        .mockResolvedValue({ additions: 1, deletions: 0, hunks: [] }),
      get_file_at_commit: vi.fn().mockResolvedValue("# at commit"),
      restore_version: vi.fn().mockResolvedValue(undefined),
      discard_file: vi
        .fn()
        .mockImplementation((path: string) =>
          Promise.resolve({ status: "discarded", paths: [path] }),
        ),
      discard_all: vi
        .fn()
        .mockImplementation((paths: string[]) =>
          Promise.resolve({ status: "discarded", paths }),
        ),
      create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
      push: vi
        .fn()
        .mockResolvedValue({ success: true, message: null, error: null }),
      fetch_remote: vi
        .fn()
        .mockResolvedValue({ success: true, message: null, error: null }),
      pull: vi
        .fn()
        .mockResolvedValue({ success: true, message: null, error: null }),
      sync: vi
        .fn()
        .mockResolvedValue({ success: true, message: null, error: null }),
      add_remote: vi
        .fn()
        .mockResolvedValue({ success: true, message: null, error: null }),
    },
    reference: {} as any,
  };

  register_git_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services };
}

describe("register_git_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("git_init shows already-repo toast for no-op init", async () => {
    const { registry, services } = create_harness();
    services.git.init_repo.mockResolvedValue({ status: "already_repo" });

    await registry.execute(ACTION_IDS.git_init);

    expect(toast.info).toHaveBeenCalledWith(
      "Git repository is already initialized",
    );
  });

  it("git_commit_all delegates to service commit_all", async () => {
    const { registry, stores, services } = create_harness();
    stores.git.set_status("main", true, 1, false, false, null, 0, 0);

    await registry.execute(ACTION_IDS.git_commit_all);

    expect(services.git.commit_all).toHaveBeenCalledTimes(1);
  });

  it("git_open_history opens dialog and loads history for current note", async () => {
    const { registry, stores, services } = create_harness();
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text(""),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    await registry.execute(ACTION_IDS.git_open_history);

    expect(stores.ui.version_history_dialog.open).toBe(true);
    expect(stores.ui.version_history_dialog.note_path).toBe("notes/a.md");
    expect(services.git.load_history).toHaveBeenCalledWith("notes/a.md", 20);
  });

  it("git_open_history does not reload when the same history dialog is already open", async () => {
    const { registry, stores, services } = create_harness();
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text(""),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.history_note_path = as_note_path("notes/a.md");

    await registry.execute(ACTION_IDS.git_open_history);

    expect(services.git.load_history).not.toHaveBeenCalled();
  });

  it("git_open_history does not reload while history is already loading", async () => {
    const { registry, stores, services } = create_harness();
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text(""),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.is_loading_history = true;

    await registry.execute(ACTION_IDS.git_open_history);

    expect(services.git.load_history).not.toHaveBeenCalled();
  });

  it("git_load_more_history delegates to service for the active note", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };

    await registry.execute(ACTION_IDS.git_load_more_history);

    expect(services.git.load_more_history).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      20,
    );
  });

  it("git_select_commit stores diff when commit has changes", async () => {
    const { registry, stores } = create_harness();
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.set_history(
      [
        {
          hash: "abc123",
          short_hash: "abc123",
          author: "me",
          timestamp_ms: 1,
          message: "update",
        },
      ],
      "notes/a.md",
    );

    await registry.execute(ACTION_IDS.git_select_commit, {
      hash: "abc123",
      short_hash: "abc123",
    });

    expect(stores.git.selected_commit?.hash).toBe("abc123");
    expect(stores.git.selected_diff).not.toBeNull();
    expect(stores.git.selected_file_content).toBeNull();
  });

  it("git_select_commit falls back to file content when diff is empty", async () => {
    const { registry, stores, services } = create_harness();
    services.git.get_diff.mockResolvedValue({
      additions: 0,
      deletions: 0,
      hunks: [],
    });
    services.git.get_file_at_commit.mockResolvedValue("# restored body");
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.git.set_history(
      [
        {
          hash: "def456",
          short_hash: "def456",
          author: "me",
          timestamp_ms: 1,
          message: "update",
        },
      ],
      "notes/a.md",
    );

    await registry.execute(ACTION_IDS.git_select_commit, {
      hash: "def456",
      short_hash: "def456",
    });

    expect(stores.git.selected_diff).toBeNull();
    expect(stores.git.selected_file_content).toBe("# restored body");
  });

  it("git_confirm_checkpoint trims description and closes dialog", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.checkpoint_dialog = {
      open: true,
      description: "  milestone  ",
    };

    await registry.execute(ACTION_IDS.git_confirm_checkpoint);

    expect(toast.loading).toHaveBeenCalledWith("Creating checkpoint commit...");
    expect(toast.success).toHaveBeenCalledWith("Checkpoint created", {
      id: "toast-id",
    });
    expect(services.git.create_checkpoint).toHaveBeenCalledWith("milestone");
    expect(stores.ui.checkpoint_dialog.open).toBe(false);
    expect(stores.ui.checkpoint_dialog.description).toBe("");
  });

  it("git_confirm_checkpoint shows init action when no repo", async () => {
    const { registry, stores, services } = create_harness();
    services.git.create_checkpoint.mockResolvedValue({ status: "no_repo" });
    stores.ui.checkpoint_dialog = {
      open: true,
      description: "milestone",
    };

    await registry.execute(ACTION_IDS.git_confirm_checkpoint);

    expect(toast.error).toHaveBeenCalledWith(
      "No git repository found",
      expect.objectContaining({
        id: "toast-id",
      }),
    );
    const call_args = vi.mocked(toast.error).mock.calls[0] as unknown[];
    const opts = call_args[1] as { action: { label: string } };
    expect(opts.action.label).toBe("Initialize");
  });

  it("git_restore_version force-reloads restored note and closes history", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.version_history_dialog = {
      open: true,
      note_path: as_note_path("notes/a.md"),
    };
    stores.tab.open_tab(as_note_path("notes/a.md"), "a");
    stores.editor.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a.md",
        title: "a",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text("# old"),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    await registry.execute(ACTION_IDS.git_restore_version, { hash: "abc123" });

    expect(services.git.restore_version).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      "abc123",
    );
    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      false,
      {
        force_reload: true,
      },
    );
    expect(stores.ui.version_history_dialog.open).toBe(false);
    expect(stores.ui.version_history_dialog.note_path).toBeNull();
  });

  it("git_add_remote opens dialog when no remote exists", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.git_add_remote);

    expect(stores.ui.add_remote_dialog).toEqual({
      open: true,
      url: "",
    });
  });

  it("git_add_remote shows info toast when remote already exists", async () => {
    const { registry, stores } = create_harness();
    stores.git.set_status("main", false, 0, true, false, null, 0, 0);

    await registry.execute(ACTION_IDS.git_add_remote);

    expect(toast.info).toHaveBeenCalledWith(
      "A git remote is already configured",
    );
    expect(stores.ui.add_remote_dialog.open).toBe(false);
  });

  it("git_confirm_add_remote trims url, submits, and closes dialog on success", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.add_remote_dialog = {
      open: true,
      url: "  git@github.com:carbide/repo.git  ",
    };

    await registry.execute(ACTION_IDS.git_confirm_add_remote);

    expect(services.git.add_remote).toHaveBeenCalledWith(
      "git@github.com:carbide/repo.git",
    );
    expect(stores.ui.add_remote_dialog).toEqual({
      open: false,
      url: "",
    });
    expect(toast.success).toHaveBeenCalledWith("Remote added", {
      id: "toast-id",
    });
  });

  it("git_update_remote_url updates the dialog input state", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(
      ACTION_IDS.git_update_remote_url,
      "git@github.com:carbide/repo.git",
    );

    expect(stores.ui.add_remote_dialog.url).toBe(
      "git@github.com:carbide/repo.git",
    );
  });

  it("git_confirm_add_remote keeps dialog open on failure", async () => {
    const { registry, stores, services } = create_harness();
    services.git.add_remote.mockResolvedValue({
      success: false,
      message: null,
      error: "remote failed",
    });
    stores.ui.add_remote_dialog = {
      open: true,
      url: "git@github.com:carbide/repo.git",
    };

    await registry.execute(ACTION_IDS.git_confirm_add_remote);

    expect(stores.ui.add_remote_dialog.open).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("remote failed", {
      id: "toast-id",
    });
  });

  it("git_cancel_add_remote resets dialog state", async () => {
    const { registry, stores } = create_harness();
    stores.ui.add_remote_dialog = {
      open: true,
      url: "git@github.com:carbide/repo.git",
    };

    await registry.execute(ACTION_IDS.git_cancel_add_remote);

    expect(stores.ui.add_remote_dialog).toEqual({
      open: false,
      url: "",
    });
  });

  it("git_fetch delegates to service and shows success toast", async () => {
    const { registry, services } = create_harness();

    await registry.execute(ACTION_IDS.git_fetch);

    expect(services.git.fetch_remote).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Fetched successfully", {
      id: "toast-id",
    });
  });

  it("git_request_discard only opens the dialog, never discards", async () => {
    const { registry, stores, services } = create_harness();

    await registry.execute(ACTION_IDS.git_request_discard, {
      file_path: "notes/a.md",
    });

    expect(stores.ui.discard_changes_dialog).toEqual({
      open: true,
      paths: ["notes/a.md"],
    });
    expect(services.git.discard_file).not.toHaveBeenCalled();
    expect(services.git.discard_all).not.toHaveBeenCalled();
  });

  it("git_request_discard_all stages every unstaged path for confirmation", async () => {
    const { registry, stores, services } = create_harness();
    stores.git.set_status("main", true, 2, false, false, null, 0, 0, [
      { path: "a.md", status: "modified" },
      { path: "b.md", status: "untracked" },
    ]);
    stores.git.stage_file("a.md");

    await registry.execute(ACTION_IDS.git_request_discard_all);

    expect(stores.ui.discard_changes_dialog).toEqual({
      open: true,
      paths: ["b.md"],
    });
    expect(services.git.discard_all).not.toHaveBeenCalled();
  });

  it("git_request_discard_all does nothing when there is nothing to discard", async () => {
    const { registry, stores } = create_harness();

    await registry.execute(ACTION_IDS.git_request_discard_all);

    expect(stores.ui.discard_changes_dialog.open).toBe(false);
  });

  it("git_cancel_discard clears the pending selection without discarding", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/a.md"] };

    await registry.execute(ACTION_IDS.git_cancel_discard);

    expect(stores.ui.discard_changes_dialog).toEqual({
      open: false,
      paths: [],
    });
    expect(services.git.discard_file).not.toHaveBeenCalled();
  });

  it("git_confirm_discard is a no-op without a pending selection", async () => {
    const { registry, services } = create_harness();

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(services.git.discard_file).not.toHaveBeenCalled();
    expect(services.git.discard_all).not.toHaveBeenCalled();
  });

  it("git_confirm_discard reloads the open note from HEAD", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/a.md"] };
    stores.tab.open_tab(as_note_path("notes/a.md"), "a");

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(services.git.discard_file).toHaveBeenCalledWith("notes/a.md");
    expect(services.editor.close_buffer).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
    );
    expect(services.note.open_note).toHaveBeenCalledWith(
      as_note_path("notes/a.md"),
      false,
      { force_reload: true, cleanup_if_missing: true },
    );
    expect(stores.ui.discard_changes_dialog.open).toBe(false);
  });

  it("git_confirm_discard drops the tab when the discarded file is gone", async () => {
    const { registry, stores, services } = create_harness();
    services.note.open_note.mockResolvedValue({ status: "not_found" });
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/new.md"] };
    stores.tab.open_tab(as_note_path("notes/new.md"), "new");

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(services.note.clear_open_note).toHaveBeenCalledTimes(1);
    expect(services.tab.remove_tab).toHaveBeenCalledWith(
      as_note_path("notes/new.md"),
    );
  });

  it("git_confirm_discard leaves unopened files alone", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/a.md"] };

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(services.git.discard_file).toHaveBeenCalledWith("notes/a.md");
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("git_confirm_discard closes the diff viewer showing a discarded file", async () => {
    const { registry, stores } = create_harness();
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/a.md"] };
    stores.ui.diff_viewer_dialog = { open: true, file_path: "notes/a.md" };

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(stores.ui.diff_viewer_dialog).toEqual({
      open: false,
      file_path: null,
    });
  });

  it("git_confirm_discard routes a multi-file selection through discard_all", async () => {
    const { registry, stores, services } = create_harness();
    stores.ui.discard_changes_dialog = {
      open: true,
      paths: ["a.md", "b.md"],
    };

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(services.git.discard_all).toHaveBeenCalledWith(["a.md", "b.md"]);
    expect(toast.success).toHaveBeenCalledWith("Discarded changes to 2 files", {
      id: "toast-id",
    });
  });

  it("git_confirm_discard surfaces a failure and reloads nothing", async () => {
    const { registry, stores, services } = create_harness();
    services.git.discard_file.mockResolvedValue({
      status: "failed",
      error: "notes/a.md has unresolved merge conflicts.",
    });
    stores.ui.discard_changes_dialog = { open: true, paths: ["notes/a.md"] };
    stores.tab.open_tab(as_note_path("notes/a.md"), "a");

    await registry.execute(ACTION_IDS.git_confirm_discard);

    expect(toast.error).toHaveBeenCalledWith(
      "notes/a.md has unresolved merge conflicts.",
      { id: "toast-id" },
    );
    expect(services.note.open_note).not.toHaveBeenCalled();
  });
});
