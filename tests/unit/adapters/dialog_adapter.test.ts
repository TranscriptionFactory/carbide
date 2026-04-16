import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("$lib/shared/utils/detect_platform", () => ({
  is_mobile_tauri: false,
}));

import { open } from "@tauri-apps/plugin-dialog";
import * as detect_platform from "$lib/shared/utils/detect_platform";
import { choose_vault_directory } from "$lib/features/vault/adapters/dialog_adapter";

const mock_open = vi.mocked(open);

describe("dialog_adapter", () => {
  beforeEach(() => {
    mock_open.mockReset();
    vi.mocked(detect_platform).is_mobile_tauri = false;
  });

  it("opens the desktop directory picker", async () => {
    mock_open.mockResolvedValueOnce("/tmp/vault");

    await expect(choose_vault_directory()).resolves.toBe("/tmp/vault");
    expect(mock_open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
  });

  it("fails fast on mobile without calling the dialog plugin", async () => {
    vi.mocked(detect_platform).is_mobile_tauri = true;

    await expect(choose_vault_directory()).rejects.toThrow(
      "Folder picker is not available on mobile yet.",
    );
    expect(mock_open).not.toHaveBeenCalled();
  });
});
