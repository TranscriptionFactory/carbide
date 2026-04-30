import type { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { create_lsp_hover_plugin } from "../adapters/lsp_hover_plugin";
import { create_lsp_definition_plugin } from "../adapters/lsp_definition_plugin";
import { create_lsp_completion_plugin } from "../adapters/lsp_completion_plugin";
import { create_lsp_inlay_hints_plugin } from "../adapters/lsp_inlay_hints_plugin";
import { create_lsp_code_action_plugin } from "../adapters/lsp_code_action_plugin";
import { wiki_suggest_plugin_key } from "../adapters/wiki_suggest_plugin";
import { at_palette_plugin_key } from "../adapters/at_palette_plugin";
import { is_link_tooltip_active } from "../adapters/link_tooltip_plugin";
import type { EditorExtension, PluginContext } from "./types";

export function create_lsp_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];
  const get_markdown = ctx.get_markdown;

  if (ctx.events.on_markdown_lsp_hover) {
    const hover_input: Parameters<typeof create_lsp_hover_plugin>[0] = {
      on_hover: ctx.events.on_markdown_lsp_hover,
      get_markdown,
    };
    if (ctx.events.on_markdown_lsp_hover_result) {
      hover_input.on_hover_result = ctx.events.on_markdown_lsp_hover_result;
    }
    if (ctx.native_link_hover_enabled !== false) {
      hover_input.should_suppress_visual = () => is_link_tooltip_active();
    }
    plugins.push(create_lsp_hover_plugin(hover_input));
  }

  if (ctx.events.on_markdown_lsp_definition) {
    plugins.push(
      create_lsp_definition_plugin({
        on_definition: ctx.events.on_markdown_lsp_definition,
        on_navigate:
          ctx.events.on_markdown_lsp_definition_navigate ?? (() => {}),
        get_markdown,
      }),
    );
  }

  if (ctx.events.on_markdown_lsp_completion) {
    const completion_blockers: Array<(view: EditorView) => boolean> = [];

    if (ctx.native_wiki_suggest_enabled !== false) {
      completion_blockers.push((view) => {
        const state = wiki_suggest_plugin_key.getState(view.state);
        if (!state?.active) return false;
        if (state.query.includes("#^") && state.items.length === 0)
          return false;
        return true;
      });
    }

    completion_blockers.push(
      (view) => at_palette_plugin_key.getState(view.state)?.active ?? false,
    );

    plugins.push(
      create_lsp_completion_plugin({
        on_completion: ctx.events.on_markdown_lsp_completion,
        get_trigger_characters:
          ctx.events.get_markdown_lsp_completion_trigger_characters ??
          (() => []),
        get_markdown,
        completion_blockers,
      }),
    );
  }

  if (ctx.events.on_markdown_lsp_inlay_hints) {
    plugins.push(
      create_lsp_inlay_hints_plugin({
        on_inlay_hints: ctx.events.on_markdown_lsp_inlay_hints,
        get_markdown,
      }),
    );
  }

  if (ctx.events.on_markdown_lsp_code_actions) {
    plugins.push(
      create_lsp_code_action_plugin({
        on_code_actions: ctx.events.on_markdown_lsp_code_actions,
        on_resolve:
          ctx.events.on_markdown_lsp_code_action_resolve ?? (() => {}),
        on_lsp_code_actions: ctx.events.on_lsp_code_actions,
        on_lsp_resolve: ctx.events.on_lsp_code_action_resolve,
        get_markdown,
      }),
    );
  }

  return { plugins };
}
