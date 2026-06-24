import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

// Containment invariant: remote scripts/styles in the live+net tier are only
// acceptable because the iframe runs with `allow-scripts` and WITHOUT
// `allow-same-origin` — so executed code has no access to the app's DOM, IPC, or
// storage. If this ever gains `allow-same-origin`, the sandbox boundary collapses.
describe("html_live_renderer sandbox containment", () => {
  const source = readFileSync(
    new URL(
      "../../../src/lib/features/document/ui/html_live_renderer.svelte",
      import.meta.url,
    ),
    "utf-8",
  );

  test("sandbox is exactly allow-scripts", () => {
    expect(source).toContain('sandbox="allow-scripts"');
  });

  test("never grants allow-same-origin", () => {
    expect(source).not.toContain("allow-same-origin");
  });
});
