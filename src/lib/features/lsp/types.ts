export type LspCodeAction = {
  title: string;
  kind: string | null;
  data: string | null;
  raw_json: string;
  source: string;
};
