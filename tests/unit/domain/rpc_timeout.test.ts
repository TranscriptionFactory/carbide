import { describe, expect, it } from "vitest";
import {
  RpcTimeoutError,
  get_rpc_timeout,
  with_timeout,
} from "$lib/features/plugin/domain/rpc_timeout";

describe("get_rpc_timeout", () => {
  it("returns 30s for vault methods", () => {
    expect(get_rpc_timeout("vault.read")).toBe(30_000);
    expect(get_rpc_timeout("vault.create")).toBe(30_000);
    expect(get_rpc_timeout("vault.modify")).toBe(30_000);
    expect(get_rpc_timeout("vault.delete")).toBe(30_000);
    expect(get_rpc_timeout("vault.list")).toBe(30_000);
  });

  it("returns 5s for non-vault methods", () => {
    expect(get_rpc_timeout("editor.get_value")).toBe(5_000);
    expect(get_rpc_timeout("commands.register")).toBe(5_000);
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
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(with_timeout(slow, "test.method", 50)).rejects.toThrow(
      RpcTimeoutError,
    );
  });

  it("includes method and timeout_ms in error", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await with_timeout(slow, "vault.read", 10);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RpcTimeoutError);
      const err = e as RpcTimeoutError;
      expect(err.method).toBe("vault.read");
      expect(err.timeout_ms).toBe(10);
    }
  });

  it("propagates original error when promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("original"));
    await expect(with_timeout(failing, "test.method", 1000)).rejects.toThrow(
      "original",
    );
  });

  it("uses default timeout from get_rpc_timeout when not specified", async () => {
    const fast = Promise.resolve(42);
    const result = await with_timeout(fast, "editor.get_value");
    expect(result).toBe(42);
  });
});
