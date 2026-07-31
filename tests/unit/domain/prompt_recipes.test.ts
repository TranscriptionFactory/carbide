import { describe, expect, it } from "vitest";
import {
  BUILTIN_INSTRUCTIONS,
  BUILTIN_QUESTIONS,
  resolve_instructions,
  to_inline_command,
} from "$lib/shared/domain/prompt_recipes";
import type { AiInlineCommand } from "$lib/shared/types/prompt_recipe";

describe("builtin recipes", () => {
  it("holds both surfaces in one registry", () => {
    expect(BUILTIN_INSTRUCTIONS.length).toBe(7);
    expect(BUILTIN_QUESTIONS.length).toBe(4);
  });

  it("exposes the four shipped question recipes", () => {
    expect(BUILTIN_QUESTIONS.map((r) => r.id)).toEqual([
      "summarize_scope",
      "extract_action_items",
      "open_questions",
      "timeline",
    ]);
  });

  it("interpolates the scope phrase into every question recipe", () => {
    for (const recipe of BUILTIN_QUESTIONS) {
      expect(recipe.build("notes tagged #research")).toContain(
        "notes tagged #research",
      );
    }
  });

  it("builds an unscoped question against the whole vault", () => {
    expect(BUILTIN_QUESTIONS[0]?.build("my vault")).toBe(
      "Summarize the key points and themes across my vault.",
    );
  });
});

describe("resolve_instructions", () => {
  it("returns all builtins when user_commands is empty", () => {
    expect(resolve_instructions([])).toEqual(BUILTIN_INSTRUCTIONS);
  });

  it("overrides a builtin instruction's fields", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "continue",
        label: "Keep going",
        description: "Custom description",
        system_prompt: "Custom prompt",
        use_selection: false,
      },
    ];
    const recipe = resolve_instructions(user_commands).find(
      (r) => r.id === "continue",
    );
    expect(recipe?.label).toBe("Keep going");
    expect(recipe?.description).toBe("Custom description");
    expect(recipe?.system_prompt).toBe("Custom prompt");
    expect(recipe?.is_builtin).toBe(true);
  });

  it("preserves is_builtin=true even when a user overrides a builtin", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "improve",
        label: "Better writing",
        description: "d",
        system_prompt: "p",
        use_selection: true,
        is_builtin: false,
      },
    ];
    const recipe = resolve_instructions(user_commands).find(
      (r) => r.id === "improve",
    );
    expect(recipe?.is_builtin).toBe(true);
  });

  it("appends custom instructions after builtins", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "my_custom",
        label: "My Custom",
        description: "Does something",
        system_prompt: "Do the thing",
        use_selection: false,
      },
    ];
    const resolved = resolve_instructions(user_commands);
    expect(resolved.length).toBe(8);
    const last = resolved[resolved.length - 1];
    expect(last?.id).toBe("my_custom");
    expect(last?.is_builtin).toBe(false);
    expect(last?.mode).toBe("instruction");
  });

  it("handles both overrides and custom instructions together", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "summarize",
        label: "TLDR",
        description: "Short version",
        system_prompt: "Summarize briefly.",
        use_selection: false,
      },
      {
        id: "rewrite_formal",
        label: "Formal rewrite",
        description: "Make it formal",
        system_prompt: "Rewrite in formal tone.",
        use_selection: true,
      },
    ];
    const resolved = resolve_instructions(user_commands);
    expect(resolved.length).toBe(8);
    expect(resolved.find((r) => r.id === "summarize")?.label).toBe("TLDR");
    expect(resolved.find((r) => r.id === "rewrite_formal")?.is_builtin).toBe(
      false,
    );
  });

  it("keeps builtin instructions in their original order", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "translate",
        label: "Translate override",
        description: "d",
        system_prompt: "p",
        use_selection: true,
      },
    ];
    const ids = resolve_instructions(user_commands).map((r) => r.id);
    expect(ids.indexOf("fix_grammar")).toBeLessThan(ids.indexOf("translate"));
  });
});

describe("to_inline_command", () => {
  it("strips the runtime discriminant before persisting", () => {
    const recipe = BUILTIN_INSTRUCTIONS[0];
    if (!recipe) throw new Error("expected a builtin instruction recipe");
    const command = to_inline_command(recipe);
    expect(command).not.toHaveProperty("mode");
    expect(command.id).toBe("continue");
    expect(command.system_prompt).toBe(recipe.system_prompt);
  });
});
