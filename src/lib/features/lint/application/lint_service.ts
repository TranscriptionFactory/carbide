import type { LintPort } from "$lib/features/lint/ports";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  LintEvent,
  LintTextEdit,
  FileDiagnostics,
} from "$lib/features/lint/types/lint";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";

const log = create_logger("lint_service");

export class LintService {
  private event_unsubscribe: (() => void) | null = null;
  private lifecycle = Promise.resolve();
  private file_versions = new Map<string, number>();

  constructor(
    private readonly port: LintPort,
    private readonly lint_store: LintStore,
    private readonly vault_store: VaultStore,
    private readonly editor_store: EditorStore,
    private readonly op_store: OpStore,
  ) {}

  async start(
    vault_id: VaultId,
    vault_path: VaultPath,
    user_overrides: string = "",
  ): Promise<void> {
    await this.run_lifecycle(async () => {
      this.teardown();
      this.event_unsubscribe = this.port.subscribe_events((event) => {
        this.handle_event(event);
      });
      try {
        await this.port.start(vault_id, vault_path, user_overrides);
      } catch (error) {
        log.from_error("Failed to start lint", error);
      }
    });
  }

  async stop(): Promise<void> {
    await this.run_lifecycle(async () => {
      const vault_id = this.vault_store.vault?.id;
      if (vault_id) {
        try {
          await this.port.stop(vault_id);
        } catch (error) {
          log.from_error("Failed to stop lint", error);
        }
      }
      this.teardown_local();
    });
  }

  async notify_file_opened(path: string, content: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.lint_store.is_running) return;

    const version = this.next_version(path);
    try {
      await this.port.open_file(vault_id, path, content, version);
    } catch (error) {
      log.from_error("Failed to notify file opened", error);
    }
  }

  async notify_file_changed(path: string, content: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.lint_store.is_running) return;

    const version = this.next_version(path);
    try {
      await this.port.update_file(vault_id, path, content, version);
    } catch (error) {
      log.from_error("Failed to notify file changed", error);
    }
  }

  async notify_file_closed(path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.lint_store.is_running) return;

    this.file_versions.delete(path);
    this.lint_store.remove_file(path);
    try {
      await this.port.close_file(vault_id, path);
    } catch (error) {
      log.from_error("Failed to notify file closed", error);
    }
  }

  async format_file(path: string): Promise<LintTextEdit[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return [];

    this.op_store.start("lint.format_file", Date.now());
    try {
      const edits = await this.port.format_file(vault_id, path);
      this.op_store.succeed("lint.format_file");
      return edits;
    } catch (error) {
      this.op_store.fail("lint.format_file", error_message(error));
      return [];
    }
  }

  async fix_all(path: string): Promise<string | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;

    this.op_store.start("lint.fix_all", Date.now());
    try {
      const result = await this.port.fix_all(vault_id, path);
      this.op_store.succeed("lint.fix_all");
      return result;
    } catch (error) {
      this.op_store.fail("lint.fix_all", error_message(error));
      return null;
    }
  }

  async check_vault(): Promise<FileDiagnostics[]> {
    const vault = this.vault_store.vault;
    if (!vault) return [];

    this.op_store.start("lint.check_vault", Date.now());
    try {
      const results = await this.port.check_vault(vault.path);
      for (const file of results) {
        this.lint_store.set_diagnostics(file.path, file.diagnostics);
      }
      this.op_store.succeed("lint.check_vault");
      return results;
    } catch (error) {
      this.op_store.fail("lint.check_vault", error_message(error));
      return [];
    }
  }

  async format_vault(): Promise<string[]> {
    const vault = this.vault_store.vault;
    if (!vault) return [];

    this.op_store.start("lint.format_vault", Date.now());
    try {
      const files = await this.port.format_vault(vault.path);
      this.op_store.succeed("lint.format_vault");
      return files;
    } catch (error) {
      this.op_store.fail("lint.format_vault", error_message(error));
      return [];
    }
  }

  private handle_event(event: LintEvent): void {
    switch (event.type) {
      case "diagnostics_updated": {
        const active = this.lint_store.active_file_path;
        if (active && event.path !== active) {
          log.warn(
            `Diagnostic path mismatch: store="${event.path}" active="${active}"`,
          );
        }
        this.lint_store.set_diagnostics(event.path, event.diagnostics);
        break;
      }
      case "status_changed":
        this.lint_store.set_status(event.status);
        break;
    }
  }

  private next_version(path: string): number {
    const current = this.file_versions.get(path) ?? 0;
    const next = current + 1;
    this.file_versions.set(path, next);
    return next;
  }

  private teardown_local(): void {
    if (this.event_unsubscribe) {
      const unsub = this.event_unsubscribe;
      this.event_unsubscribe = null;
      unsub();
    }
    this.lint_store.reset();
    this.file_versions.clear();
  }

  private teardown(): void {
    this.teardown_local();
  }

  private run_lifecycle(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
