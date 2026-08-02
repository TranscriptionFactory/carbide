import { describe, expect, it } from "vitest";
import { build_ai_inline_prompt } from "$lib/features/ai/domain/ai_prompt_builder";
import { build_editor_sources } from "$lib/features/ai/domain/ai_context_sources";
import {
  BUILTIN_INSTRUCTIONS,
  resolve_policy,
} from "$lib/shared/domain/prompt_recipes";
import { assemble_context } from "$lib/features/assistant";
import type { InstructionRecipe } from "$lib/shared/types/prompt_recipe";
import type { AiVaultContext } from "$lib/features/ai/domain/ai_types";

const commands = BUILTIN_INSTRUCTIONS;

// Drives the real assembler on the way in, exactly as the inline callsites do.
function prompt(input: {
  command_id: string;
  custom_prompt?: string;
  context_text?: string;
  selection_text?: string;
  commands?: InstructionRecipe[];
  vault_context?: AiVaultContext;
}) {
  const recipe = input.commands?.find((c) => c.id === input.command_id);
  const assembly = assemble_context(
    build_editor_sources(resolve_policy(recipe, "inline_pm").context_sources, {
      ...(input.context_text === undefined
        ? {}
        : { cursor_window: input.context_text }),
      ...(input.selection_text === undefined
        ? {}
        : { selection: input.selection_text }),
      ...(input.vault_context ? { vault: input.vault_context } : {}),
    }),
    null,
  );
  return build_ai_inline_prompt({
    command_id: input.command_id,
    assembly,
    ...(input.commands ? { commands: input.commands } : {}),
    ...(input.custom_prompt === undefined
      ? {}
      : { custom_prompt: input.custom_prompt }),
  });
}

describe("build_ai_inline_prompt", () => {
  it("returns continue prompt using the cursor window", () => {
    const result = prompt({
      command_id: "continue",
      context_text: "The quick brown fox",
      commands,
    });
    expect(result.system_prompt).toContain("Continue writing naturally");
    expect(result.user_prompt).toBe("The quick brown fox");
  });

  it("returns summarize prompt using the cursor window", () => {
    const result = prompt({
      command_id: "summarize",
      context_text: "Long document text here",
      commands,
    });
    expect(result.system_prompt).toContain("concise summary");
    expect(result.user_prompt).toBe("Long document text here");
  });

  it("returns expand prompt using the cursor window", () => {
    const result = prompt({
      command_id: "expand",
      context_text: "Brief text",
      commands,
    });
    expect(result.system_prompt).toContain("Expand and elaborate");
    expect(result.user_prompt).toBe("Brief text");
  });

  it("returns improve prompt using the selection when available", () => {
    const result = prompt({
      command_id: "improve",
      context_text: "Full document",
      selection_text: "Selected passage",
      commands,
    });
    expect(result.system_prompt).toContain("Improve the clarity");
    expect(result.user_prompt).toBe("Selected passage");
  });

  it("falls back to the cursor window for selection commands without a selection", () => {
    const result = prompt({
      command_id: "improve",
      context_text: "Full document",
      commands,
    });
    expect(result.user_prompt).toBe("Full document");
  });

  it("ignores an empty selection and keeps the cursor window", () => {
    const result = prompt({
      command_id: "improve",
      context_text: "Full document",
      selection_text: "   ",
      commands,
    });
    expect(result.user_prompt).toBe("Full document");
  });

  it("returns simplify prompt using the selection", () => {
    const result = prompt({
      command_id: "simplify",
      context_text: "Full doc",
      selection_text: "Complex sentence here",
      commands,
    });
    expect(result.system_prompt).toContain("Simplify");
    expect(result.user_prompt).toBe("Complex sentence here");
  });

  it("returns fix_grammar prompt using the selection", () => {
    const result = prompt({
      command_id: "fix_grammar",
      context_text: "Full doc",
      selection_text: "Teh quck brwon fox",
      commands,
    });
    expect(result.system_prompt).toContain("Fix spelling and grammar");
    expect(result.user_prompt).toBe("Teh quck brwon fox");
  });

  it("returns translate prompt using the selection", () => {
    const result = prompt({
      command_id: "translate",
      context_text: "Full doc",
      selection_text: "Bonjour le monde",
      commands,
    });
    expect(result.system_prompt).toContain("Translate");
    expect(result.user_prompt).toBe("Bonjour le monde");
  });

  it("handles custom command with custom_prompt", () => {
    const result = prompt({
      command_id: "custom",
      custom_prompt: "Rewrite as a haiku",
      context_text: "Some text",
      selection_text: "Selected text",
      commands,
    });
    expect(result.system_prompt).toBe("Rewrite as a haiku");
    expect(result.user_prompt).toBe("Selected text");
  });

  it("handles custom command without a selection", () => {
    const result = prompt({
      command_id: "custom",
      custom_prompt: "Make it shorter",
      context_text: "Some text",
      commands,
    });
    expect(result.system_prompt).toBe("Make it shorter");
    expect(result.user_prompt).toBe("Some text");
  });

  it("handles custom command without custom_prompt", () => {
    const result = prompt({
      command_id: "custom",
      context_text: "Some text",
      commands,
    });
    expect(result.system_prompt).toBe("Follow the user's instructions.");
    expect(result.user_prompt).toBe("Some text");
  });

  it("handles unknown command with fallback prompt", () => {
    const result = prompt({
      command_id: "nonexistent",
      context_text: "Some text",
      commands,
    });
    expect(result.system_prompt).toContain("Follow the user's instructions");
    expect(result.user_prompt).toBe("Some text");
  });

  it("uses custom command from commands list", () => {
    const custom_commands: InstructionRecipe[] = [
      ...commands,
      {
        mode: "instruction",
        id: "formal",
        label: "Formal",
        description: "Rewrite formally",
        system_prompt: "Rewrite in a formal academic tone.",
        use_selection: true,
        is_builtin: false,
      },
    ];
    const result = prompt({
      command_id: "formal",
      context_text: "Hey what's up",
      selection_text: "Hey what's up",
      commands: custom_commands,
    });
    expect(result.system_prompt).toBe("Rewrite in a formal academic tone.");
    expect(result.user_prompt).toBe("Hey what's up");
  });

  it("works without a commands list", () => {
    const result = prompt({
      command_id: "nonexistent",
      context_text: "Some text",
    });
    expect(result.system_prompt).toContain("Follow the user's instructions");
    expect(result.user_prompt).toBe("Some text");
  });

  it("appends vault context sections to the system prompt", () => {
    const result = prompt({
      command_id: "continue",
      context_text: "The quick brown fox",
      commands,
      vault_context: {
        similar_notes: [
          { path: "notes/foxes.md", title: "Foxes", blurb: "About foxes" },
        ],
        backlinks: [
          { path: "notes/animals.md", title: "Animals", blurb: "Fauna index" },
        ],
        outlinks: [],
      },
    });
    expect(result.system_prompt).toContain("Continue writing naturally");
    expect(result.system_prompt).toContain(
      "Related notes from the vault are provided for additional context.",
    );
    expect(result.system_prompt).toContain("<similar_notes>");
    expect(result.system_prompt).toContain(
      "- Foxes (notes/foxes.md): About foxes",
    );
    expect(result.system_prompt).toContain("<backlinks>");
    expect(result.system_prompt).not.toContain("<outlinks>");
    expect(result.user_prompt).toBe("The quick brown fox");
  });

  it("keeps vault context out of the user prompt", () => {
    const result = prompt({
      command_id: "continue",
      context_text: "The quick brown fox",
      commands,
      vault_context: {
        similar_notes: [
          { path: "notes/foxes.md", title: "Foxes", blurb: "About foxes" },
        ],
        backlinks: [],
        outlinks: [],
      },
    });
    expect(result.user_prompt).toBe("The quick brown fox");
    expect(result.user_prompt).not.toContain("Foxes");
  });

  it("lists a note that is both a backlink and an outlink under both headings", () => {
    const both = { path: "notes/hub.md", title: "Hub", blurb: "Index" };
    const result = prompt({
      command_id: "continue",
      context_text: "Text",
      commands,
      vault_context: {
        similar_notes: [],
        backlinks: [both],
        outlinks: [both],
      },
    });
    expect(result.system_prompt).toContain("<backlinks>");
    expect(result.system_prompt).toContain("<outlinks>");
    expect(
      result.system_prompt.match(/- Hub \(notes\/hub\.md\): Index/g)?.length,
    ).toBe(2);
  });

  it("keeps vault notes in the order their port returned them", () => {
    const result = prompt({
      command_id: "continue",
      context_text: "Text",
      commands,
      vault_context: {
        similar_notes: [
          { path: "notes/z.md", title: "Zeta", blurb: "closest" },
          { path: "notes/a.md", title: "Alpha", blurb: "further" },
        ],
        backlinks: [],
        outlinks: [],
      },
    });
    expect(result.system_prompt.indexOf("Zeta")).toBeLessThan(
      result.system_prompt.indexOf("Alpha"),
    );
  });

  it("appends vault context to custom command prompts", () => {
    const result = prompt({
      command_id: "custom",
      custom_prompt: "Rewrite as a haiku",
      context_text: "Some text",
      vault_context: {
        similar_notes: [
          { path: "notes/poetry.md", title: "Poetry", blurb: "Haiku forms" },
        ],
        backlinks: [],
        outlinks: [],
      },
    });
    expect(result.system_prompt).toContain("Rewrite as a haiku");
    expect(result.system_prompt).toContain("<similar_notes>");
  });

  it("leaves the system prompt unchanged for empty vault context", () => {
    const with_empty = prompt({
      command_id: "continue",
      context_text: "Text",
      commands,
      vault_context: { similar_notes: [], backlinks: [], outlinks: [] },
    });
    const without = prompt({
      command_id: "continue",
      context_text: "Text",
      commands,
    });
    expect(with_empty.system_prompt).toBe(without.system_prompt);
  });

  it("drops a vault note with an empty blurb rather than emitting a bare bullet", () => {
    const result = prompt({
      command_id: "continue",
      context_text: "Text",
      commands,
      vault_context: {
        similar_notes: [
          { path: "notes/empty.md", title: "Empty", blurb: "" },
          { path: "notes/full.md", title: "Full", blurb: "has text" },
        ],
        backlinks: [],
        outlinks: [],
      },
    });
    expect(result.system_prompt).not.toContain("Empty");
    expect(result.system_prompt).toContain("- Full (notes/full.md): has text");
  });
});
