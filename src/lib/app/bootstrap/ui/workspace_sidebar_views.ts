import type { Component } from "svelte";
import { SIDEBAR_VIEWS } from "$lib/app/sidebar_views";
import { GraphPanel } from "$lib/features/graph";
import { TaskPanel } from "$lib/features/task";
import { TagPanel } from "$lib/features/tags";
import { SourceControlPanel } from "$lib/features/git";
import { DailyNotesPanel } from "$lib/features/daily_notes";
import SidebarStarredView from "$lib/app/bootstrap/ui/sidebar_starred_view.svelte";
import SidebarDashboardView from "$lib/app/bootstrap/ui/sidebar_dashboard_view.svelte";

/* Getters, not values: the feature barrels above sit in an import cycle with
   the $lib/app barrel (feature panel → $lib/app → AppShell → … → this file).
   Eager map values dereference the bindings during module evaluation and
   throw a TDZ ReferenceError; getters defer the access to render time, the
   same timing the pre-registry workspace_layout template relied on. */
export const SIDEBAR_PANEL_COMPONENTS: Record<string, Component> = {
  get [SIDEBAR_VIEWS.starred]() {
    return SidebarStarredView;
  },
  get [SIDEBAR_VIEWS.dashboard]() {
    return SidebarDashboardView;
  },
  get [SIDEBAR_VIEWS.graph]() {
    return GraphPanel;
  },
  get [SIDEBAR_VIEWS.tasks]() {
    return TaskPanel;
  },
  get [SIDEBAR_VIEWS.tags]() {
    return TagPanel;
  },
  get [SIDEBAR_VIEWS.source_control]() {
    return SourceControlPanel;
  },
  get [SIDEBAR_VIEWS.daily_notes]() {
    return DailyNotesPanel;
  },
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
