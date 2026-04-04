import { VaultStore } from "$lib/features/vault";
import { NotesStore } from "$lib/features/note";
import { EditorStore } from "$lib/features/editor";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search";
import { TabStore } from "$lib/features/tab";
import { GitStore } from "$lib/features/git";
import { LinksStore } from "$lib/features/links";
import { OutlineStore } from "$lib/features/outline";
import { TerminalStore } from "$lib/features/terminal";
import { DocumentStore } from "$lib/features/document";
import { AiStore } from "$lib/features/ai";
import { GraphStore } from "$lib/features/graph";
import { BasesStore } from "$lib/features/bases";
import { TaskStore } from "$lib/features/task";
import { PluginStore, PluginSettingsStore } from "$lib/features/plugin";
import { CanvasStore } from "$lib/features/canvas";
import { TagStore } from "$lib/features/tags";
import { LintStore, LogStore } from "$lib/features/lint";
import { MarkdownLspStore } from "$lib/features/markdown_lsp";
import { LspStore } from "$lib/features/lsp";
import { DiagnosticsStore } from "$lib/features/diagnostics";
import { MetadataStore } from "$lib/features/metadata";
import { ToolchainStore } from "$lib/features/toolchain";
import { CodeLspStore } from "$lib/features/code_lsp";
import { QueryStore } from "$lib/features/query";
import { ParsedNoteCache } from "$lib/features/note";
import { ReferenceStore } from "$lib/features/reference";
import { VimNavStore } from "$lib/features/vim_nav";
import {
  FULL_APP_SURFACE,
  LITE_APP_SURFACE,
} from "$lib/app/orchestration/app_surface";

export type CoreAppStores = {
  vault: VaultStore;
  notes: NotesStore;
  editor: EditorStore;
  ui: UIStore;
  op: OpStore;
  search: SearchStore;
  tab: TabStore;
  git: GitStore;
  links: LinksStore;
  outline: OutlineStore;
  terminal: TerminalStore;
  document: DocumentStore;
  lint: LintStore;
  log: LogStore;
  markdown_lsp: MarkdownLspStore;
  lsp: LspStore;
  diagnostics: DiagnosticsStore;
  parsed_note_cache: ParsedNoteCache;
  vim_nav: VimNavStore;
};

export type FullOnlyAppStores = {
  ai: AiStore;
  plugin: PluginStore;
  plugin_settings: PluginSettingsStore;
  canvas: CanvasStore;
  tag: TagStore;
  metadata: MetadataStore;
  toolchain: ToolchainStore;
  code_lsp: CodeLspStore;
  query: QueryStore;
  reference: ReferenceStore;
  graph: GraphStore;
  bases: BasesStore;
  task: TaskStore;
};

export type AppStores = CoreAppStores & Partial<FullOnlyAppStores>;

export function create_app_stores(): AppStores {
  const surface = __CARBIDE_LITE__ ? LITE_APP_SURFACE : FULL_APP_SURFACE;
  const core: CoreAppStores = {
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    ui: new UIStore(surface),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    links: new LinksStore(),
    outline: new OutlineStore(),
    terminal: new TerminalStore(),
    document: new DocumentStore(),
    lint: new LintStore(),
    log: new LogStore(),
    markdown_lsp: new MarkdownLspStore(),
    lsp: new LspStore(),
    diagnostics: new DiagnosticsStore(),
    parsed_note_cache: new ParsedNoteCache(),
    vim_nav: new VimNavStore(),
  };

  if (__CARBIDE_LITE__) {
    return core;
  }

  return {
    ...core,
    ai: new AiStore(),
    plugin: new PluginStore(),
    plugin_settings: new PluginSettingsStore(),
    canvas: new CanvasStore(),
    tag: new TagStore(),
    metadata: new MetadataStore(),
    toolchain: new ToolchainStore(),
    code_lsp: new CodeLspStore(),
    query: new QueryStore(),
    reference: new ReferenceStore(),
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
  };
}
