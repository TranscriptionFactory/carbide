import type {
  IweActionInfo,
  MarkdownLspCodeAction,
  MarkdownLspCompletionItem,
  MarkdownLspDocumentSymbol,
  MarkdownLspHoverResult,
  MarkdownLspInlayHint,
  MarkdownLspLocation,
  MarkdownLspStatus,
  MarkdownLspSymbol,
} from "$lib/features/markdown_lsp/types";

export class MarkdownLspStore {
  status = $state<MarkdownLspStatus>("idle");
  last_hover = $state<MarkdownLspHoverResult | null>(null);
  references = $state<MarkdownLspLocation[]>([]);
  code_actions = $state<MarkdownLspCodeAction[]>([]);
  symbols = $state<MarkdownLspSymbol[]>([]);
  completions = $state<MarkdownLspCompletionItem[]>([]);
  inlay_hints = $state<MarkdownLspInlayHint[]>([]);
  document_symbols = $state<MarkdownLspDocumentSymbol[]>([]);
  completion_trigger_characters = $state<string[]>([]);
  transform_actions = $state<IweActionInfo[]>([]);
  error = $state<string | null>(null);
  loading = $state(false);

  set_status(status: MarkdownLspStatus) {
    this.status = status;
    if (status !== "error") {
      this.error = null;
    }
  }

  set_error(message: string) {
    this.error = message;
    this.status = "error";
  }

  set_hover(result: MarkdownLspHoverResult | null) {
    this.last_hover = result;
  }

  set_references(refs: MarkdownLspLocation[]) {
    this.references = refs;
  }

  set_code_actions(actions: MarkdownLspCodeAction[]) {
    this.code_actions = actions;
  }

  set_symbols(symbols: MarkdownLspSymbol[]) {
    this.symbols = symbols;
  }

  set_completions(items: MarkdownLspCompletionItem[]) {
    this.completions = items;
  }

  set_inlay_hints(hints: MarkdownLspInlayHint[]) {
    this.inlay_hints = hints;
  }

  set_document_symbols(symbols: MarkdownLspDocumentSymbol[]) {
    this.document_symbols = symbols;
  }

  set_completion_trigger_characters(chars: string[]) {
    this.completion_trigger_characters = chars;
  }

  set_transform_actions(actions: IweActionInfo[]) {
    this.transform_actions = actions;
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  reset() {
    this.status = "idle";
    this.last_hover = null;
    this.references = [];
    this.code_actions = [];
    this.symbols = [];
    this.completions = [];
    this.completion_trigger_characters = [];
    this.inlay_hints = [];
    this.document_symbols = [];
    this.transform_actions = [];
    this.error = null;
    this.loading = false;
  }
}
