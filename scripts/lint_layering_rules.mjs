import fs from "node:fs";
import path from "node:path";

const project_root = process.cwd();
const tests_root = path.join(project_root, "tests");

const source_extensions = new Set([".ts", ".js", ".mjs", ".cjs", ".svelte"]);
const feature_root = path.join(project_root, "src/lib/features");

const layering_roots = {
  components: path.join(project_root, "src/lib/components"),
  reactors: path.join(project_root, "src/lib/reactors"),
  features: feature_root,
  app: path.join(project_root, "src/lib/app"),
  routes: path.join(project_root, "src/routes"),
};

const internal_roots = {
  adapters: path.join(project_root, "src/lib/shared/adapters"),
  reactors: path.join(project_root, "src/lib/reactors"),
  components: path.join(project_root, "src/lib/components"),
  utils: path.join(project_root, "src/lib/shared/utils"),
  types: path.join(project_root, "src/lib/shared/types"),
};

const layer_rules = [
  {
    layer: "components",
    disallow_import_categories: new Set([
      "ports",
      "adapters",
      "services",
      "reactors",
    ]),
    disallow_patterns: [
      {
        regex: /\bxstate\b/g,
        message: "components must not depend on xstate",
      },
    ],
  },
  {
    layer: "stores",
    disallow_import_categories: new Set([
      "ports",
      "adapters",
      "services",
      "reactors",
      "actions",
      "components",
      "domain",
    ]),
    disallow_patterns: [
      {
        regex: /\bawait\b/g,
        message: "stores must stay synchronous (await found)",
      },
      {
        regex: /\basync\b/g,
        message: "stores must stay synchronous (async found)",
      },
    ],
  },
  {
    layer: "services",
    disallow_import_categories: new Set(["adapters", "components", "reactors"]),
    disallow_patterns: [
      {
        regex: /\$effect\b/g,
        message:
          "services must not subscribe to reactive effects; use reactors",
      },
      {
        regex: /ui_store\.svelte/g,
        message:
          "services must not import UIStore; orchestrate UI in actions/components",
      },
    ],
  },
  {
    layer: "reactors",
    disallow_import_categories: new Set(["adapters", "components"]),
    disallow_patterns: [
      {
        regex: /\bawait\b/g,
        message:
          "reactors should trigger services; avoid inline async control-flow",
      },
    ],
  },
  {
    layer: "actions",
    disallow_import_categories: new Set(["ports", "adapters", "components"]),
    disallow_patterns: [],
  },
  {
    layer: "routes",
    disallow_import_categories: new Set([
      "ports",
      "services",
      "stores",
      "reactors",
      "actions",
    ]),
    disallow_patterns: [
      {
        regex: /\bsetContext\(/g,
        message: "routes should use app context helpers, not raw setContext",
      },
    ],
  },
];

function list_source_files(dir_path) {
  const files = [];
  if (!fs.existsSync(dir_path)) return files;

  for (const entry of fs.readdirSync(dir_path, { withFileTypes: true })) {
    const full_path = path.join(dir_path, entry.name);
    if (entry.isDirectory()) {
      files.push(...list_source_files(full_path));
      continue;
    }

    const extension = path.extname(entry.name);
    if (!source_extensions.has(extension)) continue;
    files.push(full_path);
  }

  return files;
}

function resolve_internal_import(file_path, import_path) {
  if (import_path.startsWith("$lib/")) {
    return path.resolve(
      project_root,
      "src/lib",
      import_path.slice("$lib/".length),
    );
  }

  if (import_path.startsWith("./") || import_path.startsWith("../")) {
    return path.resolve(path.dirname(file_path), import_path);
  }

  return null;
}

function path_in_dir(candidate, dir_path) {
  return (
    candidate === dir_path || candidate.startsWith(`${dir_path}${path.sep}`)
  );
}

function categorize_import(file_path, import_path) {
  const resolved = resolve_internal_import(file_path, import_path);
  if (!resolved) return null;

  if (path_in_dir(resolved, feature_root)) {
    if (resolved.includes(`${path.sep}domain${path.sep}`)) {
      return "domain";
    }
    const base_name = path.basename(resolved);
    if (base_name === "ports.ts") {
      return "ports";
    }
    if (/_store\.svelte\.ts$/.test(base_name)) {
      return "stores";
    }
    if (/_service\.ts$/.test(base_name)) {
      return "services";
    }
    if (
      /_actions\.ts$/.test(base_name) ||
      base_name === "action_ids.ts" ||
      base_name === "action_registry.ts" ||
      base_name === "register_actions.ts" ||
      base_name === "action_registration_input.ts"
    ) {
      return "actions";
    }
  }

  for (const [category, root_path] of Object.entries(internal_roots)) {
    if (path_in_dir(resolved, root_path)) return category;
  }

  return null;
}

function line_number(content, index) {
  return content.slice(0, index).split("\n").length;
}

function extract_imports(content) {
  const imports = [];

  const from_import_regex = /^\s*import[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm;
  let from_match = from_import_regex.exec(content);
  while (from_match) {
    imports.push({ module: from_match[1], index: from_match.index });
    from_match = from_import_regex.exec(content);
  }

  const side_effect_import_regex = /^\s*import\s+['"]([^'"]+)['"]/gm;
  let side_effect_match = side_effect_import_regex.exec(content);
  while (side_effect_match) {
    imports.push({
      module: side_effect_match[1],
      index: side_effect_match.index,
    });
    side_effect_match = side_effect_import_regex.exec(content);
  }

  return imports;
}

function relative_path(file_path) {
  return path.relative(project_root, file_path).split(path.sep).join("/");
}

function feature_name_from_file(file_path) {
  if (!path_in_dir(file_path, feature_root)) {
    return null;
  }

  const relative = path.relative(feature_root, file_path);
  const [feature_name] = relative.split(path.sep);
  return feature_name || null;
}

function files_for_layer(layer) {
  if (layer === "stores") {
    return list_source_files(layering_roots.features).filter((file_path) =>
      /_store\.svelte\.ts$/.test(file_path),
    );
  }

  if (layer === "services") {
    return list_source_files(layering_roots.features).filter((file_path) =>
      /_service\.ts$/.test(file_path),
    );
  }

  if (layer === "actions") {
    return list_source_files(layering_roots.features).filter((file_path) => {
      const base_name = path.basename(file_path);
      return (
        /_actions\.ts$/.test(base_name) ||
        base_name === "action_ids.ts" ||
        base_name === "action_registry.ts" ||
        base_name === "register_actions.ts" ||
        base_name === "action_registration_input.ts"
      );
    });
  }

  return list_source_files(layering_roots[layer]);
}

const violations = [];

// ---- Theme contract (ADR 0001): themes are token-only [data-theme] blocks ----

const theme_selector_regex =
  /^(html)?\[data-theme(="[a-z0-9-]+")?\](\[data-color-scheme(="[a-z]+")?\])?$/;

const theme_component_selector_patterns = [
  /\.ActivityBar/,
  /\.TabBar/,
  /\.StatusBar/,
  /\.SidebarPanel/,
  /\.WorkspaceLayout/,
  /\.NoteEditor/,
  /\.ContextRail/,
  /\[data-slot=/,
  /\[data-pane/,
];

function strip_css_comments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function find_block_end(content, open_brace_index) {
  let depth = 0;
  for (let i = open_brace_index; i < content.length; i++) {
    if (content[i] === "{") depth += 1;
    else if (content[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return content.length - 1;
}

function lint_theme_block(file_path, content, selector, body_start, body_end) {
  const trimmed_selector = selector.trim().replace(/\s+/g, " ");
  if (!theme_selector_regex.test(trimmed_selector)) {
    violations.push({
      file: relative_path(file_path),
      line: line_number(content, body_start),
      message:
        `theme contract: selector "${trimmed_selector}" is not a pure ` +
        "[data-theme][data-color-scheme] block (no descendants, classes, or elements)",
    });
    return;
  }

  const body = content.slice(body_start + 1, body_end);
  const declaration_regex = /([^;{}]+?):([^;{}]*);|[^;{}]*\{/g;
  let decl_match = declaration_regex.exec(body);
  while (decl_match) {
    const absolute_index = body_start + 1 + decl_match.index;
    if (decl_match[0].endsWith("{")) {
      violations.push({
        file: relative_path(file_path),
        line: line_number(content, absolute_index),
        message:
          "theme contract: nested rule inside a [data-theme] block; " +
          "theme blocks may only declare --* custom properties",
      });
    } else {
      const property = decl_match[1].trim();
      if (!/^--[\w-]+$/.test(property)) {
        violations.push({
          file: relative_path(file_path),
          line: line_number(content, absolute_index),
          message:
            `theme contract: declaration "${property}" is not a --* custom property; ` +
            "themes may only recolor via tokens",
        });
      }
    }
    decl_match = declaration_regex.exec(body);
  }
}

function lint_theme_file(file_path) {
  const raw = fs.readFileSync(file_path, "utf8");
  const content = strip_css_comments(raw);

  const important_regex = /!important/g;
  let important_match = important_regex.exec(content);
  while (important_match) {
    violations.push({
      file: relative_path(file_path),
      line: line_number(content, important_match.index),
      message: "theme contract: !important is forbidden in theme CSS",
    });
    important_match = important_regex.exec(content);
  }

  let cursor = 0;
  while (cursor < content.length) {
    const open_brace = content.indexOf("{", cursor);
    if (open_brace === -1) break;
    const selector_start = Math.max(
      content.lastIndexOf("}", open_brace),
      content.lastIndexOf(";", open_brace),
    );
    const selector = content.slice(selector_start + 1, open_brace);
    const block_end = find_block_end(content, open_brace);

    if (selector.trim().startsWith("@layer")) {
      // descend into @layer theme wrappers; treat contents as top level
      cursor = open_brace + 1;
      continue;
    }

    if (selector.includes("[data-theme")) {
      lint_theme_block(file_path, content, selector, open_brace, block_end);
    } else {
      for (const pattern of theme_component_selector_patterns) {
        if (pattern.test(selector)) {
          violations.push({
            file: relative_path(file_path),
            line: line_number(content, open_brace),
            message:
              `theme contract: component selector "${selector.trim()}" in theme CSS; ` +
              "component styling belongs to the components layer",
          });
          break;
        }
      }
    }
    cursor = block_end + 1;
  }
}

const themes_css_path = path.join(project_root, "src/styles/themes.css");
if (fs.existsSync(themes_css_path)) {
  lint_theme_file(themes_css_path);
}

// Post-cull, per-theme CSS files are retired outright: a theme is a token
// block in themes.css, never a stylesheet of its own.
const styles_dir = path.join(project_root, "src/styles");
if (fs.existsSync(styles_dir)) {
  for (const entry of fs.readdirSync(styles_dir)) {
    if (/^theme-.*\.css$/.test(entry)) {
      violations.push({
        file: `src/styles/${entry}`,
        line: 1,
        message:
          "theme contract: theme-*.css files are retired; express themes as " +
          "token-only [data-theme] blocks in themes.css (layout CSS belongs " +
          "to the components layer)",
      });
    }
  }
}

for (const rule of layer_rules) {
  const files = files_for_layer(rule.layer);

  for (const file_path of files) {
    const content = fs.readFileSync(file_path, "utf8");
    const imports = extract_imports(content);

    for (const current_import of imports) {
      const category = categorize_import(file_path, current_import.module);
      if (category && rule.disallow_import_categories.has(category)) {
        violations.push({
          file: relative_path(file_path),
          line: line_number(content, current_import.index),
          message: `${rule.layer} cannot import ${category} (${current_import.module})`,
        });
      }
    }

    for (const pattern of rule.disallow_patterns) {
      let match = pattern.regex.exec(content);
      while (match) {
        violations.push({
          file: relative_path(file_path),
          line: line_number(content, match.index),
          message: `${rule.layer}: ${pattern.message}`,
        });
        match = pattern.regex.exec(content);
      }
      pattern.regex.lastIndex = 0;
    }
  }
}

const import_policy_roots = [
  path.join(project_root, "src/lib"),
  path.join(project_root, "src/routes"),
];
const import_policy_files = import_policy_roots.flatMap((dir_path) =>
  list_source_files(dir_path),
);

for (const file_path of import_policy_files) {
  const source_feature_name = feature_name_from_file(file_path);
  const content = fs.readFileSync(file_path, "utf8");
  const imports = extract_imports(content);

  for (const current_import of imports) {
    const resolved_import_path = resolve_internal_import(
      file_path,
      current_import.module,
    );
    if (resolved_import_path && path_in_dir(resolved_import_path, tests_root)) {
      violations.push({
        file: relative_path(file_path),
        line: line_number(content, current_import.index),
        message:
          `app code must not import test infrastructure (${current_import.module}); ` +
          "move shared runtime code into `src/lib` and keep test-only helpers in `tests/`",
      });
      continue;
    }

    const deep_feature_match = /^\$lib\/features\/([^/]+)\/.+/.exec(
      current_import.module,
    );
    if (!deep_feature_match) {
      continue;
    }

    const target_feature_name = deep_feature_match[1];
    if (source_feature_name && source_feature_name === target_feature_name) {
      continue;
    }

    violations.push({
      file: relative_path(file_path),
      line: line_number(content, current_import.index),
      message:
        `cross-feature deep import is not allowed (${current_import.module}); ` +
        "import through feature entrypoints (`$lib/features/<feature>`) outside the owning feature",
    });
  }
}

if (violations.length > 0) {
  console.error(
    `Layering rules failed with ${String(violations.length)} violation(s):`,
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${String(violation.line)} ${violation.message}`,
    );
  }
  process.exit(1);
}

console.log("Layering rules passed.");
