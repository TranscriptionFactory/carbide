import type { Plugin } from "prosemirror-state";
import { create_strikethrough_prose_plugin } from "../adapters/strikethrough_plugin";
import { create_inline_mark_input_rules_prose_plugin } from "../adapters/inline_mark_input_rules_plugin";
import { create_mark_escape_prose_plugin } from "../adapters/mark_escape_plugin";
import { create_paired_delimiter_prose_plugin } from "../adapters/paired_delimiter_plugin";
import type { EditorExtension } from "./types";

export function create_marks_extension(): EditorExtension {
  const plugins: Plugin[] = [
    create_strikethrough_prose_plugin(),
    create_inline_mark_input_rules_prose_plugin(),
    create_paired_delimiter_prose_plugin(),
    create_mark_escape_prose_plugin(),
  ];

  return { plugins };
}
