import { describe, expect, it } from "vitest";
import { should_start_markdown_lsp } from "$lib/reactors/markdown_lsp_lifecycle.reactor.svelte";

describe("markdown_lsp_lifecycle.reactor", () => {
  it("keeps startup single-flight for identical requested identities", () => {
    expect(should_start_markdown_lsp("vault:iwes:", "", "", false)).toBe(true);
    expect(
      should_start_markdown_lsp("vault:iwes:", "vault:iwes:", "", false),
    ).toBe(false);
    expect(
      should_start_markdown_lsp("vault:iwes:", "", "vault:iwes:", false),
    ).toBe(false);
  });

  it("defers IWE startup until a markdown note is open", () => {
    expect(should_start_markdown_lsp("vault:iwes:", "", "", true)).toBe(false);
  });
});
