import type {
  IweActionInfo,
  MarksmanCodeAction,
  MarksmanCompletionItem,
  MarksmanDocumentSymbol,
  MarksmanHoverResult,
  MarksmanInlayHint,
  MarksmanLocation,
  MarksmanStatus,
  MarksmanSymbol,
} from "$lib/features/marksman/types";

export class MarksmanStore {
  status = $state<MarksmanStatus>("idle");
  last_hover = $state<MarksmanHoverResult | null>(null);
  references = $state<MarksmanLocation[]>([]);
  code_actions = $state<MarksmanCodeAction[]>([]);
  symbols = $state<MarksmanSymbol[]>([]);
  completions = $state<MarksmanCompletionItem[]>([]);
  inlay_hints = $state<MarksmanInlayHint[]>([]);
  document_symbols = $state<MarksmanDocumentSymbol[]>([]);
  completion_trigger_characters = $state<string[]>([]);
  transform_actions = $state<IweActionInfo[]>([]);
  error = $state<string | null>(null);
  loading = $state(false);

  set_status(status: MarksmanStatus) {
    this.status = status;
    if (status !== "error") {
      this.error = null;
    }
  }

  set_error(message: string) {
    this.error = message;
    this.status = "error";
  }

  set_hover(result: MarksmanHoverResult | null) {
    this.last_hover = result;
  }

  set_references(refs: MarksmanLocation[]) {
    this.references = refs;
  }

  set_code_actions(actions: MarksmanCodeAction[]) {
    this.code_actions = actions;
  }

  set_symbols(symbols: MarksmanSymbol[]) {
    this.symbols = symbols;
  }

  set_completions(items: MarksmanCompletionItem[]) {
    this.completions = items;
  }

  set_inlay_hints(hints: MarksmanInlayHint[]) {
    this.inlay_hints = hints;
  }

  set_document_symbols(symbols: MarksmanDocumentSymbol[]) {
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
