import fs from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Guard: ensure the version hasn't already been released on GitHub
try {
  const tags = execSync("git tag -l 'v*'", { encoding: "utf8" })
    .trim()
    .split("\n");
  if (tags.includes(`v${pkg.version}`)) {
    console.error(
      `\n❌ Version ${pkg.version} already has a git tag (v${pkg.version}).` +
        `\n   This usually means a release was published outside the changeset flow.` +
        `\n   Bump the version in package.json to the next unreleased version before running changeset.\n`,
    );
    process.exit(1);
  }
} catch {
  // git not available — skip check (e.g. CI version sync from tag)
}

const tauriConf = JSON.parse(
  fs.readFileSync("src-tauri/tauri.conf.json", "utf8"),
);
tauriConf.version = pkg.version;
fs.writeFileSync(
  "src-tauri/tauri.conf.json",
  JSON.stringify(tauriConf, null, 2),
);

const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
fs.writeFileSync(
  "src-tauri/Cargo.toml",
  cargoToml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${pkg.version}"`),
);

const cliCargoToml = fs.readFileSync(
  "src-tauri/crates/carbide-cli/Cargo.toml",
  "utf8",
);
fs.writeFileSync(
  "src-tauri/crates/carbide-cli/Cargo.toml",
  cliCargoToml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${pkg.version}"`),
);

// Both workspace crates carry the app version and Cargo.lock lists them as
// separate packages, so the rewrite has to reach both. Anchored on `carbide`
// alone it left carbide-cli two releases behind, and cargo regenerated the line
// on sight — which is what made every worktree open on a dirty tree.
const cargoLock = fs.readFileSync("src-tauri/Cargo.lock", "utf8");
fs.writeFileSync(
  "src-tauri/Cargo.lock",
  cargoLock.replace(
    /^(name = "carbide(?:-cli)?"\nversion = )"[^"]*"/gm,
    `$1"${pkg.version}"`,
  ),
);
