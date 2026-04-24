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
