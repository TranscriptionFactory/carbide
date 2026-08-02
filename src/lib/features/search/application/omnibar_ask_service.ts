import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  AssistantContextStats,
  AssistantMessage,
  AssistantSessionStore,
  RunHandle,
} from "$lib/features/assistant";
import type { RagStreamEvent } from "$lib/features/rag";

// Narrower than RagService's own RagQueryInput, which the rag barrel does not
// export: naming only the fields this surface supplies keeps `query` injectable
// with a fake in tests and still assignable from the real service.
export type OmnibarAskQueryInput = {
  question: string;
  provider_config: AiProviderConfig;
  on_run_started?: (handle: RunHandle) => void;
};

export type OmnibarAskQuery = (
  input: OmnibarAskQueryInput,
) => AsyncGenerator<RagStreamEvent>;

export type OmnibarAskDeps = {
  query: OmnibarAskQuery;
  sessions: AssistantSessionStore;
  resolve_provider: () => Promise<AiProviderConfig | null>;
  insert_at_cursor: (text: string) => void;
  can_insert: () => boolean;
  open_session: (session_id: string) => void;
};

// "skipped" is a refusal that never opened a session; "stopped" and "error"
// both leave one behind, which is what esc has to preserve.
export type OmnibarAskResult =
  | { status: "done" }
  | { status: "stopped" }
  | { status: "error"; message: string }
  | { status: "skipped" };

const NO_PROVIDER =
  "No AI provider is available — configure one in Settings, then try again.";

function empty_message(): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    citations: [],
  };
}

// R6: nothing here runs until submit(). Retrieval, prompt assembly, the kernel
// run and citation resolution all live in RagService.query — this owns only the
// fold of that stream onto a ⌁ session, because the rag RunSpec carries no
// origin.session_id for the shared session sink to bind to (C1 follow-up).
export class OmnibarAskController {
  private handle: RunHandle | null = null;
  private session_id: string | null = null;
  private running = false;

  constructor(private readonly deps: OmnibarAskDeps) {}

  get current_session_id(): string | null {
    return this.session_id;
  }

  async submit(
    question: string,
    on_session_started?: (session_id: string) => void,
  ): Promise<OmnibarAskResult> {
    const asked = question.trim();
    if (asked === "") return { status: "skipped" };
    // ↵ submits whenever there is no answer yet, so it stays live through the
    // wait. Without this a second press would orphan the first run and strand
    // its session half-written. The flag covers provider resolution too, which
    // is awaited before any run handle exists.
    if (this.running) return { status: "skipped" };
    this.running = true;

    try {
      // Resolution precedes the session so a refusal leaves nothing behind.
      const provider = await this.deps.resolve_provider();
      if (!provider) return { status: "error", message: NO_PROVIDER };

      const session = this.deps.sessions.create({
        kind: "inline",
        title: asked,
        provider_id: provider.id,
      });
      this.session_id = session.id;
      this.deps.sessions.append_message(session.id, {
        id: crypto.randomUUID(),
        role: "user",
        content: asked,
        citations: [],
      });
      on_session_started?.(session.id);

      return await this.consume(session.id, asked, provider);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.handle?.stop();
  }

  // False when there is no mounted editor: EditorService.insert_text is a
  // silent no-op without an open note, so the caller disables the affordance
  // rather than letting ⌘↵ look broken.
  insert(): boolean {
    if (!this.deps.can_insert()) return false;
    const text = this.answer_text();
    if (text === "") return false;
    this.deps.insert_at_cursor(text);
    return true;
  }

  // R3: promote opens the session as a tab. Kind stays "inline" — it records
  // where the exchange came from, not what it is allowed to become.
  promote(): void {
    if (this.session_id) this.deps.open_session(this.session_id);
  }

  reset(): void {
    this.handle = null;
    this.session_id = null;
  }

  private answer_text(): string {
    if (!this.session_id) return "";
    const session = this.deps.sessions.get(this.session_id);
    const answer = session?.messages.findLast(
      (message) => message.role === "assistant",
    );
    return answer?.content ?? "";
  }

  private async consume(
    session_id: string,
    question: string,
    provider: AiProviderConfig,
  ): Promise<OmnibarAskResult> {
    let message_id: string | null = null;
    let failure: string | null = null;
    let completed = false;
    let stats: AssistantContextStats | null = null;

    // Only turn content opens the turn. `sources` arrives before the run even
    // starts, so opening on it would leave an empty bubble behind every ask
    // that was stopped early.
    const open = (): string => {
      if (message_id) return message_id;
      const message = empty_message();
      if (stats) message.context_stats = stats;
      this.deps.sessions.append_message(session_id, message);
      message_id = message.id;
      return message.id;
    };

    const amend = (
      id: string,
      changes: (message: AssistantMessage) => Partial<AssistantMessage>,
    ): void => {
      const message = this.deps.sessions
        .get(session_id)
        ?.messages.find((entry) => entry.id === id);
      if (!message) return;
      this.deps.sessions.update_message(session_id, id, changes(message));
    };

    try {
      for await (const event of this.deps.query({
        question,
        provider_config: provider,
        on_run_started: (handle) => {
          this.handle = handle;
        },
      })) {
        if (event.type === "text") {
          const id = open();
          amend(id, (message) => ({ content: message.content + event.text }));
        } else if (event.type === "sources") {
          stats = event.stats;
          if (message_id) {
            amend(message_id, () => ({ context_stats: event.stats }));
          }
        } else if (event.type === "citation") {
          amend(open(), (message) => ({
            citations: [...message.citations, event.citation],
          }));
        } else if (event.type === "error") {
          failure = event.error;
        } else if (event.type === "done") {
          completed = true;
        }
      }
    } catch (thrown) {
      // The retrieval pipeline reports its own failures as error events, so
      // reaching here means it broke rather than refused. Settling as a failed
      // turn keeps the surface out of a permanent "running" state.
      failure = error_message(thrown);
    } finally {
      this.handle = null;
    }

    return this.settle(session_id, message_id, failure, completed);
  }

  // query() signals its three terminal states differently: a `done` event, an
  // `error` event, or the generator simply returning — which is what an abort
  // looks like, since the kernel dispatches no terminal event for one.
  private settle(
    session_id: string,
    message_id: string | null,
    failure: string | null,
    completed: boolean,
  ): OmnibarAskResult {
    if (failure !== null) {
      if (message_id) {
        this.deps.sessions.update_message(session_id, message_id, {
          error: failure,
        });
      }
      return { status: "error", message: failure };
    }

    if (completed) return { status: "done" };

    if (message_id) {
      const session = this.deps.sessions.get(session_id);
      const message = session?.messages.find(
        (entry) => entry.id === message_id,
      );
      // A turn stopped before it said anything is an empty bubble, not history.
      if (session && message && message.content === "") {
        this.deps.sessions.replace_messages(
          session_id,
          session.messages.filter((entry) => entry.id !== message_id),
        );
      } else {
        this.deps.sessions.update_message(session_id, message_id, {
          stopped: true,
        });
      }
    }
    return { status: "stopped" };
  }
}
