/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";
import RecentsFileView from "$lib/features/folder/ui/recents_file_view.svelte";
import type { RecentsPeriod } from "$lib/shared/types/editor_settings";

type Props = Parameters<typeof RecentsFileView>[1]["props"];

function render(props: Partial<Props> = {}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const on_change_period = vi.fn();
  const app = mount(RecentsFileView, {
    target,
    props: {
      results: [],
      sort: "modified",
      direction: "desc",
      period: "all",
      show_non_markdown: true,
      on_change_sort: vi.fn(),
      on_change_direction: vi.fn(),
      on_change_period,
      on_change_show_non_markdown: vi.fn(),
      on_open_note: vi.fn(),
      ...props,
    } as Props,
  });
  flushSync();
  return {
    target,
    on_change_period,
    cleanup() {
      unmount(app);
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
    expect(labels).not.toContain("Quarter");
    expect(target.textContent).not.toContain("Quarter");
    cleanup();
  });

  it("opens a range calendar popover and dispatches the picked range", async () => {
    const { target, on_change_period, cleanup } = render();
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

    const day = [...days].find(
      (d) =>
        d.getAttribute("data-outside-month") === null &&
        d.textContent?.trim() === "10",
    );
    expect(day).toBeTruthy();
    day?.click();
    flushSync();

    expect(on_change_period).toHaveBeenCalledTimes(1);
    const period = on_change_period.mock.calls[0]?.[0] as RecentsPeriod;
    expect(period.startsWith("custom:")).toBe(true);
    expect(period).toMatch(/^custom:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/);
    cleanup();
  });

  it("shows the stored range on the trigger", () => {
    const { target, cleanup } = render({
      period: "custom:2026-09-01..2026-09-19",
    });
    const trigger = target.querySelector('button[title="Custom date range"]');

    expect(trigger?.textContent).toContain("Sep 1 – Sep 19");
    expect(trigger?.getAttribute("aria-pressed")).toBe("true");
    cleanup();
  });
});
