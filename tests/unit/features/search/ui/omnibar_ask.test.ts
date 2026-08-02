/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import OmnibarAsk from "$lib/features/search/ui/omnibar_ask.svelte";
import type { AssistantSession } from "$lib/features/assistant";
import type { OmnibarAskStatus } from "$lib/features/search/types/omnibar_ask";
import {
  make_session,
  make_session_message,
} from "../../../helpers/assistant_session_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const QUESTION = "when did we decide k=60 for rrf?";

function answered(content = "k=60 was fixed on 2026-07-18."): AssistantSession {
  return make_session({
    kind: "inline",
    messages: [
      make_session_message({ role: "user", content: QUESTION }),
      make_session_message({
        role: "assistant",
        content,
        citations: [
          { index: 1, note_path: "experiments/rrf-weights.md", title: "rrf" },
        ],
      }),
    ],
  });
}

let mounted: Array<{ app: ReturnType<typeof mount>; target: HTMLElement }> = [];

function render(
  overrides: {
    session?: AssistantSession | null;
    status?: OmnibarAskStatus;
    error?: string | null;
    can_insert?: boolean;
    draft?: string;
  } = {},
) {
  const handlers = {
    on_draft_change: vi.fn(),
    on_mode_change: vi.fn(),
    on_submit: vi.fn(),
    on_insert: vi.fn(),
    on_promote: vi.fn(),
    on_stop: vi.fn(),
    on_dismiss: vi.fn(),
  };

  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(OmnibarAsk, {
    target,
    props: {
      draft: overrides.draft ?? QUESTION,
      session: overrides.session ?? null,
      status: overrides.status ?? "idle",
      error: overrides.error ?? null,
      can_insert: overrides.can_insert ?? true,
      provider_label: "claude · retrieval scope: vault",
      ...handlers,
    },
  });
  flushSync();
  mounted.push({ app, target });

  const input = target.querySelector<HTMLInputElement>(
    '[data-testid="omnibar-ask-input"]',
  );
  if (!input) throw new Error("ask input did not render");

  return {
    ...handlers,
    target,
    input,
    press(key: string, modifiers: { meta?: boolean } = {}) {
      const event = new KeyboardEvent("keydown", {
        key,
        metaKey: modifiers.meta ?? false,
        bubbles: true,
        cancelable: true,
      });
      // bits-ui's escape layer listens on `document` in the bubble phase and
      // never consults defaultPrevented, so document is the target that
      // actually matters; window is checked too since the omnibar's own keymap
      // lives there.
      let reached_document = false;
      let reached_window = false;
      const document_spy = () => (reached_document = true);
      const window_spy = () => (reached_window = true);
      document.addEventListener("keydown", document_spy);
      window.addEventListener("keydown", window_spy);
      input.dispatchEvent(event);
      document.removeEventListener("keydown", document_spy);
      window.removeEventListener("keydown", window_spy);
      flushSync();
      return { reached_document, reached_window };
    },
    called() {
      return Object.entries(handlers)
        .filter(([, fn]) => fn.mock.calls.length > 0)
        .map(([name]) => name);
    },
  };
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
  flushSync();
});

describe("OmnibarAsk — mode segment", () => {
  it("offers a way back to Search and reports the change", () => {
    const view = render();

    const toggles = [
      ...view.target.querySelectorAll<HTMLButtonElement>(
        "button[aria-pressed]",
      ),
    ];
    expect(toggles.map((button) => button.textContent?.trim())).toEqual([
      "Search",
      "Ask",
    ]);
    expect(
      toggles.map((button) => button.getAttribute("aria-pressed")),
    ).toEqual(["false", "true"]);

    toggles[0]?.click();
    flushSync();

    expect(view.on_mode_change).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe("OmnibarAsk — rendering the answer", () => {
  it("renders the streamed answer and its citations", () => {
    const view = render({ session: answered() });

    expect(
      view.target.querySelector('[data-testid="omnibar-ask-answer"]')
        ?.textContent,
    ).toContain("k=60 was fixed on 2026-07-18.");
    expect(
      view.target.querySelector('[data-testid="omnibar-ask-citations"]')
        ?.textContent,
    ).toContain("[1]");
  });

  it("shows the failure instead of an answer when the run errored", () => {
    const view = render({ status: "error", error: "provider exploded" });

    expect(
      view.target.querySelector('[data-testid="omnibar-ask-error"]')
        ?.textContent,
    ).toContain("provider exploded");
    expect(
      view.target.querySelector('[data-testid="omnibar-ask-answer"]'),
    ).toBeNull();
  });

  it("offers insert only while a note is open", () => {
    expect(render({ session: answered() }).target.textContent).toContain(
      "Insert at cursor",
    );
    expect(
      render({ session: answered(), can_insert: false }).target.textContent,
    ).not.toContain("Insert at cursor");
  });
});

describe("OmnibarAsk — keymap", () => {
  it("dismisses on esc and does nothing else", () => {
    const view = render({ session: answered() });

    view.press("Escape");

    expect(view.called()).toEqual(["on_dismiss"]);
  });

  it("stops the run on esc while streaming and leaves the surface up", () => {
    const view = render({ session: null, status: "running" });

    view.press("Escape");

    expect(view.called()).toEqual(["on_stop"]);
  });

  it("keeps esc and enter away from the dialog and the search keymap", () => {
    const view = render({ session: answered() });

    expect(view.press("Escape")).toEqual({
      reached_document: false,
      reached_window: false,
    });
    expect(view.press("Enter")).toEqual({
      reached_document: false,
      reached_window: false,
    });
  });

  it("keeps esc away from the dialog while a run is streaming", () => {
    const view = render({ session: null, status: "running" });

    expect(view.press("Escape").reached_document).toBe(false);
    expect(view.called()).toEqual(["on_stop"]);
  });

  it("ignores a second enter while the first ask is still streaming", () => {
    const view = render({ session: null, status: "running" });

    view.press("Enter");
    view.press("Enter");

    expect(view.on_submit).not.toHaveBeenCalled();
  });

  it("submits on enter while there is no answer yet", () => {
    const view = render({ session: null });

    view.press("Enter");

    expect(view.called()).toEqual(["on_submit"]);
  });

  it("promotes on enter once an answer exists", () => {
    const view = render({ session: answered() });

    view.press("Enter");

    expect(view.called()).toEqual(["on_promote"]);
  });

  it("inserts on meta-enter", () => {
    const view = render({ session: answered() });

    view.press("Enter", { meta: true });

    expect(view.called()).toEqual(["on_insert"]);
  });

  it("ignores meta-enter when no note is open", () => {
    const view = render({ session: answered(), can_insert: false });

    view.press("Enter", { meta: true });

    expect(view.called()).toEqual([]);
  });

  it("ignores meta-enter before an answer exists", () => {
    const view = render({ session: null });

    view.press("Enter", { meta: true });

    expect(view.called()).toEqual([]);
  });
});
