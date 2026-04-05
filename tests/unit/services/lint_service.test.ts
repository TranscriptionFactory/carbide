import { describe, it, expect, vi, beforeEach } from "vitest";
import { LintService } from "$lib/features/lint/application/lint_service";
import type { LintPort } from "$lib/features/lint/ports";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";

function create_mock_lint_port(overrides: Partial<LintPort> = {}): LintPort {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    open_file: vi.fn().mockResolvedValue(undefined),
    update_file: vi.fn().mockResolvedValue(undefined),
    close_file: vi.fn().mockResolvedValue(undefined),
    format_file: vi.fn().mockResolvedValue([]),
    fix_all: vi.fn().mockResolvedValue(null),
    check_vault: vi.fn().mockResolvedValue([]),
    format_vault: vi.fn().mockResolvedValue([]),
    get_status: vi.fn().mockResolvedValue("stopped"),
    subscribe_events: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

function create_mock_stores() {
  return {
    lint_store: {
      set_status: vi.fn(),
      reset: vi.fn(),
      is_running: false,
    } as unknown as LintStore,
    vault_store: { vault: null } as unknown as VaultStore,
    editor_store: {} as unknown as EditorStore,
    op_store: {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    } as unknown as OpStore,
  };
}

const VAULT_ID = "v1" as VaultId;
const VAULT_PATH = "/vaults/test" as VaultPath;

describe("LintService", () => {
  describe("permanent failure guard", () => {
    it("suppresses retry with same config after start failure", async () => {
      const port = create_mock_lint_port({
        start: vi
          .fn()
          .mockRejectedValue(new Error("cannot execute binary file")),
      });
      const stores = create_mock_stores();
      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(1);

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(1);
    });

    it("allows retry with different config after failure", async () => {
      const port = create_mock_lint_port({
        start: vi
          .fn()
          .mockRejectedValue(new Error("cannot execute binary file")),
      });
      const stores = create_mock_stores();
      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(1);

      await service.start(VAULT_ID, VAULT_PATH, "new_rules", false);
      expect(port.start).toHaveBeenCalledTimes(2);
    });

    it("clears failure guard on successful start", async () => {
      let call_count = 0;
      const port = create_mock_lint_port({
        start: vi.fn().mockImplementation(() => {
          call_count++;
          if (call_count === 1) return Promise.reject(new Error("fail"));
          return Promise.resolve();
        }),
      });
      const stores = create_mock_stores();
      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(1);

      await service.start(VAULT_ID, VAULT_PATH, "changed", false);
      expect(port.start).toHaveBeenCalledTimes(2);

      await service.start(VAULT_ID, VAULT_PATH, "changed", false);
      expect(port.start).toHaveBeenCalledTimes(3);
    });

    it("allows retry after clear_failure()", async () => {
      const port = create_mock_lint_port({
        start: vi.fn().mockRejectedValue(new Error("fail")),
      });
      const stores = create_mock_stores();
      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(1);

      service.clear_failure();

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      expect(port.start).toHaveBeenCalledTimes(2);
    });
  });
});
