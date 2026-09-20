/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";
import RecentsFileView from "$lib/features/folder/ui/recents_file_view.svelte";
import type { RecentsPeriod } from "$lib/shared/types/editor_settings";

function render(period: RecentsPeriod = "all") {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const on_change_period = vi.fn();
  const app = mount(RecentsFileView, {
    target,
    props: {
      results: [],
      sort: "modified",
      direction: "desc",
      period,
      show_non_markdown: true,
      on_change_sort: vi.fn(),
      on_change_direction: vi.fn(),
      on_change_period,
      on_change_show_non_markdown: vi.fn(),
      on_open_note: vi.fn(),
    },
  });
  flushSync();
  return {
    target,
    on_change_period,
    cleanup: () => {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("recents_file_view — the date range control", () => {
  it("offers All/Today/Week/Month and a calendar button, with no Quarter", () => {
    const { target, cleanup } = render();
    const labels = [...target.querySelectorAll("button")].map((b) =>
      b.textContent?.trim(),
    );

    expect(labels).toContain("All");
    expect(labels).toContain("Today");
    expect(labels).toContain("Week");
    expect(labels).toContain("Month");
    expect(target.textContent).not.toContain("Quarter");
    cleanup();
  });

  async function open_calendar(target: HTMLElement) {
    const trigger = target.querySelector<HTMLButtonElement>(
      'button[title="Custom date range"]',
    );
    expect(trigger?.textContent).toContain("Dates");
    trigger?.click();
    flushSync();
    await Promise.resolve();
    flushSync();
    const days = document.querySelectorAll<HTMLElement>("[data-bits-day]");
    expect(days.length).toBeGreaterThan(20);
    return { trigger, days: [...days] };
  }

  function click_day(days: HTMLElement[], label: number) {
    const day = days.find(
      (d) =>
        d.getAttribute("data-outside-month") === null &&
        d.textContent?.trim() === String(label),
    );
    expect(day).toBeTruthy();
    day?.click();
    flushSync();
    return day?.getAttribute("data-value");
  }

  function days_other_than_today(): [number, number] {
    const today = new Date().getDate();
    return today === 10 ? [15, 14] : today === 15 ? [10, 14] : [10, 15];
  }

  function today_key(): string {
    const now = new Date();
    return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  it("commits the range only once both ends are picked, with the picked end rather than today", async () => {
    const { target, on_change_period, cleanup } = render();
    const { days } = await open_calendar(target);
    const [first, second] = days_other_than_today();

    const start = click_day(days, first);
    expect(on_change_period).not.toHaveBeenCalled();

    const end = click_day(days, second);
    expect(end).not.toBe(today_key());
    expect(on_change_period).toHaveBeenCalledTimes(1);
    expect(on_change_period).toHaveBeenCalledWith(
      `custom:${String(start)}..${String(end)}`,
    );
    cleanup();
  });

  it("commits start..today when the popover closes with only a start picked", async () => {
    const { target, on_change_period, cleanup } = render();
    const { trigger, days } = await open_calendar(target);
    const [first] = days_other_than_today();

    const start = click_day(days, first);
    expect(on_change_period).not.toHaveBeenCalled();

    trigger?.click();
    flushSync();
    await Promise.resolve();
    flushSync();

    expect(on_change_period).toHaveBeenCalledTimes(1);
    expect(on_change_period).toHaveBeenCalledWith(
      `custom:${String(start)}..${today_key()}`,
    );
    cleanup();
  });

  it("shows the stored range on the trigger", () => {
    const { target, cleanup } = render("custom:2026-09-01..2026-09-19");
    const trigger = target.querySelector('button[title="Custom date range"]');

    expect(trigger?.textContent).toContain("Sep 1 – Sep 19");
    expect(trigger?.getAttribute("aria-pressed")).toBe("true");
    cleanup();
  });
});
