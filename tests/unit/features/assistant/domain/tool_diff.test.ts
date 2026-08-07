import { describe, expect, it } from "vitest";
import {
  compute_diff_rows,
  type DiffRow,
} from "$lib/features/assistant/domain/tool_diff";

function lines(count: number, prefix: string): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index)}`,
  );
}

function kinds(rows: DiffRow[]): string[] {
  return rows.map((row) => row.kind);
}

function count_kind(rows: DiffRow[], kind: DiffRow["kind"]): number {
  return rows.filter((row) => row.kind === kind).length;
}

function gap_counts(rows: DiffRow[]): number[] {
  return rows.flatMap((row) => (row.kind === "gap" ? [row.count] : []));
}

describe("compute_diff_rows", () => {
  it("treats a null old_text as an all-add file", () => {
    const rows = compute_diff_rows(null, "alpha\nbeta\ngamma");
    expect(rows).toEqual([
      { kind: "add", text: "alpha" },
      { kind: "add", text: "beta" },
      { kind: "add", text: "gamma" },
    ]);
  });

  it("treats an empty new file as a single empty add line", () => {
    expect(compute_diff_rows(null, "")).toEqual([{ kind: "add", text: "" }]);
  });

  it("bails with the line count when either side exceeds 2000 lines", () => {
    const huge = lines(2001, "line").join("\n");
    const rows = compute_diff_rows("small", huge);

    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (row?.kind !== "bail") throw new Error("expected a bail row");
    expect(row.reason).toContain("2001");
  });

  it("keeps a run of exactly eight unchanged lines uncollapsed", () => {
    const middle = lines(8, "ctx").join("\n");
    const rows = compute_diff_rows(
      `first\n${middle}\nlast`,
      `FIRST\n${middle}\nLAST`,
    );

    expect(count_kind(rows, "ctx")).toBe(8);
    expect(count_kind(rows, "gap")).toBe(0);
  });

  it("collapses a nine-line run to three leading, a gap, and three trailing", () => {
    const middle = lines(9, "ctx").join("\n");
    const rows = compute_diff_rows(
      `first\n${middle}\nlast`,
      `FIRST\n${middle}\nLAST`,
    );

    expect(gap_counts(rows)).toEqual([3]);
    expect(count_kind(rows, "ctx")).toBe(6);

    const gap_index = rows.findIndex((row) => row.kind === "gap");
    expect(kinds(rows.slice(gap_index - 3, gap_index))).toEqual([
      "ctx",
      "ctx",
      "ctx",
    ]);
    expect(kinds(rows.slice(gap_index + 1, gap_index + 4))).toEqual([
      "ctx",
      "ctx",
      "ctx",
    ]);
  });

  it("collapses the untouched head and tail without stranding edge context", () => {
    const head = lines(10, "head").join("\n");
    const tail = lines(10, "tail").join("\n");
    const rows = compute_diff_rows(
      `${head}\ntarget\n${tail}`,
      `${head}\nchanged\n${tail}`,
    );

    expect(rows[0]).toEqual({ kind: "gap", count: 7 });
    expect(rows[rows.length - 1]).toEqual({ kind: "gap", count: 7 });
    expect(gap_counts(rows)).toEqual([7, 7]);
    expect(count_kind(rows, "ctx")).toBe(6);
  });

  it("collapses an unchanged file entirely into one gap", () => {
    const text = lines(12, "same").join("\n");
    expect(compute_diff_rows(text, text)).toEqual([{ kind: "gap", count: 12 }]);
  });

  it("leaves a short unchanged file as plain context", () => {
    const text = lines(5, "same").join("\n");
    const rows = compute_diff_rows(text, text);

    expect(count_kind(rows, "ctx")).toBe(5);
    expect(count_kind(rows, "gap")).toBe(0);
  });
});
