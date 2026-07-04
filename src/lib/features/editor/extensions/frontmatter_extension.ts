import type { PluginContext, EditorExtension } from "./types";
import { create_frontmatter_view_plugin } from "../adapters/frontmatter_view_plugin";

export function create_frontmatter_extension(
  ctx: PluginContext,
): EditorExtension {
  const config = ctx.frontmatter_widget;
  if (!config) return { plugins: [] };
  return { plugins: [create_frontmatter_view_plugin(config)] };
}
