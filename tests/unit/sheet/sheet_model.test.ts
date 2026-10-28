import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initSync } from "@ironcalc/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  load_sheet,
  serialize_sheet,
  take_dirty,
  track_selection,
} from "../../../src/sheet/sheet_model";

const SHEET = 0;

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const wasm_path = require.resolve("@ironcalc/wasm/wasm_bg.wasm");
  initSync({ module: readFileSync(wasm_path) });
});

describe("sheet_model round trip", () => {
  it.each([
    ["comma, LF, trailing", "id,amount\n007,1.0\n2,=SUM(B2:B2)\n"],
    ["CRLF, no trailing", 'a,b\r\n1.50,"x, y"\r\n,'],
    ["semicolon", "a;b;c\n1;2;3\n"],
    ["trailing empty cells", "a,,\nb,,\n\n"],
    ["quoted fields kept verbatim", '"a","b"\n"1e3","TRUE"\n'],
    ["text-prefixed original", "'quoted,  padded  \n"],
  ])("leaves an unedited file byte-identical: %s", (_, text) => {
    expect(serialize_sheet(load_sheet(text, null))).toBe(text);
  });

  it("round-trips tab-separated text with the given delimiter", () => {
    const text = "a\tb\n007\t1,5\n";
    expect(serialize_sheet(load_sheet(text, "\t"))).toBe(text);
  });

  it("returns empty text for empty input", () => {
    expect(serialize_sheet(load_sheet("", null))).toBe("");
  });
});

describe("sheet_model leading zeros", () => {
  it("loads a leading-zero number as text", () => {
    const sheet = load_sheet("007\n", null);
    expect(sheet.model.getFormattedCellValue(SHEET, 1, 1)).toBe("007");
  });

  it.each([["08"], ["'08"]])(
    "saves a cell edited to %s as 08 and reloads it as text",
    (input) => {
      const sheet = load_sheet("007,x\n", null);
      sheet.model.setUserInput(SHEET, 1, 1, input);
      sheet.model.evaluate();
      const saved = serialize_sheet(sheet);
      expect(saved).toBe("08,x\n");
      const reloaded = load_sheet(saved, null);
      expect(reloaded.model.getFormattedCellValue(SHEET, 1, 1)).toBe("08");
    },
  );
});

describe("sheet_model edits", () => {
  it("re-encodes only the edited row with the source dialect", () => {
    const text = 'a;"b"\r\n1;2\r\n';
    const sheet = load_sheet(text, null);
    sheet.model.setUserInput(SHEET, 2, 2, "x;y");
    expect(serialize_sheet(sheet)).toBe('a;"b"\r\n1;"x;y"\r\n');
  });

  it("includes a cell typed outside the loaded range", () => {
    const sheet = load_sheet("a,b\n", null);
    sheet.model.setSelectedCell(5, 40);
    sheet.model.setUserInput(SHEET, 5, 40, "far");
    track_selection(sheet);
    const rows = serialize_sheet(sheet).split("\n");
    expect(rows[0]).toBe("a,b");
    expect(rows[4]?.split(",")).toHaveLength(40);
    expect(rows[4]?.endsWith(",far")).toBe(true);
  });

  it("follows data shifted right by an inserted column", () => {
    const sheet = load_sheet("a,b\nc\n", null);
    sheet.model.insertColumns(SHEET, 1, 1);
    sheet.model.setUserInput(SHEET, 3, 3, "z");
    expect(serialize_sheet(sheet)).toBe(",a,b\n,c\n,,z\n");
  });

  it("reports dirty after an edit and clean after a flush", () => {
    const sheet = load_sheet("a\n", null);
    expect(take_dirty(sheet.model)).toBe(false);
    sheet.model.setUserInput(SHEET, 1, 1, "b");
    expect(take_dirty(sheet.model)).toBe(true);
    expect(take_dirty(sheet.model)).toBe(false);
  });
});

describe("sheet_model structural edits", () => {
  const formatted = 'item,rate,price,total\nA,50%,"$1,250.50",=sum(c2:c2)\n';

  it("keeps original text of rows shifted by an inserted row", () => {
    const sheet = load_sheet(formatted, null);
    sheet.model.insertRows(SHEET, 1, 1);
    expect(serialize_sheet(sheet)).toBe(
      '\nitem,rate,price,total\nA,50%,"$1,250.50",=SUM(C3:C3)\n',
    );
  });

  it("keeps original text after deleting a middle row", () => {
    const sheet = load_sheet("h,v\na,50%\nb,1.0\n", null);
    sheet.model.deleteRows(SHEET, 2, 1);
    expect(serialize_sheet(sheet)).toBe("h,v\nb,1.0\n");
  });

  it("restores byte-identical output after undoing a row insert", () => {
    const sheet = load_sheet(formatted, null);
    sheet.model.insertRows(SHEET, 1, 1);
    sheet.model.undo();
    expect(serialize_sheet(sheet)).toBe(formatted);
  });

  it("matches duplicate identical rows one to one", () => {
    const text = "50%,1.0\n50%,1.0\n50%,1.0\n";
    const sheet = load_sheet(text, null);
    sheet.model.deleteRows(SHEET, 2, 1);
    expect(serialize_sheet(sheet)).toBe("50%,1.0\n50%,1.0\n");
  });

  it("falls back to cell content for rows shifted by an inserted column", () => {
    const sheet = load_sheet("a,50%\n", null);
    sheet.model.insertColumns(SHEET, 1, 1);
    expect(serialize_sheet(sheet)).toBe(",a,0.5\n");
  });
});
