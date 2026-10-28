export type LoadedCell = { original: string; loaded: string };

export type GridView = {
  last_row: number;
  last_column: (row: number) => number;
  text: (row: number, column: number) => string;
};

const LEADING_ZERO_NUMBER = /^0\d+$/;
const TEXT_PREFIX = "'";

export function cell_key(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

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

export function grid_rows(grid: GridView, source_rows: string[][]): string[][] {
  const row_count = Math.max(grid.last_row, source_rows.length);
  return Array.from({ length: row_count }, (_, r) => {
    const width = Math.max(
      grid.last_column(r + 1),
      source_rows[r]?.length ?? 0,
    );
    return Array.from({ length: width }, (_, c) => grid.text(r + 1, c + 1));
  });
}
