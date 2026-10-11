import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// The trust prompt is a promise only TrustedHtmlDialog resolves, so every
// window needs exactly one mounted instance regardless of the active tab: the
// main window via AppShellDialogs, the detached viewer window via ViewerShell
// (`+page.svelte` renders one shell or the other, never both).
const SRC_ROOT = fileURLToPath(new URL("../../../src", import.meta.url));

function svelte_files_mounting_dialog(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf-8" })
    .filter((relative) => relative.endsWith(".svelte"))
    .filter((relative) =>
      readFileSync(join(SRC_ROOT, relative), "utf-8").includes(
        "<TrustedHtmlDialog",
      ),
    )
    .sort();
}

describe("TrustedHtmlDialog mount points", () => {
  it("mounts once per window shell and never inside the document viewer", () => {
    expect(svelte_files_mounting_dialog()).toEqual([
      "lib/app/bootstrap/ui/app_shell_dialogs.svelte",
      "lib/app/bootstrap/ui/viewer_shell.svelte",
    ]);
  });
});
