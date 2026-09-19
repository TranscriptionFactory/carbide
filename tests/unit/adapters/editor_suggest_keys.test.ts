/**
 * @vitest-environment jsdom
 *
 * Assembled-editor key routing for the suggest menus.
 *
 * The bug this file guards: `handleKeyDown` props run in plugin order and stop
 * at the first handler that returns true, and `handleDOMEvents.keydown` runs
 * before any of them. Registered after `core_extension`, every suggest menu was
 * dead to Enter (baseKeymap claimed it) and to Tab/arrows inside code fences
 * (the code-block view's keydown handler claimed them). So these tests mount the
 * real `assemble_extensions(...)` plugin list and dispatch real bubbling
 * keyboard events at `view.dom` — never `handleKeyDown` directly, which would
 * skip the DOM handlers that were stealing the keys.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Node as ProseNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { assemble_extensions } from "$lib/features/editor/extensions";
import {
  set_dsl_suggestions,
  type DslLanguage,
} from "$lib/features/editor/adapters/dsl_suggest_plugin";
import { set_cite_suggestions } from "$lib/features/editor/adapters/cite_suggest_plugin";
import { set_tag_suggestions } from "$lib/features/editor/adapters/tag_suggest_plugin";
import { set_wiki_suggestions } from "$lib/features/editor/adapters/wiki_suggest_plugin";
import type { PluginContext } from "$lib/features/editor/extensions/types";
import type { EditorEventHandlers } from "$lib/features/editor/ports";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";

const DSL_ITEMS: Record<DslLanguage, readonly [DslSuggestion, DslSuggestion]> =
  {
    query: [
      { label: "status", insert: "status" },
      { label: "section", insert: "section" },
    ],
    base: [
      { label: "table", insert: "table" },
      { label: "view", insert: "view" },
    ],
    tasks: [
      { label: "is", insert: "is" },
      { label: "not", insert: "not" },
    ],
  };

const DSL_LANGUAGES = Object.keys(DSL_ITEMS) as DslLanguage[];

let open_views: EditorView[] = [];

beforeAll(() => {
  // jsdom omits the client-rect APIs ProseMirror's endOfTextblock needs (a text
  // node has neither); the gap-cursor keymap calls them for arrow keys and
  // throws without, aborting the whole key handler chain.
  const rect_stubs: Array<[PropertyKey, () => unknown]> = [
    ["getClientRects", () => []],
    ["getBoundingClientRect", () => new DOMRect()],
  ];
  for (const proto of [Node.prototype, Range.prototype]) {
    for (const [name, stub] of rect_stubs) {
      if (!(name in proto)) {
        Object.defineProperty(proto, name, { value: stub });
      }
    }
  }
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const view of open_views) view.destroy();
  open_views = [];
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function fence(language: string, text: string): ProseNode {
  const code_block = schema.nodes["code_block"];
  if (!code_block) throw new Error("schema has no code_block");
  return code_block.create(
    { language },
    text.length > 0 ? schema.text(text) : [],
  );
}

function paragraph(text: string): ProseNode {
  const para = schema.nodes["paragraph"];
  if (!para) throw new Error("schema has no paragraph");
  return para.create(null, text.length > 0 ? schema.text(text) : []);
}

function doc_of(blocks: ProseNode[]): ProseNode {
  const doc = schema.nodes["doc"];
  if (!doc) throw new Error("schema has no doc");
  return doc.create(null, blocks);
}

// The whole shipped plugin stack, with the suggest providers wired the way
// editor_service wires them: on_query pushes suggestions back into the view.
// The item list is query-independent on purpose — this file tests key routing,
// not the providers.
function mount(doc: ProseNode): EditorView {
  let view: EditorView | null = null;

  const push_dsl = (language: DslLanguage) => {
    if (!view) return;
    set_dsl_suggestions(view, language, DSL_ITEMS[language], 0);
  };

  const events: EditorEventHandlers = {
    on_markdown_change: () => {},
    on_dirty_state_change: () => {},
    on_dsl_query_suggest: () => {
      push_dsl("query");
    },
    on_dsl_base_suggest: () => {
      push_dsl("base");
    },
    on_dsl_tasks_suggest: () => {
      push_dsl("tasks");
    },
    on_tag_suggest_query: () => {
      if (view) {
        set_tag_suggestions(view, [{ tag: "foo", count: 2, promoted: true }]);
      }
    },
    on_cite_suggest_query: () => {
      if (view) {
        set_cite_suggestions(view, [
          {
            citekey: "smith2020",
            title: "A paper",
            authors: "Smith",
            year: "2020",
          },
        ]);
      }
    },
    on_wiki_suggest_query: () => {
      if (view) {
        set_wiki_suggestions(view, [
          { title: "Target", path: "target.md", kind: "existing" },
        ]);
      }
    },
  };

  const ctx: PluginContext = {
    events,
    get_note_path: () => "note.md",
    get_vault_id: () => null,
    get_markdown: () => "",
    resolve_asset_url_for_vault: null,
  };

  const container = document.createElement("div");
  document.body.appendChild(container);

  const assembled = assemble_extensions(ctx, {
    toolbar_visibility: "always_hide",
  });
  view = new EditorView(container, {
    state: EditorState.create({ schema, doc, plugins: assembled.plugins }),
  });
  open_views.push(view);
  return view;
}

function place_cursor(view: EditorView, pos: number) {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

// Suggest providers answer through a 50 ms debounce timer.
function flush_suggest_queries() {
  vi.advanceTimersByTime(80);
}

function press(
  view: EditorView,
  key: string,
  modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
): void {
  view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }),
  );
}

// Each suggest plugin mounts its own dropdown, all sharing the class name, so
// ask how many are visible rather than reading the first one.
function open_menus(selector: string): number {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.style.display === "block",
  ).length;
}

function highlighted(selector: string): string[] {
  return Array.from(
    document.querySelectorAll(`${selector}__item--selected`),
  ).map((row) => row.textContent ?? "");
}

describe.each(DSL_LANGUAGES)("dsl suggest in a ```%s fence", (language) => {
  const items = DSL_ITEMS[language];

  it("accepts the highlighted suggestion on Enter", () => {
    const view = mount(doc_of([fence(language, "")]));
    place_cursor(view, 1);
    flush_suggest_queries();

    expect(open_menus(".DslSuggest")).toBe(1);
    expect(highlighted(".DslSuggest")).toEqual([items[0].label]);

    press(view, "Enter");

    // The whole fence text is replaced, not extended with a newline.
    expect(view.state.doc.firstChild?.type.name).toBe("code_block");
    expect(view.state.doc.firstChild?.textContent).toBe(items[0].insert);
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");
  });

  it("accepts the highlighted suggestion on Tab", () => {
    const view = mount(doc_of([fence(language, "")]));
    place_cursor(view, 1);
    flush_suggest_queries();

    press(view, "Tab");

    // Accepted instead of indented.
    expect(view.state.doc.firstChild?.textContent).toBe(items[0].insert);
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");
  });

  it("moves the highlight on ArrowDown at block end instead of leaving the fence", () => {
    const view = mount(doc_of([fence(language, "x")]));
    place_cursor(view, 2);
    flush_suggest_queries();

    press(view, "ArrowDown");

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");

    press(view, "Enter");
    expect(view.state.doc.firstChild?.textContent).toBe(items[1].insert);
  });

  it("keeps ArrowUp at block start inside the fence and moves the highlight", () => {
    const view = mount(doc_of([fence(language, "x")]));
    place_cursor(view, 1);
    flush_suggest_queries();

    press(view, "ArrowDown");
    press(view, "ArrowUp");

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.selection.$from.parent.type.name).toBe("code_block");

    press(view, "Enter");
    expect(view.state.doc.firstChild?.textContent).toBe(items[0].insert + "x");
  });

  it("closes on Escape and hands Tab back to the fence", () => {
    const view = mount(doc_of([fence(language, "x")]));
    place_cursor(view, 2);
    flush_suggest_queries();

    press(view, "Escape");

    expect(open_menus(".DslSuggest")).toBe(0);
    expect(view.state.doc.firstChild?.textContent).toBe("x");

    // No suggestion open any more: Tab indents as it always did.
    press(view, "Tab");
    expect(view.state.doc.firstChild?.textContent).toBe("x  ");
  });

  it("keeps Mod-Enter escaping the fence while suggestions are open", () => {
    const view = mount(doc_of([fence(language, "x")]));
    place_cursor(view, 2);
    flush_suggest_queries();

    press(view, "Enter", { metaKey: true });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.lastChild?.type.name).toBe("paragraph");
  });
});

describe("plain fence editing with no suggest open", () => {
  it("indents on Tab", () => {
    const view = mount(doc_of([fence("plaintext", "x")]));
    place_cursor(view, 1);

    press(view, "Tab");

    expect(view.state.doc.firstChild?.textContent).toBe("  x");
  });

  it("escapes on Mod-Enter", () => {
    const view = mount(doc_of([fence("plaintext", "x")]));
    place_cursor(view, 1);

    press(view, "Enter", { metaKey: true });

    expect(view.state.doc.childCount).toBe(2);
  });

  it("still exits the fence on ArrowDown at block end", () => {
    const view = mount(doc_of([fence("plaintext", "x")]));
    place_cursor(view, 2);

    press(view, "ArrowDown");

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.lastChild?.type.name).toBe("paragraph");
  });

  it("still exits the fence on ArrowUp at block start", () => {
    const view = mount(doc_of([fence("plaintext", "x")]));
    place_cursor(view, 1);

    press(view, "ArrowUp");

    // The code-block view inserts a paragraph before the fence; the assembled
    // editor also appends a trailing paragraph, so assert placement, not count.
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
  });
});

describe("prose suggest menus accept on Enter", () => {
  it("slash menu inserts its command", () => {
    const view = mount(doc_of([paragraph("/")]));
    place_cursor(view, 2);

    expect(open_menus(".SlashMenu")).toBe(1);

    press(view, "Enter");

    expect(view.state.doc.firstChild?.type.name).toBe("heading");
    expect(view.state.doc.firstChild?.attrs["level"]).toBe(1);
    expect(view.state.doc.firstChild?.textContent).toBe("");
  });

  it("tag suggest replaces the query with the tag", () => {
    const view = mount(doc_of([paragraph("#fo")]));
    place_cursor(view, 4);
    flush_suggest_queries();

    expect(open_menus(".TagSuggest")).toBe(1);

    press(view, "Enter");

    expect(view.state.doc.firstChild?.textContent).toBe("#foo");
  });

  it("cite suggest replaces the query with the citekey", () => {
    const view = mount(doc_of([paragraph("[@sm")]));
    place_cursor(view, 5);
    flush_suggest_queries();

    expect(open_menus(".CiteSuggest")).toBe(1);

    press(view, "Enter");

    expect(view.state.doc.firstChild?.textContent).toBe("[@smith2020]");
  });
});

describe("code fence language picker, hoisted ahead of baseKeymap", () => {
  it("accepts the highlighted language on Enter", () => {
    const view = mount(doc_of([paragraph("```py")]));
    place_cursor(view, 6);

    expect(open_menus(".CodeFenceLangPicker")).toBe(1);

    press(view, "Enter");

    expect(view.state.doc.firstChild?.type.name).toBe("code_block");
    expect(String(view.state.doc.firstChild?.attrs["language"])).toContain(
      "py",
    );
  });
});

describe("wiki link suggest", () => {
  // NOT fixed by this lane, and the reorder cannot fix it: the `[[` menu comes
  // from create_wiki_suggest_prose_plugin inside create_wiki_link_extension,
  // which still registers after core_extension — baseKeymap's Enter claims the
  // key before the menu sees it. Written as a known failure (the menu opens, the
  // accept never runs) so that moving that registration ahead of core flips this
  // to "passed" and vitest points at the assertion to invert.
  it.fails("accepts the highlighted note on Enter", () => {
    const view = mount(doc_of([paragraph("[[ta")]));
    place_cursor(view, 5);
    flush_suggest_queries();

    expect(open_menus(".WikiSuggest")).toBe(1);

    press(view, "Enter");

    expect(view.state.doc.firstChild?.textContent).toBe("[[target]]");
  });
});
