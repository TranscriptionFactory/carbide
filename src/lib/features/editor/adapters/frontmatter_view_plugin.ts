import { type NodeView } from "prosemirror-view";
import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { mount, unmount } from "svelte";
import { FrontmatterInlineWidget } from "$lib/features/metadata";
import type { MetadataStore } from "$lib/features/metadata";

export type FrontmatterWidgetConfig = {
  metadata_store: MetadataStore | null;
  is_enabled: () => boolean;
  on_update: (key: string, value: string) => void;
  on_add: (key: string, value: string) => void;
  on_remove: (key: string) => void;
};

class FrontmatterNodeView implements NodeView {
  dom: HTMLElement;
  private svelte_app: Record<string, unknown>;

  constructor(config: FrontmatterWidgetConfig) {
    this.dom = document.createElement("div");
    this.dom.dataset["type"] = "frontmatter";
    this.svelte_app = mount(FrontmatterInlineWidget, {
      target: this.dom,
      props: { ...config },
    });
  }

  update(node: ProseNode): boolean {
    return node.type.name === "frontmatter";
  }

  destroy() {
    void unmount(this.svelte_app);
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

export function create_frontmatter_view_plugin(
  config: FrontmatterWidgetConfig,
): Plugin {
  return new Plugin({
    key: new PluginKey("frontmatter-view"),
    props: {
      nodeViews: {
        frontmatter: () => new FrontmatterNodeView(config),
      },
    },
  });
}
