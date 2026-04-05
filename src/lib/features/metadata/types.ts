export type PropertyType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "array"
  | "tags";

export type NoteProperty = {
  key: string;
  value: string;
  type: PropertyType;
};

export type NoteTag = {
  tag: string;
  source: "frontmatter" | "inline";
};

export type NoteMetadata = {
  properties: NoteProperty[];
  tags: NoteTag[];
};
