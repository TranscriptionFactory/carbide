/** Core auto-tag logic: TOML parsing, tag detection, and text replacement. */

export function parse_toml_string_array(toml, section, key) {
  const section_re = new RegExp(`^\\[${section}\\]`, "m");
  const section_match = section_re.exec(toml);
  if (!section_match) return [];

  const after_section = toml.slice(
    section_match.index + section_match[0].length,
  );
  const next_section = after_section.search(/^\[/m);
  const block =
    next_section === -1 ? after_section : after_section.slice(0, next_section);

  const key_re = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)]`, "ms");
  const key_match = key_re.exec(block);
  if (!key_match) return [];

  const raw = key_match[1];
  const items = [];
  const str_re = /"([^"]*)"|'([^']*)'/g;
  let m;
  while ((m = str_re.exec(raw)) !== null) {
    items.push(m[1] ?? m[2]);
  }
  return items;
}

export function parse_config(toml) {
  const allow = parse_toml_string_array(toml, "allow", "tags");
  const deny = parse_toml_string_array(toml, "deny", "tags");
  return { allow, deny };
}

export function resolve_tags(config) {
  const deny_set = new Set(config.deny.map((t) => t.toLowerCase()));
  return config.allow
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0 && !deny_set.has(t));
}

export function split_frontmatter(markdown) {
  const fm_re = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = fm_re.exec(markdown);
  if (!match) return { frontmatter: null, body: markdown, raw_fm: "" };
  return {
    frontmatter: match[1],
    body: markdown.slice(match[0].length),
    raw_fm: match[0],
  };
}

export function is_in_heading(line) {
  return /^\s*#{1,6}\s/.test(line);
}

export function is_in_code_fence(lines, line_index) {
  let in_fence = false;
  for (let i = 0; i < line_index; i++) {
    if (/^```/.test(lines[i].trimStart())) in_fence = !in_fence;
  }
  return in_fence;
}

export function apply_tags(body, tags) {
  if (tags.length === 0) return body;

  const escaped = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?<=^|\\s)(?!#)(${escaped.join("|")})(?=\\s|$|[.,;:!?)])`,
    "gim",
  );

  const lines = body.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (is_in_heading(line) || is_in_code_fence(lines, i)) {
      result.push(line);
      continue;
    }
    result.push(line.replace(pattern, "#$1"));
  }

  return result.join("\n");
}

export function auto_tag(markdown, config_toml) {
  const config = parse_config(config_toml);
  const tags = resolve_tags(config);
  if (tags.length === 0) return markdown;

  const { body, raw_fm } = split_frontmatter(markdown);
  const new_body = apply_tags(body, tags);
  return raw_fm + new_body;
}
