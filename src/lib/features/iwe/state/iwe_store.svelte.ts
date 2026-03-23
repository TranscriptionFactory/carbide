import type {
  IweCodeAction,
  IweCompletionItem,
  IweDocumentSymbol,
  IweHoverResult,
  IweInlayHint,
  IweLocation,
  IweStatus,
  IweSymbol,
} from "$lib/features/iwe/types";

export class IweStore {
  status = $state<IweStatus>("idle");
  last_hover = $state<IweHoverResult | null>(null);
  references = $state<IweLocation[]>([]);
  code_actions = $state<IweCodeAction[]>([]);
  symbols = $state<IweSymbol[]>([]);
  completions = $state<IweCompletionItem[]>([]);
  inlay_hints = $state<IweInlayHint[]>([]);
  document_symbols = $state<IweDocumentSymbol[]>([]);
  completion_trigger_characters = $state<string[]>([]);
  error = $state<string | null>(null);
  loading = $state(false);

  set_status(status: IweStatus) {
    this.status = status;
    if (status !== "error") {
      this.error = null;
    }
  }

  set_error(message: string) {
    this.error = message;
    this.status = "error";
  }

  set_hover(result: IweHoverResult | null) {
    this.last_hover = result;
  }

  set_references(refs: IweLocation[]) {
    this.references = refs;
  }

  set_code_actions(actions: IweCodeAction[]) {
    this.code_actions = actions;
  }

  set_symbols(symbols: IweSymbol[]) {
    this.symbols = symbols;
  }

  set_completions(items: IweCompletionItem[]) {
    this.completions = items;
  }

  set_inlay_hints(hints: IweInlayHint[]) {
    this.inlay_hints = hints;
  }

  set_document_symbols(symbols: IweDocumentSymbol[]) {
    this.document_symbols = symbols;
  }

  set_completion_trigger_characters(chars: string[]) {
    this.completion_trigger_characters = chars;
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
    this.error = null;
    this.loading = false;
  }
}
