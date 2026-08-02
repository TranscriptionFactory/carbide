import { describe, expect, it } from "vitest";
import {
  BUILTIN_INSTRUCTIONS,
  BUILTIN_QUESTIONS,
  build_question,
  resolve_instructions,
  resolve_policy,
  resolve_questions,
  to_inline_command,
  to_question_recipe,
} from "$lib/shared/domain/prompt_recipes";
import type {
  AiInlineCommand,
  AiQuestionRecipe,
  InstructionRecipe,
} from "$lib/shared/types/prompt_recipe";

function instruction(
  overrides: Partial<InstructionRecipe> = {},
): InstructionRecipe {
  return {
    mode: "instruction",
    id: "fixture",
    label: "Fixture",
    description: "d",
    system_prompt: "p",
    use_selection: false,
    ...overrides,
  };
}

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
      expect(build_question(recipe, "notes tagged #research")).toContain(
        "notes tagged #research",
      );
    }
  });

  it("builds an unscoped question against the whole vault", () => {
    const recipe = BUILTIN_QUESTIONS[0];
    if (!recipe) throw new Error("expected a builtin question recipe");
    expect(build_question(recipe, "my vault")).toBe(
      "Summarize the key points and themes across my vault.",
    );
  });

  it("renders a template with no placeholder verbatim", () => {
    expect(
      build_question(
        {
          mode: "question",
          id: "no_scope",
          label: "No scope",
          template: "What did I decide?",
        },
        "my vault",
      ),
    ).toBe("What did I decide?");
  });

  it("replaces every occurrence of the scope placeholder", () => {
    expect(
      build_question(
        {
          mode: "question",
          id: "twice",
          label: "Twice",
          template: "Compare {scope} against the rest of {scope}.",
        },
        "my vault",
      ),
    ).toBe("Compare my vault against the rest of my vault.");
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

describe("resolve_questions", () => {
  it("returns all builtins when the user has overridden nothing", () => {
    expect(resolve_questions([])).toEqual(BUILTIN_QUESTIONS);
  });

  it("keeps a builtin question's id and builtin flag through an override", () => {
    const overrides: AiQuestionRecipe[] = [
      {
        id: "timeline",
        label: "Story so far",
        template: "Walk me through {scope} in order.",
      },
    ];
    const recipe = resolve_questions(overrides).find(
      (r) => r.id === "timeline",
    );
    if (!recipe) throw new Error("expected the timeline recipe to survive");
    expect(recipe.label).toBe("Story so far");
    expect(recipe.is_builtin).toBe(true);
    expect(recipe.mode).toBe("question");
    expect(build_question(recipe, "my vault")).toBe(
      "Walk me through my vault in order.",
    );
  });

  it("appends custom questions after builtins", () => {
    const resolved = resolve_questions([
      {
        id: "decisions",
        label: "Decisions",
        template: "What did {scope} decide?",
      },
    ]);
    expect(resolved.length).toBe(5);
    const last = resolved[resolved.length - 1];
    expect(last?.id).toBe("decisions");
    expect(last?.is_builtin).toBe(false);
    expect(last?.mode).toBe("question");
  });

  it("strips the runtime discriminant before persisting", () => {
    const recipe = BUILTIN_QUESTIONS[0];
    if (!recipe) throw new Error("expected a builtin question recipe");
    const stored = to_question_recipe(recipe);
    expect(stored).not.toHaveProperty("mode");
    expect(stored.template).toBe(recipe.template);
  });
});

describe("resolve_policy", () => {
  it("declares the same sources at both inline surfaces", () => {
    const recipe = instruction({ use_selection: false });
    for (const surface of ["inline_pm", "inline_cm"] as const) {
      expect(resolve_policy(recipe, surface).context_sources).toEqual([
        "selection",
        "cursor_window",
        "similar_notes",
        "backlinks",
        "outlinks",
      ]);
    }
  });

  it("offers both editor sources whether or not the recipe reads a selection", () => {
    for (const use_selection of [true, false]) {
      const sources = resolve_policy(
        instruction({ use_selection }),
        "inline_pm",
      ).context_sources;
      expect(sources).toContain("selection");
      expect(sources).toContain("cursor_window");
    }
  });

  it("takes the surface default for a free-form prompt with no recipe", () => {
    expect(resolve_policy(undefined, "chat").context_sources).toEqual([
      "pinned",
      "retrieved",
    ]);
  });

  it("resolves declared sources identically inline and in the panel", () => {
    const recipe = instruction({
      policy: { context_sources: ["selection", "active_document"] },
    });
    const inline = resolve_policy(recipe, "inline_pm");
    const panel = resolve_policy(recipe, "panel");
    expect(inline.context_sources).toEqual(panel.context_sources);
    expect(inline.context_sources).toEqual(["selection", "active_document"]);
  });

  it("merges per field, so an undeclared field still follows the surface", () => {
    const recipe = instruction({ policy: { apply_behavior: "answer_only" } });
    const policy = resolve_policy(recipe, "chat");
    expect(policy.apply_behavior).toBe("answer_only");
    expect(policy.context_sources).toEqual(["pinned", "retrieved"]);
  });

  it("leaves every builtin instruction on its surface defaults", () => {
    const expected = resolve_policy(undefined, "inline_pm");
    for (const recipe of BUILTIN_INSTRUCTIONS) {
      expect(recipe.policy).toBeUndefined();
      expect(resolve_policy(recipe, "inline_pm")).toEqual(expected);
    }
  });

  it("declares tool_policy none everywhere in this cycle", () => {
    for (const surface of [
      "inline_pm",
      "inline_cm",
      "panel",
      "chat",
    ] as const) {
      expect(resolve_policy(instruction(), surface).tool_policy).toBe("none");
    }
  });
});
