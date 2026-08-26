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
import ChatMessage from "$lib/features/assistant/ui/chat_message.svelte";
import type { AssistantMessage } from "$lib/features/assistant";
import type { AppContext } from "$lib/app/di/create_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

let cleanups: Array<() => void> = [];

function message(id: string, role: "user" | "assistant"): AssistantMessage {
  return { id, role, content: `${role} ${id}`, citations: [] };
}

function render_panel(messages: AssistantMessage[]): HTMLElement {
  const rendered = render_with_app_context(ChatPanel, {
    app_context: {
      stores: {
        assistant_chat: {
          messages,
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
        },
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
  return rendered.target;
}

function render_message(message: AssistantMessage): HTMLElement {
  const rendered = render_with_app_context(ChatMessage, {
    app_context: {
      stores: {
        editor: { open_note: null },
        vault: { vault: { path: "/vault/root" } },
      },
      action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Partial<AppContext>,
    props: { message },
  });
  cleanups.push(() => {
    rendered.cleanup();
  });
  return rendered.target;
}

function panel_root(target: HTMLElement): HTMLElement {
  const root = target.querySelector<HTMLElement>("[data-assistant-panel-root]");
  if (!root) throw new Error("assistant panel root did not render");
  return root;
}

function transcript(target: HTMLElement): HTMLElement {
  const element = target.querySelector<HTMLElement>(
    '[data-testid="chat-transcript"]',
  );
  if (!element) throw new Error("chat transcript container did not render");
  return element;
}

function message_body(target: HTMLElement): HTMLElement {
  const body = target.querySelector<HTMLElement>(".rag-markdown");
  if (!body) throw new Error("message body did not render");
  return body;
}

async function settle() {
  flushSync();
  await tick();
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  document.body.innerHTML = "";
});

describe("assistant panel density", () => {
  it("stacks messages at the Problems-panel gap rather than the 16px default", async () => {
    const target = render_panel([
      message("m1", "user"),
      message("m2", "assistant"),
    ]);
    await settle();

    const stack = transcript(target).firstElementChild;
    expect(stack?.className).toContain("gap-2.5");
    expect(stack?.className).not.toContain("gap-4");
  });

  it("pads the transcript at the Problems-panel scale", async () => {
    const target = render_panel([message("m1", "user")]);
    await settle();

    const container = transcript(target);
    expect(container.className).toContain("p-2");
    expect(container.className).not.toContain("p-3");
  });

  it("separates the message list from the composer with exactly one divider", async () => {
    const target = render_panel([message("m1", "user")]);
    await settle();

    const below_transcript = [...panel_root(target).children].slice(
      [...panel_root(target).children].indexOf(transcript(target)) + 1,
    );

    expect(below_transcript.length).toBeGreaterThan(0);
    expect(
      below_transcript.filter((el) => el.className.includes("border-t")),
    ).toHaveLength(1);
  });
});

describe("assistant message density", () => {
  // The Compact pass declined the 14px -> 13px body-type drop: chat prose is
  // the one surface in this panel read at length. Pinned so a later density
  // sweep does not quietly take it.
  it("keeps the message body at 14px", () => {
    const body = message_body(render_message(message("a1", "assistant")));

    expect(body.className).toContain("text-sm");
    expect(body.className).not.toContain("text-xs");
    expect(body.className).not.toContain("text-[13px]");
  });

  it("tightens the body line-height below the relaxed default", () => {
    const body = message_body(render_message(message("a1", "assistant")));

    expect(body.className).toContain("leading-[1.45]");
    expect(body.className).not.toContain("leading-relaxed");
  });

  it("draws the user bubble at the compact padding", () => {
    const target = render_message(message("u1", "user"));
    const bubble = target.querySelector<HTMLElement>(".whitespace-pre-wrap");

    expect(bubble?.className).toContain("px-[9px]");
    expect(bubble?.className).toContain("py-[5px]");
    expect(bubble?.className).toContain("text-sm");
  });

  it("closes the gap between the blocks within one message", () => {
    const target = render_message(message("a1", "assistant"));
    const wrapper = target.querySelector<HTMLElement>(".group\\/message");

    expect(wrapper?.className).toContain("gap-1.5");
    expect(wrapper?.className).not.toContain("gap-2");
  });
});
