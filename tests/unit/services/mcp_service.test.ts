import { describe, expect, it, vi } from "vitest";
import { McpService } from "$lib/features/mcp";
import { McpStore } from "$lib/features/mcp";
import type { McpPort, McpStatusInfo } from "$lib/features/mcp";

function create_mock_port(overrides?: Partial<McpPort>): McpPort {
  return {
    start: vi.fn().mockResolvedValue({ status: "running", transport: "stdio" }),
    stop: vi.fn().mockResolvedValue(undefined),
    get_status: vi
      .fn()
      .mockResolvedValue({ status: "stopped", transport: null }),
    ...overrides,
  };
}

describe("McpService", () => {
  it("start updates store to running", async () => {
    const store = new McpStore();
    const port = create_mock_port();
    const service = new McpService(port, store);

    await service.start();

    expect(store.status).toBe("running");
    expect(store.transport).toBe("stdio");
    expect(port.start).toHaveBeenCalledOnce();
  });

  it("stop resets store", async () => {
    const store = new McpStore();
    const port = create_mock_port();
    const service = new McpService(port, store);

    await service.start();
    await service.stop();

    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
    expect(port.stop).toHaveBeenCalledOnce();
  });

  it("start handles port failure gracefully", async () => {
    const store = new McpStore();
    const port = create_mock_port({
      start: vi.fn().mockRejectedValue(new Error("failed")),
    });
    const service = new McpService(port, store);

    await service.start();

    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
  });

  it("stop resets store even when port throws", async () => {
    const store = new McpStore();
    const port = create_mock_port({
      stop: vi.fn().mockRejectedValue(new Error("failed")),
    });
    const service = new McpService(port, store);

    store.set_status({ status: "running", transport: "stdio" });
    await service.stop();

    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
  });

  it("refresh_status updates store from port", async () => {
    const info: McpStatusInfo = { status: "running", transport: "stdio" };
    const store = new McpStore();
    const port = create_mock_port({
      get_status: vi.fn().mockResolvedValue(info),
    });
    const service = new McpService(port, store);

    await service.refresh_status();

    expect(store.status).toBe("running");
    expect(store.transport).toBe("stdio");
  });

  it("refresh_status resets store on failure", async () => {
    const store = new McpStore();
    store.set_status({ status: "running", transport: "stdio" });
    const port = create_mock_port({
      get_status: vi.fn().mockRejectedValue(new Error("failed")),
    });
    const service = new McpService(port, store);

    await service.refresh_status();

    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
  });
});
