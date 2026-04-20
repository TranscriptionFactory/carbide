import type { AssetsPort, NotesPort } from "$lib/features/note";
import type { ClipboardPort } from "$lib/features/clipboard";
import type { EditorPort } from "$lib/features/editor";
import type { SearchPort, WorkspaceIndexPort } from "$lib/features/search";
import type { SettingsPort, StoragePort } from "$lib/features/settings";
import type { ShellPort } from "$lib/features/shell";
import type { GitPort } from "$lib/features/git";
import type { VaultPort, VaultSettingsPort } from "$lib/features/vault";
import type { DocumentPort } from "$lib/features/document";
import type { TerminalPort } from "$lib/features/terminal";
import type { WindowPort } from "$lib/features/window";
import type { WatcherPort } from "$lib/features/watcher";
import type { AiPort, AiStreamPort } from "$lib/features/ai";
import type { GraphPort } from "$lib/features/graph";
import type { BasesPort } from "$lib/features/bases";
import type { TaskPort } from "$lib/features/task";
import type { PluginHostPort, PluginSettingsPort } from "$lib/features/plugin";
import type { CanvasPort } from "$lib/features/canvas";
import type { TagPort } from "$lib/features/tags";
import type { LintPort } from "$lib/features/lint";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp";
// STT removed — archived on archive/stt-main
// import type { SttPort } from "$lib/features/stt";

import type { ToolchainPort } from "$lib/features/toolchain";
import type { CodeLspPort } from "$lib/features/code_lsp";
import type { McpPort } from "$lib/features/mcp";
import type { SavedQueryPort } from "$lib/features/query";
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
  editor: EditorPort;
  clipboard: ClipboardPort;
  shell: ShellPort;
  git: GitPort;
  document: DocumentPort;
  terminal: TerminalPort;
  window: WindowPort;
  watcher: WatcherPort;
  ai: AiPort;
  ai_stream: AiStreamPort;
  graph: GraphPort;
  bases: BasesPort;
  task: TaskPort;
  plugin: PluginHostPort;
  plugin_settings: PluginSettingsPort;
  canvas: CanvasPort;
  tag: TagPort;
  lint: LintPort;
  markdown_lsp: MarkdownLspPort;

  toolchain: ToolchainPort;
  code_lsp: CodeLspPort;
  saved_query: SavedQueryPort;
  reference_storage: ReferenceStoragePort;
  citation: CitationPort;
  doi_lookup: DoiLookupPort;
  linked_source: LinkedSourcePort;
  mcp: McpPort;
  // stt: SttPort;
};
