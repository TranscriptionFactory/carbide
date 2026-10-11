/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { ACTION_IDS } from "$lib/app";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { AssistantMessage } from "$lib/features/assistant";
import ChatMessage from "$lib/features/assistant/ui/chat_message.svelte";
import ChatPanel from "$lib/features/assistant/ui/chat_panel.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

const RAW = "There's an issue with the selected model (does-not-exist).";

let cleanups: Array<() => void> = [];
let execute: ReturnType<typeof vi.fn>;

function failed_message(
  extra: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id: "a1",
    role: "assistant",
    content: "partial",
    citations: [],
    error: "Claude Code request failed — see logs for details.",
    ...extra,
  };
}

function render_message(message: AssistantMessage): HTMLElement {
  const rendered = render_with_app_context(ChatMessage, {
    app_context: {
      stores: {
        editor: { open_note: null },
        vault: { vault: { path: "/vault/root" } },
      },
      action_registry: { execute },
    } as unknown as Partial<AppContext>,
    props: { message },
  });
  cleanups.push(() => {
    rendered.cleanup();
  });
  return rendered.target;
}

function render_panel(error_detail: string | null): HTMLElement {
  const rendered = render_with_app_context(ChatPanel, {
    app_context: {
      stores: {
        assistant_chat: {
          messages: [{ id: "u1", role: "user", content: "q", citations: [] }],
          summaries: [],
          active: null,
          active_id: "session-1",
          is_loading: false,
          loading_stage: "searching",
          streaming_id: null,
          queued_prompt: null,
          error: "Claude Code request failed — see logs for details.",
          error_detail,
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
      action_registry: { execute },
    } as unknown as Partial<AppContext>,
    props: {} as never,
  });
  cleanups.push(() => {
    rendered.cleanup();
  });
  return rendered.target;
}

function detail_of(target: HTMLElement): HTMLDetailsElement | null {
  return target.querySelector<HTMLDetailsElement>(
    '[data-testid="chat-error-detail"]',
  );
}

beforeEach(() => {
  execute = vi.fn().mockResolvedValue(undefined);
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

describe("failed turn detail", () => {
  it("shows the generic line plus a collapsed disclosure with the raw text", () => {
    const target = render_message(failed_message({ error_detail: RAW }));

    const detail = detail_of(target);
    expect(target.textContent).toContain(
      "Failed: Claude Code request failed — see logs for details.",
    );
    expect(detail?.open).toBe(false);
    expect(detail?.querySelector("summary")?.textContent?.trim()).toBe(
      "Details",
    );
    expect(detail?.querySelector("pre")?.textContent).toBe(RAW);
  });

  it("renders no disclosure when the failure has no detail", () => {
    const target = render_message(failed_message());

    expect(target.textContent).toContain("Failed:");
    expect(detail_of(target)).toBeNull();
  });

  it("copies the raw text through the action registry", () => {
    const target = render_message(failed_message({ error_detail: RAW }));

    detail_of(target)
      ?.querySelector<HTMLButtonElement>('[aria-label="Copy error details"]')
      ?.click();

    expect(execute).toHaveBeenCalledWith(ACTION_IDS.rag_copy_error_detail, RAW);
  });
});

describe("error banner detail", () => {
  it("shows the raw text under the banner message", () => {
    const target = render_panel(RAW);

    expect(target.textContent).toContain(
      "Claude Code request failed — see logs for details.",
    );
    expect(detail_of(target)?.querySelector("pre")?.textContent).toBe(RAW);
  });

  it("renders no disclosure under a banner with no detail", () => {
    const target = render_panel(null);

    expect(target.textContent).toContain("Claude Code request failed");
    expect(detail_of(target)).toBeNull();
  });
});
