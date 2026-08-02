import { describe, expect, it, vi } from "vitest";
import {
  answer_chat_mcp_query,
  build_chat_query_input,
  collect_chat_query_response,
} from "$lib/features/assistant";
import type { RunEvent, RunSpec } from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_chat_seam } from "../helpers/assistant_chat_seam";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  AssistantCitation,
  AssistantChatStreamEvent,
  ChatMcpQueryEvent,
} from "$lib/features/assistant";

// WHAT THIS FILE PROVES: that the in-app call site and the MCP call site AGREE
// — same retrieval, same assembly, same prompt, same answer and citations for
// the same question. It does NOT prove either one is CORRECT. Both could be
// wrong together and every assertion here would still pass. Do not let these
// assertions drift toward a correctness claim, and do not relax one to go
// green; a red here is the gate working.
//
// It is a parity test, not a unit test of the collector. Both sides run the
// REAL RetrievalService behind the REAL DI object literal via create_chat_seam,
// so scope filtering, the read bound, budget assembly and citation numbering
// are all genuinely exercised. A fake RetrievalPort would make every assertion
// below pass while proving only that the code agrees with the fake.
//
// Determinism, by construction — all three, not two of three:
//   1. ONE index instance   — one create_chat_seam call per scenario, so both
//      retrievals read the same search fake, RetrievalService and VaultStore.
//   2. ONE limit SOURCE     — both sides derive the limit from the same
//      `settings` object. Not one hardcoded limit handed to both sides: that
//      would pin the very value whose divergence is the bug.
//   3. NO MUTATION between  — the fakes are stateless mockResolvedValue and
//      nothing re-indexes or re-sorts between the two retrievals.

const QUESTION = "what is it?";

// Deliberately OFF DEFAULT. Both settings default to exactly what retrieval and
// the assembler fall back to (15 notes / 8000 tokens), so a fixture left at the
// defaults cannot tell "honours the setting" from "ignores the setting" — which
// is precisely how the MCP path drifted unnoticed.
const RETRIEVE_LIMIT = 7;
const TOKEN_BUDGET = 3000;

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "cli", command: "ollama", args: ["run", "{model}"] },
  model: "qwen3:8b",
};

const answer_events: RunEvent[] = [
  { type: "text", text: "The answer is 42 [1]." },
  { type: "done" },
];

const mcp_event: ChatMcpQueryEvent = {
  id: 1,
  question: QUESTION,
  folder: null,
  tag: null,
};

// Long enough that TOKEN_BUDGET truncates it and the 8000-token default would
// not: (3000 - 2500) * 4 = 2000 chars of room against (8000 - 2500) * 4 =
// 22000. That is what makes a budget divergence visible in the assembled
// prompt rather than silently identical.
const LONG_BODY = `The answer is 42.\n${"filler prose. ".repeat(800)}`;

function make_settings(
  overrides: Partial<EditorSettings> = {},
): EditorSettings {
  return {
    ...DEFAULT_EDITOR_SETTINGS,
    ai_enabled: true,
    ai_rag_retrieve_limit: RETRIEVE_LIMIT,
    ai_rag_context_token_budget: TOKEN_BUDGET,
    ...overrides,
  };
}

function note_meta(path: string, title: string, id: string) {
  return {
    id,
    path,
    name: title.toLowerCase(),
    title,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 100,
    file_type: "md",
  };
}

// One seam per scenario. Both call sites then share a single index instance.
function make_seam(...events: RunEvent[]) {
  const search = {
    search_blocks: vi.fn().mockResolvedValue([]),
    hybrid_search: vi
      .fn()
      .mockResolvedValue([
        { note: note_meta("notes/q.md", "Q", "1"), score: 0.9, source: "both" },
      ]),
  };
  const notes = {
    read_note: vi.fn().mockResolvedValue({ markdown: LONG_BODY }),
  };
  const run_starter = create_test_run_starter(() => events);

  const { chat } = create_chat_seam({
    search,
    notes,
    tag: { get_notes_for_tag: vi.fn().mockResolvedValue([]) },
    bases: { load_view: vi.fn(), query: vi.fn() },
    run_starter: run_starter as never,
  });

  return { chat, search, run_starter };
}

async function in_app_collect(gen: AsyncGenerator<AssistantChatStreamEvent>) {
  let content = "";
  const citations: AssistantCitation[] = [];
  let error: string | null = null;
  for await (const event of gen) {
    if (event.type === "text") content += event.text;
    else if (event.type === "citation") citations.push(event.citation);
    else if (event.type === "error") error = event.error;
  }
  return { content, citations, error };
}

function ask_in_app(
  chat: ReturnType<typeof make_seam>["chat"],
  settings: EditorSettings,
  scope: Record<string, string[]> = {},
) {
  return in_app_collect(
    chat.query(
      build_chat_query_input({
        question: QUESTION,
        provider_config: provider,
        settings,
        scope,
      }),
    ),
  );
}

function ask_over_mcp(
  chat: ReturnType<typeof make_seam>["chat"],
  settings: EditorSettings,
  event: ChatMcpQueryEvent = mcp_event,
) {
  return answer_chat_mcp_query(
    chat,
    () => Promise.resolve(provider),
    settings,
    event,
  );
}

function user_prompt(spec: RunSpec | undefined): string {
  const request = spec?.request;
  if (request?.mode !== "text") return "";
  const content = request.messages.at(-1)?.content;
  return typeof content === "string" ? content : "";
}

describe("in-app and MCP answer the same question the same way", () => {
  it("returns the same answer, citations and error from both call sites", async () => {
    const settings = make_settings();
    const { chat } = make_seam(...answer_events);

    const in_app = await ask_in_app(chat, settings);
    const mcp = await ask_over_mcp(chat, settings);

    expect(mcp.answer).toBe(in_app.content);
    expect(mcp.citations).toEqual(in_app.citations);
    expect(mcp.error).toBe(in_app.error);
    expect(mcp.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
  });

  // The load-bearing assertion. The answer text above is scripted into the run
  // starter, so it matches whatever retrieval did; the RunSpec is not. Two
  // identical specs mean both call sites retrieved the same notes, assembled
  // them under the same budget and built the same prompt.
  it("hands the model an identical prompt from both call sites", async () => {
    const settings = make_settings();
    const { chat, run_starter } = make_seam(...answer_events);

    await ask_in_app(chat, settings);
    await ask_over_mcp(chat, settings);

    expect(run_starter.specs).toHaveLength(2);
    expect(run_starter.specs[0]).toEqual(run_starter.specs[1]);
  });

  it("applies an MCP folder scope the way the in-app path applies the same scope", async () => {
    const settings = make_settings();
    const { chat, run_starter } = make_seam(...answer_events);

    await ask_in_app(chat, settings, { folders: ["notes"] });
    await ask_over_mcp(chat, settings, {
      id: 2,
      question: QUESTION,
      folder: "notes",
      tag: null,
    });

    expect(run_starter.specs).toHaveLength(2);
    expect(run_starter.specs[0]).toEqual(run_starter.specs[1]);
  });
});

describe("both call sites honour the user's retrieval settings", () => {
  // Guards the fixture itself: at the defaults these tests could not tell
  // "honours the setting" from "ignores it", because the defaults and the
  // fallbacks are the same numbers.
  it("uses a fixture that differs from the built-in fallbacks", () => {
    expect(RETRIEVE_LIMIT).not.toBe(
      DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
    );
    expect(TOKEN_BUDGET).not.toBe(
      DEFAULT_EDITOR_SETTINGS.ai_rag_context_token_budget,
    );
  });

  it("retrieves with the configured limit from both call sites", async () => {
    const settings = make_settings();
    const { chat, search } = make_seam(...answer_events);

    await ask_in_app(chat, settings);
    await ask_over_mcp(chat, settings);

    const limits = search.hybrid_search.mock.calls.map(
      (call) => call[2] as number,
    );
    expect(limits).toEqual([RETRIEVE_LIMIT, RETRIEVE_LIMIT]);
  });

  // Proves the configured budget actually bites on this fixture. Without this
  // the prompt-equality assertion above would be vacuous for the budget: a note
  // small enough to fit both budgets assembles identically either way.
  it("assembles under the configured token budget rather than the default", async () => {
    const settings = make_settings();
    const { chat, run_starter } = make_seam(...answer_events);

    await ask_in_app(chat, settings);

    expect(user_prompt(run_starter.specs[0])).toContain("[middle truncated]");
  });
});

describe("the MCP bridge honours the assistant kill switch", () => {
  it("refuses when the assistant is disabled, without resolving a provider", async () => {
    const { chat, run_starter } = make_seam(...answer_events);
    const resolve_provider = vi.fn().mockResolvedValue(provider);

    const mcp = await answer_chat_mcp_query(
      chat,
      resolve_provider,
      make_settings({ ai_enabled: false }),
      mcp_event,
    );

    expect(mcp).toEqual({
      answer: "",
      citations: [],
      error: "AI Assistant is disabled in settings",
    });
    expect(resolve_provider).not.toHaveBeenCalled();
    expect(run_starter.specs).toHaveLength(0);
  });

  it("reports no provider when the assistant is enabled but none resolves", async () => {
    const { chat } = make_seam(...answer_events);

    const mcp = await answer_chat_mcp_query(
      chat,
      () => Promise.resolve(null),
      make_settings(),
      mcp_event,
    );

    expect(mcp.error).toBe("No AI provider configured");
  });
});

describe("collect_chat_query_response", () => {
  it("surfaces a stream error as a normalized response error", async () => {
    const { chat } = make_seam({
      type: "error",
      message: "Ollama request failed — see logs for details.",
    });

    const mcp = await ask_over_mcp(chat, make_settings());

    expect(mcp.error).toBe("Ollama request failed — see logs for details.");
  });

  it("folds a raw event stream into answer, citations and error", async () => {
    const stream: AssistantChatStreamEvent[] = [
      { type: "text", text: "hello " },
      {
        type: "citation",
        citation: { index: 1, note_path: "a.md", title: "A" },
      },
      { type: "text", text: "world" },
      { type: "done" },
    ];
    async function* events(): AsyncGenerator<AssistantChatStreamEvent> {
      for (const event of stream) yield await Promise.resolve(event);
    }

    expect(await collect_chat_query_response(events())).toEqual({
      answer: "hello world",
      citations: [{ index: 1, note_path: "a.md", title: "A" }],
      error: null,
    });
  });
});
