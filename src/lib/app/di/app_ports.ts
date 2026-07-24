import type { AssetsPort, NotesPort } from "$lib/features/note";
import type { ClipPort } from "$lib/features/clip";
import type { ClipboardPort } from "$lib/features/clipboard";
import type { EditorPort } from "$lib/features/editor";
import type { SearchPort, WorkspaceIndexPort } from "$lib/features/search";
import type { SettingsPort, StoragePort } from "$lib/features/settings";
import type { ShellPort } from "$lib/features/shell";
import type { GitPort } from "$lib/features/git";
import type { VaultPort, VaultSettingsPort } from "$lib/features/vault";
import type {
  DocumentPort,
  TrustedHtmlPort,
  ReadingPositionPort,
} from "$lib/features/document";
import type { TerminalPort } from "$lib/features/terminal";
import type { WindowPort } from "$lib/features/window";
import type { WatcherPort } from "$lib/features/watcher";
import type {
  AiPort,
  AiStreamPort,
  AiHistoryPersistencePort,
} from "$lib/features/ai";
import type { GraphPort } from "$lib/features/graph";
import type { BasesPort } from "$lib/features/bases";
import type { TypesPort } from "$lib/features/types";
import type { TaskPort } from "$lib/features/task";
import type {
  PluginHostPort,
  PluginSettingsPort,
  MarketplacePort,
} from "$lib/features/plugin";
import type { CanvasPort } from "$lib/features/canvas";
import type { MetadataPort } from "$lib/features/metadata";
import type { TagPort } from "$lib/features/tags";
import type { LintPort } from "$lib/features/lint";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp";
// STT removed — archived on archive/stt-main
// import type { SttPort } from "$lib/features/stt";

import type { ToolchainPort } from "$lib/features/toolchain";
import type { CodeLspPort } from "$lib/features/code_lsp";
import type { McpPort } from "$lib/features/mcp";
import type { SavedQueryPort } from "$lib/features/query";
import type { AgentPort, RagPersistencePort } from "$lib/features/rag";
import type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
  LinkedSourcePort,
} from "$lib/features/reference";

export type Ports = {
  vault: VaultPort;
  notes: NotesPort;
  index: WorkspaceIndexPort;
  search: SearchPort;
  settings: SettingsPort;
  storage: StoragePort;
  vault_settings: VaultSettingsPort;
  assets: AssetsPort;
  clip: ClipPort;
  editor: EditorPort;
  clipboard: ClipboardPort;
  shell: ShellPort;
  git: GitPort;
  document: DocumentPort;
  trusted_html: TrustedHtmlPort;
  reading_position: ReadingPositionPort;
  terminal: TerminalPort;
  window: WindowPort;
  watcher: WatcherPort;
  ai: AiPort;
  ai_stream: AiStreamPort;
  ai_history: AiHistoryPersistencePort;
  graph: GraphPort;
  bases: BasesPort;
  types: TypesPort;
  task: TaskPort;
  plugin: PluginHostPort;
  plugin_settings: PluginSettingsPort;
  marketplace: MarketplacePort;
  canvas: CanvasPort;
  metadata: MetadataPort;
  tag: TagPort;
  lint: LintPort;
  markdown_lsp: MarkdownLspPort;

  toolchain: ToolchainPort;
  code_lsp: CodeLspPort;
  saved_query: SavedQueryPort;
  rag_persistence: RagPersistencePort;
  agent: AgentPort;
  reference_storage: ReferenceStoragePort;
  citation: CitationPort;
  doi_lookup: DoiLookupPort;
  linked_source: LinkedSourcePort;
  mcp: McpPort;
  // stt: SttPort;
};
