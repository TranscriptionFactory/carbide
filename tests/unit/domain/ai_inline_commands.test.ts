import { describe, expect, it } from "vitest";
import {
  BUILTIN_INLINE_COMMANDS,
  resolve_inline_commands,
  type AiInlineCommand,
} from "$lib/features/ai/domain/ai_inline_commands";

describe("resolve_inline_commands", () => {
  it("returns all builtins when user_commands is empty", () => {
    const result = resolve_inline_commands([]);
    expect(result).toEqual(BUILTIN_INLINE_COMMANDS);
    expect(result.length).toBe(7);
  });

  it("overrides a builtin command's fields", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "continue",
        label: "Keep going",
        description: "Custom description",
        system_prompt: "Custom prompt",
        use_selection: false,
      },
    ];
    const result = resolve_inline_commands(user_commands);
    const cmd = result.find((c) => c.id === "continue")!;
    expect(cmd.label).toBe("Keep going");
    expect(cmd.description).toBe("Custom description");
    expect(cmd.system_prompt).toBe("Custom prompt");
    expect(cmd.is_builtin).toBe(true);
  });

  it("preserves is_builtin=true even when user overrides a builtin", () => {
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
    const result = resolve_inline_commands(user_commands);
    const cmd = result.find((c) => c.id === "improve")!;
    expect(cmd.is_builtin).toBe(true);
  });

  it("appends custom (non-builtin) commands after builtins", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "my_custom",
        label: "My Custom",
        description: "Does something",
        system_prompt: "Do the thing",
        use_selection: false,
      },
    ];
    const result = resolve_inline_commands(user_commands);
    expect(result.length).toBe(8);
    const last = result[result.length - 1]!;
    expect(last.id).toBe("my_custom");
    expect(last.is_builtin).toBe(false);
  });

  it("handles both overrides and custom commands together", () => {
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
    const result = resolve_inline_commands(user_commands);
    expect(result.length).toBe(8);
    expect(result.find((c) => c.id === "summarize")!.label).toBe("TLDR");
    expect(result.find((c) => c.id === "rewrite_formal")!.is_builtin).toBe(
      false,
    );
  });

  it("builtins retain their original order", () => {
    const user_commands: AiInlineCommand[] = [
      {
        id: "translate",
        label: "Translate override",
        description: "d",
        system_prompt: "p",
        use_selection: true,
      },
    ];
    const result = resolve_inline_commands(user_commands);
    const ids = result.map((c) => c.id);
    const translate_idx = ids.indexOf("translate");
    const fix_grammar_idx = ids.indexOf("fix_grammar");
    expect(fix_grammar_idx).toBeLessThan(translate_idx);
  });
});
