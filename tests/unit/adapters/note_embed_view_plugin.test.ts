/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  embed_src_matches_path,
  extract_heading_section,
} from "$lib/features/editor/adapters/note_embed_view_plugin";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import { undoDepth } from "prosemirror-history";

describe("embed_src_matches_path", () => {
  it("matches a name-only src against a nested fs path", () => {
    expect(
      embed_src_matches_path("Meeting Notes", "work/Meeting Notes.md"),
    ).toBe(true);
  });

  it("matches an exact path src with extension stripped", () => {
    expect(embed_src_matches_path("work/plan", "work/plan.md")).toBe(true);
  });

  it("matches case-insensitively like wiki link resolution", () => {
    expect(embed_src_matches_path("readme", "docs/README.md")).toBe(true);
  });

  it("rejects a different note whose name merely ends with the src", () => {
    expect(embed_src_matches_path("plan", "work/master-plan.md")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(embed_src_matches_path("alpha", "beta.md")).toBe(false);
  });
});

describe("extract_heading_section", () => {
  it("ends a section at the next heading of the same or higher level", () => {
    const markdown = "# Top\n\n## A\na\n\n### Sub\ns\n\n## B\nb\n";

    expect(extract_heading_section(markdown, "A")).toBe(
      "## A\na\n\n### Sub\ns\n\n",
    );
  });

  it("runs to the end of the note when no heading follows", () => {
    expect(extract_heading_section("## A\na\n", "a")).toBe("## A\na\n");
  });

  it("ends a section at a setext heading", () => {
    const markdown = "## A\na\n\nNext\n---\nb\n";

    expect(extract_heading_section(markdown, "A")).toBe("## A\na\n\n");
  });

  it("finds a setext heading as the target", () => {
    const markdown = "Title\n=====\nt\n\n# Next\n";

    expect(extract_heading_section(markdown, "Title")).toBe(
      "Title\n=====\nt\n\n",
    );
  });

  it("does not end a section at a hash line inside a fence", () => {
    const markdown = "## A\n\n```sh\n# comment\n```\n\nafter\n\n## B\n";

    expect(extract_heading_section(markdown, "A")).toBe(
      "## A\n\n```sh\n# comment\n```\n\nafter\n\n",
    );
  });

  it("does not take a hash line inside a fence as the target", () => {
    expect(extract_heading_section("```\n# A\n```\n", "A")).toBe("");
  });

  it("does not end a section at a thematic break", () => {
    const markdown = "## A\na\n\n---\n\nb\n";

    expect(extract_heading_section(markdown, "A")).toBe(markdown);
  });

  it("matches a heading with a closing hash sequence", () => {
    expect(extract_heading_section("## A ##\na\n", "A")).toBe("## A ##\na\n");
  });

  it("matches the source text of a heading with inline formatting", () => {
    const markdown = "## **Bold** title\na\n";

    expect(extract_heading_section(markdown, "**Bold** title")).toBe(markdown);
  });

  it.each(["C#", "c#"])("matches literal trailing hashes in %j", (target) => {
    const markdown = "## C#\na\n\n## Next\nb\n";

    expect(extract_heading_section(markdown, target)).toBe("## C#\na\n\n");
  });

  it("preserves stripped matching for formatted headings with trailing hashes", () => {
    const markdown = "## **Bold** title#\na\n";

    expect(extract_heading_section(markdown, "**Bold** title")).toBe(markdown);
    expect(extract_heading_section(markdown, "**Bold** title#")).toBe(markdown);
  });

  it("returns nothing for a missing heading", () => {
    expect(extract_heading_section("## A\n", "B")).toBe("");
  });
});

describe("note embed collapse", () => {
  it("updates persisted markdown without adding an undo entry", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const port = create_prosemirror_editor_port({
      note_embed: {
        read_note: vi.fn().mockResolvedValue("embedded content"),
        subscribe_to_changes: () => vi.fn(),
      },
    });
    const session = await port.start_session({
      root,
      initial_markdown: "![[note]]\n",
      note_path: "host.md",
      vault_id: null,
      syntax_reveal_enabled: true,
      events: {
        on_markdown_change: vi.fn(),
        on_dirty_state_change: vi.fn(),
        on_cursor_change: vi.fn(),
        on_selection_change: vi.fn(),
      },
    });
    const view = session.get_view?.();
    const button = root.querySelector<HTMLButtonElement>(
      ".note-embed__collapse",
    );
    if (!view || !button) throw new Error("missing note embed view");
    const undo_depth: unknown = undoDepth(view.state);

    button.click();

    expect(undoDepth(view.state)).toBe(undo_depth);
    expect(session.get_markdown().trim()).toBe("![[note|collapsed]]");
    expect(session.is_dirty()).toBe(true);

    button.click();

    expect(undoDepth(view.state)).toBe(undo_depth);
    expect(session.get_markdown().trim()).toBe("![[note]]");
    expect(session.is_dirty()).toBe(false);
    session.destroy();
    root.remove();
  });
});
