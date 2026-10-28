export type LoadedCell = { original: string; loaded: string };

export type SourceRow = { originals: string[]; loaded: string[] };

export type GridView = {
  last_row: number;
  last_column: (row: number) => number;
  content: (row: number, column: number) => string;
};

const LEADING_ZERO_NUMBER = /^0\d+$/;
const TEXT_PREFIX = "'";
const FORMULA_PREFIX = "=";

export function to_model_input(value: string): string {
  return LEADING_ZERO_NUMBER.test(value) ? TEXT_PREFIX + value : value;
}

export function saved_text(
  content: string,
  cell: LoadedCell | undefined,
): string {
  if (cell && cell.loaded === content) return cell.original;
  return content.startsWith(TEXT_PREFIX) ? content.slice(1) : content;
}

function row_signature(contents: string[]): string {
  let end = contents.length;
  while (end > 0 && contents[end - 1] === "") end--;
  return JSON.stringify(
    contents
      .slice(0, end)
      .map((content) => (content.startsWith(FORMULA_PREFIX) ? null : content)),
  );
}

function nearest_unused(
  candidates: number[],
  index: number,
  used: Set<number>,
): number | undefined {
  let best: number | undefined;
  for (const candidate of candidates) {
    if (used.has(candidate)) continue;
    if (
      best === undefined ||
      Math.abs(candidate - index) < Math.abs(best - index)
    ) {
      best = candidate;
    }
  }
  return best;
}

type RowMatch = { source: number; edited: boolean };

const EMPTY_SIGNATURE = row_signature([]);

function match_rows(
  grid_signatures: string[],
  source_signatures: string[],
): (RowMatch | undefined)[] {
  const used = new Set<number>();
  const matches: (RowMatch | undefined)[] = grid_signatures.map(
    (signature, index) => {
      if (source_signatures[index] !== signature) return undefined;
      used.add(index);
      return { source: index, edited: false };
    },
  );
  const by_signature = new Map<string, number[]>();
  source_signatures.forEach((signature, index) => {
    const indices = by_signature.get(signature);
    if (indices) indices.push(index);
    else by_signature.set(signature, [index]);
  });
  grid_signatures.forEach((signature, index) => {
    if (matches[index] !== undefined) return;
    const match = nearest_unused(
      by_signature.get(signature) ?? [],
      index,
      used,
    );
    if (match === undefined) return;
    used.add(match);
    matches[index] = { source: match, edited: false };
  });
  grid_signatures.forEach((signature, index) => {
    if (matches[index] !== undefined || signature === EMPTY_SIGNATURE) return;
    if (index >= source_signatures.length || used.has(index)) return;
    used.add(index);
    matches[index] = { source: index, edited: true };
  });
  return matches;
}

function row_texts(
  contents: string[],
  source: SourceRow | undefined,
  width: number,
): string[] {
  return Array.from({ length: width }, (_, c) =>
    saved_text(
      contents[c] ?? "",
      source && {
        original: source.originals[c] ?? "",
        loaded: source.loaded[c] ?? "",
      },
    ),
  );
}

export function grid_rows(grid: GridView, sources: SourceRow[]): string[][] {
  const row_count = Math.max(grid.last_row, sources.length);
  const contents = Array.from({ length: row_count }, (_, r) =>
    Array.from({ length: grid.last_column(r + 1) }, (_, c) =>
      grid.content(r + 1, c + 1),
    ),
  );
  const matches = match_rows(
    contents.map(row_signature),
    sources.map((source) => row_signature(source.loaded)),
  );
  while (
    contents.length > grid.last_row &&
    matches[contents.length - 1] === undefined
  ) {
    contents.pop();
  }
  return contents.map((row, r) => {
    const match = matches[r];
    if (match === undefined) return row_texts(row, undefined, row.length);
    const source = sources[match.source];
    const width = match.edited
      ? row.length
      : Math.max(row.length, source?.originals.length ?? 0);
    return row_texts(row, source, width);
  });
}
