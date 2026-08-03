import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RunHandle, RunStarter } from "$lib/features/assistant/types/run";
import { start_run_stream } from "$lib/features/assistant/application/run_stream";
import {
  build_document_edit_prompt,
  build_note_edit_prompt,
} from "$lib/features/assistant/domain/edit_target_prompt";

export type EditOpenTabTarget = {
  kind: "note" | "document";
  path: string;
  title: string;
  content: string;
};

export type EditOpenTabRequest = {
  provider_config: AiProviderConfig;
  target: EditOpenTabTarget;
  instructions: string;
  on_run_started?: (handle: RunHandle) => void;
};

// `stopped` and `empty` are distinct non-results: neither may become a
// proposal — a partial or vacuous stream must never turn into a whole-file
// rewrite.
export type EditOpenTabResult =
  | { status: "done"; output: string }
  | { status: "stopped" }
  | { status: "empty" }
  | { status: "error"; message: string };

// Runs through start_run_stream so Stop and presence come for free (I1) —
// no AbortController here.
export class DocumentEditService {
  constructor(private readonly run_starter: RunStarter) {}

  async edit(request: EditOpenTabRequest): Promise<EditOpenTabResult> {
    const { target } = request;
    const prompt =
      target.kind === "document"
        ? build_document_edit_prompt({
            file_path: target.path,
            file_title: target.title,
            content: target.content,
            instructions: request.instructions,
          })
        : build_note_edit_prompt({
            note_path: target.path,
            content: target.content,
            instructions: request.instructions,
          });

    const { handle, events } = await start_run_stream(this.run_starter, {
      kind: "note",
      label: request.instructions,
      provider: request.provider_config,
      origin: target.kind === "note" ? { note_path: target.path } : {},
      request: {
        mode: "text",
        system_prompt: "",
        messages: [{ role: "user", content: prompt }],
      },
    });
    request.on_run_started?.(handle);

    let output = "";
    try {
      for await (const event of events) {
        if (event.type === "text") {
          output += event.text;
        } else if (event.type === "error") {
          return { status: "error", message: event.message };
        } else if (event.type === "end") {
          if (event.outcome.status === "aborted") return { status: "stopped" };
          if (event.outcome.status === "error") {
            return { status: "error", message: event.outcome.error.message };
          }
        }
      }
      if (output.trim() === "") return { status: "empty" };
      return { status: "done", output };
    } finally {
      handle.stop();
    }
  }
}
