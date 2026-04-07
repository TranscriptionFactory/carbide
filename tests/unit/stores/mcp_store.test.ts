import { describe, expect, it } from "vitest";
import { McpStore } from "$lib/features/mcp";

describe("McpStore", () => {
  it("starts with stopped status", () => {
    const store = new McpStore();
    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
    expect(store.is_running).toBe(false);
  });

  it("set_status updates status and transport", () => {
    const store = new McpStore();
    store.set_status({ status: "running", transport: "stdio" });
    expect(store.status).toBe("running");
    expect(store.transport).toBe("stdio");
    expect(store.is_running).toBe(true);
  });

  it("reset clears to stopped state", () => {
    const store = new McpStore();
    store.set_status({ status: "running", transport: "stdio" });
    store.reset();
    expect(store.status).toBe("stopped");
    expect(store.transport).toBeNull();
    expect(store.is_running).toBe(false);
  });

  it("starts with null setup_status", () => {
    const store = new McpStore();
    expect(store.setup_status).toBeNull();
  });

  it("set_setup_status stores the status", () => {
    const store = new McpStore();
    const status = {
      claudeDesktopConfigured: true,
      claudeCodeConfigured: false,
      httpPort: 3457,
      tokenExists: true,
      cliInstalled: false,
    };
    store.set_setup_status(status);
    expect(store.setup_status).toEqual(status);
  });
});
