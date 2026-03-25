import type { LspCodeAction, LspDiagnostic } from "$lib/features/lsp/types";

export class LspStore {
  code_actions: LspCodeAction[] = $state([]);
  diagnostics: LspDiagnostic[] = $state([]);

  set_code_actions(actions: LspCodeAction[]) {
    this.code_actions = actions;
  }

  set_diagnostics(diagnostics: LspDiagnostic[]) {
    this.diagnostics = diagnostics;
  }
}
