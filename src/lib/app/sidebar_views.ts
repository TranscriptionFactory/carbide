import type { Component } from "svelte";
import type { IconProps } from "@lucide/svelte";
import {
  Files,
  Star,
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Tags,
  Network,
  GitBranch,
} from "@lucide/svelte";

export const SIDEBAR_VIEWS = {
  explorer: "explorer",
  dashboard: "dashboard",
  starred: "starred",
  graph: "graph",
  tasks: "tasks",
  tags: "tags",
  source_control: "source_control",
  daily_notes: "daily_notes",
} as const;

export type SidebarView =
  | (typeof SIDEBAR_VIEWS)[keyof typeof SIDEBAR_VIEWS]
  | (string & {});

export type SidebarViewDef = {
  id: string;
  label: string;
  icon: Component<IconProps>;
  command_icon: string;
  keywords: string[];
  vault_only: boolean;
  default_visible: boolean;
};

export type SidebarViewConfigEntry = { id: string; visible: boolean };

export const SIDEBAR_VIEW_REGISTRY: SidebarViewDef[] = [
  {
    id: SIDEBAR_VIEWS.explorer,
    label: "Explorer",
    icon: Files,
    command_icon: "files",
    keywords: ["explorer", "files", "tree", "folders"],
    vault_only: false,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.starred,
    label: "Starred",
    icon: Star,
    command_icon: "star",
    keywords: ["starred", "favorites", "bookmarks", "pinned"],
    vault_only: true,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.dashboard,
    label: "Dashboard",
    icon: LayoutDashboard,
    command_icon: "layout-dashboard",
    keywords: ["dashboard", "overview", "vault", "stats"],
    vault_only: true,
    default_visible: false,
  },
  {
    id: SIDEBAR_VIEWS.tasks,
    label: "Tasks",
    icon: ListChecks,
    command_icon: "list-checks",
    keywords: ["tasks", "todo", "checklist"],
    vault_only: true,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.daily_notes,
    label: "Daily Notes",
    icon: CalendarDays,
    command_icon: "calendar-days",
    keywords: ["daily", "notes", "journal", "calendar"],
    vault_only: true,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.tags,
    label: "Tags",
    icon: Tags,
    command_icon: "tags",
    keywords: ["tags", "labels", "topics"],
    vault_only: true,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.graph,
    label: "Graph",
    icon: Network,
    command_icon: "network",
    keywords: ["graph", "network", "links", "connections"],
    vault_only: true,
    default_visible: true,
  },
  {
    id: SIDEBAR_VIEWS.source_control,
    label: "Source Control",
    icon: GitBranch,
    command_icon: "git-branch",
    keywords: ["source", "control", "git", "version", "commit"],
    vault_only: true,
    default_visible: true,
  },
];

export function sidebar_view_def(id: string): SidebarViewDef | undefined {
  return SIDEBAR_VIEW_REGISTRY.find((v) => v.id === id);
}

export function default_sidebar_views_config(): SidebarViewConfigEntry[] {
  return SIDEBAR_VIEW_REGISTRY.map((v) => ({
    id: v.id,
    visible: v.default_visible,
  }));
}

export function resolve_sidebar_views_config(
  stored: SidebarViewConfigEntry[] | null | undefined,
): SidebarViewConfigEntry[] {
  const entries = Array.isArray(stored) ? stored : [];
  const result: SidebarViewConfigEntry[] = entries
    .filter((entry) => sidebar_view_def(entry.id) !== undefined)
    .map((entry) => ({ id: entry.id, visible: entry.visible }));
  const present = new Set(result.map((entry) => entry.id));

  SIDEBAR_VIEW_REGISTRY.forEach((view, index) => {
    if (present.has(view.id)) return;
    const previous = SIDEBAR_VIEW_REGISTRY[index - 1];
    const insert_at =
      previous === undefined
        ? 0
        : result.findIndex((entry) => entry.id === previous.id) + 1;
    result.splice(insert_at, 0, {
      id: view.id,
      visible: view.default_visible,
    });
    present.add(view.id);
  });

  return result;
}
