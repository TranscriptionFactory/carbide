import type { Component } from "svelte";
import {
  Terminal,
  CircleAlert,
  Zap,
  Search,
  Bot,
  ShieldCheck,
} from "@lucide/svelte";
import type { BottomPanelTab } from "$lib/app/orchestration/ui_store.svelte";

// One home for tab presentation, shared by the panel's tab strip and the
// status bar's switcher. The Record makes adding an id to BOTTOM_PANEL_TABS
// without a descriptor a compile error.
export const BOTTOM_PANEL_TAB_META: Record<
  BottomPanelTab,
  { label: string; icon: Component }
> = {
  terminal: { label: "Terminal", icon: Terminal },
  problems: { label: "Problems", icon: CircleAlert },
  lsp_results: { label: "LSP", icon: Zap },
  query: { label: "Query", icon: Search },
  assistant: { label: "Assistant", icon: Bot },
  trust: { label: "Trust", icon: ShieldCheck },
};
