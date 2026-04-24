import { describe, it, expect } from "vitest";
import {
  daily_note_path,
  parse_daily_note_date,
} from "$lib/features/daily_notes/domain/daily_note_path";

describe("daily_note_path", () => {
  it("builds path with default format", () => {
    const date = new Date(2026, 3, 23); // April 23, 2026
    expect(daily_note_path("Journal", "%Y-%m-%d", date)).toBe(
      "Journal/2026/2026-04-23.md",
    );
  });

  it("builds path with custom format", () => {
    const date = new Date(2026, 0, 1); // Jan 1, 2026
    expect(daily_note_path("Notes/Daily", "%d-%m-%Y", date)).toBe(
      "Notes/Daily/2026/01-01-2026.md",
    );
  });

  it("pads month and day with zeros", () => {
    const date = new Date(2026, 0, 5); // Jan 5
    expect(daily_note_path("J", "%Y-%m-%d", date)).toBe("J/2026/2026-01-05.md");
  });
});

describe("parse_daily_note_date", () => {
  it("parses date from default format", () => {
    const result = parse_daily_note_date(
      "Journal",
      "%Y-%m-%d",
      "Journal/2026/2026-04-23.md",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("parses date from custom format", () => {
    const result = parse_daily_note_date(
      "Notes/Daily",
      "%d-%m-%Y",
      "Notes/Daily/2026/23-04-2026.md",
    );
    expect(result).toEqual(new Date(2026, 3, 23));
  });

  it("returns null for non-matching path", () => {
    expect(
      parse_daily_note_date("Journal", "%Y-%m-%d", "Other/2026/2026-04-23.md"),
    ).toBeNull();
  });

  it("returns null for wrong extension", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026/2026-04-23.txt",
      ),
    ).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(
      parse_daily_note_date(
        "Journal",
        "%Y-%m-%d",
        "Journal/2026/2026-13-45.md",
      ),
    ).toBeNull();
  });

  it("returns null for path without year subfolder", () => {
    expect(
      parse_daily_note_date("Journal", "%Y-%m-%d", "Journal/2026-04-23.md"),
    ).toBeNull();
  });
});
