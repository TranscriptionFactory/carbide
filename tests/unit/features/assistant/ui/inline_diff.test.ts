/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import InlineDiff from "$lib/features/assistant/ui/inline_diff.svelte";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_diff(props: {
  path?: string;
  old_text: string | null;
  new_text: string;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(InlineDiff, {
    target,
    props: {
      path: props.path ?? "notes/example.md",
      old_text: props.old_text,
      new_text: props.new_text,
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function rows(target: HTMLElement): HTMLElement[] {
  return [
    ...target.querySelectorAll<HTMLElement>("[data-testid='inline-diff-row']"),
  ];
}

function rows_of_kind(target: HTMLElement, kind: string): HTMLElement[] {
  return rows(target).filter((row) => row.dataset.kind === kind);
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("InlineDiff", () => {
  it("shows the path in a truncating header", () => {
    const target = render_diff({ old_text: null, new_text: "hello" });
    const header = target.querySelector("[data-testid='inline-diff-path']");

    expect(header?.textContent?.trim()).toBe("notes/example.md");
    expect(header?.className).toContain("truncate");
  });

  it("renders a new file as add rows with a plus gutter", () => {
    const target = render_diff({ old_text: null, new_text: "one\ntwo" });
    const added = rows_of_kind(target, "add");

    expect(added).toHaveLength(2);
    expect(added[0]?.textContent).toBe("+one");
    expect(added[1]?.textContent).toBe("+two");
    expect(added[0]?.className).toContain("text-chart-2");
  });

  it("gutters and colours deleted and context rows", () => {
    const target = render_diff({
      old_text: "keep\ndrop me\ntail",
      new_text: "keep\ntail",
    });

    const deleted = rows_of_kind(target, "del");
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.textContent).toBe("-drop me");
    expect(deleted[0]?.className).toContain("text-destructive");

    const context = rows_of_kind(target, "ctx");
    expect(context).toHaveLength(2);
    expect(context[0]?.textContent).toBe(" keep");
    expect(context[0]?.className).toContain("text-muted-foreground");
  });

  it("preserves leading whitespace in row text", () => {
    const target = render_diff({ old_text: null, new_text: "    indented" });
    const [row] = rows(target);

    expect(row?.textContent).toBe("+    indented");
    expect(row?.className).toContain("whitespace-pre");
  });

  it("renders a collapsed run as a centred gap marker", () => {
    const unchanged = Array.from(
      { length: 12 },
      (_, index) => `same${String(index)}`,
    ).join("\n");
    const target = render_diff({
      old_text: unchanged,
      new_text: unchanged,
    });

    const gaps = rows_of_kind(target, "gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.textContent?.trim()).toBe("⋯ 12 unchanged lines");
    expect(gaps[0]?.className).toContain("text-center");
  });

  it("renders an oversized diff as a single italic bail row", () => {
    const huge = Array.from(
      { length: 2001 },
      (_, index) => `line${String(index)}`,
    ).join("\n");
    const target = render_diff({ old_text: "small", new_text: huge });

    expect(rows(target)).toHaveLength(1);
    const [row] = rows_of_kind(target, "bail");
    expect(row?.textContent).toContain("2001");
    expect(row?.className).toContain("italic");
  });
});
