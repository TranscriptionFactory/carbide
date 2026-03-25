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
import { SplitViewStore } from "$lib/features/split_view";
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
import { IweStore } from "$lib/features/iwe";
import { LspStore } from "$lib/features/lsp";
import { DiagnosticsStore } from "$lib/features/diagnostics";
import { MetadataStore } from "$lib/features/metadata";
import { ToolchainStore } from "$lib/features/toolchain";
import { CodeLspStore } from "$lib/features/code_lsp";
import { QueryStore } from "$lib/features/query";
import { ParsedNoteCache } from "$lib/features/note";
import { ReferenceStore } from "$lib/features/reference";

export type AppStores = {
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
  split_view: SplitViewStore;
  terminal: TerminalStore;
  document: DocumentStore;
  ai: AiStore;
  graph: GraphStore;
  bases: BasesStore;
  task: TaskStore;
  plugin: PluginStore;
  plugin_settings: PluginSettingsStore;
  canvas: CanvasStore;
  tag: TagStore;
  lint: LintStore;
  log: LogStore;
  iwe: IweStore;
  lsp: LspStore;
  diagnostics: DiagnosticsStore;
  metadata: MetadataStore;
  toolchain: ToolchainStore;
  code_lsp: CodeLspStore;
  query: QueryStore;
  parsed_note_cache: ParsedNoteCache;
  reference: ReferenceStore;
};

export function create_app_stores(): AppStores {
  return {
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    ui: new UIStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    links: new LinksStore(),
    outline: new OutlineStore(),
    split_view: new SplitViewStore(),
    terminal: new TerminalStore(),
    document: new DocumentStore(),
    ai: new AiStore(),
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    plugin: new PluginStore(),
    plugin_settings: new PluginSettingsStore(),
    canvas: new CanvasStore(),
    tag: new TagStore(),
    lint: new LintStore(),
    log: new LogStore(),
    iwe: new IweStore(),
    lsp: new LspStore(),
    diagnostics: new DiagnosticsStore(),
    metadata: new MetadataStore(),
    toolchain: new ToolchainStore(),
    code_lsp: new CodeLspStore(),
    query: new QueryStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };
}
