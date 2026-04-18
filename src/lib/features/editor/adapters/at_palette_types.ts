export type AtPaletteCategory =
  | "notes"
  | "headings"
  | "dates"
  | "references"
  | "tags"
  | "commands";

export type AtPaletteNoteItem = {
  category: "notes";
  title: string;
  path: string;
  kind: "existing" | "planned";
  ref_count?: number | undefined;
};

export type AtPaletteHeadingItem = {
  category: "headings";
  text: string;
  level: number;
  note_path: string;
};

export type AtPaletteDateItem = {
  category: "dates";
  label: string;
  date_str: string;
  description: string;
};

export type AtPaletteReferenceItem = {
  category: "references";
  citekey: string;
  title: string;
  authors: string;
  year: string;
};

export type AtPaletteTagItem = {
  category: "tags";
  tag: string;
  count: number;
};

export type AtPaletteCommandItem = {
  category: "commands";
  id: string;
  label: string;
  description: string;
  icon: string;
};

export type AtPaletteItem =
  | AtPaletteNoteItem
  | AtPaletteHeadingItem
  | AtPaletteDateItem
  | AtPaletteReferenceItem
  | AtPaletteTagItem
  | AtPaletteCommandItem;
