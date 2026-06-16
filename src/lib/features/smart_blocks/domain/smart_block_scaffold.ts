export type SmartBlockScaffoldType = "query" | "base" | "backlinks" | "tasks";

export function smart_block_body(type: SmartBlockScaffoldType): string {
  switch (type) {
    case "query":
      return "notes with #tag";
    case "base":
      return "view: table\nquery: notes with #tag";
    case "backlinks":
      return "";
    case "tasks":
      return "not done\nsort by due_date";
  }
}
