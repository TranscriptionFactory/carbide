import { parse_frontmatter } from "$lib/shared/domain/frontmatter_parser";
import type { TypeDefinition } from "../ports";

function read_scalar(yaml: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \t]*${escaped}[ \t]*:[ \t]*(.*)$`, "m");
  const match = re.exec(yaml);
  const captured = match?.[1];
  if (captured === undefined) return undefined;
  const raw = captured.trim().replace(/^["']|["']$/g, "");
  return raw.length > 0 ? raw : undefined;
}

function to_boolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "no") return false;
  return undefined;
}

function to_number(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assign_defined<T, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

export function parse_type_definition(
  name: string,
  path: string,
  markdown: string,
): TypeDefinition {
  const { yaml } = parse_frontmatter(markdown);
  const definition: TypeDefinition = { name, path };
  assign_defined(definition, "icon", read_scalar(yaml, "icon"));
  assign_defined(definition, "color", read_scalar(yaml, "color"));
  assign_defined(definition, "order", to_number(read_scalar(yaml, "order")));
  assign_defined(definition, "label", read_scalar(yaml, "label"));
  assign_defined(
    definition,
    "visible",
    to_boolean(read_scalar(yaml, "visible")),
  );
  assign_defined(definition, "template", read_scalar(yaml, "template"));
  return definition;
}
