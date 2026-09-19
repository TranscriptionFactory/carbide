import { describe, expect, it, vi } from "vitest";
import type {
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import type { DslLanguage } from "$lib/features/editor/adapters/dsl_suggest_plugin";
import {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { BasesStore } from "$lib/features/bases";
import type { TagPort } from "$lib/features/tags";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";
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

type CapturedSuggestions = {
  language: DslLanguage;
  items: DslSuggestion[];
  from_offset: number;
};

type DslSuggestSession = EditorSession & {
  captured_dsl_suggestions: CapturedSuggestions[];
};

function create_session_with_dsl_suggest(): DslSuggestSession {
  const captured_dsl_suggestions: CapturedSuggestions[] = [];
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn(),
    get_markdown: vi.fn(() => ""),
    insert_text_at_cursor: vi.fn(),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    set_dsl_suggestions: (language, items, from_offset) => {
      captured_dsl_suggestions.push({ language, items, from_offset });
    },
    captured_dsl_suggestions,
  };
}

function create_setup(
  session: DslSuggestSession,
  available_properties: { name: string }[],
) {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());

  const bases_store = new BasesStore();
  bases_store.available_properties = available_properties.map((p) => ({
    name: p.name,
    property_type: "string",
    count: 1,
    unique_values: null,
  }));

  let session_config: EditorSessionConfig | undefined;
  const editor_port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) => {
      session_config = config;
      return Promise.resolve(session);
    }),
  };

  const callbacks: EditorServiceCallbacks = {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
    on_file_drop_requested: vi.fn(),
  };

  // the DSL suggest events are only wired when a tag or notes port is present
  const tag_port: TagPort = {
    list_all_tags: vi.fn(() => Promise.resolve([])),
    get_notes_for_tag: vi.fn(() => Promise.resolve([])),
    get_notes_for_tag_prefix: vi.fn(() => Promise.resolve([])),
  };

  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    op_store,
    callbacks,
    undefined,
    undefined,
    undefined,
    tag_port,
    undefined,
    undefined,
    undefined,
    bases_store,
  );

  return { service, bases_store, get_config: () => session_config };
}

function require_config(
  config: EditorSessionConfig | undefined,
): EditorSessionConfig {
  if (!config) throw new Error("session_config not set — mount() not called");
  return config;
}

function require_first<T>(arr: T[]): T {
  const item = arr[0];
  if (item === undefined)
    throw new Error("Expected at least one captured item");
  return item;
}

describe("handle_dsl_suggest_query — property names", () => {
  it("offers frontmatter properties from the bases store after with", async () => {
    const session = create_session_with_dsl_suggest();
    const { service, get_config } = create_setup(session, [
      { name: "status" },
      { name: "priority" },
    ]);
    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Test"),
    });

    const config = require_config(get_config());
    config.events.on_dsl_query_suggest?.("notes with ");
    await vi.waitUntil(() => session.captured_dsl_suggestions.length > 0);

    const captured = require_first(session.captured_dsl_suggestions);
    const labels = captured.items.map((i) => i.label);
    expect(captured.language).toBe("query");
    expect(labels).toContain("status");
    expect(labels).toContain("priority");
  });

  it("reflects a property refresh without remounting", async () => {
    const session = create_session_with_dsl_suggest();
    const { service, bases_store, get_config } = create_setup(session, [
      { name: "status" },
    ]);
    await service.mount({
      root: {} as HTMLDivElement,
      note: create_open_note("test.md", "# Test"),
    });

    const config = require_config(get_config());
    config.events.on_dsl_query_suggest?.("notes with ");
    await vi.waitUntil(() => session.captured_dsl_suggestions.length > 0);

    bases_store.available_properties = [
      {
        name: "owner",
        property_type: "string",
        count: 2,
        unique_values: null,
      },
    ];
    config.events.on_dsl_query_suggest?.("notes with ");
    await vi.waitUntil(() => session.captured_dsl_suggestions.length > 1);

    const labels = session.captured_dsl_suggestions[1]?.items.map(
      (i) => i.label,
    );
    expect(labels).toContain("owner");
    expect(labels).not.toContain("status");
  });
});
