import { describe, it, expect, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  extract_at_trigger,
  detect_prefix,
  dispatch_palette_queries,
} from "$lib/features/editor/adapters/at_palette_plugin";
import type { AtPalettePluginConfig } from "$lib/features/editor/adapters/at_palette_plugin";

function create_schema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        code: true,
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre" }],
      },
      math_block: {
        group: "block",
        content: "text*",
        code: true,
        toDOM: () => ["div", 0] as const,
        parseDOM: [{ tag: "div.math" }],
      },
      text: { group: "inline" },
    },
  });
}

function make_state(text: string, cursor_offset?: number): EditorState {
  const schema = create_schema();
  const para = schema.nodes["paragraph"].create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
  const doc = schema.nodes["doc"].create(null, [para]);
  const state = EditorState.create({ doc });
  const pos = cursor_offset ?? 1 + text.length;
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

function make_code_block_state(text: string): EditorState {
  const schema = create_schema();
  const block = schema.nodes["code_block"].create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
  const doc = schema.nodes["doc"].create(null, [block]);
  const state = EditorState.create({ doc });
  const pos = 1 + text.length;
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

function make_math_block_state(text: string): EditorState {
  const schema = create_schema();
  const block = schema.nodes["math_block"].create(
    null,
    text.length > 0 ? schema.text(text) : [],
  );
  const doc = schema.nodes["doc"].create(null, [block]);
  const state = EditorState.create({ doc });
  const pos = 1 + text.length;
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

describe("extract_at_trigger", () => {
  it("returns null for empty paragraph", () => {
    expect(extract_at_trigger(make_state(""))).toBeNull();
  });

  it("returns null when no @ present", () => {
    expect(extract_at_trigger(make_state("hello world"))).toBeNull();
  });

  it("returns trigger for bare @", () => {
    const result = extract_at_trigger(make_state("@"));
    expect(result).not.toBeNull();
    expect(result!.query).toBe("");
  });

  it("returns trigger for @ at start of line", () => {
    const result = extract_at_trigger(make_state("@tod"));
    expect(result).not.toBeNull();
    expect(result!.query).toBe("tod");
  });

  it("returns trigger for @ preceded by whitespace", () => {
    const result = extract_at_trigger(make_state("hello @tod"));
    expect(result).not.toBeNull();
    expect(result!.query).toBe("tod");
  });

  it("returns null when @ is preceded by non-whitespace (email-like)", () => {
    expect(extract_at_trigger(make_state("user@example"))).toBeNull();
  });

  it("returns null when inside code block", () => {
    expect(extract_at_trigger(make_code_block_state("@today"))).toBeNull();
  });

  it("returns null when inside math block", () => {
    expect(extract_at_trigger(make_math_block_state("@today"))).toBeNull();
  });

  it("allows spaces in query (unlike date_suggest)", () => {
    const result = extract_at_trigger(make_state("@next friday"));
    expect(result).not.toBeNull();
    expect(result!.query).toBe("next friday");
  });

  it("returns null for double-@", () => {
    expect(extract_at_trigger(make_state("@hello@world"))).toBeNull();
  });

  it("caps query at 40 characters", () => {
    const long_query = "a".repeat(41);
    expect(extract_at_trigger(make_state(`@${long_query}`))).toBeNull();
  });

  it("allows query up to 40 characters", () => {
    const query = "a".repeat(40);
    const result = extract_at_trigger(make_state(`@${query}`));
    expect(result).not.toBeNull();
    expect(result!.query).toBe(query);
  });

  it("returns correct from position for @ at start", () => {
    const result = extract_at_trigger(make_state("@tod"));
    expect(result!.from).toBe(1);
  });

  it("returns correct from position for @ after text", () => {
    const result = extract_at_trigger(make_state("hello @tod"));
    expect(result!.from).toBe(1 + "hello ".length);
  });

  it("returns null for range selection", () => {
    const schema = create_schema();
    const para = schema.nodes["paragraph"].create(null, schema.text("@today"));
    const doc = schema.nodes["doc"].create(null, [para]);
    const state = EditorState.create({ doc });
    const with_range = state.apply(
      state.tr.setSelection(TextSelection.create(doc, 1, 4)),
    );
    expect(extract_at_trigger(with_range)).toBeNull();
  });
});

describe("detect_prefix", () => {
  it("maps '/' to notes (markdown only)", () => {
    const result = detect_prefix("/roadmap");
    expect(result.category).toBe("notes");
    expect(result.stripped_query).toBe("roadmap");
    expect(result.markdown_only).toBe(true);
  });

  it("maps '//' to notes (all file types)", () => {
    const result = detect_prefix("//roadmap");
    expect(result.category).toBe("notes");
    expect(result.stripped_query).toBe("roadmap");
    expect(result.markdown_only).toBe(false);
  });

  it("maps '#' to headings", () => {
    const result = detect_prefix("#intro");
    expect(result.category).toBe("headings");
    expect(result.stripped_query).toBe("intro");
  });

  it("maps '[' to references", () => {
    const result = detect_prefix("[smith");
    expect(result.category).toBe("references");
    expect(result.stripped_query).toBe("smith");
  });

  it("maps '>' to commands", () => {
    const result = detect_prefix(">new");
    expect(result.category).toBe("commands");
    expect(result.stripped_query).toBe("new");
  });

  it("maps 'd:' to dates", () => {
    const result = detect_prefix("d:tomorrow");
    expect(result.category).toBe("dates");
    expect(result.stripped_query).toBe("tomorrow");
  });

  it("maps 't:' to tags", () => {
    const result = detect_prefix("t:project");
    expect(result.category).toBe("tags");
    expect(result.stripped_query).toBe("project");
  });

  it("does not activate tag mode for 't ' (legacy space rule removed)", () => {
    const result = detect_prefix("t project");
    expect(result.category).toBe("all");
    expect(result.stripped_query).toBe("t project");
  });

  it("does not activate tag mode for bare 't' (collides with words like 'table')", () => {
    const result = detect_prefix("table");
    expect(result.category).toBe("all");
    expect(result.stripped_query).toBe("table");
  });

  it("maps plain text to all", () => {
    const result = detect_prefix("something");
    expect(result.category).toBe("all");
    expect(result.stripped_query).toBe("something");
  });

  it("maps empty string to all", () => {
    const result = detect_prefix("");
    expect(result.category).toBe("all");
    expect(result.stripped_query).toBe("");
  });

  it("strips prefix even when nothing follows ('#')", () => {
    const result = detect_prefix("#");
    expect(result.category).toBe("headings");
    expect(result.stripped_query).toBe("");
  });

  it("strips prefix even when nothing follows ('[')", () => {
    const result = detect_prefix("[");
    expect(result.category).toBe("references");
    expect(result.stripped_query).toBe("");
  });

  it("strips prefix even when nothing follows ('t:')", () => {
    const result = detect_prefix("t:");
    expect(result.category).toBe("tags");
    expect(result.stripped_query).toBe("");
  });

  it("strips prefix even when nothing follows ('d:')", () => {
    const result = detect_prefix("d:");
    expect(result.category).toBe("dates");
    expect(result.stripped_query).toBe("");
  });
});

function make_config_spies() {
  const config: AtPalettePluginConfig = {
    on_note_query: vi.fn(),
    on_heading_query: vi.fn(),
    on_tag_query: vi.fn(),
    on_cite_query: vi.fn(),
    on_cite_accept: vi.fn(),
    on_command_execute: vi.fn(),
    get_commands: () => [],
  };
  return config;
}

describe("dispatch_palette_queries", () => {
  it("'#' (no follow-up) fires heading query with empty string, not '#'", () => {
    const config = make_config_spies();
    dispatch_palette_queries("#", detect_prefix("#"), config);
    expect(config.on_heading_query).toHaveBeenCalledWith(null, "");
    expect(config.on_tag_query).not.toHaveBeenCalled();
    expect(config.on_cite_query).not.toHaveBeenCalled();
    expect(config.on_note_query).not.toHaveBeenCalled();
  });

  it("'[' (no follow-up) fires cite query with empty string, not '['", () => {
    const config = make_config_spies();
    dispatch_palette_queries("[", detect_prefix("["), config);
    expect(config.on_cite_query).toHaveBeenCalledWith("");
    expect(config.on_tag_query).not.toHaveBeenCalled();
    expect(config.on_heading_query).not.toHaveBeenCalled();
    expect(config.on_note_query).not.toHaveBeenCalled();
  });

  it("'t:' (no follow-up) fires tag query with empty string, not 't:'", () => {
    const config = make_config_spies();
    dispatch_palette_queries("t:", detect_prefix("t:"), config);
    expect(config.on_tag_query).toHaveBeenCalledWith("");
    expect(config.on_heading_query).not.toHaveBeenCalled();
    expect(config.on_cite_query).not.toHaveBeenCalled();
    expect(config.on_note_query).not.toHaveBeenCalled();
  });

  it("'#intro' passes only the stripped query to heading callback", () => {
    const config = make_config_spies();
    dispatch_palette_queries("#intro", detect_prefix("#intro"), config);
    expect(config.on_heading_query).toHaveBeenCalledWith(null, "intro");
    expect(config.on_tag_query).not.toHaveBeenCalled();
  });

  it("'[smith' passes only the stripped query to cite callback", () => {
    const config = make_config_spies();
    dispatch_palette_queries("[smith", detect_prefix("[smith"), config);
    expect(config.on_cite_query).toHaveBeenCalledWith("smith");
    expect(config.on_heading_query).not.toHaveBeenCalled();
  });

  it("'t:project' passes only the stripped query to tag callback", () => {
    const config = make_config_spies();
    dispatch_palette_queries("t:project", detect_prefix("t:project"), config);
    expect(config.on_tag_query).toHaveBeenCalledWith("project");
    expect(config.on_heading_query).not.toHaveBeenCalled();
  });

  it("'/roadmap' passes stripped query and markdown_only=true", () => {
    const config = make_config_spies();
    dispatch_palette_queries("/roadmap", detect_prefix("/roadmap"), config);
    expect(config.on_note_query).toHaveBeenCalledWith("roadmap", true);
  });

  it("'//roadmap' passes stripped query and markdown_only=false", () => {
    const config = make_config_spies();
    dispatch_palette_queries("//roadmap", detect_prefix("//roadmap"), config);
    expect(config.on_note_query).toHaveBeenCalledWith("roadmap", false);
  });

  it("plain query (no prefix) fans out to all callbacks with raw query", () => {
    const config = make_config_spies();
    dispatch_palette_queries("hello", detect_prefix("hello"), config);
    expect(config.on_note_query).toHaveBeenCalledWith("hello", false);
    expect(config.on_heading_query).toHaveBeenCalledWith(null, "hello");
    expect(config.on_tag_query).toHaveBeenCalledWith("hello");
    expect(config.on_cite_query).toHaveBeenCalledWith("hello");
  });
});
