import {
  TYPE_DEFINITION_MARKER,
  type BackendTypeCount,
  type TypeDefinition,
  type TypeSection,
} from "../ports";

export const DEFAULT_TYPE_ICON = "tag";
export const DEFAULT_TYPE_COLOR = "var(--muted-foreground)";
export const DEFAULT_TYPE_ORDER = 1000;

function to_type_section(
  name: string,
  count: number,
  definition: TypeDefinition | undefined,
): TypeSection {
  const section: TypeSection = {
    name,
    label: definition?.label ?? name,
    icon: definition?.icon ?? DEFAULT_TYPE_ICON,
    color: definition?.color ?? DEFAULT_TYPE_COLOR,
    order: definition?.order ?? DEFAULT_TYPE_ORDER,
    count,
    visible: definition?.visible ?? true,
  };
  if (definition?.path) section.path = definition.path;
  return section;
}

export function build_type_sections(
  backend_types: BackendTypeCount[],
  definitions: TypeDefinition[],
): TypeSection[] {
  const counts = new Map<string, number>();
  for (const entry of backend_types) {
    if (entry.name === TYPE_DEFINITION_MARKER) continue;
    counts.set(entry.name, entry.count);
  }

  const definition_by_name = new Map<string, TypeDefinition>();
  for (const def of definitions) {
    definition_by_name.set(def.name, def);
  }

  const names = new Set<string>([
    ...counts.keys(),
    ...definition_by_name.keys(),
  ]);

  const sections = [...names].map((name) =>
    to_type_section(name, counts.get(name) ?? 0, definition_by_name.get(name)),
  );

  return sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
