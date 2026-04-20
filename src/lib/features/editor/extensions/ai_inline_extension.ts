import type { EditorExtension } from "./types";
import { create_ai_menu_plugin } from "../adapters/ai_menu_plugin";

export function create_ai_inline_extension(): EditorExtension {
  return {
    plugins: [create_ai_menu_plugin()],
  };
}
