import { Model } from "@ironcalc/wasm";
import {
  parse_csv,
  serialize_csv,
  type CsvSource,
} from "../lib/features/document/domain/sheet_csv";
import {
  cell_key,
  grid_rows,
  saved_text,
  to_model_input,
  type LoadedCell,
} from "./sheet_cells";

const SHEET = 0;

export type LoadedSheet = {
  model: Model;
  source: CsvSource;
  cells: Map<string, LoadedCell>;
  column_bound: number;
};

function for_each_value(
  rows: string[][],
  visit: (row: number, column: number, value: string) => void,
) {
  rows.forEach((values, r) => {
    values.forEach((value, c) => {
      if (value !== "") visit(r + 1, c + 1, value);
    });
  });
}

function keep_leading_zeros_as_text(model: Model) {
  const set_user_input = model.setUserInput.bind(model);
  model.setUserInput = (sheet, row, column, input) => {
    set_user_input(sheet, row, column, to_model_input(input));
  };
}

export function load_sheet(
  text: string,
  delimiter: string | null,
): LoadedSheet {
  const source = parse_csv(text, delimiter);
  const model = new Model("Sheet1", "en", "UTC", "en");
  for_each_value(source.rows, (row, column, value) => {
    model.setUserInput(SHEET, row, column, to_model_input(value));
  });
  model.evaluate();
  const cells = new Map<string, LoadedCell>();
  for_each_value(source.rows, (row, column, value) => {
    cells.set(cell_key(row, column), {
      original: value,
      loaded: model.getCellContent(SHEET, row, column),
    });
  });
  model.flushSendQueue();
  keep_leading_zeros_as_text(model);
  return {
    model,
    source,
    cells,
    column_bound: source.rows.reduce(
      (widest, row) => Math.max(widest, row.length),
      0,
    ),
  };
}

export function track_selection(sheet: LoadedSheet) {
  const view = sheet.model.getSelectedView();
  sheet.column_bound = Math.max(
    sheet.column_bound,
    view.column,
    view.range[1],
    view.range[3],
  );
}

function last_of(values: Int32Array): number {
  return values[values.length - 1] ?? 0;
}

function last_data_column(model: Model, row: number): number {
  return last_of(model.getColumnsWithData(SHEET, row));
}

function last_data_row(model: Model, column_bound: number): number {
  let scanned = 0;
  let bound = column_bound;
  let last_row = 0;
  while (scanned < bound) {
    for (let column = scanned + 1; column <= bound; column++) {
      last_row = Math.max(
        last_row,
        last_of(model.getRowsWithData(SHEET, column)),
      );
    }
    scanned = bound;
    for (let row = 1; row <= last_row; row++) {
      bound = Math.max(bound, last_data_column(model, row));
    }
  }
  return last_row;
}

export function sheet_rows(sheet: LoadedSheet): string[][] {
  const { model, cells } = sheet;
  return grid_rows(
    {
      last_row: last_data_row(model, sheet.column_bound),
      last_column: (row) => last_data_column(model, row),
      text: (row, column) =>
        saved_text(
          model.getCellContent(SHEET, row, column),
          cells.get(cell_key(row, column)),
        ),
    },
    sheet.source.rows,
  );
}

export function serialize_sheet(sheet: LoadedSheet): string {
  return serialize_csv(sheet_rows(sheet), sheet.source);
}

export function take_dirty(model: Model): boolean {
  return model.flushSendQueue().length > 1;
}
