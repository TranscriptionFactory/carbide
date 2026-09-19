import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIVE_EMBED_SANDBOX,
  SAFE_EMBED_SANDBOX,
} from "$lib/features/editor/adapters/html_embed_renderer";
import { CODE_PREVIEW_SANDBOX } from "$lib/features/editor/adapters/code_preview";

// Containment invariant for the two in-note HTML surfaces (`![[x.html]]`
// transclusions and ```html fences): `allow-scripts` must never meet
// `allow-same-origin`, and a scripted frame must never be a `srcdoc` frame —
// Live documents are served over `carbide-html:` by `html_live_register`, whose
// header CSP is the single source for the Live policy.
//
// Pre-existing frames outside this lane (`html_viewer.svelte`'s bridged Safe
// preview, `excalidraw_host.svelte`) are not covered here: the tab viewer and
// canvas host own their own envelopes.
const source = (relative: string): string =>
  readFileSync(
    new URL(`../../../src/lib/${relative}`, import.meta.url),
    "utf-8",
  );

const FILE_EMBED_VIEW = source(
  "features/editor/adapters/file_embed_view_plugin.ts",
);
const CODE_BLOCK_VIEW = source(
  "features/editor/adapters/code_block_view_plugin.ts",
);

describe("in-note html frame sandbox", () => {
  test("sandbox constants never combine scripts with same-origin", () => {
    expect(SAFE_EMBED_SANDBOX).toBe("allow-same-origin");
    expect(LIVE_EMBED_SANDBOX).toBe("allow-scripts");
    expect(CODE_PREVIEW_SANDBOX).toBe("allow-scripts");
    for (const sandbox of [
      SAFE_EMBED_SANDBOX,
      LIVE_EMBED_SANDBOX,
      CODE_PREVIEW_SANDBOX,
    ]) {
      expect(sandbox).not.toContain("allow-same-origin allow-scripts");
      expect(sandbox).not.toContain("allow-scripts allow-same-origin");
    }
  });

  test("no surface grants a frame both script and same-origin access", () => {
    for (const file of [FILE_EMBED_VIEW, CODE_BLOCK_VIEW]) {
      expect(file).not.toContain('"allow-scripts allow-same-origin"');
      expect(file).not.toContain('"allow-same-origin allow-scripts"');
    }
  });

  test("embed live frame is the allow-scripts frame and is not a srcdoc frame", () => {
    expect(FILE_EMBED_VIEW).toContain(
      'live_frame.setAttribute("sandbox", LIVE_EMBED_SANDBOX)',
    );
    expect(FILE_EMBED_VIEW).toContain(
      'safe_frame.setAttribute("sandbox", SAFE_EMBED_SANDBOX)',
    );
    expect(FILE_EMBED_VIEW).toContain("state.live_frame.src = url");
    expect(FILE_EMBED_VIEW).not.toContain("live_frame.srcdoc");
  });

  test("fence preview frame loads a registered carbide-html: url, never srcdoc", () => {
    expect(CODE_BLOCK_VIEW).toContain(
      'iframe.setAttribute("sandbox", CODE_PREVIEW_SANDBOX)',
    );
    expect(CODE_BLOCK_VIEW).toContain("state.iframe.src = url");
    expect(CODE_BLOCK_VIEW).not.toContain("iframe.srcdoc");
    expect(CODE_BLOCK_VIEW).not.toContain("allow-same-origin");
  });

  test("both live paths register through html_live_register", () => {
    for (const file of [FILE_EMBED_VIEW, CODE_BLOCK_VIEW]) {
      expect(file).toContain('invoke<string>("html_live_register"');
      expect(file).toContain('"html_live_release"');
    }
  });

  test("srcdoc is only ever written to the safe embed frame", () => {
    const srcdoc_targets = [
      ...FILE_EMBED_VIEW.matchAll(/(\w+)\.srcdoc =/g),
    ].map((match) => match[1] ?? "");
    expect(srcdoc_targets.length).toBeGreaterThan(0);
    for (const target of srcdoc_targets) {
      expect(target).toBe("safe_frame");
    }
  });
});
