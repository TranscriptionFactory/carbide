import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bindingsPath = resolve(__dirname, "../src/lib/generated/bindings.ts");

if (process.env.CI) {
  console.log("Skipping codegen on CI");
  process.exit(0);
}

if (existsSync(bindingsPath) && process.platform === "win32") {
  console.log("Skipping codegen on Windows (bindings already exist)");
  process.exit(0);
}

execSync(
  "cd src-tauri && cargo test specta_export::export_bindings -- --nocapture",
  {
    stdio: "inherit",
    shell: true,
  },
);
