export function parse_toml_string_array(
  toml: string,
  section: string,
  key: string,
): string[];

export function parse_config(toml: string): {
  allow: string[];
  deny: string[];
};

export function resolve_tags(config: {
  allow: string[];
  deny: string[];
}): string[];

export function split_frontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
  raw_fm: string;
};

export function is_in_heading(line: string): boolean;

export function is_in_code_fence(lines: string[], line_index: number): boolean;

export function apply_tags(body: string, tags: string[]): string;

export function auto_tag(markdown: string, config_toml: string): string;
