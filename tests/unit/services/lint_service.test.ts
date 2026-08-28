import { describe, it, expect, vi } from "vitest";
import { LintService } from "$lib/features/lint/application/lint_service";
import { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { LintPort } from "$lib/features/lint/ports";
import type { LintStore as LintStoreType } from "$lib/features/lint/state/lint_store.svelte";
import type { LintEvent } from "$lib/features/lint/types/lint";
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
  describe("notify_file_closed", () => {
    it("does not call port when lint is not running", async () => {
      const port = create_mock_lint_port();
      const stores = create_mock_stores();
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;
      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.notify_file_closed("docs/a.md");
      expect(port.close_file).not.toHaveBeenCalled();
    });

    it("calls port and clears version when lint is running", async () => {
      const port = create_mock_lint_port();
      const stores = create_mock_stores();
      stores.lint_store = {
        ...stores.lint_store,
        is_running: true,
      } as unknown as LintStore;
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.notify_file_closed("docs/a.md");
      expect(port.close_file).toHaveBeenCalledWith(VAULT_ID, "docs/a.md");
    });
  });

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

  describe("double close", () => {
    it("double close does not error", async () => {
      const port = create_mock_lint_port();
      const stores = create_mock_stores();
      stores.lint_store = {
        ...stores.lint_store,
        is_running: true,
      } as unknown as LintStore;
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.notify_file_closed("docs/a.md");
      await service.notify_file_closed("docs/a.md");
      expect(port.close_file).toHaveBeenCalledTimes(2);
    });
  });

  describe("close after stop then start", () => {
    it("close after stop then start does not carry stale version", async () => {
      const port = create_mock_lint_port();
      const stores = create_mock_stores();
      stores.lint_store = {
        ...stores.lint_store,
        is_running: true,
      } as unknown as LintStoreType;
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service.notify_file_opened("docs/a.md", "hello");
      await service.notify_file_changed("docs/a.md", "hello world");
      await service.stop();

      const service2 = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      await service2.notify_file_opened("docs/a.md", "fresh");
      const open_calls = vi.mocked(port.open_file).mock.calls;
      const last_open = open_calls.at(-1);
      expect(last_open?.[3]).toBe(1);
    });
  });

  describe("stop ordering", () => {
    it("flips is_running to false before the port.stop promise resolves", async () => {
      const real_lint_store = new LintStore();
      real_lint_store.set_status("running");

      let release_stop: (() => void) | null = null;
      const stop_mock = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release_stop = resolve;
          }),
      );
      const port = create_mock_lint_port({ stop: stop_mock });
      const stores = create_mock_stores();
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        real_lint_store as unknown as LintStoreType,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      const stop_promise = service.stop();
      // One microtask lets the queued lifecycle op flip the status while the
      // port.stop promise is still pending.
      await Promise.resolve();

      expect(real_lint_store.is_running).toBe(false);
      expect(stop_mock).toHaveBeenCalledWith(VAULT_ID);

      release_stop?.();
      await stop_promise;
    });

    it("file notifications during the stop window are no-ops (not running)", async () => {
      const real_lint_store = new LintStore();
      real_lint_store.set_status("running");

      let release_stop: (() => void) | null = null;
      const stop_mock = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release_stop = resolve;
          }),
      );
      const open_mock = vi.fn().mockResolvedValue(undefined);
      const update_mock = vi.fn().mockResolvedValue(undefined);
      const port = create_mock_lint_port({
        stop: stop_mock,
        open_file: open_mock,
        update_file: update_mock,
      });
      const stores = create_mock_stores();
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        real_lint_store as unknown as LintStoreType,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
      );

      const stop_promise = service.stop();
      await Promise.resolve();

      await service.notify_file_opened("docs/a.md", "content");
      await service.notify_file_changed("docs/a.md", "content 2");

      expect(open_mock).not.toHaveBeenCalled();
      expect(update_mock).not.toHaveBeenCalled();

      release_stop?.();
      await stop_promise;
    });
  });

  describe("diagnostics after restart", () => {
    it("still forwards diagnostics events after a completed stop/start cycle", async () => {
      let events_callback: ((event: LintEvent) => void) | null = null;
      const subscribe_mock = vi
        .fn()
        .mockImplementation((callback: (event: LintEvent) => void) => {
          events_callback = callback;
          return () => {};
        });
      const port = create_mock_lint_port({ subscribe_events: subscribe_mock });

      const stores = create_mock_stores();
      const diagnostics_store = {
        push: vi.fn(),
        clear_file: vi.fn(),
        clear_source: vi.fn(),
      };
      stores.vault_store = {
        vault: { id: VAULT_ID, path: VAULT_PATH },
      } as unknown as VaultStore;

      const service = new LintService(
        port,
        stores.lint_store,
        stores.vault_store,
        stores.editor_store,
        stores.op_store,
        diagnostics_store as never,
      );

      await service.start(VAULT_ID, VAULT_PATH, "", false);
      await service.stop();
      await service.start(VAULT_ID, VAULT_PATH, "", false);

      if (!events_callback) throw new Error("subscribe_events was not called");
      events_callback({
        type: "diagnostics_updated",
        path: "docs/a.md",
        diagnostics: [
          {
            line: 1,
            column: 1,
            end_line: 1,
            end_column: 5,
            severity: "warning",
            message: "lint hit",
            rule_id: "MD001",
            fixable: true,
          },
        ],
      } as LintEvent);

      expect(diagnostics_store.push).toHaveBeenCalledTimes(1);
      expect(diagnostics_store.push).toHaveBeenCalledWith("lint", "docs/a.md", [
        expect.objectContaining({
          message: "lint hit",
          source: "lint",
        }),
      ]);
    });
  });
});
