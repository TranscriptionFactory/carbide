import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const tauriConfigPath = path.join(
  workspaceRoot,
  "src-tauri",
  "tauri.conf.json",
);
const cargoTomlPath = path.join(workspaceRoot, "src-tauri", "Cargo.toml");
const args = process.argv.slice(2);
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));

if (args[0] === "--print-current") {
  process.stdout.write(`${tauriConfig.version}\n`);
  process.exit(0);
}

const version = args[0];

if (!version) {
  throw new Error("Version argument is required");
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Version must be semver, got: ${version}`);
}

tauriConfig.version = version;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
const updatedCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?^version = )"[^"]+"/m,
  `$1"${version}"`,
);

if (cargoToml === updatedCargoToml) {
  throw new Error("Failed to update Cargo.toml package version");
}

fs.writeFileSync(cargoTomlPath, updatedCargoToml);
