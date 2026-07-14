/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import type {
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(note_path: string, markdown: string): OpenNoteState {
  const path = as_note_path(note_path);
  return {
    meta: {
      id: path,
      path,
      name: note_path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "",
      title: note_path.replace(/\.md$/i, ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: markdown.length,
      file_type: null,
    },
    markdown: as_markdown_text(markdown),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush_until(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) {
    await Promise.resolve();
  }
  expect(cond()).toBe(true);
}

function create_dom_session(args: {
  index: number;
  root: HTMLElement;
  destroy_throws: boolean;
  events: string[];
}): EditorSession {
  const container = document.createElement("div");
  container.className = "session-root";
  const toolbar = document.createElement("div");
  toolbar.className = "formatting-toolbar-mount";
  const content = document.createElement("div");
  content.className = "ProseMirror";
  container.append(toolbar, content);
  args.root.appendChild(container);

  return {
    destroy: vi.fn(() => {
      args.events.push(`destroy:${String(args.index)}`);
      if (args.destroy_throws) {
        throw new Error(`destroy ${String(args.index)} failed`);
      }
      container.remove();
    }),
    set_markdown: vi.fn(),
    get_markdown: vi.fn(() => ""),
    insert_text_at_cursor: vi.fn(),
    replace_selection: vi.fn(),
    get_selected_text: vi.fn(() => null),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    get_view: () =>
      ({ dom: container }) as unknown as import("prosemirror-view").EditorView,
  };
}

function create_setup(args: { destroy_throws: boolean }) {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());

  const events: string[] = [];
  const gates: { promise: Promise<void>; resolve: () => void }[] = [];

  const editor_port: EditorPort = {
    start_session: vi.fn(async (config: EditorSessionConfig) => {
      const index = gates.length;
      events.push(`start:${String(index)}`);
      const gate = create_deferred();
      gates.push(gate);
      await gate.promise;
      return create_dom_session({
        index,
        root: config.root,
        destroy_throws: args.destroy_throws,
        events,
      });
    }),
  };

  const callbacks: EditorServiceCallbacks = {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
    on_file_drop_requested: vi.fn(),
  };

  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    op_store,
    callbacks,
  );

  return { service, editor_store, events, gates };
}

describe("EditorService session transitions", () => {
  it("keeps exactly one live editor and toolbar after overlapping mounts with throwing teardown", async () => {
    const { service, editor_store, events, gates } = create_setup({
      destroy_throws: true,
    });
    const root = document.createElement("div");
    const note = create_open_note("docs/alpha.md", "# Alpha");
    editor_store.set_open_note(note);

    const first_mount = service.mount({ root, note });
    const second_mount = service.mount({ root, note });

    await flush_until(() => gates.length === 1);
    gates[0]?.resolve();
    await flush_until(() => gates.length === 2);
    gates[1]?.resolve();
    await Promise.all([first_mount, second_mount]);

    expect(root.querySelectorAll(".formatting-toolbar-mount")).toHaveLength(1);
    expect(root.querySelectorAll(".session-root")).toHaveLength(1);
    expect(events).toEqual(["start:0", "destroy:0", "start:1"]);
  });

  it("removes the dead session DOM when a late session destroy throws", async () => {
    const { service, editor_store, gates } = create_setup({
      destroy_throws: true,
    });
    const root = document.createElement("div");
    const note = create_open_note("docs/alpha.md", "# Alpha");
    editor_store.set_open_note(note);

    const mount_promise = service.mount({ root, note });
    await flush_until(() => gates.length === 1);

    service.unmount();
    gates[0]?.resolve();
    await mount_promise;

    expect(root.querySelectorAll(".session-root")).toHaveLength(0);
    expect(root.querySelectorAll(".formatting-toolbar-mount")).toHaveLength(0);
    expect(service.is_mounted()).toBe(false);
  });

  it("removes the mounted session DOM when destroy throws during unmount", async () => {
    const { service, editor_store, events, gates } = create_setup({
      destroy_throws: true,
    });
    const root = document.createElement("div");
    const note = create_open_note("docs/alpha.md", "# Alpha");
    editor_store.set_open_note(note);

    const mount_promise = service.mount({ root, note });
    await flush_until(() => gates.length === 1);
    gates[0]?.resolve();
    await mount_promise;
    expect(root.querySelectorAll(".session-root")).toHaveLength(1);

    service.unmount();
    await flush_until(() => events.includes("destroy:0"));

    expect(root.querySelectorAll(".session-root")).toHaveLength(0);
    expect(root.querySelectorAll(".formatting-toolbar-mount")).toHaveLength(0);
  });
});
