import { describe, it, expect, vi } from "vitest";
import { run_base_query } from "$lib/app/base_query";
import type { BasesPort, BaseNoteRow } from "$lib/features/bases";
import type { QueryResult, QuerySection } from "$lib/features/query";
import type { NoteMeta } from "$lib/shared/types/note";
import type { VaultId } from "$lib/shared/types/ids";

function make_note(path: string): NoteMeta {
  const name = path.split("/").pop() ?? path;
  return {
    id: path as never,
    path: path as never,
    name,
    title: name.replace(/\.md$/, ""),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function make_row(path: string): BaseNoteRow {
  return {
    note: make_note(path),
    properties: {},
    tags: [],
    stats: {
      word_count: 0,
      char_count: 0,
      heading_count: 0,
      outlink_count: 0,
      reading_time_secs: 0,
      task_count: 0,
      tasks_done: 0,
      tasks_todo: 0,
      next_due_date: null,
      last_indexed_at: 0,
    },
  };
}

function make_section(title: string, start_line: number): QuerySection {
  return {
    heading_id: title.toLowerCase(),
    title,
    level: 2,
    heading_path: title,
    start_line,
    end_line: start_line + 4,
    word_count: 10,
  };
}

const SECTION_RESULT: QueryResult = {
  items: [
    {
      note: make_note("b.md"),
      matched_clauses: [],
      section: make_section("One", 1),
    },
    {
      note: make_note("a.md"),
      matched_clauses: [],
      section: make_section("Two", 9),
    },
    {
      note: make_note("b.md"),
      matched_clauses: [],
      section: make_section("Three", 20),
    },
  ],
  total: 3,
  elapsed_ms: 1,
  query_text: "sections with #x",
};

function make_bases(rows: BaseNoteRow[]): BasesPort {
  return {
    query: vi.fn(() => Promise.resolve({ rows, total: rows.length })),
    list_properties: vi.fn(() => Promise.resolve([])),
  } as unknown as BasesPort;
}

describe("run_base_query", () => {
  it("collapses section items to one row per note, in first-appearance order", async () => {
    const bases = make_bases([make_row("a.md"), make_row("b.md")]);
    const outcome = await run_base_query(
      { run_query: () => Promise.resolve(SECTION_RESULT), bases },
      "v" as VaultId,
      "sections with #x",
    );

    expect(outcome.rows.map((row) => row.note.path)).toEqual(["b.md", "a.md"]);
    expect(outcome.total).toBe(2);
  });
});
