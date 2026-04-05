import { describe, expect, it } from "vitest";
import { build_command_context } from "$lib/features/search/domain/build_command_context";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";

function make_stores(
  overrides: {
    editor?: Partial<EditorStore>;
    git?: Partial<GitStore>;
    ai?: Partial<AiStore>;
    ui?: Partial<UIStore>;
  } = {},
) {
  const editor = new EditorStore();
  const git = new GitStore();
  const ai = new AiStore();
  const ui = new UIStore();

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

  return { editor, git, ai, ui };
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

  it("detects open note", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("test.md") },
    });
    const ctx = build_command_context(stores);
    expect(ctx.has_open_note).toBe(true);
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
    });
    const ctx = build_command_context(stores);
    expect(ctx.is_canvas_file).toBe(true);
    expect(ctx.is_excalidraw_file).toBe(false);
  });

  it("detects excalidraw file", () => {
    const stores = make_stores({
      editor: { open_note: make_open_note("drawing.excalidraw") },
    });
    const ctx = build_command_context(stores);
    expect(ctx.is_excalidraw_file).toBe(true);
    expect(ctx.is_canvas_file).toBe(false);
  });
});
