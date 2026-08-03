import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// tauri-specta emits a direct `invoke` import, which would leave the ~170
// commands reachable only through the bindings — including the ones that hung on
// a cloud-synced vault — with no timing attribution. Point them at the wrapper
// instead. Timing only; `timed_invoke` rethrows errors exactly as invoke threw
// them, which the bindings' own try/catch depends on.
// Matched by regex, not an exact string: tauri-specta emits tabs and prettier
// later rewrites them to spaces, so this has to survive both shapes.
const generated_import =
  /import\s*\{\s*invoke as TAURI_INVOKE,\s*Channel as TAURI_CHANNEL,?\s*\}\s*from\s*"@tauri-apps\/api\/core";/;

const instrumented_import = `import { Channel as TAURI_CHANNEL } from "@tauri-apps/api/core";
import { timed_invoke as TAURI_INVOKE } from "$lib/shared/adapters/tauri_invoke";`;

const bindings = readFileSync(bindingsPath, "utf8");
if (bindings.includes(instrumented_import)) {
  console.log("Bindings already route through timed_invoke.");
} else if (generated_import.test(bindings)) {
  writeFileSync(
    bindingsPath,
    bindings.replace(generated_import, instrumented_import),
  );
  console.log("Rewrote bindings to invoke through timed_invoke.");
} else {
  console.error(
    "codegen: could not find the generated invoke import in bindings.ts.\n" +
      "tauri-specta's output shape changed — update the rewrite in scripts/codegen.mjs,\n" +
      "otherwise every generated command silently loses slow-command timing.",
  );
  process.exit(1);
}
