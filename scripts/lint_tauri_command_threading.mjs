import fs from "node:fs";
import path from "node:path";

const project_root = process.cwd();
const rust_source_root = path.join(project_root, "src-tauri/src");

// wry invokes the IPC protocol closure inline on the macOS main thread, and
// tauri-macros compiles a non-`async` command to ExecutionContext::Blocking on
// the dispatching thread. A sync command therefore runs ON the main thread, and
// a single slow read (an iCloud/OneDrive online-only file) freezes the whole app.
//
// Every #[tauri::command] must be `async fn` or carry #[tauri::command(async)],
// unless it is listed here with a justification. Additions need a real reason:
// "it is fast" is not one, because a network filesystem makes anything slow.
const MAIN_THREAD_COMMANDS = new Map([
  [
    "confirm_window_close",
    "takes a WebviewWindow, which is not Send and cannot cross into spawn_blocking",
  ],
  [
    "get_pending_file_open",
    "takes a Mutex<Option<String>> off in-memory state; performs no I/O",
  ],
  [
    "html_live_register",
    "registers HTML in the in-memory LiveHtmlStore; performs no I/O",
  ],
  [
    "html_live_release",
    "releases a token from the in-memory LiveHtmlStore; performs no I/O",
  ],
  [
    "resolve_note_link",
    "pure string/path manipulation on its arguments; touches no filesystem",
  ],
  [
    "resolve_wiki_link",
    "pure string/path manipulation on its arguments; touches no filesystem",
  ],
  [
    "rewrite_note_links",
    "pure in-memory regex rewrite of a markdown string; touches no filesystem",
  ],
  [
    "resolve_home_dir",
    "reads the resolved home directory from Tauri's path resolver; performs no I/O",
  ],
  [
    "trusted_html_parent_folder",
    "trims and slices the supplied path string; resolves no vault root and touches no filesystem",
  ],
  [
    "rag_query_respond",
    "completion callback: takes a Mutex<HashMap>, removes an entry and sends on an unbounded " +
      "channel; no I/O, and staying on the dispatch thread unblocks the waiting MCP thread sooner",
  ],
]);

const command_attribute = /#\[tauri::command(\s*\(\s*async\s*\)\s*)?\]/g;
const fn_signature = /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?(async\s+)?fn\s+(\w+)/;

function collect_rust_files(dir_path, accumulator) {
  for (const entry of fs.readdirSync(dir_path, { withFileTypes: true })) {
    const entry_path = path.join(dir_path, entry.name);
    if (entry.isDirectory()) {
      collect_rust_files(entry_path, accumulator);
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      accumulator.push(entry_path);
    }
  }
  return accumulator;
}

function line_number(content, index) {
  return content.slice(0, index).split("\n").length;
}

function relative_path(file_path) {
  return path.relative(project_root, file_path).split(path.sep).join("/");
}

// Walks forward from a #[tauri::command] attribute past any further attributes
// (#[specta::specta], #[allow(...)], doc comments) to the function it decorates.
function find_decorated_fn(lines, attribute_line_index) {
  for (
    let index = attribute_line_index + 1;
    index < Math.min(attribute_line_index + 12, lines.length);
    index += 1
  ) {
    const line = lines[index];
    const trimmed = line.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("#[") ||
      trimmed.startsWith("//")
    ) {
      continue;
    }
    const match = fn_signature.exec(line);
    return match ? { name: match[2], is_async: Boolean(match[1]) } : null;
  }
  return null;
}

const violations = [];
const seen_commands = new Set();

for (const file_path of collect_rust_files(rust_source_root, [])) {
  const content = fs.readFileSync(file_path, "utf8");
  if (!content.includes("#[tauri::command")) {
    continue;
  }
  const lines = content.split("\n");

  command_attribute.lastIndex = 0;
  let attribute_match;
  while ((attribute_match = command_attribute.exec(content)) !== null) {
    const attribute_is_async = Boolean(attribute_match[1]);
    const attribute_line = line_number(content, attribute_match.index);
    const decorated = find_decorated_fn(lines, attribute_line - 1);

    if (!decorated) {
      violations.push({
        file: relative_path(file_path),
        line: attribute_line,
        message:
          "#[tauri::command] does not decorate a recognisable fn signature; " +
          "the threading gate cannot verify it",
      });
      continue;
    }

    seen_commands.add(decorated.name);
    if (attribute_is_async || decorated.is_async) {
      if (MAIN_THREAD_COMMANDS.has(decorated.name)) {
        violations.push({
          file: relative_path(file_path),
          line: attribute_line,
          message:
            `\`${decorated.name}\` runs off the main thread but is still listed in ` +
            "MAIN_THREAD_COMMANDS; remove the stale allowlist entry",
        });
      }
      continue;
    }

    if (MAIN_THREAD_COMMANDS.has(decorated.name)) {
      continue;
    }

    violations.push({
      file: relative_path(file_path),
      line: attribute_line,
      message:
        `\`${decorated.name}\` is a sync #[tauri::command], so it runs on the macOS main ` +
        "thread and any slow I/O freezes the app; make it `pub async fn` delegating to " +
        '`shared::blocking::blocking("name", move || name_inner(..))`, or add it to ' +
        "MAIN_THREAD_COMMANDS with a justification",
    });
  }
}

for (const command_name of MAIN_THREAD_COMMANDS.keys()) {
  if (!seen_commands.has(command_name)) {
    violations.push({
      file: "scripts/lint_tauri_command_threading.mjs",
      line: 1,
      message:
        `MAIN_THREAD_COMMANDS lists \`${command_name}\`, which is no longer a ` +
        "#[tauri::command]; remove the stale entry",
    });
  }
}

if (violations.length > 0) {
  console.error(
    `Tauri command threading rules failed with ${String(violations.length)} violation(s):`,
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${String(violation.line)} ${violation.message}`,
    );
  }
  process.exit(1);
}

console.log(
  `Tauri command threading rules passed (${String(seen_commands.size)} commands, ` +
    `${String(MAIN_THREAD_COMMANDS.size)} allowlisted).`,
);
