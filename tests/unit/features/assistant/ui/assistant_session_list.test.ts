/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistantSessionList from "$lib/features/assistant/ui/assistant_session_list.svelte";
import {
  to_assistant_session_summary,
  type AssistantSession,
  type AssistantSessionSummary,
} from "$lib/features/assistant";
import { make_session } from "../../../helpers/assistant_session_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const NOW_MS = 1_700_000_000_000;
const MINUTE_MS = 60_000;

function make_summary(
  overrides: Partial<AssistantSession> = {},
): AssistantSessionSummary {
  return to_assistant_session_summary(make_session(overrides));
}

function render_list(options: {
  sessions: AssistantSessionSummary[];
  active_id?: string | null;
}) {
  const on_open = vi.fn();
  const on_rename = vi.fn();
  const on_delete = vi.fn();

  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantSessionList, {
    target,
    props: {
      sessions: options.sessions,
      active_id: options.active_id ?? null,
      on_open,
      on_rename,
      on_delete,
      now: () => NOW_MS,
    },
  });

  flushSync();

  return {
    on_open,
    on_rename,
    on_delete,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function get_rows(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-testid="assistant-session-row"]',
    ),
  ];
}

function row_ids(): (string | undefined)[] {
  return get_rows().map((row) => row.dataset.sessionId);
}

function get_row(session_id: string): HTMLElement {
  const row = document.body.querySelector<HTMLElement>(
    `[data-testid="assistant-session-row"][data-session-id="${session_id}"]`,
  );
  if (!row) throw new Error(`no row for session ${session_id}`);
  return row;
}

function query_in_row(row: HTMLElement, testid: string): HTMLElement | null {
  return row.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

function get_in_row(row: HTMLElement, testid: string): HTMLElement {
  const element = query_in_row(row, testid);
  if (!element)
    throw new Error(`no ${testid} in row ${row.dataset.sessionId ?? "?"}`);
  return element;
}

function get_chip(kind: string): HTMLElement {
  const chip = document.body.querySelector<HTMLElement>(
    `[data-testid="assistant-session-filter"][data-kind="${kind}"]`,
  );
  if (!chip) throw new Error(`no filter chip for ${kind}`);
  return chip;
}

function query_group_toggle(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '[data-testid="assistant-inline-group-toggle"]',
  );
}

function get_group_toggle(): HTMLElement {
  const toggle = query_group_toggle();
  if (!toggle) throw new Error("no inline group toggle");
  return toggle;
}

function click(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  flushSync();
}

function press(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  flushSync();
}

function type_into(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function rename_input(row: HTMLElement): HTMLInputElement {
  const input = row.querySelector<HTMLInputElement>(
    '[data-testid="assistant-session-rename-input"]',
  );
  if (!input)
    throw new Error(`row ${row.dataset.sessionId ?? "?"} is not renaming`);
  return input;
}

const CHAT = make_summary({
  id: "chat-1",
  kind: "chat",
  title: "Ranking experiments",
  updated_at: NOW_MS - 2 * MINUTE_MS,
});

const NOTE = make_summary({
  id: "note-1",
  kind: "note",
  title: "hybrid-retrieval.md",
  updated_at: NOW_MS - 18 * MINUTE_MS,
});

const INLINE = make_summary({
  id: "inline-1",
  kind: "inline",
  title: "Tighten prose",
  updated_at: NOW_MS - 60 * MINUTE_MS,
});

const INLINE_OLDER = make_summary({
  id: "inline-2",
  kind: "inline",
  title: "Expand the intro",
  updated_at: NOW_MS - 90 * MINUTE_MS,
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant_session_list.svelte — rows and kind badges", () => {
  it("1: lists chat and note sessions as top-level rows in updated_at-descending order", () => {
    const view = render_list({
      sessions: [
        make_summary({
          id: "chat-old",
          kind: "chat",
          updated_at: NOW_MS - 40 * MINUTE_MS,
        }),
        INLINE,
        make_summary({
          id: "chat-new",
          kind: "chat",
          updated_at: NOW_MS - MINUTE_MS,
        }),
        NOTE,
      ],
    });

    expect(row_ids()).toEqual(["chat-new", "note-1", "chat-old"]);

    view.cleanup();
  });

  it("2: marks every row with its kind and the matching glyph", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    click(get_group_toggle());

    const chat_row = get_row("chat-1");
    expect(chat_row.dataset.kind).toBe("chat");
    expect(get_in_row(chat_row, "assistant-session-kind").textContent).toBe(
      "◈",
    );

    const note_row = get_row("note-1");
    expect(note_row.dataset.kind).toBe("note");
    expect(get_in_row(note_row, "assistant-session-kind").textContent).toBe(
      "▤",
    );

    const inline_row = get_row("inline-1");
    expect(inline_row.dataset.kind).toBe("inline");
    expect(get_in_row(inline_row, "assistant-session-kind").textContent).toBe(
      "⌁",
    );

    view.cleanup();
  });

  it("3: renders the relative update time against the injected clock", () => {
    const view = render_list({ sessions: [CHAT, NOTE] });

    expect(
      get_in_row(get_row("note-1"), "assistant-session-when").textContent,
    ).toBe("18m ago");
    expect(
      get_in_row(get_row("chat-1"), "assistant-session-when").textContent,
    ).toBe("2m ago");

    view.cleanup();
  });

  it("4: marks only the active session as current", () => {
    const view = render_list({ sessions: [CHAT, NOTE], active_id: "note-1" });

    expect(get_row("note-1").getAttribute("aria-current")).toBe("true");
    expect(get_row("chat-1").getAttribute("aria-current")).toBeNull();

    view.cleanup();
  });
});

describe("assistant_session_list.svelte — kind filters", () => {
  it("5: starts on the All filter with every kind chip unpressed", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    expect(get_chip("all").getAttribute("aria-pressed")).toBe("true");
    expect(get_chip("inline").getAttribute("aria-pressed")).toBe("false");
    expect(get_chip("note").getAttribute("aria-pressed")).toBe("false");
    expect(get_chip("chat").getAttribute("aria-pressed")).toBe("false");

    view.cleanup();
  });

  it("6: shows only note sessions under the Note filter", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    click(get_chip("note"));

    expect(row_ids()).toEqual(["note-1"]);
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="chat"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="inline"]',
      ),
    ).toBeNull();
    expect(query_group_toggle()).toBeNull();
    expect(get_chip("note").getAttribute("aria-pressed")).toBe("true");

    view.cleanup();
  });

  it("7: shows only chat sessions under the Chat filter", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    click(get_chip("chat"));

    expect(row_ids()).toEqual(["chat-1"]);
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="note"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="inline"]',
      ),
    ).toBeNull();
    expect(query_group_toggle()).toBeNull();

    view.cleanup();
  });

  it("8: shows inline sessions as ordinary rows under the Inline filter", () => {
    const view = render_list({
      sessions: [CHAT, NOTE, INLINE, INLINE_OLDER],
    });

    click(get_chip("inline"));

    expect(row_ids()).toEqual(["inline-1", "inline-2"]);
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="chat"]',
      ),
    ).toBeNull();
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="note"]',
      ),
    ).toBeNull();

    view.cleanup();
  });

  it("9: restores the full list when All is selected again", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    click(get_chip("chat"));
    click(get_chip("all"));

    expect(row_ids()).toEqual(["chat-1", "note-1"]);
    expect(get_chip("all").getAttribute("aria-pressed")).toBe("true");
    expect(get_chip("chat").getAttribute("aria-pressed")).toBe("false");
    expect(query_group_toggle()).not.toBeNull();

    view.cleanup();
  });

  it("10: shows a filter-specific empty state when no session matches", () => {
    const view = render_list({ sessions: [CHAT] });

    expect(
      document.body.querySelector('[data-testid="assistant-session-empty"]'),
    ).toBeNull();

    click(get_chip("note"));

    expect(get_rows()).toHaveLength(0);
    expect(
      document.body.querySelector('[data-testid="assistant-session-empty"]')
        ?.textContent,
    ).toContain("No note sessions yet");

    view.cleanup();
  });

  it("11: shows the empty state when there are no sessions at all", () => {
    const view = render_list({ sessions: [] });

    expect(get_rows()).toHaveLength(0);
    expect(
      document.body.querySelector('[data-testid="assistant-session-empty"]')
        ?.textContent,
    ).toContain("No sessions yet");

    view.cleanup();
  });
});

describe("assistant_session_list.svelte — inline group", () => {
  it("12: keeps inline sessions out of the DOM until the group is expanded", () => {
    const view = render_list({ sessions: [CHAT, INLINE, INLINE_OLDER] });

    const toggle = get_group_toggle();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("⌁ Inline · 2");
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="inline"]',
      ),
    ).toBeNull();
    expect(row_ids()).toEqual(["chat-1"]);

    view.cleanup();
  });

  it("13: mounts the inline rows when the group is expanded", () => {
    const view = render_list({ sessions: [CHAT, INLINE, INLINE_OLDER] });

    click(get_group_toggle());

    expect(get_group_toggle().getAttribute("aria-expanded")).toBe("true");
    expect(row_ids()).toEqual(["chat-1", "inline-1", "inline-2"]);
    expect(
      get_in_row(
        get_row("inline-1"),
        "assistant-session-open",
      ).textContent?.trim(),
    ).toBe("Tighten prose");

    view.cleanup();
  });

  it("14: removes the inline rows again when the group is collapsed", () => {
    const view = render_list({ sessions: [CHAT, INLINE] });

    click(get_group_toggle());
    click(get_group_toggle());

    expect(get_group_toggle().getAttribute("aria-expanded")).toBe("false");
    expect(
      document.body.querySelector(
        '[data-testid="assistant-session-row"][data-kind="inline"]',
      ),
    ).toBeNull();

    view.cleanup();
  });

  it("15: renders no group at all when there are no inline sessions", () => {
    const view = render_list({ sessions: [CHAT, NOTE] });

    expect(query_group_toggle()).toBeNull();
    expect(
      document.body.querySelector('[data-testid="assistant-inline-group"]'),
    ).toBeNull();
    expect(row_ids()).toEqual(["chat-1", "note-1"]);

    view.cleanup();
  });

  it("16: leaves the top-level rows mounted when the group expands", () => {
    const view = render_list({ sessions: [CHAT, NOTE, INLINE] });

    click(get_group_toggle());

    expect(get_row("chat-1").dataset.kind).toBe("chat");
    expect(get_row("note-1").dataset.kind).toBe("note");
    expect(row_ids()).toEqual(["chat-1", "note-1", "inline-1"]);

    view.cleanup();
  });
});

describe("assistant_session_list.svelte — open, rename and delete", () => {
  it("17: opens exactly the clicked session", () => {
    const view = render_list({ sessions: [CHAT, NOTE] });

    click(get_in_row(get_row("note-1"), "assistant-session-open"));

    expect(view.on_open.mock.calls).toEqual([["note-1"]]);

    view.cleanup();
  });

  it("18: opens an inline session from the expanded group", () => {
    const view = render_list({ sessions: [CHAT, INLINE] });

    click(get_group_toggle());
    click(get_in_row(get_row("inline-1"), "assistant-session-open"));

    expect(view.on_open.mock.calls).toEqual([["inline-1"]]);

    view.cleanup();
  });

  it("19: seeds the rename input with the current title", () => {
    const view = render_list({ sessions: [CHAT] });

    click(get_in_row(get_row("chat-1"), "assistant-session-rename"));

    const row = get_row("chat-1");
    expect(rename_input(row).value).toBe("Ranking experiments");
    expect(query_in_row(row, "assistant-session-open")).toBeNull();

    view.cleanup();
  });

  it("20: keeps rename mode scoped to the clicked row", () => {
    const view = render_list({ sessions: [CHAT, NOTE] });

    click(get_in_row(get_row("chat-1"), "assistant-session-rename"));

    const other = get_row("note-1");
    expect(
      get_in_row(other, "assistant-session-open").textContent?.trim(),
    ).toBe("hybrid-retrieval.md");
    expect(query_in_row(other, "assistant-session-rename-input")).toBeNull();

    view.cleanup();
  });

  it("21: commits a renamed title on Enter", () => {
    const view = render_list({ sessions: [CHAT] });

    click(get_in_row(get_row("chat-1"), "assistant-session-rename"));
    const input = rename_input(get_row("chat-1"));
    type_into(input, "Ranking experiments v2");
    press(input, "Enter");

    expect(view.on_rename.mock.calls).toEqual([
      ["chat-1", "Ranking experiments v2"],
    ]);
    const row = get_row("chat-1");
    expect(query_in_row(row, "assistant-session-rename-input")).toBeNull();
    expect(query_in_row(row, "assistant-session-open")).not.toBeNull();

    view.cleanup();
  });

  it("22: cancels a rename on Escape without renaming", () => {
    const view = render_list({ sessions: [CHAT] });

    click(get_in_row(get_row("chat-1"), "assistant-session-rename"));
    const input = rename_input(get_row("chat-1"));
    type_into(input, "discarded");
    press(input, "Escape");

    expect(view.on_rename).not.toHaveBeenCalled();
    const row = get_row("chat-1");
    expect(query_in_row(row, "assistant-session-rename-input")).toBeNull();
    expect(get_in_row(row, "assistant-session-open").textContent?.trim()).toBe(
      "Ranking experiments",
    );

    view.cleanup();
  });

  it("23: refuses to commit an empty title and stays in rename mode", () => {
    const view = render_list({ sessions: [CHAT] });

    click(get_in_row(get_row("chat-1"), "assistant-session-rename"));
    const input = rename_input(get_row("chat-1"));
    type_into(input, "   ");
    press(input, "Enter");

    expect(view.on_rename).not.toHaveBeenCalled();
    expect(rename_input(get_row("chat-1"))).not.toBeNull();

    view.cleanup();
  });

  it("24: deletes exactly the clicked session", () => {
    const view = render_list({ sessions: [CHAT, NOTE] });

    click(get_in_row(get_row("chat-1"), "assistant-session-delete"));

    expect(view.on_delete.mock.calls).toEqual([["chat-1"]]);
    expect(view.on_open).not.toHaveBeenCalled();

    view.cleanup();
  });

  it("25: labels every row affordance for assistive technology", () => {
    const view = render_list({ sessions: [CHAT] });

    const row = get_row("chat-1");
    for (const testid of [
      "assistant-session-open",
      "assistant-session-rename",
      "assistant-session-delete",
    ]) {
      const button = get_in_row(row, testid);
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("aria-label")).toContain(
        "Ranking experiments",
      );
    }

    view.cleanup();
  });
});
