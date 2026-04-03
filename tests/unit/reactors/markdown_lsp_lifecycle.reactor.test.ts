import { describe, expect, it } from "vitest";
import {
  should_rewrite_iwe_provider,
  should_start_markdown_lsp,
} from "$lib/reactors/markdown_lsp_lifecycle.reactor.svelte";

describe("markdown_lsp_lifecycle.reactor", () => {
  it("keeps startup single-flight for identical requested identities", () => {
    expect(should_start_markdown_lsp("vault:iwes:", "", "")).toBe(true);
    expect(should_start_markdown_lsp("vault:iwes:", "vault:iwes:", "")).toBe(
      false,
    );
    expect(should_start_markdown_lsp("vault:iwes:", "", "vault:iwes:")).toBe(
      false,
    );
  });

  it("only rewrites the provider after a healthy IWE startup", () => {
    expect(
      should_rewrite_iwe_provider(
        "provider-a",
        "",
        "vault:iwes::iwes",
        "running",
      ),
    ).toBe(true);
    expect(
      should_rewrite_iwe_provider(
        "provider-a",
        "",
        "vault:iwes::marksman",
        "running",
      ),
    ).toBe(false);
    expect(
      should_rewrite_iwe_provider(
        "provider-a",
        "provider-a",
        "vault:iwes::iwes",
        "running",
      ),
    ).toBe(false);
    expect(
      should_rewrite_iwe_provider("provider-a", "", "vault:iwes::iwes", "idle"),
    ).toBe(false);
  });
});
