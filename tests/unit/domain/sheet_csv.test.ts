import { describe, expect, it } from "vitest";
import {
  parse_csv,
  serialize_csv,
} from "../../../src/lib/features/document/domain/sheet_csv";

function row_at(rows: string[][], index: number): string[] {
  const row = rows[index];
  if (!row) throw new Error("missing row " + String(index));
  return row;
}

function round_trip(text: string, delimiter: string | null = null) {
  const source = parse_csv(text, delimiter);
  return serialize_csv(source.rows, source);
}

describe("sheet_csv unedited round trip", () => {
  const cases: Record<string, string> = {
    lf: "a,b\n1,2\n",
    crlf: "a,b\r\n1,2\r\n",
    "no trailing newline": "a,b\n1,2",
    "quoted fields": '"a","b c"\n"1","2"\n',
    "embedded newline": 'a,b\n"line1\nline2",x\n',
    "embedded crlf": 'a,b\r\n"line1\r\nline2",x\r\n',
    "escaped quotes": 'a,b\n"say ""hi""",x\n',
    "surrounding spaces": "a,b\n  1 , 2  \n",
    "unnecessary quotes": 'a,b\n"abc",d\n',
    "normalisable inputs":
      'id,pct,money,f,n,b,d\n007,50%,"$1,250.50",=sum(c2:d2),1.0,TRUE,2024-01-05\n',
    "blank line": "a,b\n\n1,2\n",
    "ragged rows": '"a",b,c\n1\n1,2,3,4\n',
    "trailing empty cells": "a,b,,\n1,2,,\n",
  };
  for (const [name, text] of Object.entries(cases)) {
    it(`is byte-identical for ${name}`, () => {
      expect(round_trip(text)).toBe(text);
    });
  }
});

describe("sheet_csv editing one cell", () => {
  it("changes only that record's bytes", () => {
    const text = 'a,b\n"x",  y \n007,50%\n';
    const source = parse_csv(text, null);
    const rows = source.rows.map((r) => [...r]);
    row_at(rows, 2)[1] = "51%";
    expect(serialize_csv(rows, source)).toBe('a,b\n"x",  y \n007,51%\n');
  });
});

describe("sheet_csv formulas", () => {
  it("writes a formula input as typed", () => {
    const source = parse_csv("a,b\n1,2\n", null);
    const rows = [row_at(source.rows, 0), ["1", "=B2*2"]];
    expect(serialize_csv(rows, source)).toBe("a,b\n1,=B2*2\n");
  });
});

describe("sheet_csv quoting on write", () => {
  it.each([
    ["delimiter", "a,b"],
    ["quote", 'say "hi"'],
    ["newline", "l1\nl2"],
    ["carriage return", "l1\rl2"],
  ])("quotes a value with a %s and parses it back", (_name, value) => {
    const source = parse_csv("h1,h2\n", null);
    const out = serialize_csv([row_at(source.rows, 0), [value, "z"]], source);
    expect(out).toContain('"');
    const reparsed = parse_csv(out, ",");
    expect(reparsed.rows[1]).toEqual([value, "z"]);
  });

  it("does not quote plain values", () => {
    const source = parse_csv("h1,h2\n", null);
    expect(
      serialize_csv([row_at(source.rows, 0), ["a b", "=1+1"]], source),
    ).toBe("h1,h2\na b,=1+1\n");
  });
});

describe("sheet_csv CRLF", () => {
  it("stays CRLF after an edit", () => {
    const source = parse_csv('"a",b\r\n1,2\r\n', null);
    expect(source.dialect.eol).toBe("\r\n");
    const out = serialize_csv([row_at(source.rows, 0), ["1", "3"]], source);
    expect(out).toBe('"a",b\r\n1,3\r\n');
  });
});

describe("sheet_csv ragged rows", () => {
  it("loads without loss", () => {
    const source = parse_csv("a,b,c\n1\n1,2,3,4\n", null);
    expect(source.rows).toEqual([["a", "b", "c"], ["1"], ["1", "2", "3", "4"]]);
  });

  it("emits an unedited row with trailing empty cells verbatim", () => {
    const source = parse_csv('"a",b,,\n1,2\n', null);
    expect(row_at(source.rows, 0)).toEqual(["a", "b", "", ""]);
    const out = serialize_csv([row_at(source.rows, 0), ["1", "9"]], source);
    expect(out).toBe('"a",b,,\n1,9\n');
  });
});

describe("sheet_csv empty text", () => {
  it("has no rows and a default dialect", () => {
    const source = parse_csv("", null);
    expect(source.rows).toEqual([]);
    expect(source.dialect).toEqual({
      delimiter: ",",
      eol: "\n",
      trailing_eol: true,
    });
  });

  it("honours a given delimiter", () => {
    expect(parse_csv("", "\t").dialect.delimiter).toBe("\t");
  });

  it("serializes a first row with a trailing newline", () => {
    const source = parse_csv("", null);
    expect(serialize_csv([["a", "b"]], source)).toBe("a,b\n");
  });
});

describe("sheet_csv delimiter handling", () => {
  it("detects semicolons", () => {
    const source = parse_csv("a;b;c\n1;2;3\n", null);
    expect(source.dialect.delimiter).toBe(";");
    expect(row_at(source.rows, 1)).toEqual(["1", "2", "3"]);
  });

  it("detects tabs", () => {
    expect(parse_csv("a\tb\n1\t2\n", null).dialect.delimiter).toBe("\t");
  });

  it("detects commas, ignoring decimal commas inside quotes", () => {
    expect(parse_csv('a,b\n"1;5",2\n', null).dialect.delimiter).toBe(",");
  });

  it("detects from the leading rows only, ignoring the tail", () => {
    const head = "a;b;c\n".repeat(20);
    const tail = "x,y\n1,2,3,4,5\n".repeat(5000);
    expect(parse_csv(head + tail, null).dialect.delimiter).toBe(";");
  });

  it("honours an explicit tab over detection", () => {
    const source = parse_csv("a,b\tc\n", "\t");
    expect(row_at(source.rows, 0)).toEqual(["a,b", "c"]);
  });

  it("encodes with the detected delimiter", () => {
    const source = parse_csv("a;b\n1;2\n", null);
    const out = serialize_csv([row_at(source.rows, 0), ["x;y", "2"]], source);
    expect(out).toBe('a;b\n"x;y";2\n');
  });
});

describe("sheet_csv appended rows", () => {
  it("encodes rows beyond the source with the dialect", () => {
    const source = parse_csv("a,b\r\n1,2", null);
    const out = serialize_csv([...source.rows, ["3", "x,y"]], source);
    expect(out).toBe('a,b\r\n1,2\r\n3,"x,y"');
  });
});
