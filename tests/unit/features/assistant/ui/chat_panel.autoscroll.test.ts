/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import ChatPanel from "$lib/features/assistant/ui/chat_panel.svelte";
import AssistantPanelTab from "$lib/features/assistant/ui/assistant_panel_tab.svelte";
import type { AssistantMessage } from "$lib/features/assistant";
import type { AppContext } from "$lib/app/di/create_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";
import { create_replaceable_props } from "../../../helpers/reactive_props.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

const TRANSCRIPT_SCROLL_HEIGHT = 1200;

type ChatState = Record<string, unknown>;

type ScrollWrite = { element: Element; top: number };

let scroll_writes: ScrollWrite[] = [];
let scroll_tops: WeakMap<Element, number>;
let original_scroll_top: PropertyDescriptor;
let original_scroll_height: PropertyDescriptor;
let cleanups: Array<() => void> = [];

function chat_state(overrides: ChatState = {}): ChatState {
  return {
    messages: [],
    summaries: [],
    active: null,
    active_id: "session-1",
    is_loading: false,
    loading_stage: "searching",
    streaming_id: null,
    queued_prompt: null,
    error: null,
    provider_id: "claude",
    scope: {},
    mode: "ask",
    auto_approve: false,
    readiness: { state: "ready" },
    pending_sources: null,
    attached_document: null,
    composer_restore: null,
    set_provider: vi.fn(),
    set_scope: vi.fn(),
    clear_composer_restore: vi.fn(),
    ...overrides,
  };
}

function message(id: string, role: "user" | "assistant"): AssistantMessage {
  return { id, role, content: `${role} ${id}`, citations: [] };
}

function render_panel(
  component: typeof ChatPanel,
  initial: ChatState = chat_state(),
) {
  const chat = create_replaceable_props(initial);
  const rendered = render_with_app_context(component, {
    app_context: {
      stores: {
        assistant_chat: chat.props,
        assistant_sessions: { summaries: [] },
        assistant_runs: { all: [] },
        assistant_proposals: { pending: [] },
        editor: { open_note: null },
        vault: { vault: { id: "vault-1", path: "/vault/root" } },
        tab: { active_tab: null, tabs: [] },
        notes: { folder_paths: [] },
        tag: { tags: [] },
        bases: { saved_views: [] },
        ui: {
          editor_settings: {
            ai_providers: [{ id: "claude", name: "Claude" }],
            ai_default_provider_id: "claude",
            ai_question_recipes: [],
          },
        },
      },
      services: {
        document: { get_document_edit_target: vi.fn().mockReturnValue(null) },
        search: {
          suggest_wiki_links: vi.fn().mockResolvedValue({ results: [] }),
        },
        assistant_sessions: { save_session: vi.fn() },
      },
      action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Partial<AppContext>,
    props: {} as never,
  });
  cleanups.push(() => {
    rendered.cleanup();
  });
  return {
    target: rendered.target,
    replace: (patch: Partial<ChatState>) => {
      chat.replace(patch);
    },
  };
}

function transcript(target: HTMLElement): HTMLElement {
  const element = target.querySelector<HTMLElement>(
    '[data-testid="chat-transcript"]',
  );
  if (!element) throw new Error("chat transcript container did not render");
  return element;
}

async function settle() {
  flushSync();
  await tick();
  await tick();
}

function last_scroll_write(): ScrollWrite {
  const write = scroll_writes.at(-1);
  if (!write) throw new Error("scrollTop was never written");
  return write;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  scroll_writes = [];
  scroll_tops = new WeakMap();
  original_scroll_top = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollTop",
  ) as PropertyDescriptor;
  original_scroll_height = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollHeight",
  ) as PropertyDescriptor;

  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return scroll_tops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      scroll_tops.set(this, value);
      scroll_writes.push({ element: this, top: value });
    },
  });
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return TRANSCRIPT_SCROLL_HEIGHT;
    },
  });
});

afterEach(() => {
  Object.defineProperty(Element.prototype, "scrollTop", original_scroll_top);
  Object.defineProperty(
    Element.prototype,
    "scrollHeight",
    original_scroll_height,
  );
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  document.body.innerHTML = "";
});

describe("chat panel autoscroll", () => {
  it("scrolls a transcript parked at the top to the bottom on submit", async () => {
    const { target, replace } = render_panel(
      ChatPanel,
      chat_state({
        messages: [message("m1", "user"), message("m2", "assistant")],
      }),
    );
    await settle();

    const container = transcript(target);
    container.scrollTop = 0;
    scroll_writes = [];

    replace({
      messages: [
        message("m1", "user"),
        message("m2", "assistant"),
        message("m3", "user"),
      ],
      is_loading: true,
    });
    await settle();

    expect(last_scroll_write().element).toBe(container);
    expect(container.scrollTop).toBe(TRANSCRIPT_SCROLL_HEIGHT);
  });

  it("scrolls to the bottom when only the wait indicator appears", async () => {
    const messages = [message("m1", "user")];
    const { target, replace } = render_panel(
      ChatPanel,
      chat_state({ messages }),
    );
    await settle();

    const container = transcript(target);
    container.scrollTop = 0;
    scroll_writes = [];

    replace({ messages, is_loading: true, loading_stage: "generating" });
    await settle();

    expect(target.querySelector('[data-testid="chat-transcript"]')).toBe(
      container,
    );
    expect(last_scroll_write().element).toBe(container);
    expect(container.scrollTop).toBe(TRANSCRIPT_SCROLL_HEIGHT);
  });

  it("scrolls to the bottom when a prompt is queued behind a running turn", async () => {
    const messages = [message("m1", "user")];
    const { target, replace } = render_panel(
      ChatPanel,
      chat_state({ messages, is_loading: true }),
    );
    await settle();

    const container = transcript(target);
    container.scrollTop = 0;
    scroll_writes = [];

    replace({ queued_prompt: { text: "and also this", revision: 0 } });
    await settle();

    expect(
      target.querySelector('[data-testid="chat-queued-prompt"]'),
    ).not.toBeNull();
    expect(last_scroll_write().element).toBe(container);
    expect(container.scrollTop).toBe(TRANSCRIPT_SCROLL_HEIGHT);
  });

  it("scrolls the bottom Assistant tab projection the same way", async () => {
    const { target, replace } = render_panel(
      AssistantPanelTab as unknown as typeof ChatPanel,
      chat_state({ messages: [message("m1", "user")] }),
    );
    await settle();

    const container = transcript(target);
    container.scrollTop = 0;
    scroll_writes = [];

    replace({
      messages: [message("m1", "user"), message("m2", "user")],
      is_loading: true,
    });
    await settle();

    expect(last_scroll_write().element).toBe(container);
    expect(container.scrollTop).toBe(TRANSCRIPT_SCROLL_HEIGHT);
  });
});
