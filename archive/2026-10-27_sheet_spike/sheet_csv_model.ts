import Papa from "papaparse";
import { Model } from "@ironcalc/wasm";

const SHEET = 0;

type LoadedCell = { original: string; loaded: string };

export type LoadedSheet = {
  model: Model;
  cells: Map<string, LoadedCell>;
  delimiter: string;
  newline: string;
};

function key(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

function detect_newline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function load_sheet(text: string, delimiter: string): LoadedSheet {
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: false,
  });
  const model = new Model("Sheet1", "en", "UTC", "en");
  parsed.data.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== "") model.setUserInput(SHEET, r + 1, c + 1, cell);
    });
  });
  model.evaluate();
  const cells = new Map<string, LoadedCell>();
  parsed.data.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === "") return;
      cells.set(key(r + 1, c + 1), {
        original: cell,
        loaded: model.getCellContent(SHEET, r + 1, c + 1),
      });
    });
  });
  model.flushSendQueue();
  return {
    model,
    cells,
    delimiter: parsed.meta.delimiter,
    newline: detect_newline(text),
  };
}

function used_rows(model: Model): number {
  let max_row = 0;
  for (let column = 1; column <= 256; column++) {
    const rows = model.getRowsWithData(SHEET, column);
    if (rows.length === 0) continue;
    max_row = Math.max(max_row, rows[rows.length - 1] ?? 0);
  }
  return max_row;
}

function cell_text(sheet: LoadedSheet, row: number, column: number): string {
  const content = sheet.model.getCellContent(SHEET, row, column);
  const loaded = sheet.cells.get(key(row, column));
  return loaded && loaded.loaded === content ? loaded.original : content;
}

export function serialize_sheet(sheet: LoadedSheet): string {
  const rows: string[][] = [];
  const row_count = used_rows(sheet.model);
  for (let row = 1; row <= row_count; row++) {
    const columns = sheet.model.getColumnsWithData(SHEET, row);
    const last = columns.length ? (columns[columns.length - 1] ?? 0) : 0;
    const values: string[] = [];
    for (let column = 1; column <= last; column++) {
      values.push(cell_text(sheet, row, column));
    }
    rows.push(values);
  }
  return (
    Papa.unparse(rows, { delimiter: sheet.delimiter, newline: sheet.newline }) +
    sheet.newline
  );
}

export function take_dirty(model: Model): boolean {
  return model.flushSendQueue().length > 1;
}
