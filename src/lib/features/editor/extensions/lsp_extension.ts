import type { Plugin } from "prosemirror-state";
import { create_lsp_hover_plugin } from "../adapters/lsp_hover_plugin";
import { create_lsp_definition_plugin } from "../adapters/lsp_definition_plugin";
import { create_lsp_completion_plugin } from "../adapters/lsp_completion_plugin";
import { create_lsp_inlay_hints_plugin } from "../adapters/lsp_inlay_hints_plugin";
import { create_lsp_code_action_plugin } from "../adapters/lsp_code_action_plugin";
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
    plugins.push(
      create_lsp_completion_plugin({
        on_completion: ctx.events.on_markdown_lsp_completion,
        get_trigger_characters:
          ctx.events.get_markdown_lsp_completion_trigger_characters ??
          (() => []),
        get_markdown,
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
