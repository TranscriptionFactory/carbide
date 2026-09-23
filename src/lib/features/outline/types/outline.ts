export type OutlineHeading = {
  id: string;
  level: number;
  text: string;
  /** As of the last structural outline change; resolve a live editor position by id. */
  pos: number;
};
