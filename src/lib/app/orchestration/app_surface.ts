export type SidebarView =
  | "explorer"
  | "dashboard"
  | "starred"
  | "graph"
  | "tasks"
  | (string & {});

export type ContextRailTab =
  | "links"
  | "outline"
  | "ai"
  | "graph"
  | "tasks"
  | "metadata";

export type BottomPanelTab = "terminal" | "problems" | "lsp_results" | "query";

export type AppSurfaceConfig = {
  sidebar_views: SidebarView[];
  default_sidebar_view: SidebarView;
  context_rail_tabs: ContextRailTab[];
  default_context_rail_tab: ContextRailTab;
  bottom_panel_tabs: BottomPanelTab[];
  default_bottom_panel_tab: BottomPanelTab;
};

export const FULL_APP_SURFACE: AppSurfaceConfig = {
  sidebar_views: ["explorer", "dashboard", "starred", "graph", "tasks"],
  default_sidebar_view: "explorer",
  context_rail_tabs: ["links", "outline", "ai", "graph", "tasks", "metadata"],
  default_context_rail_tab: "links",
  bottom_panel_tabs: ["terminal", "problems", "lsp_results", "query"],
  default_bottom_panel_tab: "terminal",
};

export const LITE_APP_SURFACE: AppSurfaceConfig = {
  sidebar_views: ["explorer", "starred"],
  default_sidebar_view: "explorer",
  context_rail_tabs: ["links", "outline"],
  default_context_rail_tab: "links",
  bottom_panel_tabs: ["terminal", "problems"],
  default_bottom_panel_tab: "terminal",
};

export function normalize_sidebar_view(
  surface: AppSurfaceConfig,
  view: SidebarView,
): SidebarView {
  return surface.sidebar_views.includes(view)
    ? view
    : surface.default_sidebar_view;
}

export function normalize_context_rail_tab(
  surface: AppSurfaceConfig,
  tab: ContextRailTab,
): ContextRailTab {
  return surface.context_rail_tabs.includes(tab)
    ? tab
    : surface.default_context_rail_tab;
}

export function normalize_bottom_panel_tab(
  surface: AppSurfaceConfig,
  tab: BottomPanelTab,
): BottomPanelTab {
  return surface.bottom_panel_tabs.includes(tab)
    ? tab
    : surface.default_bottom_panel_tab;
}
