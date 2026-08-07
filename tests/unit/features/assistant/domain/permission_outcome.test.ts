import { describe, expect, it } from "vitest";
import {
  classify_outcome,
  outcome_line,
  select_permission_options,
  type PermissionOutcomeClass,
} from "$lib/features/assistant/domain/permission_outcome";
import type { PermissionOptionSpec } from "$lib/features/assistant/types/agent_events";

function option(
  option_id: string,
  kind: PermissionOptionSpec["kind"],
  label = option_id,
): PermissionOptionSpec {
  return { option_id, label, kind };
}

describe("classify_outcome", () => {
  const table: Array<[string, PermissionOutcomeClass]> = [
    ["selected:allow_once", "approved"],
    ["selected:allow_always", "approved"],
    ["selected:allow", "approved"],
    ["selected:reject_once", "denied"],
    ["selected:reject_always", "denied"],
    ["selected:reject", "denied"],
    ["cancelled", "dismissed"],
    ["timeout", "dismissed"],
    ["", "dismissed"],
    ["selected:proceed", "dismissed"],
    ["allow_once", "dismissed"],
    ["ALLOW", "dismissed"],
  ];

  for (const [outcome, expected] of table) {
    it(`classifies ${JSON.stringify(outcome)} as ${expected}`, () => {
      expect(classify_outcome(outcome)).toBe(expected);
    });
  }

  it("never reads an outcome outside the grant prefix as approval", () => {
    for (const outcome of [
      "selected:unknown_kind",
      "denied_by_policy",
      "approved",
      "ok",
      "selected:",
    ]) {
      expect(classify_outcome(outcome)).not.toBe("approved");
    }
  });
});

describe("outcome_line", () => {
  const table: Array<[string, boolean, string]> = [
    ["selected:allow_once", false, "Allowed"],
    ["selected:allow_once", true, "Allowed automatically"],
    ["selected:allow_always", false, "Allowed"],
    ["selected:allow_always", true, "Allowed automatically"],
    ["selected:reject_once", false, "Denied"],
    ["selected:reject_once", true, "Denied automatically"],
    ["selected:reject_always", true, "Denied automatically"],
    ["cancelled", false, "Dismissed"],
    ["cancelled", true, "Dismissed"],
    ["timeout", true, "Dismissed"],
    ["something-new", false, "Dismissed"],
  ];

  for (const [outcome, auto, expected] of table) {
    it(`renders ${JSON.stringify(outcome)} (auto=${String(auto)}) as "${expected}"`, () => {
      expect(outcome_line(outcome, auto)).toBe(expected);
    });
  }
});

describe("select_permission_options", () => {
  it("makes the mildest allow primary and keeps allow_always as escalation", () => {
    const choices = select_permission_options([
      option("aa", "allow_always"),
      option("ao", "allow_once"),
      option("ro", "reject_once"),
    ]);

    expect(choices.primary?.option_id).toBe("ao");
    expect(choices.escalation?.option_id).toBe("aa");
    expect(choices.refusal?.option_id).toBe("ro");
  });

  it("promotes allow_always to primary and offers no escalation beside it", () => {
    const choices = select_permission_options([
      option("aa", "allow_always"),
      option("ro", "reject_once"),
    ]);

    expect(choices.primary?.option_id).toBe("aa");
    expect(choices.escalation).toBeNull();
  });

  it("picks the first option of each kind when the agent sends synonyms", () => {
    const choices = select_permission_options([
      option("a", "allow_once", "Yes"),
      option("b", "allow_once", "Allow"),
      option("c", "reject_once", "No"),
      option("d", "reject_once", "Deny"),
    ]);

    expect(choices.primary?.label).toBe("Yes");
    expect(choices.refusal?.label).toBe("No");
  });

  it("falls back to reject_always when no reject_once is offered", () => {
    const choices = select_permission_options([
      option("ao", "allow_once"),
      option("ra", "reject_always"),
    ]);

    expect(choices.refusal?.option_id).toBe("ra");
  });

  it("reports nothing on offer for an empty list", () => {
    expect(select_permission_options([])).toEqual({
      primary: null,
      escalation: null,
      refusal: null,
    });
  });
});
