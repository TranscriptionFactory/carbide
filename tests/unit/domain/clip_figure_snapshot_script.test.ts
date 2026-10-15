/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SCRIPT = readFileSync(
  "src-tauri/src/features/clip/figure_snapshot.js",
  "utf8",
);

type SnapshotApi = {
  detect(): number;
  prepare(index: number): {
    ready: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    viewport_width: number;
    viewport_height: number;
  } | null;
};

function api(): SnapshotApi {
  return (window as unknown as { __carbide_snapshot: SnapshotApi })
    .__carbide_snapshot;
}

function load(body: string, css = ""): void {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = body;
  window.eval(SCRIPT);
}

// jsdom has no layout: every element reports its size from data-w/data-h
// (default 100x100) at data-x/data-y.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const num = (name: string, fallback: number) =>
      Number(this.getAttribute(name) ?? fallback);
    const x = num("data-x", 0);
    const y = num("data-y", 0);
    const width = num("data-w", 100);
    const height = num("data-h", 100);
    return {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    } as DOMRect;
  };
  Element.prototype.scrollIntoView = () => undefined;
});

const marked = () =>
  [...document.querySelectorAll("figure[data-carbide-snapshot]")].map(
    (figure) => figure.id,
  );

describe("figure snapshot script: detect", () => {
  it("marks figures whose layout depends on positioning, canvas, or css backgrounds", () => {
    load(
      `<figure id="overlay"><svg></svg><img class="pin" src="a.png"></figure>
       <figure id="chart"><canvas></canvas></figure>
       <figure id="sprite"><div class="bg"></div></figure>
       <figure id="plain"><img src="b.png"><figcaption>Plain</figcaption></figure>`,
      ".pin { position: absolute } .bg { background-image: url(sprite.png) }",
    );
    expect(api().detect()).toBe(3);
    expect(marked()).toEqual(["overlay", "chart", "sprite"]);
  });

  it("numbers marked figures in document order", () => {
    load(
      `<figure id="a"><canvas></canvas></figure><figure id="b"><canvas></canvas></figure>`,
    );
    api().detect();
    const indexes = [
      ...document.querySelectorAll("figure[data-carbide-snapshot]"),
    ].map((figure) => figure.getAttribute("data-carbide-snapshot"));
    expect(indexes).toEqual(["0", "1"]);
  });

  it("ignores screen-reader-only and invisible positioned elements", () => {
    load(
      `<figure id="sr"><img src="a.png"><span class="sr-only" data-w="1" data-h="1">label</span></figure>
       <figure id="hidden-tip"><img src="a.png"><span class="tip">tip</span></figure>`,
      ".sr-only { position: absolute } .tip { position: absolute; visibility: hidden }",
    );
    expect(api().detect()).toBe(0);
  });

  it("skips hidden figures and figures nested in other figures", () => {
    load(
      `<figure id="hidden" style="display: none"><canvas></canvas></figure>
       <figure id="outer"><figure id="inner"><canvas></canvas></figure></figure>`,
    );
    api().detect();
    expect(marked()).toEqual(["outer"]);
  });
});

describe("figure snapshot script: prepare", () => {
  it("returns the figure's content box without its caption", () => {
    load(
      `<figure id="f"><div class="stage" data-x="10" data-y="20" data-w="300" data-h="200"><canvas data-x="10" data-y="20" data-w="300" data-h="200"></canvas></div><figcaption data-x="10" data-y="230" data-w="300" data-h="40">Caption</figcaption></figure>`,
    );
    api().detect();
    expect(api().prepare(0)).toMatchObject({
      ready: true,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
  });

  it("reports not-ready while images are still loading", () => {
    load(`<figure><canvas></canvas><img src="slow.png"></figure>`);
    api().detect();
    for (const img of document.querySelectorAll("img")) {
      Object.defineProperty(img, "complete", { value: false });
    }
    expect(api().prepare(0)?.ready).toBe(false);
  });

  it("returns null for an unknown index", () => {
    load(`<figure><canvas></canvas></figure>`);
    api().detect();
    expect(api().prepare(5)).toBeNull();
  });
});
