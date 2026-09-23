import { seeded_rng } from "./seeded_rng";

const WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "tempor",
  "incididunt",
  "labore",
  "magna",
  "aliqua",
  "veniam",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "commodo",
];

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

function sentence(rng: () => number, words: number): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) parts.push(pick(rng, WORDS));
  return parts.join(" ");
}

function paragraph(rng: () => number, index: number): string {
  const extras = [
    `[[Note ${String(index % 97)}]]`,
    `#tag${String(index % 31)}`,
    `[[session:sess-${String(index % 13)}]]`,
    `**${sentence(rng, 2)}**`,
    `\`code_${String(index)}\``,
    `$x_${String(index % 7)}^2$`,
  ];
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    parts.push(sentence(rng, 8 + Math.floor(rng() * 8)));
    if (rng() < 0.6) parts.push(pick(rng, extras));
  }
  return `${parts.join(" ")}.`;
}

function list_block(rng: () => number, index: number): string {
  const lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const prefix = rng() < 0.4 ? `- [${rng() < 0.5 ? "x" : " "}] ` : "- ";
    lines.push(`${prefix}${sentence(rng, 6)} [[Item ${String(index + i)}]]`);
    if (rng() < 0.3) lines.push(`  - ${sentence(rng, 5)} #nested${String(i)}`);
  }
  return lines.join("\n");
}

function code_block(rng: () => number, index: number): string {
  const body: string[] = [];
  for (let i = 0; i < 6; i++) {
    body.push(
      `const v${String(index)}_${String(i)} = "${sentence(rng, 3)}"; // #not-a-tag`,
    );
  }
  return ["```ts", ...body, "```"].join("\n");
}

function table_block(rng: () => number): string {
  const rows = ["| a | b | c |", "| --- | --- | --- |"];
  for (let i = 0; i < 4; i++) {
    rows.push(
      `| ${sentence(rng, 2)} | ${sentence(rng, 2)} | ${sentence(rng, 2)} |`,
    );
  }
  return rows.join("\n");
}

function math_block(index: number): string {
  return [
    "$$",
    `\\sum_{i=0}^{${String(index)}} i^2 = \\frac{n(n+1)(2n+1)}{6}`,
    "$$",
  ].join("\n");
}

/**
 * Deterministic realistic markdown of roughly `target_chars` characters:
 * frontmatter, headings every few blocks, wiki/session links, tags, nested
 * lists and tasks, fenced code, tables and math.
 */
export function build_large_markdown(target_chars: number, seed = 42): string {
  const rng = seeded_rng(seed);
  const blocks: string[] = [
    "---\ntitle: Large note\ntags: [perf, fixture]\n---",
    "# Large note",
  ];
  let size = blocks.join("\n\n").length;
  let index = 0;
  while (size < target_chars) {
    let block: string;
    const slot = index % 12;
    if (slot === 0 || slot === 8) block = `## Section ${String(index)}`;
    else if (slot === 4) block = `### Subsection ${String(index)}`;
    else if (slot === 3) block = list_block(rng, index);
    else if (slot === 5) block = code_block(rng, index);
    else if (slot === 9 && index % 24 === 9) block = table_block(rng);
    else if (slot === 11 && index % 24 === 11) block = math_block(index);
    else block = paragraph(rng, index);
    blocks.push(block);
    size += block.length + 2;
    index++;
  }
  return `${blocks.join("\n\n")}\n`;
}
