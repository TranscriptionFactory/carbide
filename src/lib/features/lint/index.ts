export type { LintPort } from "$lib/features/lint/ports";
export { create_lint_tauri_adapter } from "$lib/features/lint/adapters/lint_tauri_adapter";
export { LintStore } from "$lib/features/lint/state/lint_store.svelte";
export { LintService } from "$lib/features/lint/application/lint_service";
export { register_lint_actions } from "$lib/features/lint/application/lint_actions";
export { apply_lint_text_edits } from "$lib/features/lint/domain/apply_text_edits";
export {
  map_lint_diagnostics,
  update_cm_diagnostics,
  create_lint_extensions,
} from "$lib/features/lint/editor/cm_lint_source";
export type {
  LintDiagnostic,
  LintSeverity,
  LintTextEdit,
  LintStatus,
  LintEvent,
  FileDiagnostics,
} from "$lib/features/lint/types/lint";
export { default as LintStatusIndicator } from "$lib/features/lint/ui/lint_status_indicator.svelte";
export { default as ProblemsPanel } from "$lib/features/lint/ui/problems_panel.svelte";
