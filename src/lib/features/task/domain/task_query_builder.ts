import type { TaskGrouping, TaskStatus } from "../types";

export type DueClause =
  | { kind: "today" }
  | { kind: "this_week" }
  | { kind: "last_week" }
  | { kind: "next_days"; days: number }
  | { kind: "before" | "after" | "on"; date: string };

export type TaskQueryClause =
  | { kind: "status"; status: TaskStatus }
  | { kind: "due"; due: DueClause }
  | { kind: "tag"; tag: string }
  | { kind: "path"; text: string }
  | { kind: "text"; text: string }
  | {
      kind: "section";
      match: "is" | "under";
      heading: string;
      include_subheadings?: boolean;
    };

export type TaskSortSpec = { property: string; descending?: boolean };

export type TaskQueryBuilderSpec = {
  clauses: TaskQueryClause[];
  sort?: TaskSortSpec[];
  group_by?: TaskGrouping;
};

function render_due(due: DueClause): string {
  switch (due.kind) {
    case "today":
      return "due today";
    case "this_week":
      return "due this week";
    case "last_week":
      return "due last week";
    case "next_days":
      return `due next ${due.days} days`;
    case "before":
    case "after":
    case "on":
      return `due ${due.kind} ${due.date}`;
  }
}

function render_clause(clause: TaskQueryClause): string {
  switch (clause.kind) {
    case "status":
      return `status is ${clause.status}`;
    case "due":
      return render_due(clause.due);
    case "tag":
      return `tag includes ${clause.tag}`;
    case "path":
      return `path includes ${clause.text}`;
    case "text":
      return `text includes ${clause.text}`;
    case "section": {
      if (clause.match === "is") {
        return `section is #${clause.heading}`;
      }
      const suffix =
        clause.include_subheadings === false
          ? " include_subheadings:false"
          : "";
      return `section under #${clause.heading}${suffix}`;
    }
  }
}

export function build_task_query_text(spec: TaskQueryBuilderSpec): string {
  const lines = spec.clauses.map(render_clause);

  for (const sort of spec.sort ?? []) {
    lines.push(`sort by ${sort.property}${sort.descending ? " desc" : ""}`);
  }

  if (spec.group_by && spec.group_by !== "none") {
    lines.push(`group by ${spec.group_by}`);
  }

  return lines.join("\n");
}
