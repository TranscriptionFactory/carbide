import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { line_character_from_md_offset } from "./lsp_plugin_utils";
import type { EditorService } from "../application/editor_service";

export function create_cm_lsp_completion(
  editor_service: EditorService,
): Extension {
  const trigger_chars = editor_service.lsp_completion_trigger_characters;

  async function completion_source(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    const triggered_by_char =
      ctx.pos > 0 &&
      trigger_chars.includes(ctx.state.sliceDoc(ctx.pos - 1, ctx.pos));

    if (!ctx.explicit && !triggered_by_char) return null;

    const markdown = ctx.state.doc.toString();
    const { line, character } = line_character_from_md_offset(
      markdown,
      ctx.pos,
    );

    const items = await editor_service.lsp_completion(line, character);
    if (items.length === 0) return null;

    const word = ctx.matchBefore(/\w*/);
    const from = word?.from ?? ctx.pos;

    return {
      from,
      options: items.map((item) => {
        const opt: { label: string; apply: string; detail?: string } = {
          label: item.label,
          apply: item.insert_text ?? item.label,
        };
        if (item.detail != null) opt.detail = item.detail;
        return opt;
      }),
    };
  }

  return autocompletion({
    override: [completion_source],
    activateOnTyping: trigger_chars.length > 0,
  });
}
