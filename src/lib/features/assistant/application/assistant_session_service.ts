import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { start_run_stream } from "$lib/features/assistant/application/run_stream";
import type { RunStarter } from "$lib/features/assistant/types/run";
import type { AssistantSessionPersistencePort } from "$lib/features/assistant/ports";
import type {
  AssistantMessage,
  AssistantSession,
  AssistantSessionSummary,
} from "$lib/features/assistant/types/session";
import {
  migrate_scope,
  migrate_session_fields,
  sanitize_generated_title,
} from "$lib/features/assistant/types/assistant_session_model";

const log = create_logger("assistant_session_service");

const TITLE_EXCHANGE_LIMIT = 1000;
const TITLE_SYSTEM_PROMPT =
  "Reply with only a 2-4 word noun phrase title for this conversation. Sentence case. No punctuation, no quotes.";

// I4: sessions are the assistant's, whatever surface opened them. This owns
// reading and writing them plus the field migration every load runs through;
// retrieval never sees a stored session.
//
// Every CRUD method swallows and logs its failure rather than throwing: a chat
// that cannot reach disk must still answer, and the callers are UI actions with
// nowhere to put an exception.
export class AssistantSessionService {
  constructor(
    private readonly persistence_port: AssistantSessionPersistencePort,
    private readonly run_starter: RunStarter,
  ) {}

  async list_sessions(vault_id: string): Promise<AssistantSessionSummary[]> {
    try {
      return await this.persistence_port.list_sessions(vault_id);
    } catch (err) {
      log.warn("Assistant list_sessions failed", { error: error_message(err) });
      return [];
    }
  }

  async load_session(
    vault_id: string,
    id: string,
  ): Promise<AssistantSession | null> {
    try {
      return await this.persistence_port.load_session(vault_id, id);
    } catch (err) {
      log.warn("Assistant load_session failed", { error: error_message(err) });
      return null;
    }
  }

  // The one hydration boundary (R3/I8). migrate_session_fields fills fields
  // that predate their own existence and migrate_scope upgrades a legacy
  // single-string scope; dropping either loses sessions silently, because both
  // migrate optional fields and the load still typechecks without them.
  async load_all_sessions(vault_id: string): Promise<AssistantSession[]> {
    const summaries = await this.list_sessions(vault_id);
    const sessions = await Promise.all(
      summaries.map((summary) => this.load_session(vault_id, summary.id)),
    );
    return sessions
      .filter((session): session is AssistantSession => session !== null)
      .map((session) =>
        migrate_session_fields({
          ...session,
          scope: migrate_scope(session.scope),
        }),
      );
  }

  async save_session(
    vault_id: string,
    session: AssistantSession,
  ): Promise<void> {
    try {
      await this.persistence_port.save_session(vault_id, session);
    } catch (err) {
      log.warn("Assistant save_session failed", { error: error_message(err) });
    }
  }

  async delete_session(vault_id: string, id: string): Promise<void> {
    try {
      await this.persistence_port.delete_session(vault_id, id);
    } catch (err) {
      log.warn("Assistant delete_session failed", {
        error: error_message(err),
      });
    }
  }

  async generate_title(
    provider_config: AiProviderConfig,
    messages: AssistantMessage[],
  ): Promise<string | null> {
    const user = messages.find((m) => m.role === "user");
    const assistant = messages.find((m) => m.role === "assistant");
    if (!user || !assistant) return null;
    const exchange =
      `User: ${user.content}\n\nAssistant: ${assistant.content}`.slice(
        0,
        TITLE_EXCHANGE_LIMIT,
      );
    try {
      const { events } = await start_run_stream(this.run_starter, {
        kind: "background",
        label: "Name this chat",
        provider: provider_config,
        request: {
          mode: "text",
          system_prompt: TITLE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: exchange }],
        },
      });
      let text = "";
      for await (const event of events) {
        if (event.type === "text") text += event.text;
        else if (event.type === "error") return null;
        // Half a title is not a title. A stopped run writes nothing rather
        // than naming the chat after whatever arrived first.
        else if (event.type === "end" && event.outcome.status === "aborted") {
          return null;
        }
      }
      return sanitize_generated_title(text);
    } catch (err) {
      log.warn("Assistant title generation failed", {
        error: error_message(err),
      });
      return null;
    }
  }
}
