import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SETTINGS_REGISTRY } from "$lib/features/settings/domain/settings_catalog";
import { SearchService } from "$lib/features/search/application/search_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OmnibarItem } from "$lib/shared/types/search";
import { create_mock_search_port } from "../../helpers/mock_ports";

const ARGS_PLACEHOLDER = "{model} or -p {prompt} or {output_file}";

const DIALOG = readFileSync(
  new URL(
    "../../../../src/lib/features/settings/ui/settings_dialog.svelte",
    import.meta.url,
  ),
  "utf-8",
);

const DOC = readFileSync(
  new URL("../../../../docs/ai_and_chat.md", import.meta.url),
  "utf-8",
);

const collapse = (text: string) => text.replace(/\s+/g, " ");

const providers_entry = SETTINGS_REGISTRY.find(
  (entry) => entry.key === "ai_providers",
);

const settings_hits = (query: string): string[] =>
  new SearchService(
    create_mock_search_port(),
    new VaultStore(),
    new OpStore(),
    () => 0,
  )
    .search_settings(query)
    .filter(
      (item): item is Extract<OmnibarItem, { kind: "setting" }> =>
        item.kind === "setting",
    )
    .map((item) => item.setting.key);

describe("AI Providers settings entry", () => {
  it("names every token Carbide substitutes into CLI args", () => {
    expect(providers_entry?.description).toContain("{model}");
    expect(providers_entry?.description).toContain("{prompt}");
    expect(providers_entry?.description).toContain("{output_file}");
  });

  it("states that omitting {prompt} sends the prompt on stdin", () => {
    expect(providers_entry?.description).toMatch(
      /omit \{prompt\}[^.]*\bstdin\b/i,
    );
  });

  it("is reachable by searching settings for a token name", () => {
    for (const query of ["prompt", "output_file", "stdin"]) {
      expect(settings_hits(query)).toContain("ai_providers");
    }
  });
});

describe("Providers section in the settings dialog", () => {
  it("renders the same token guidance as the settings search entry", () => {
    expect(collapse(DIALOG)).toContain(
      collapse(`Args accept {"{model}"}, {"{prompt}"} and {"{output_file}"};
        omit {"{prompt}"} and Carbide sends the prompt on stdin instead.`),
    );
  });

  it("hints the tokens on both the edit and the add provider form", () => {
    const hint = `placeholder={"${ARGS_PLACEHOLDER}"}`;

    expect(DIALOG.split(hint).length - 1).toBe(2);
  });

  it("no longer ships the add form's model-only hint", () => {
    expect(DIALOG).not.toContain(`placeholder="chat `);
  });
});

describe("docs/ai_and_chat.md placeholder reference", () => {
  it("documents each substituted token", () => {
    expect(DOC).toContain("### Placeholders in CLI args");
    expect(DOC).toContain("`{model}`");
    expect(DOC).toContain("`{prompt}`");
    expect(DOC).toContain("`{output_file}`");
  });

  it("explains the two tokens whose presence changes behaviour", () => {
    expect(DOC).toMatch(/Omitting `\{prompt\}`[^.]*stdin/);
    expect(DOC).toMatch(/`\{output_file\}`[^.]*IWE transforms/);
  });

  it("attributes the double-braced {{context}} to IWE, not Carbide", () => {
    expect(DOC).toMatch(/`\{\{context\}\}`[\s\S]{0,160}\*\*IWE's\*\* token/);
  });
});
