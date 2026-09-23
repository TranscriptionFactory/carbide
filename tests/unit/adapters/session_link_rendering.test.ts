// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  parse_markdown,
  serialize_markdown,
  schema,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_wiki_link_converter_prose_plugin,
  create_wiki_link_click_prose_plugin,
  wiki_link_plugin_key,
} from "$lib/features/editor/adapters/wiki_link_plugin";
import {
  create_wiki_suggest_prose_plugin,
  set_wiki_suggestions,
} from "$lib/features/editor/adapters/wiki_suggest_plugin";
import {
  resolve_session_link,
  type SessionLinkTarget,
} from "$lib/features/assistant/domain/session_link";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function render(markdown: string, get_sessions: () => SessionLinkTarget[]) {
  const open = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const mounted = new EditorView(host, {
    state: EditorState.create({
      schema,
      doc: parse_markdown(markdown),
      plugins: [
        create_wiki_link_converter_prose_plugin({
          link_type: schema.marks.link,
          resolve_session_link: (target) =>
            resolve_session_link(target, get_sessions()),
        }),
        create_wiki_link_click_prose_plugin({
          on_internal_link_click: open,
          on_external_link_click: vi.fn(),
        }),
      ],
    }),
  });
  view = mounted;
  mounted.dispatch(
    mounted.state.tr.setMeta(wiki_link_plugin_key, { action: "full_scan" }),
  );
  return { mounted, open, host };
}

function refresh_sessions(mounted: EditorView) {
  mounted.dispatch(
    mounted.state.tr.setMeta(wiki_link_plugin_key, {
      action: "refresh_sessions",
    }),
  );
}

describe("session link rendering", () => {
  it.each(["session-1", "v1.2 #3: https://host/path?x=%23"])(
    "renders, round-trips, and opens %s",
    (target) => {
      const session = {
        id: "session-1",
        title: "v1.2 #3: https://host/path?x=%23",
      };
      const { mounted, host, open } = render(`[[◈ ${target}]]`, () => [
        session,
      ]);
      const anchor = host.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe(`◈ ${target}`);
      expect(
        host
          .querySelector("[data-session-id]")
          ?.getAttribute("data-session-id"),
      ).toBe("session-1");
      expect(host.querySelector("[data-session-link-broken]")).toBeNull();
      expect(serialize_markdown(mounted.state.doc).trim()).toBe(
        `[[◈ ${target}]]\u200B`,
      );
      anchor?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      expect(open).toHaveBeenCalledWith(`◈ ${target}`, "", "wiki");
    },
  );

  it("updates broken state without changing note content when sessions load, rename, or disappear", () => {
    let sessions: SessionLinkTarget[] = [];
    const { mounted, host } = render(
      "[[◈ session-1|◈ Original]]",
      () => sessions,
    );
    const source = serialize_markdown(mounted.state.doc);
    expect(host.querySelector("[data-session-link-broken]")).not.toBeNull();
    sessions = [{ id: "session-1", title: "Renamed" }];
    refresh_sessions(mounted);
    expect(host.querySelector("[data-session-link-broken]")).toBeNull();
    expect(host.querySelector('[title="Renamed"]')).not.toBeNull();
    sessions = [];
    refresh_sessions(mounted);
    expect(host.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(serialize_markdown(mounted.state.doc)).toBe(source);
  });

  it("does not resolve session links on a selection-only transaction", () => {
    const get_sessions = vi.fn(() => [{ id: "session-1", title: "One" }]);
    const { mounted } = render("[[◈ session-1]]\n\nplain text", get_sessions);
    get_sessions.mockClear();
    mounted.dispatch(
      mounted.state.tr.setSelection(TextSelection.create(mounted.state.doc, 2)),
    );
    expect(get_sessions).not.toHaveBeenCalled();
  });

  it("resolves only the session links in the edited block when typing", () => {
    const get_sessions = vi.fn(() => [{ id: "session-1", title: "One" }]);
    const { mounted } = render(
      "[[◈ session-1]]\n\n[[◈ session-1]]\n\nplain text",
      get_sessions,
    );
    get_sessions.mockClear();
    const end = mounted.state.doc.content.size - 1;
    mounted.dispatch(mounted.state.tr.insertText("x", end));
    expect(get_sessions).not.toHaveBeenCalled();

    const first_link_end = mounted.state.doc.firstChild!.nodeSize - 2;
    mounted.dispatch(mounted.state.tr.insertText("y", first_link_end));
    expect(get_sessions).toHaveBeenCalledTimes(1);
  });

  it("re-resolves every session link on the refresh meta", () => {
    const get_sessions = vi.fn(() => [{ id: "session-1", title: "One" }]);
    const { mounted } = render(
      "[[◈ session-1]]\n\n[[◈ session-1]]",
      get_sessions,
    );
    get_sessions.mockClear();
    refresh_sessions(mounted);
    expect(get_sessions).toHaveBeenCalledTimes(2);
  });

  it("marks duplicate titles broken but leaves ordinary note links untouched", () => {
    const { host } = render("[[◈ Duplicate]] and [[ordinary]]", () => [
      { id: "a", title: "Duplicate" },
      { id: "b", title: "Duplicate" },
    ]);
    expect(host.querySelectorAll("[data-session-link-broken]")).toHaveLength(1);
    expect(host.querySelector('a[href="ordinary.md"]')).not.toBeNull();
  });

  it("autocomplete inserts a stable ID with a delimiter-safe readable alias", () => {
    const plugin = create_wiki_suggest_prose_plugin({
      on_query: vi.fn(),
      on_dismiss: vi.fn(),
      base_note_path: "source.md",
    });
    const doc = schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(null, schema.text("[[◈")),
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mounted = new EditorView(host, {
      state: EditorState.create({ schema, doc, plugins: [plugin] }),
    });
    view = mounted;
    mounted.dispatch(
      mounted.state.tr.setSelection(
        TextSelection.create(doc, doc.content.size - 1),
      ),
    );
    set_wiki_suggestions(mounted, [
      {
        kind: "existing",
        path: "◈ session-1",
        title: "◈ Title | [part]\nmore",
      },
    ]);
    mounted.someProp("handleKeyDown", (handler) =>
      handler(mounted, new KeyboardEvent("keydown", { key: "Enter" })),
    );
    expect(mounted.state.doc.textContent).toBe(
      "[[◈ session-1|◈ Title    part  more]]",
    );
  });
});
