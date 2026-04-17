import type { Plugin } from "prosemirror-state";
import { create_callout_view_prose_plugin } from "../adapters/callout_view_plugin";
import type { EditorExtension } from "./types";

export function create_callout_extension(): EditorExtension {
  const plugins: Plugin[] = [create_callout_view_prose_plugin()];
  return { plugins };
}
