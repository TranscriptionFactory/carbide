import fs from "node:fs";
import { describe, expect, it } from "vitest";

// `scripts/sync-versions.mjs` fans package.json's version out to the Tauri
// config, both crate manifests and both Cargo.lock entries. Its lockfile
// rewrite was once anchored on `name = "carbide"` alone, so carbide-cli's
// entry silently froze while its manifest advanced — two releases of drift,
// visible only as a Cargo.lock that cargo re-dirtied in every worktree.
//
// These read the committed files rather than the script, because the invariant
// is about the repo's state: whatever the release does, the app version must
// appear in all five places.

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  version: string;
};
const lock = fs.readFileSync("src-tauri/Cargo.lock", "utf8");

function manifest_version(path: string): string | undefined {
  return fs.readFileSync(path, "utf8").match(/^version\s*=\s*"([^"]*)"/m)?.[1];
}

function lock_version(crate: string): string | undefined {
  return lock.match(
    new RegExp(String.raw`^name = "${crate}"\nversion = "([^"]*)"`, "m"),
  )?.[1];
}

describe("workspace versions stay in sync with package.json", () => {
  it("package.json carries a concrete semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("tauri.conf.json matches", () => {
    const conf = JSON.parse(
      fs.readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as { version: string };
    expect(conf.version).toBe(pkg.version);
  });

  // 2 manifests + 2 lock entries = 4 cases; each.() rows are counted by the
  // runner, not by grepping for `it(`.
  it.each(["src-tauri/Cargo.toml", "src-tauri/crates/carbide-cli/Cargo.toml"])(
    "%s matches",
    (path) => {
      expect(manifest_version(path)).toBe(pkg.version);
    },
  );

  it.each(["carbide", "carbide-cli"])(
    "Cargo.lock pins %s at the app version",
    (crate) => {
      expect(lock_version(crate)).toBe(pkg.version);
    },
  );
});
