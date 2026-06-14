import type { Plugin } from "prosemirror-state";
import { create_code_block_view_prose_plugin } from "../adapters/code_block_view_plugin";
import type { SmartBlocksConfig } from "../adapters/code_block_view_plugin";
import { create_shiki_prose_plugin } from "../adapters/shiki_plugin";
import { create_code_fence_language_prose_plugin } from "../adapters/code_fence_language_plugin";
import type { EditorExtension } from "./types";

export function create_code_block_extension(
  smart_blocks?: SmartBlocksConfig,
): EditorExtension {
  const plugins: Plugin[] = [
    create_code_fence_language_prose_plugin(),
    create_code_block_view_prose_plugin(smart_blocks),
    create_shiki_prose_plugin(),
  ];

  return { plugins };
}
