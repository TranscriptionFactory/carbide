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
    const default_from = word?.from ?? ctx.pos;

    return {
      from: default_from,
      options: items.map((item) => {
        let item_from: number | undefined;
        if (item.text_edit_range) {
          const r = item.text_edit_range;
          const line_obj = ctx.state.doc.line(r.start_line + 1);
          item_from = line_obj.from + r.start_character;
        }
        const opt: {
          label: string;
          apply: string;
          detail?: string;
          from?: number;
        } = {
          label: item.label,
          apply: item.insert_text ?? item.label,
        };
        if (item_from != null) opt.from = item_from;
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
