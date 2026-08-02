// I5 mechanical check: every call to the two note/document direct-write
// primitives outside the proposal apply path must be marked with a
// `// ALLOWED_DIRECT_APPLY: <reason>` comment on the line immediately above
// it. A new, unmarked call site fails the check; so does removing a marker
// without removing its call.
//
// This grep is deliberately partial. It can only see writers that call
// `apply_ai_output`/`apply_document_ai_output` by name — it CANNOT see the
// ProseMirror inline menu's live-insert preview, which writes via a raw
// `view.dispatch(tr)` transaction and never calls either function (that is
// exactly the shape of check that let W0's I1 grep pass while I1's substance
// did not: a grep over callers of a function is blind to a writer that never
// calls it). That third exception — the live-insert path in
// `ai_actions.ts`'s inline streaming loop — is documented in place with its
// own ALLOWED_DIRECT_APPLY comment and is verified separately, at runtime,
// by asserting exactly one checkpoint per accept and zero while streaming
// (see tests/unit/actions/register_ai_actions.test.ts, "I5" describe block).
//
// Usage: node scripts/check_i5_direct_apply.mjs

import fs from "node:fs";
import path from "node:path";

const project_root = process.cwd();
const src_root = path.join(project_root, "src/lib");

const WRITE_CALLS = [/\bapply_ai_output\(/, /\bapply_document_ai_output\(/];

// Definitions/type declarations of the two primitives themselves are not
// call sites — exclude the files that own them.
const DEFINITION_FILES = new Set([
  "features/editor/application/editor_service.ts",
  "features/document/application/document_service.ts",
]);

// The plugin host RPC surface is a distinct capability, not one of the
// AI-edit surfaces I5 is about: apply_ai_output there is a third-party
// plugin applying its OWN generated output on its own behalf, reached
// through context.services, never through the inline menu or the AI panel.
// Out of this check's scope entirely, not an ALLOWED_DIRECT_APPLY exception.
const OUT_OF_SCOPE_DIRS = ["features/plugin/"];

// How many lines above a call site to look for the marker — wide enough to
// cover a multi-line justification comment block immediately preceding a
// multi-line function call.
const MARKER_LOOKBACK = 10;

const MARKER = /ALLOWED_DIRECT_APPLY/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|svelte)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
const allowed = [];

for (const file of walk(src_root)) {
  const rel = path.relative(src_root, file);
  if (DEFINITION_FILES.has(rel)) continue;
  if (OUT_OF_SCOPE_DIRS.some((dir) => rel.startsWith(dir))) continue;

  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!WRITE_CALLS.some((pattern) => pattern.test(line))) return;

    const window = lines.slice(Math.max(0, index - MARKER_LOOKBACK), index + 1);
    const marked = window.some((candidate) => MARKER.test(candidate));
    const entry = { file: rel, line: index + 1, text: line.trim() };
    if (marked) {
      allowed.push(entry);
    } else {
      violations.push(entry);
    }
  });
}

if (violations.length > 0) {
  console.error(
    "I5 violation: direct note/document write with no ALLOWED_DIRECT_APPLY marker:\n",
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(
    "\nEvery AI note-mutation must flow through the proposal store behind a " +
      "checkpoint (I5). If this call site is a deliberate, justified " +
      "exception, add a `// ALLOWED_DIRECT_APPLY: <reason>` comment above it " +
      "and name the exception in the same commit.",
  );
  process.exit(1);
}

console.log("I5 direct-apply check: OK — every direct write is named.\n");
console.log("Allowed exceptions (grep-visible):");
for (const a of allowed) {
  console.log(`  ${a.file}:${a.line}`);
}
console.log(
  "\nNot grep-visible, verified at runtime instead: the ProseMirror inline " +
    "menu's live-insert preview (raw transaction, ai_actions.ts's inline " +
    "streaming loop) — see the checkpoint-count assertions in " +
    "register_ai_actions.test.ts.",
);
