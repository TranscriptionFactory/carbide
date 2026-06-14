import { VIEW_MODES, type ViewMode } from "$lib/features/bases";

export type BaseViewSpec = {
  view: ViewMode;
  query: string;
  group_by: string[];
  date_property: string | null;
};

export type BaseViewParseResult =
  | { ok: true; spec: BaseViewSpec }
  | { ok: false; error: string };

const LINE_RE = /^\s*([a-zA-Z_]+)\s*:\s*(.*)$/;

function split_list(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parse_base_view_spec(body: string): BaseViewParseResult {
  const fields = new Map<string, string>();
  for (const line of body.split("\n")) {
    if (line.trim().length === 0) continue;
    const match = LINE_RE.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (key === undefined || value === undefined) continue;
    fields.set(key.toLowerCase(), value.trim());
  }

  const query = fields.get("query") ?? "";
  if (query.length === 0) {
    return { ok: false, error: "base block requires a query" };
  }

  const raw_view = fields.get("view");
  let view: ViewMode = "table";
  if (raw_view !== undefined) {
    if (!VIEW_MODES.includes(raw_view as ViewMode)) {
      return { ok: false, error: `Unknown view: ${raw_view}` };
    }
    view = raw_view as ViewMode;
  }

  return {
    ok: true,
    spec: {
      view,
      query,
      group_by: split_list(fields.get("group_by") ?? ""),
      date_property: fields.get("date_property") || null,
    },
  };
}

export function serialize_base_view_spec(spec: BaseViewSpec): string {
  const lines = [`view: ${spec.view}`];
  if (
    (spec.view === "kanban" || spec.view === "tree") &&
    spec.group_by.length > 0
  ) {
    lines.push(`group_by: ${spec.group_by.join(", ")}`);
  }
  if (spec.view === "calendar" && spec.date_property) {
    lines.push(`date_property: ${spec.date_property}`);
  }
  lines.push(`query: ${spec.query}`);
  return lines.join("\n");
}
