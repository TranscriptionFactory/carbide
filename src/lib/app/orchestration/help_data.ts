import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSanitize from "rehype-sanitize";

export type EditorShortcut = {
  label: string;
  key: string;
};

export type MarkdownSyntaxEntry = {
  label: string;
  syntax: string;
};

export type GuideEntry = {
  slug: string;
  title: string;
  description: string;
};

const raw_docs = import.meta.glob("/docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const GUIDES: GuideEntry[] = [
  {
    slug: "getting_started",
    title: "Getting Started",
    description: "Set up Carbide and learn the basics",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "How the codebase is structured",
  },
  {
    slug: "search_and_queries",
    title: "Search & Queries",
    description: "Find notes with full-text and structured queries",
  },
  {
    slug: "bases_and_references",
    title: "Bases & References",
    description: "Organize notes with bases and cross-references",
  },
  {
    slug: "markdown-syntax-guide",
    title: "Markdown Syntax Guide",
    description: "Supported markdown features and extensions",
  },
  {
    slug: "plugin_howto",
    title: "Writing Plugins",
    description: "Build and register custom plugins",
  },
  {
    slug: "html_to_markdown_plugin",
    title: "HTML to Markdown Plugin",
    description: "Convert HTML content to markdown notes",
  },
  {
    slug: "data_storage_locations",
    title: "Data Storage Locations",
    description: "Where Carbide stores your data",
  },
  {
    slug: "UI",
    title: "UI Design System",
    description: "Colors, tokens, and component patterns",
  },
];

const md_processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

export async function render_guide(slug: string): Promise<string | null> {
  const key = `/docs/${slug}.md`;
  const raw = raw_docs[key];
  if (!raw) return null;
  const result = await md_processor.process(raw);
  return String(result);
}

export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  { label: "Bold", key: "CmdOrCtrl+B" },
  { label: "Italic", key: "CmdOrCtrl+I" },
  { label: "Inline Code", key: "CmdOrCtrl+E" },
  { label: "Strikethrough", key: "CmdOrCtrl+Shift+X" },
  { label: "Heading 1", key: "CmdOrCtrl+Alt+1" },
  { label: "Heading 2", key: "CmdOrCtrl+Alt+2" },
  { label: "Heading 3", key: "CmdOrCtrl+Alt+3" },
  { label: "Code Block", key: "CmdOrCtrl+Alt+C" },
  { label: "Ordered List", key: "CmdOrCtrl+Alt+7" },
  { label: "Bullet List", key: "CmdOrCtrl+Alt+8" },
  { label: "Undo", key: "CmdOrCtrl+Z" },
  { label: "Redo", key: "CmdOrCtrl+Shift+Z" },
  { label: "Indent", key: "Tab" },
  { label: "Outdent", key: "Shift+Tab" },
  { label: "Line Break", key: "Shift+Enter" },
];

export const MARKDOWN_SYNTAX: MarkdownSyntaxEntry[] = [
  { label: "Heading 1", syntax: "# Heading" },
  { label: "Heading 2", syntax: "## Heading" },
  { label: "Heading 3", syntax: "### Heading" },
  { label: "Bold", syntax: "**bold**" },
  { label: "Italic", syntax: "*italic*" },
  { label: "Strikethrough", syntax: "~~text~~" },
  { label: "Bullet List", syntax: "- item" },
  { label: "Ordered List", syntax: "1. item" },
  { label: "Task List", syntax: "- [ ] task" },
  { label: "Blockquote", syntax: "> quote" },
  { label: "Inline Code", syntax: "`code`" },
  { label: "Code Block", syntax: "```lang\ncode\n```" },
  { label: "Link", syntax: "[text](url)" },
  { label: "Image", syntax: "![alt](url)" },
  { label: "Wiki Link", syntax: "[[note]]" },
  { label: "Line Break", syntax: "line one\\\\\nline two" },
  { label: "Horizontal Rule", syntax: "---" },
  { label: "Table", syntax: "| A | B |\n|---|---|\n| 1 | 2 |" },
  { label: "Inline Math", syntax: "$expr$" },
  { label: "Block Math", syntax: "$$expr$$" },
];
