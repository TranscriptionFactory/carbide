import { describe, it, expect } from "vitest";
import {
  parse_natural_date,
  format_date,
  generate_date_presets,
} from "$lib/features/editor/domain/parse_natural_date";

describe("format_date", () => {
  it("formats with zero-padded month and day", () => {
    expect(format_date(new Date(2024, 1, 5))).toBe("2024-02-05");
  });

  it("formats december correctly", () => {
    expect(format_date(new Date(2024, 11, 31))).toBe("2024-12-31");
  });
});

describe("parse_natural_date", () => {
  const now = new Date(2024, 0, 15); // Monday Jan 15 2024

  it("returns null for empty string", () => {
    expect(parse_natural_date("", now)).toBeNull();
  });

  it("returns null for gibberish", () => {
    expect(parse_natural_date("xyzzy", now)).toBeNull();
    expect(parse_natural_date("asdfghjkl", now)).toBeNull();
  });

  it("parses 'today'", () => {
    const result = parse_natural_date("today", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Today");
    expect(format_date(result!.date)).toBe("2024-01-15");
  });

  it("parses 'tomorrow'", () => {
    const result = parse_natural_date("tomorrow", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Tomorrow");
    expect(format_date(result!.date)).toBe("2024-01-16");
  });

  it("parses 'yesterday'", () => {
    const result = parse_natural_date("yesterday", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Yesterday");
    expect(format_date(result!.date)).toBe("2024-01-14");
  });

  it("parses 'next monday'", () => {
    const result = parse_natural_date("next monday", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Next Monday");
    expect(format_date(result!.date)).toBe("2024-01-22");
  });

  it("parses 'next sunday'", () => {
    const result = parse_natural_date("next sunday", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Next Sunday");
    expect(format_date(result!.date)).toBe("2024-01-21");
  });

  it("parses 'last friday'", () => {
    const result = parse_natural_date("last friday", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Last Friday");
    expect(format_date(result!.date)).toBe("2024-01-12");
  });

  it("parses 'in 3 days'", () => {
    const result = parse_natural_date("in 3 days", now);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("In 3 days");
    expect(format_date(result!.date)).toBe("2024-01-18");
  });

  it("parses 'in 1 day'", () => {
    const result = parse_natural_date("in 1 day", now);
    expect(result).not.toBeNull();
    expect(format_date(result!.date)).toBe("2024-01-16");
  });

  it("parses 'in 2 weeks'", () => {
    const result = parse_natural_date("in 2 weeks", now);
    expect(result).not.toBeNull();
    expect(format_date(result!.date)).toBe("2024-01-29");
  });

  it("parses 'jan 3'", () => {
    const result = parse_natural_date("jan 3", now);
    expect(result).not.toBeNull();
    expect(format_date(result!.date)).toBe("2024-01-03");
  });

  it("parses 'december 25'", () => {
    const result = parse_natural_date("december 25", now);
    expect(result).not.toBeNull();
    expect(format_date(result!.date)).toBe("2024-12-25");
  });

  it("parses explicit YYYY-MM-DD", () => {
    const result = parse_natural_date("2025-03-14", now);
    expect(result).not.toBeNull();
    expect(format_date(result!.date)).toBe("2025-03-14");
  });

  it("is case insensitive", () => {
    expect(parse_natural_date("TODAY", now)).not.toBeNull();
    expect(parse_natural_date("Next Monday", now)).not.toBeNull();
  });

  it("trims whitespace", () => {
    expect(parse_natural_date("  today  ", now)).not.toBeNull();
  });

  it("returns null for invalid month day", () => {
    expect(parse_natural_date("feb 30", now)).toBeNull();
  });

  it("returns null for 'in 0 days'", () => {
    expect(parse_natural_date("in 0 days", now)).toBeNull();
  });
});

describe("generate_date_presets", () => {
  it("returns today, tomorrow, yesterday, and next weekdays", () => {
    const now = new Date(2024, 0, 15);
    const presets = generate_date_presets(now);
    expect(presets.length).toBe(8); // 3 basic + 5 weekdays
    expect(presets[0]!.label).toBe("Today");
    expect(presets[1]!.label).toBe("Tomorrow");
    expect(presets[2]!.label).toBe("Yesterday");
    expect(presets[3]!.label).toBe("Next Monday");
    expect(presets[7]!.label).toBe("Next Friday");
  });

  it("formats dates correctly", () => {
    const now = new Date(2024, 0, 15);
    const presets = generate_date_presets(now);
    expect(presets[0]!.date_str).toBe("2024-01-15");
    expect(presets[1]!.date_str).toBe("2024-01-16");
    expect(presets[2]!.date_str).toBe("2024-01-14");
  });

  it("handles month boundary", () => {
    const now = new Date(2024, 0, 31);
    const presets = generate_date_presets(now);
    expect(presets[1]!.date_str).toBe("2024-02-01");
  });
});
