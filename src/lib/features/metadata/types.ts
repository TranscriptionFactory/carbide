export type NoteProperty = {
  key: string;
  value: string;
  type: string;
};

export type NoteTag = {
  tag: string;
  source: "frontmatter" | "inline";
};

export type NoteMetadata = {
  properties: NoteProperty[];
  tags: NoteTag[];
};
