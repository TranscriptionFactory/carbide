export interface TemplateApi {
  editor: {
    getInfo(): Promise<{ path: string; name: string } | null>;
    getSelection(): Promise<string>;
    replaceSelection(content: string): Promise<unknown>;
  };
  metadata: {
    getFileCache(path: string): Promise<{
      frontmatter?: Record<string, unknown>;
      [key: string]: unknown;
    } | null>;
    getBacklinks(path: string): Promise<unknown[] | null>;
  };
  vault: {
    list(): Promise<string[]>;
    create(path: string, content: string): Promise<unknown>;
    modify(path: string, content: string): Promise<unknown>;
  };
  actions: { execute(id: string, args: unknown[]): Promise<unknown> };
  settings: { set(key: string, value: unknown): Promise<unknown> };
}

export type TemplateRenderer = (source: string, context: unknown) => string;

export function create_renderer(
  handlebars: {
    create(): {
      registerHelper(
        name: string,
        helper: (...args: unknown[]) => unknown,
      ): void;
      compile(
        source: string,
        options: { noEscape: boolean },
      ): (context: unknown) => string;
    };
  },
  default_date_format?: string,
): TemplateRenderer;

export function slugify(value: string): string;
export function parse_frontmatter(content: string): {
  frontmatter: { template?: Record<string, string>; [key: string]: unknown };
  body: string;
};
export function build_frontmatter(meta: {
  name?: string;
  description?: string;
  category?: string;
}): string;
export function gather_context(api: TemplateApi): Promise<{
  current_note: { path: string; name: string };
  selection: { text: string };
  fileCache: { frontmatter: Record<string, unknown>; [key: string]: unknown };
  backlinks: unknown[];
}>;
export function insert_template(
  api: TemplateApi,
  render: TemplateRenderer,
  source: string,
): Promise<string>;
export function save_template(
  api: TemplateApi,
  folder: string,
  name: string,
  category: string,
  body: string,
  overwrite?: boolean,
): Promise<{ path: string; needs_confirmation: boolean }>;
export function create_note(
  api: TemplateApi,
  render: TemplateRenderer,
  source: string,
  name: string,
): Promise<string>;
export const COMMANDS: Array<{ id: string; label: string }>;
export function open_command(
  api: TemplateApi,
  command: string,
  panel_ready?: boolean,
): Promise<boolean>;
