export type SmartBlockScaffoldType = "query" | "base" | "backlinks";

function fence(type: string, body: string): string {
  return body.length > 0
    ? `\`\`\`${type}\n${body}\n\`\`\``
    : `\`\`\`${type}\n\`\`\``;
}

export function smart_block_scaffold(type: SmartBlockScaffoldType): string {
  switch (type) {
    case "query":
      return fence("query", "notes with #tag");
    case "base":
      return fence("base", "view: table\nquery: notes with #tag");
    case "backlinks":
      return fence("backlinks", "");
  }
}
