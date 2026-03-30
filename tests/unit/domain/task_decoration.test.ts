import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parse_task_due_date } from "$lib/features/editor/adapters/task_decoration_plugin";

describe("parse_task_due_date", () => {
  const FIXED_TODAY = "2024-06-15";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TODAY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for text without a due date", () => {
    expect(parse_task_due_date("Buy groceries")).toBeNull();
    expect(parse_task_due_date("[ ] no date here")).toBeNull();
  });

  it("parses @ prefix format", () => {
    const result = parse_task_due_date("task text @2024-06-20");
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2024-06-20");
    expect(result?.format).toBe("@");
    expect(result?.overdue).toBe(false);
    expect(result?.today).toBe(false);
  });

  it("parses due: prefix format", () => {
    const result = parse_task_due_date("task text due: 2024-06-20");
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2024-06-20");
    expect(result?.format).toBe("due:");
  });

  it("parses calendar emoji format", () => {
    const result = parse_task_due_date("task text \u{1F4C5} 2024-06-20");
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2024-06-20");
  });

  it("marks today correctly", () => {
    const result = parse_task_due_date(`task @${FIXED_TODAY}`);
    expect(result?.today).toBe(true);
    expect(result?.overdue).toBe(false);
  });

  it("marks past dates as overdue", () => {
    const result = parse_task_due_date("task @2024-01-01");
    expect(result?.overdue).toBe(true);
    expect(result?.today).toBe(false);
  });

  it("marks future dates as not overdue", () => {
    const result = parse_task_due_date("task @2025-12-31");
    expect(result?.overdue).toBe(false);
    expect(result?.today).toBe(false);
  });

  it("picks first matching pattern when multiple formats present", () => {
    const result = parse_task_due_date("task \u{1F4C5} 2024-06-20 @2024-07-01");
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2024-06-20");
  });
});
