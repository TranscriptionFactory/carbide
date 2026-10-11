import { describe, expect, it, vi } from "vitest";
import { create_embed_path_resolver } from "$lib/features/editor/extensions/embed_extension";
import { resolve_wiki_file_target } from "$lib/features/editor/domain/wiki_link_resolution";
import type { VaultId } from "$lib/shared/types/ids";

const VAULT_PATHS = ["notes/chart.html", "notes/my chart.html"];

function create_resolver(vault_id: VaultId | null = "vault-1" as VaultId) {
  const resolve_vault_file_path = vi.fn((_vault_id: VaultId, target: string) =>
    Promise.resolve(resolve_wiki_file_target(target, VAULT_PATHS) ?? null),
  );
  const resolve = create_embed_path_resolver({
    get_vault_id: () => vault_id,
    resolve_vault_file_path,
  });
  return { resolve, resolve_vault_file_path };
}

describe("create_embed_path_resolver", () => {
  it("resolves a bare embed link and its vault path to the same trust key", async () => {
    const { resolve } = create_resolver();

    expect(await resolve("chart.html")).toBe("notes/chart.html");
    expect(await resolve("notes/chart.html")).toBe("notes/chart.html");
  });

  it("decodes percent-encoded links before resolving", async () => {
    const { resolve } = create_resolver();

    expect(await resolve("my%20chart.html")).toBe("notes/my chart.html");
  });

  it("returns null when a vault-relative link has no match", async () => {
    const { resolve } = create_resolver();

    expect(await resolve("missing.html")).toBeNull();
    expect(await resolve("notes/missing.html")).toBeNull();
  });

  it("leaves absolute and linked-source paths unresolved", async () => {
    const { resolve, resolve_vault_file_path } = create_resolver();

    expect(await resolve("/abs/chart.html")).toBe("/abs/chart.html");
    expect(await resolve("@linked/src/chart.html")).toBe(
      "@linked/src/chart.html",
    );
    expect(resolve_vault_file_path).not.toHaveBeenCalled();
  });

  it("skips resolution without an open vault", async () => {
    const { resolve, resolve_vault_file_path } = create_resolver(null);

    expect(await resolve("chart.html")).toBe("chart.html");
    expect(resolve_vault_file_path).not.toHaveBeenCalled();
  });
});
