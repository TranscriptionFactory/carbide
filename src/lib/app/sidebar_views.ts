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

export type SidebarViewMeta = {
  id: string;
  label: string;
  icon: Component<IconProps>;
  command_icon: string;
  keywords: string[];
  vault_only: boolean;
  default_visible: boolean;
};

export type DynamicSidebarView = {
  id: string;
  label: string;
  icon: Component<IconProps>;
  keywords?: string[];
};

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

export function combined_sidebar_view_registry(
  dynamic: DynamicSidebarView[] = [],
): SidebarViewMeta[] {
  const metas: SidebarViewMeta[] = SIDEBAR_VIEW_REGISTRY.map((v) => ({
    id: v.id,
    label: v.label,
    icon: v.icon,
    command_icon: v.command_icon,
    keywords: v.keywords,
    vault_only: v.vault_only,
    default_visible: v.default_visible,
  }));
  const present = new Set(metas.map((m) => m.id));

  for (const view of dynamic) {
    if (present.has(view.id)) continue;
    metas.push({
      id: view.id,
      label: view.label,
      icon: view.icon,
      command_icon: "list-tree",
      keywords: view.keywords ?? [],
      vault_only: true,
      default_visible: true,
    });
    present.add(view.id);
  }

  return metas;
}

export function sidebar_view_meta(
  id: string,
  dynamic: DynamicSidebarView[] = [],
): SidebarViewMeta | undefined {
  return combined_sidebar_view_registry(dynamic).find((m) => m.id === id);
}

export function default_sidebar_views_config(
  dynamic: DynamicSidebarView[] = [],
): SidebarViewConfigEntry[] {
  return combined_sidebar_view_registry(dynamic).map((v) => ({
    id: v.id,
    visible: v.default_visible,
  }));
}

export function resolve_sidebar_views_config(
  stored: SidebarViewConfigEntry[] | null | undefined,
  dynamic: DynamicSidebarView[] = [],
): SidebarViewConfigEntry[] {
  const registry = combined_sidebar_view_registry(dynamic);
  const known = new Set(registry.map((v) => v.id));
  const entries = Array.isArray(stored) ? stored : [];
  const result: SidebarViewConfigEntry[] = entries
    .filter((entry) => known.has(entry.id))
    .map((entry) => ({ id: entry.id, visible: entry.visible }));
  const present = new Set(result.map((entry) => entry.id));

  registry.forEach((view, index) => {
    if (present.has(view.id)) return;
    const previous = registry[index - 1];
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
