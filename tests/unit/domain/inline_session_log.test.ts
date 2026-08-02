import { describe, expect, it } from "vitest";
import {
  build_inline_messages,
  derive_inline_title,
  describe_inline_request,
} from "$lib/features/ai/domain/inline_session_log";
import type { InstructionRecipe } from "$lib/shared/types/prompt_recipe";

const commands: InstructionRecipe[] = [
  {
    mode: "instruction",
    id: "continue",
    label: "Continue writing",
    description: "Keep going",
    system_prompt: "continue",
    use_selection: false,
  },
  {
    mode: "instruction",
    id: "shorten",
    label: "Make shorter",
    description: "Trim it",
    system_prompt: "shorten",
    use_selection: true,
  },
];

describe("describe_inline_request", () => {
  it("prefers the user's own prompt", () => {
    expect(
      describe_inline_request({ prompt: "  rewrite as a list  " }, commands),
    ).toBe("rewrite as a list");
  });

  it("falls back to the command label when there is no prompt", () => {
    expect(describe_inline_request({ command_id: "shorten" }, commands)).toBe(
      "Make shorter",
    );
  });

  it("treats an empty payload as the default continue command", () => {
    expect(describe_inline_request(undefined, commands)).toBe(
      "Continue writing",
    );
  });

  it("falls back to the raw id for a command it cannot resolve", () => {
    expect(describe_inline_request({ command_id: "ghost" }, commands)).toBe(
      "ghost",
    );
  });

  it("ignores a whitespace-only prompt", () => {
    expect(describe_inline_request({ prompt: "   " }, commands)).toBe(
      "Continue writing",
    );
  });
});

describe("derive_inline_title", () => {
  it("collapses whitespace", () => {
    expect(derive_inline_title("rewrite\n  this   line")).toBe(
      "rewrite this line",
    );
  });

  it("truncates a long prompt with an ellipsis", () => {
    const title = derive_inline_title("x".repeat(200));
    expect(title).toHaveLength(61);
    expect(title.endsWith("…")).toBe(true);
  });

  it("names an empty prompt rather than producing a blank title", () => {
    expect(derive_inline_title("   ")).toBe("Inline edit");
  });
});

describe("build_inline_messages", () => {
  it("pairs the prompt and the result as user then assistant", () => {
    const [user, assistant] = build_inline_messages("shorten this", "Short.");

    expect(user).toMatchObject({ role: "user", content: "shorten this" });
    expect(assistant).toMatchObject({ role: "assistant", content: "Short." });
  });

  it("gives each message a distinct id", () => {
    const [user, assistant] = build_inline_messages("a", "b");

    expect(user?.id).not.toBe(assistant?.id);
  });
});
