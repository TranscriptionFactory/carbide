/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  apply_figure_snapshots,
  snapshot_url,
} from "$lib/features/clip/domain/apply_figure_snapshots";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected element is missing");
  return value;
}

const COMPOSITE = `<figure data-carbide-snapshot="0"><div class="stage"><svg viewBox="0 0 10 10"><path d="M0 0"></path></svg><img src="https://example.com/a.png" alt="a"></div><figcaption>Circuit for 4e:55</figcaption></figure>`;

describe("apply_figure_snapshots", () => {
  it("shows the snapshot with the caption and tucks the original elements into details", () => {
    const doc = parse(
      apply_figure_snapshots(COMPOSITE, new Map([[0, snapshot_url(0)]])),
    );
    const figure = required(doc.querySelector("figure"));
    const children = [...figure.children].map((child) => child.tagName);
    expect(children).toEqual(["IMG", "FIGCAPTION", "DETAILS"]);
    const snapshot = required(figure.querySelector(":scope > img"));
    expect(snapshot.getAttribute("src")).toBe(snapshot_url(0));
    expect(snapshot.getAttribute("alt")).toBe("Circuit for 4e:55");
    const details = required(figure.querySelector("details"));
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe(
      "Figure elements",
    );
    expect(details.querySelector("svg path")).not.toBeNull();
    expect(details.querySelector('img[alt="a"]')).not.toBeNull();
    expect(details.querySelector("figcaption")).toBeNull();
  });

  it("falls back to a generic alt text when the figure has no caption", () => {
    const doc = parse(
      apply_figure_snapshots(
        '<figure data-carbide-snapshot="0"><canvas></canvas></figure>',
        new Map([[0, snapshot_url(0)]]),
      ),
    );
    expect(doc.querySelector("figure > img")?.getAttribute("alt")).toBe(
      "Figure snapshot",
    );
  });

  it("leaves figures without a snapshot intact and strips every marker", () => {
    const html =
      COMPOSITE +
      '<figure data-carbide-snapshot="1"><canvas></canvas><figcaption>No snapshot</figcaption></figure>';
    const doc = parse(
      apply_figure_snapshots(html, new Map([[0, snapshot_url(0)]])),
    );
    const second = required(doc.querySelectorAll("figure")[1]);
    expect(second.querySelector("canvas")).not.toBeNull();
    expect(second.querySelector("details")).toBeNull();
    expect(doc.querySelector("[data-carbide-snapshot]")).toBeNull();
  });

  it("uses reserved, never-resolving urls for snapshot placeholders", () => {
    expect(new URL(snapshot_url(3)).hostname.endsWith(".invalid")).toBe(true);
    expect(snapshot_url(3)).not.toBe(snapshot_url(4));
  });
});
