import type { LspCodeAction } from "$lib/features/lsp/types";

export class LspStore {
  code_actions: LspCodeAction[] = $state([]);

  set_code_actions(actions: LspCodeAction[]) {
    this.code_actions = actions;
  }
}
