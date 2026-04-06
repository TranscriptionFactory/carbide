import { describe, expect, it } from "vitest";
import {
  rule_chip_label,
  rule_chip_title,
  format_rule_name,
} from "$lib/features/smart_links/domain/format_rule";

describe("rule_chip_label", () => {
  it("returns short label for known rule IDs", () => {
    expect(rule_chip_label("same_day")).toBe("day");
    expect(rule_chip_label("shared_tag")).toBe("tag");
    expect(rule_chip_label("shared_property")).toBe("prop");
    expect(rule_chip_label("semantic_similarity")).toBe("semantic");
    expect(rule_chip_label("title_overlap")).toBe("title");
    expect(rule_chip_label("shared_outlinks")).toBe("links");
  });

  it("returns raw ID for unknown rule IDs", () => {
    expect(rule_chip_label("custom_rule")).toBe("custom_rule");
    expect(rule_chip_label("")).toBe("");
  });
});

describe("format_rule_name", () => {
  it("converts snake_case to Title Case", () => {
    expect(format_rule_name("same_day")).toBe("Same Day");
    expect(format_rule_name("shared_tag")).toBe("Shared Tag");
    expect(format_rule_name("semantic_similarity")).toBe("Semantic Similarity");
  });

  it("capitalizes single word", () => {
    expect(format_rule_name("metadata")).toBe("Metadata");
  });

  it("handles empty string", () => {
    expect(format_rule_name("")).toBe("");
  });
});

describe("rule_chip_title", () => {
  it("formats known rule with score percentage", () => {
    expect(rule_chip_title({ ruleId: "same_day", rawScore: 0.75 })).toBe(
      "day (75%)",
    );
  });

  it("formats unknown rule with raw ID", () => {
    expect(rule_chip_title({ ruleId: "custom_rule", rawScore: 0.5 })).toBe(
      "custom_rule (50%)",
    );
  });

  it("rounds score correctly", () => {
    expect(rule_chip_title({ ruleId: "shared_tag", rawScore: 0.333 })).toBe(
      "tag (33%)",
    );
    expect(rule_chip_title({ ruleId: "shared_tag", rawScore: 0.999 })).toBe(
      "tag (100%)",
    );
  });
});
