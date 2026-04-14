import type { LspCodeAction, LspDiagnostic } from "$lib/features/lsp/types";

export class LspStore {
  code_actions: LspCodeAction[] = $state([]);
  diagnostics: LspDiagnostic[] = $state([]);
  hover_content = $state<{
    contents: string;
    line: number;
    character: number;
  } | null>(null);
  active_lsp_tab = $state<"code_actions" | "diagnostics" | "hover">(
    "code_actions",
  );

  set_code_actions(actions: LspCodeAction[]) {
    this.code_actions = actions;
  }

  set_diagnostics(diagnostics: LspDiagnostic[]) {
    this.diagnostics = diagnostics;
  }

  set_hover(
    content: { contents: string; line: number; character: number } | null,
  ) {
    this.hover_content = content;
  }
}
