export const SIDEBAR_VIEWS = {
  explorer: "explorer",
  dashboard: "dashboard",
  starred: "starred",
  graph: "graph",
  tasks: "tasks",
  tags: "tags",
  source_control: "source_control",
} as const;

export type SidebarView =
  | (typeof SIDEBAR_VIEWS)[keyof typeof SIDEBAR_VIEWS]
  | (string & {});
