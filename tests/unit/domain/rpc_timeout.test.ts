import { describe, expect, it } from "vitest";
import {
  with_timeout,
  get_rpc_timeout,
  RpcTimeoutError,
} from "$lib/features/plugin/domain/rpc_timeout";

describe("get_rpc_timeout", () => {
  it("returns 30s for fs operations", () => {
    expect(get_rpc_timeout("vault.read")).toBe(30_000);
    expect(get_rpc_timeout("vault.create")).toBe(30_000);
    expect(get_rpc_timeout("vault.modify")).toBe(30_000);
    expect(get_rpc_timeout("vault.delete")).toBe(30_000);
    expect(get_rpc_timeout("vault.list")).toBe(30_000);
  });

  it("returns 5s for non-fs operations", () => {
    expect(get_rpc_timeout("editor.get_value")).toBe(5_000);
    expect(get_rpc_timeout("commands.register")).toBe(5_000);
    expect(get_rpc_timeout("ui.add_statusbar_item")).toBe(5_000);
    expect(get_rpc_timeout("search.fts")).toBe(5_000);
  });
});

describe("with_timeout", () => {
  it("resolves when promise resolves before timeout", async () => {
    const result = await with_timeout(
      Promise.resolve("ok"),
      "test.method",
      100,
    );
    expect(result).toBe("ok");
  });

  it("rejects with RpcTimeoutError when promise exceeds timeout", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(with_timeout(slow, "test.method", 10)).rejects.toThrow(
      RpcTimeoutError,
    );
  });

  it("includes method name and timeout in error message", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await with_timeout(slow, "editor.get_value", 10);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RpcTimeoutError);
      const err = e as RpcTimeoutError;
      expect(err.method).toBe("editor.get_value");
      expect(err.timeout_ms).toBe(10);
      expect(err.message).toContain("editor.get_value");
      expect(err.message).toContain("10ms");
    }
  });

  it("uses default timeout from get_rpc_timeout when not specified", async () => {
    const result = await with_timeout(Promise.resolve(42), "vault.read");
    expect(result).toBe(42);
  });
});
