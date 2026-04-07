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
    setup_claude_desktop: vi.fn().mockResolvedValue({
      success: true,
      path: "/tmp/config.json",
      message: "Configured",
    }),
    setup_claude_code: vi.fn().mockResolvedValue({
      success: true,
      path: "/tmp/.mcp.json",
      message: "Configured",
    }),
    regenerate_token: vi.fn().mockResolvedValue("new_token_abc"),
    get_setup_status: vi.fn().mockResolvedValue({
      claudeDesktopConfigured: false,
      claudeCodeConfigured: false,
      httpPort: 3457,
      tokenExists: true,
      cliInstalled: false,
    }),
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

  it("setup_claude_desktop returns result and refreshes setup status", async () => {
    const store = new McpStore();
    const port = create_mock_port();
    const service = new McpService(port, store);

    const result = await service.setup_claude_desktop();

    expect(result.success).toBe(true);
    expect(result.path).toBe("/tmp/config.json");
    expect(port.setup_claude_desktop).toHaveBeenCalledOnce();
    expect(port.get_setup_status).toHaveBeenCalledOnce();
  });

  it("setup_claude_code passes vault_id and refreshes setup status", async () => {
    const store = new McpStore();
    const port = create_mock_port();
    const service = new McpService(port, store);

    const result = await service.setup_claude_code("vault-123");

    expect(result.success).toBe(true);
    expect(port.setup_claude_code).toHaveBeenCalledWith("vault-123");
    expect(port.get_setup_status).toHaveBeenCalledOnce();
  });

  it("regenerate_token delegates to port", async () => {
    const store = new McpStore();
    const port = create_mock_port();
    const service = new McpService(port, store);

    const token = await service.regenerate_token();

    expect(token).toBe("new_token_abc");
    expect(port.regenerate_token).toHaveBeenCalledOnce();
  });

  it("refresh_setup_status updates store with status", async () => {
    const store = new McpStore();
    const port = create_mock_port({
      get_setup_status: vi.fn().mockResolvedValue({
        claudeDesktopConfigured: true,
        claudeCodeConfigured: false,
        httpPort: 3457,
        tokenExists: true,
        cliInstalled: false,
      }),
    });
    const service = new McpService(port, store);

    await service.refresh_setup_status();

    expect(store.setup_status).toEqual({
      claudeDesktopConfigured: true,
      claudeCodeConfigured: false,
      httpPort: 3457,
      tokenExists: true,
      cliInstalled: false,
    });
  });

  it("refresh_setup_status silently handles failure", async () => {
    const store = new McpStore();
    const port = create_mock_port({
      get_setup_status: vi.fn().mockRejectedValue(new Error("fail")),
    });
    const service = new McpService(port, store);

    await service.refresh_setup_status();

    expect(store.setup_status).toBeNull();
  });
});
