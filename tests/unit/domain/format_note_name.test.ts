import { describe, expect, test } from "vitest";
import { format_note_name } from "$lib/features/note/domain/format_note_name";

describe("format_note_name", () => {
  const fixed_date = new Date(2024, 11, 31, 0, 0, 0);

  test("returns empty string for empty template", () => {
    expect(format_note_name("", fixed_date)).toBe("");
  });

  test("expands %Y to 4-digit year", () => {
    expect(format_note_name("%Y", fixed_date)).toBe("2024");
  });

  test("expands %m to 2-digit month", () => {
    expect(format_note_name("%m", fixed_date)).toBe("12");
  });

  test("expands %d to 2-digit day", () => {
    expect(format_note_name("%d", fixed_date)).toBe("31");
  });

  test("expands %H to 2-digit hour at midnight", () => {
    expect(format_note_name("%H", fixed_date)).toBe("00");
  });

  test("expands %M to 2-digit minute", () => {
    expect(format_note_name("%M", fixed_date)).toBe("00");
  });

  test("expands %S to 2-digit second", () => {
    expect(format_note_name("%S", fixed_date)).toBe("00");
  });

  test("expands all tokens in a full template", () => {
    const date = new Date(2024, 0, 5, 9, 3, 7);
    expect(format_note_name("%Y-%m-%d %H:%M:%S", date)).toBe(
      "2024-01-05 09:03:07",
    );
  });

  test("passes unknown tokens through literally", () => {
    expect(format_note_name("Daily %Y %X Note", fixed_date)).toBe(
      "Daily 2024 %X Note",
    );
  });

  test("pads single-digit months to 2 digits", () => {
    const date = new Date(2024, 0, 1, 0, 0, 0);
    expect(format_note_name("%m", date)).toBe("01");
  });

  test("handles Dec 31 midnight edge case", () => {
    expect(format_note_name("%Y-%m-%d", fixed_date)).toBe("2024-12-31");
  });
});
