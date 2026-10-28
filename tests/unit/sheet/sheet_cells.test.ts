import { describe, expect, it } from "vitest";
import {
  grid_rows,
  saved_text,
  to_model_input,
  type GridView,
} from "../../../src/sheet/sheet_cells";

function grid_of(cells: Record<string, string>): GridView {
  const entries = Object.entries(cells).map(([key, text]) => {
    const [row, column] = key.split(":").map(Number);
    return { row: row ?? 0, column: column ?? 0, text };
  });
  return {
    last_row: Math.max(0, ...entries.map((e) => e.row)),
    last_column: (row) =>
      Math.max(0, ...entries.filter((e) => e.row === row).map((e) => e.column)),
    text: (row, column) => cells[`${String(row)}:${String(column)}`] ?? "",
  };
}

describe("to_model_input", () => {
  it("marks leading-zero numbers as text", () => {
    expect(to_model_input("007")).toBe("'007");
    expect(to_model_input("0123")).toBe("'0123");
  });

  it("leaves other values unchanged", () => {
    for (const value of ["0", "0.5", "7", "-007", "0x1", "abc", "'08", "=A1"]) {
      expect(to_model_input(value)).toBe(value);
    }
  });
});

describe("saved_text", () => {
  it("returns the original text for an unedited cell", () => {
    expect(saved_text("'007", { original: "007", loaded: "'007" })).toBe("007");
    expect(saved_text("1", { original: "1.0", loaded: "1" })).toBe("1.0");
  });

  it("strips the text prefix from edited content", () => {
    expect(saved_text("'08", { original: "007", loaded: "'007" })).toBe("08");
    expect(saved_text("'08", undefined)).toBe("08");
  });

  it("returns edited content verbatim otherwise", () => {
    expect(saved_text("2", { original: "1.0", loaded: "1" })).toBe("2");
    expect(saved_text("", undefined)).toBe("");
  });
});

describe("grid_rows", () => {
  it("keeps source widths and row count when the grid is narrower", () => {
    const source = [["a", "", ""], ["", ""], ["b"]];
    const grid = grid_of({ "1:1": "a", "3:1": "b" });
    expect(grid_rows(grid, source)).toEqual(source);
  });

  it("extends rows and widths to the grid's data", () => {
    const grid = grid_of({ "1:1": "a", "1:3": "c", "3:2": "x" });
    expect(grid_rows(grid, [["a"]])).toEqual([["a", "", "c"], [], ["", "x"]]);
  });

  it("returns no rows for an empty grid and empty source", () => {
    expect(grid_rows(grid_of({}), [])).toEqual([]);
  });
});
