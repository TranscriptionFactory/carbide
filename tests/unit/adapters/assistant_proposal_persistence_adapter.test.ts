import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(cmd: string, args: Record<string, unknown>) => unknown>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: Record<string, unknown>) => invoke(cmd, args),
}));

const { create_assistant_proposal_persistence_tauri_adapter } =
  await import("$lib/features/assistant/adapters/assistant_proposal_persistence_tauri_adapter");

const PROPOSALS_PATH = ".carbide/assistant/proposals.json";

function fake_vault(): Map<string, string> {
  const files = new Map<string, string>();
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    const path = args.relativePath as string;
    if (cmd === "read_vault_file") {
      const content = files.get(path);
      if (content === undefined) return Promise.reject(new Error("not found"));
      return Promise.resolve(content);
    }
    if (cmd === "write_vault_file") {
      files.set(path, args.content as string);
      return Promise.resolve();
    }
    return Promise.reject(new Error(`unexpected command ${cmd}`));
  });
  return files;
}

describe("assistant proposal persistence tauri adapter", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("writes the stored value as pretty JSON to the single proposals file", async () => {
    const files = fake_vault();
    const adapter = create_assistant_proposal_persistence_tauri_adapter();

    await adapter.save_proposals("v1", { version: 1, proposals: [] });

    expect(files.get(PROPOSALS_PATH)).toBe(
      JSON.stringify({ version: 1, proposals: [] }, null, 2),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_vault_file",
      expect.objectContaining({ vaultId: "v1" }),
    );
  });

  it("round-trips the raw JSON value", async () => {
    fake_vault();
    const adapter = create_assistant_proposal_persistence_tauri_adapter();
    const value = { version: 1, saved_at: 5, proposals: [{ id: "p" }] };

    await adapter.save_proposals("v1", value);

    expect(await adapter.load_proposals("v1")).toEqual(value);
  });

  it("returns null when the file does not exist", async () => {
    fake_vault();
    const adapter = create_assistant_proposal_persistence_tauri_adapter();

    expect(await adapter.load_proposals("v1")).toBeNull();
  });

  it("returns null for a file that is not valid JSON", async () => {
    const files = fake_vault();
    files.set(PROPOSALS_PATH, "{corrupt");
    const adapter = create_assistant_proposal_persistence_tauri_adapter();

    expect(await adapter.load_proposals("v1")).toBeNull();
  });
});
