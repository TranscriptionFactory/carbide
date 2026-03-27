import { describe, it, expect } from "vitest";
import {
  carbide_asset_url,
  carbide_file_asset_url,
} from "$lib/features/note/domain/asset_url";
import { as_asset_path, as_vault_id } from "$lib/shared/types/ids";

describe("carbide_asset_url", () => {
  it("encodes asset paths for custom scheme", () => {
    const vault_id = as_vault_id("vault-1");
    const asset_path = as_asset_path(".assets/folder name/image 1.png");

    const result = carbide_asset_url(vault_id, asset_path);

    expect(result).toBe(
      "carbide-asset://vault/vault-1/.assets/folder%20name/image%201.png",
    );
  });
});

describe("carbide_file_asset_url", () => {
  it("encodes absolute paths for file scheme", () => {
    const result = carbide_file_asset_url("/Users/abir/papers/paper.pdf");

    expect(result).toBe("carbide-asset://file/Users/abir/papers/paper.pdf");
  });

  it("encodes spaces in absolute paths", () => {
    const result = carbide_file_asset_url("/Users/abir/my papers/file (1).pdf");

    expect(result).toBe(
      "carbide-asset://file/Users/abir/my%20papers/file%20(1).pdf",
    );
  });
});
