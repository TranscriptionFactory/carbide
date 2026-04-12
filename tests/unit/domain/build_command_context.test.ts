import { describe, expect, it } from "vitest";
import { build_command_context } from "$lib/features/search/domain/build_command_context";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { Tab } from "$lib/features/tab/types/tab";

function make_note_tab(path: string): Tab {
  return {
    id: `tab-${path}`,
    title: path.replace(/\.md$/, ""),
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "note",
    note_path: path as any,
  };
}

function make_document_tab(path: string, file_type: string): Tab {
  return {
    id: `tab-${path}`,
    title: path,
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "document",
    file_path: path,
    file_type,
  };
}

function make_stores(
  overrides: {
    editor?: Partial<EditorStore>;
    git?: Partial<GitStore>;
    ai?: Partial<AiStore>;
    ui?: Partial<UIStore>;
    active_tab?: Tab | null;
  } = {},
) {
  const editor = new EditorStore();
  const git = new GitStore();
  const ai = new AiStore();
  const ui = new UIStore();
  const tab = new TabStore();

  if (overrides.editor?.open_note) {
    editor.open_note = overrides.editor.open_note;
  }
  if (overrides.editor?.selection !== undefined) {
    editor.selection = overrides.editor.selection;
  }
  if (overrides.editor?.split_view !== undefined) {
    editor.split_view = overrides.editor.split_view;
  }
  if (overrides.git?.enabled !== undefined) {
    git.enabled = overrides.git.enabled;
  }
  if (overrides.git?.has_remote !== undefined) {
    git.has_remote = overrides.git.has_remote;
  }
  if (overrides.ai?.dialog?.cli_status) {
    ai.dialog.cli_status = overrides.ai.dialog.cli_status;
  }
  if (overrides.active_tab) {
    tab.tabs = [overrides.active_tab];
    tab.active_tab_id = overrides.active_tab.id;
  }

  return { editor, tab, git, ai, ui };
}

function make_open_note(path: string) {
  return {
    meta: {
      id: path,
      path,
      name: path.replace(/\.md$/, ""),
      title: path.replace(/\.md$/, ""),
      mtime_ms: 0,
      ctime_ms: 0,
      blurb: null,
      size_bytes: 0,
      file_type: null,
    },
    markdown: "",
    is_dirty: false,
  } as any;
}

describe("build_command_context", () => {
  it("returns all false for empty stores", () => {
    const stores = make_stores();
    const ctx = build_command_context(stores);

    expect(ctx.has_open_note).toBe(false);
    expect(ctx.has_git_repo).toBe(false);
    expect(ctx.has_git_remote).toBe(false);
    expect(ctx.has_ai_cli).toBe(false);
    expect(ctx.is_split_view).toBe(false);
    expect(ctx.has_selection).toBe(false);
    expect(ctx.is_canvas_file).toBe(false);
    expect(ctx.is_excalidraw_file).toBe(false);
  });

  it("detects open note when active tab is a note", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("test.md") },
      active_tab: make_note_tab("test.md"),
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_open_note).toBe(true);
  });

  it("returns has_open_note false when active tab is not a note", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("test.md") },
      active_tab: make_document_tab("report.html", "html"),
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_open_note).toBe(false);
  });

  it("detects git repo and remote", () => {
    const stores = make_stores({
      git: { enabled: true, has_remote: true },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_git_repo).toBe(true);
    expect(ctx.has_git_remote).toBe(true);
  });

  it("detects available AI CLI", () => {
    const stores = make_stores({
      ai: { dialog: { cli_status: "available" } as any },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_ai_cli).toBe(true);
  });

  it("returns false for unavailable AI CLI", () => {
    const stores = make_stores({
      ai: { dialog: { cli_status: "unavailable" } as any },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_ai_cli).toBe(false);
  });

  it("detects split view", () => {
    const stores = make_stores({
      editor: { split_view: true },
    });
    const ctx = build_command_context(stores);
    expect(ctx.is_split_view).toBe(true);
  });

  it("detects selection with non-empty text", () => {
    const stores = make_stores({
      editor: {
        selection: { from: 0, to: 5, text: "hello" } as any,
      },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_selection).toBe(true);
  });

  it("returns false for empty selection text", () => {
    const stores = make_stores({
      editor: {
        selection: { from: 0, to: 0, text: "" } as any,
      },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_selection).toBe(false);
  });

  it("detects canvas file", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("diagram.canvas") },
      active_tab: make_note_tab("diagram.canvas"),
    });
    const ctx = build_command_context(stores);
    expect(ctx.is_canvas_file).toBe(true);
    expect(ctx.is_excalidraw_file).toBe(false);
  });

  it("detects excalidraw file", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("drawing.excalidraw") },
      active_tab: make_note_tab("drawing.excalidraw"),
    });
    const ctx = build_command_context(stores);
    expect(ctx.is_excalidraw_file).toBe(true);
    expect(ctx.is_canvas_file).toBe(false);
  });
});
