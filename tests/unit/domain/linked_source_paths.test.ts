import { describe, expect, it } from "vitest";
import {
  compute_vault_relative_path,
  compute_home_relative_path,
  resolve_linked_path,
  enrich_meta_with_paths,
} from "$lib/features/reference/domain/linked_source_paths";

describe("compute_vault_relative_path", () => {
  it("returns relative path for file in sibling directory", () => {
    expect(
      compute_vault_relative_path(
        "/Users/abir/projects/2_LINKED_SOURCES/paper.pdf",
        "/Users/abir/projects/1_VAULT",
      ),
    ).toBe("../2_LINKED_SOURCES/paper.pdf");
  });

  it("returns relative path for file inside vault", () => {
    expect(
      compute_vault_relative_path(
        "/Users/abir/vault/attachments/fig.png",
        "/Users/abir/vault",
      ),
    ).toBe("attachments/fig.png");
  });

  it("returns undefined for empty file_path", () => {
    expect(
      compute_vault_relative_path("", "/Users/abir/vault"),
    ).toBeUndefined();
  });

  it("returns undefined for empty vault_root", () => {
    expect(compute_vault_relative_path("/some/file.pdf", "")).toBeUndefined();
  });
});

describe("compute_home_relative_path", () => {
  it("replaces home dir prefix with ~", () => {
    expect(
      compute_home_relative_path(
        "/Users/abir/Library/Mobile Documents/paper.pdf",
        "/Users/abir",
      ),
    ).toBe("~/Library/Mobile Documents/paper.pdf");
  });

  it("handles home dir with trailing slash", () => {
    expect(
      compute_home_relative_path("/Users/abir/docs/file.pdf", "/Users/abir/"),
    ).toBe("~/docs/file.pdf");
  });

  it("returns undefined for file outside home dir", () => {
    expect(
      compute_home_relative_path("/tmp/file.pdf", "/Users/abir"),
    ).toBeUndefined();
  });

  it("returns undefined for empty inputs", () => {
    expect(compute_home_relative_path("", "/Users/abir")).toBeUndefined();
    expect(compute_home_relative_path("/some/file.pdf", "")).toBeUndefined();
  });
});

describe("resolve_linked_path", () => {
  const vault_root = "/Users/bob/projects/vault";
  const home_dir = "/Users/bob";

  it("returns absolute path when present", () => {
    expect(
      resolve_linked_path(
        { external_file_path: "/Users/abir/papers/paper.pdf" },
        vault_root,
        home_dir,
      ),
    ).toBe("/Users/abir/papers/paper.pdf");
  });

  it("resolves vault_relative_path when absolute is missing", () => {
    expect(
      resolve_linked_path(
        {
          vault_relative_path: "../linked/paper.pdf",
        },
        vault_root,
        home_dir,
      ),
    ).toBe("/Users/bob/projects/linked/paper.pdf");
  });

  it("resolves home_relative_path when absolute and vault-relative are missing", () => {
    expect(
      resolve_linked_path(
        {
          home_relative_path: "~/Library/papers/paper.pdf",
        },
        vault_root,
        home_dir,
      ),
    ).toBe("/Users/bob/Library/papers/paper.pdf");
  });

  it("returns null when all paths are missing", () => {
    expect(resolve_linked_path({}, vault_root, home_dir)).toBeNull();
  });

  it("prefers absolute over vault-relative", () => {
    expect(
      resolve_linked_path(
        {
          external_file_path: "/absolute/path.pdf",
          vault_relative_path: "../other/path.pdf",
        },
        vault_root,
        home_dir,
      ),
    ).toBe("/absolute/path.pdf");
  });

  it("prefers vault-relative over home-relative", () => {
    expect(
      resolve_linked_path(
        {
          vault_relative_path: "../linked/paper.pdf",
          home_relative_path: "~/Library/paper.pdf",
        },
        vault_root,
        home_dir,
      ),
    ).toBe("/Users/bob/projects/linked/paper.pdf");
  });
});

describe("enrich_meta_with_paths", () => {
  it("adds both relative paths when file is under home and resolvable from vault", () => {
    const meta = enrich_meta_with_paths(
      { external_file_path: "/Users/abir/projects/linked/paper.pdf" },
      "/Users/abir/projects/vault",
      "/Users/abir",
    );
    expect(meta.vault_relative_path).toBe("../linked/paper.pdf");
    expect(meta.home_relative_path).toBe("~/projects/linked/paper.pdf");
    expect(meta.external_file_path).toBe(
      "/Users/abir/projects/linked/paper.pdf",
    );
  });

  it("returns meta unchanged when external_file_path is absent", () => {
    const original = { citekey: "smith2024" };
    const result = enrich_meta_with_paths(original, "/vault", "/home");
    expect(result).toBe(original);
  });

  it("sets home_relative_path to undefined when file is outside home", () => {
    const meta = enrich_meta_with_paths(
      { external_file_path: "/tmp/paper.pdf" },
      "/Users/abir/vault",
      "/Users/abir",
    );
    expect(meta.vault_relative_path).toBe("../../../tmp/paper.pdf");
    expect(meta.home_relative_path).toBeUndefined();
  });
});
