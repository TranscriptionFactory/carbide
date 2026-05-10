import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { external_mcp_tauri_adapter } from "$lib/features/plugin/adapters/external_mcp_tauri_adapter";

const mock_invoke = vi.mocked(invoke);

describe("external_mcp_tauri_adapter", () => {
  beforeEach(() => {
    mock_invoke.mockReset();
  });

  describe("start", () => {
    it("invokes external_mcp_start with correct args", async () => {
      mock_invoke.mockResolvedValue(undefined);

      await external_mcp_tauri_adapter.start(
        "srv-1",
        "/usr/bin/mcp-tool",
        ["serve", "--port", "8080"],
        { API_KEY: "secret" },
        "/home/user/vault",
      );

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_start", {
        serverId: "srv-1",
        binary: "/usr/bin/mcp-tool",
        args: ["serve", "--port", "8080"],
        envVars: { API_KEY: "secret" },
        workingDir: "/home/user/vault",
      });
    });

    it("sends null for missing working_dir", async () => {
      mock_invoke.mockResolvedValue(undefined);

      await external_mcp_tauri_adapter.start("srv", "/bin/tool", [], {});

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_start", {
        serverId: "srv",
        binary: "/bin/tool",
        args: [],
        envVars: {},
        workingDir: null,
      });
    });
  });

  describe("stop", () => {
    it("invokes external_mcp_stop", async () => {
      mock_invoke.mockResolvedValue(undefined);

      await external_mcp_tauri_adapter.stop("srv-1");

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_stop", {
        serverId: "srv-1",
      });
    });
  });

  describe("call_tool", () => {
    it("invokes external_mcp_call_tool with arguments", async () => {
      mock_invoke.mockResolvedValue({
        content: [{ type: "text", text: "result" }],
      });

      const result = await external_mcp_tauri_adapter.call_tool(
        "srv-1",
        "compile",
        { output: "wiki/" },
      );

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_call_tool", {
        serverId: "srv-1",
        toolName: "compile",
        arguments: { output: "wiki/" },
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "result" }],
      });
    });

    it("sends null for missing arguments", async () => {
      mock_invoke.mockResolvedValue({ content: [] });

      await external_mcp_tauri_adapter.call_tool("srv-1", "status");

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_call_tool", {
        serverId: "srv-1",
        toolName: "status",
        arguments: null,
      });
    });
  });

  describe("status", () => {
    it("invokes external_mcp_status and returns result", async () => {
      mock_invoke.mockResolvedValue({
        status: "running",
        tool_count: 7,
      });

      const result = await external_mcp_tauri_adapter.status("srv-1");

      expect(mock_invoke).toHaveBeenCalledWith("external_mcp_status", {
        serverId: "srv-1",
      });
      expect(result).toEqual({ status: "running", tool_count: 7 });
    });
  });
});
