import type { PropertyType, StandardField } from "../types";

export const STANDARD_FIELDS: StandardField[] = [
  {
    key: "title",
    type: "string",
    description: "Display title of the note",
    keywords: ["name", "heading"],
  },
  {
    key: "aliases",
    type: "tags",
    description: "Alternate names this note can be found under",
    keywords: ["alias", "alternate", "names"],
  },
  {
    key: "tags",
    type: "tags",
    description: "Topic tags for grouping and filtering",
    keywords: ["topic", "label", "category"],
  },
  {
    key: "date_created",
    type: "date",
    description: "Creation date (YYYY-MM-DD)",
    keywords: ["created", "date", "born"],
  },
  {
    key: "status",
    type: "string",
    description: "Workflow status",
    values: ["todo", "in-progress", "done"],
    keywords: ["state", "workflow", "stage"],
  },
  {
    key: "priority",
    type: "string",
    description: "Priority level",
    values: ["low", "medium", "high"],
    keywords: ["importance", "urgency"],
  },
  {
    key: "due",
    type: "date",
    description: "Due date (YYYY-MM-DD)",
    keywords: ["deadline", "date"],
  },
  {
    key: "cover",
    type: "string",
    description: "Cover image path",
    keywords: ["image", "banner", "thumbnail"],
  },
  {
    key: "color",
    type: "string",
    description: "Accent color",
    keywords: ["colour", "accent"],
  },
  {
    key: "icon",
    type: "string",
    description: "Icon name or emoji",
    keywords: ["emoji", "glyph"],
  },
];

export function find_standard_field(key: string): StandardField | undefined {
  return STANDARD_FIELDS.find((f) => f.key === key);
}

function is_list_type(type: PropertyType | undefined): boolean {
  return type === "tags" || type === "array";
}

export function coerce_field_value(
  key: string,
  value: string,
  known_type?: PropertyType,
): string | string[] {
  if (
    is_list_type(known_type) ||
    is_list_type(find_standard_field(key)?.type)
  ) {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return value;
}
