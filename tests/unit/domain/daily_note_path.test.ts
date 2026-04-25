import { describe, it, expect } from "vitest";
import {
  daily_note_path,
  parse_daily_note_date,
} from "$lib/features/daily_notes/domain/daily_note_path";

describe("daily_note_path", () => {
  it("builds flat path with none format", () => {
    const date = new Date(2026, 3, 23);
    expect(daily_note_path("Journal", "%Y-%m-%d", date, "none")).toBe(
      "Journal/2026-04-23.md",
    );
  });

  it("builds flat path by default", () => {
    const date = new Date(2026, 3, 23);
    expect(daily_note_path("Journal", "%Y-%m-%d", date)).toBe(
      "Journal/2026-04-23.md",
    );
  });

  it("builds path with year subfolder", () => {
    const date = new Date(2026, 3, 23);
    expect(daily_note_path("Journal", "%Y-%m-%d", date, "year")).toBe(
      "Journal/2026/2026-04-23.md",
    );
  });

  it("builds path with year+month subfolder", () => {
    const date = new Date(2026, 3, 23);
    expect(daily_note_path("Journal", "%Y-%m-%d", date, "year_month")).toBe(
      "Journal/2026/04/2026-04-23.md",
    );
  });

  it("builds year subfolder with custom format", () => {
    const date = new Date(2026, 0, 1);
    expect(daily_note_path("Notes/Daily", "%d-%m-%Y", date, "year")).toBe(
      "Notes/Daily/2026/01-01-2026.md",
    );
  });

  it("pads month in year_month subfolder", () => {
    const date = new Date(2026, 0, 5);
    expect(daily_note_path("J", "%Y-%m-%d", date, "year_month")).toBe(
      "J/2026/01/2026-01-05.md",
    );
  });
});

describe("parse_daily_note_date", () => {
  it("parses date from flat path (none)", () => {
    const result = parse_daily_note_date(
      "Journal",
      "%Y-%m-%d",
      "Journal/2026-04-23.md",
      "none",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("parses date from flat path by default", () => {
    const result = parse_daily_note_date(
      "Journal",
      "%Y-%m-%d",
      "Journal/2026-04-23.md",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("parses date from year subfolder", () => {
    const result = parse_daily_note_date(
      "Journal",
      "%Y-%m-%d",
      "Journal/2026/2026-04-23.md",
      "year",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("parses date from year_month subfolder", () => {
    const result = parse_daily_note_date(
      "Journal",
      "%Y-%m-%d",
      "Journal/2026/04/2026-04-23.md",
      "year_month",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("parses date from custom format with year subfolder", () => {
    const result = parse_daily_note_date(
      "Notes/Daily",
      "%d-%m-%Y",
      "Notes/Daily/2026/23-04-2026.md",
      "year",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("returns null for non-matching path", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Other/2026/2026-04-23.md",
        "year",
      ),
    ).toBeNull();
  });

  it("returns null for wrong extension", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026/2026-04-23.txt",
        "year",
      ),
    ).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026/2026-13-45.md",
        "year",
      ),
    ).toBeNull();
  });

  it("rejects year subfolder path when format is none", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026/2026-04-23.md",
        "none",
      ),
    ).toBeNull();
  });

  it("rejects flat path when format is year", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026-04-23.md",
        "year",
      ),
    ).toBeNull();
  });
});
