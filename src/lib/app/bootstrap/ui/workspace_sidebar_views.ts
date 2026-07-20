import type { Component } from "svelte";
import { SIDEBAR_VIEWS } from "$lib/app";
import { GraphPanel } from "$lib/features/graph";
import { TaskPanel } from "$lib/features/task";
import { TagPanel } from "$lib/features/tags";
import { SourceControlPanel } from "$lib/features/git";
import { DailyNotesPanel } from "$lib/features/daily_notes";
import SidebarStarredView from "$lib/app/bootstrap/ui/sidebar_starred_view.svelte";
import SidebarDashboardView from "$lib/app/bootstrap/ui/sidebar_dashboard_view.svelte";

export const SIDEBAR_PANEL_COMPONENTS: Record<string, Component> = {
  [SIDEBAR_VIEWS.starred]: SidebarStarredView,
  [SIDEBAR_VIEWS.dashboard]: SidebarDashboardView,
  [SIDEBAR_VIEWS.graph]: GraphPanel,
  [SIDEBAR_VIEWS.tasks]: TaskPanel,
  [SIDEBAR_VIEWS.tags]: TagPanel,
  [SIDEBAR_VIEWS.source_control]: SourceControlPanel,
  [SIDEBAR_VIEWS.daily_notes]: DailyNotesPanel,
};

/* Views whose sidebar header shows the registry label; everything else
   (explorer, graph, tasks, tags) keeps the VaultSwitcherDropdown header.
   Plugin views are titled too, resolved at runtime. */
export const TITLED_VIEWS: ReadonlySet<string> = new Set([
  SIDEBAR_VIEWS.starred,
  SIDEBAR_VIEWS.dashboard,
  SIDEBAR_VIEWS.source_control,
  SIDEBAR_VIEWS.daily_notes,
]);
