import type { Plugin } from "prosemirror-state";
import { schema } from "../adapters/markdown_pipeline";
import {
  create_math_view_prose_plugin,
  create_math_inline_input_prose_plugin,
  create_math_block_input_rule_prose_plugin,
} from "../adapters/math_plugin";
import type { EditorExtension } from "./types";

export function create_math_extension(): EditorExtension {
  const plugins: Plugin[] = [
    create_math_view_prose_plugin(),
    create_math_inline_input_prose_plugin(),
    create_math_block_input_rule_prose_plugin(schema),
  ];

  return { plugins };
}
