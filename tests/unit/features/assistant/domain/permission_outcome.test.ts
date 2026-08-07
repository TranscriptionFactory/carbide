import { describe, expect, it } from "vitest";
import {
  classify_outcome,
  dedupe_options,
  outcome_line,
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

describe("dedupe_options", () => {
  it("keeps the first option of each kind", () => {
    const deduped = dedupe_options([
      option("a", "allow_once", "Yes"),
      option("b", "allow_once", "Allow"),
      option("c", "reject_once", "No"),
      option("d", "reject_once", "Deny"),
    ]);

    expect(deduped.map((o) => o.option_id)).toEqual(["a", "c"]);
    expect(deduped.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("preserves one option per kind in arrival order", () => {
    const deduped = dedupe_options([
      option("r1", "reject_always"),
      option("a1", "allow_always"),
      option("a2", "allow_once"),
      option("r2", "reject_once"),
    ]);

    expect(deduped.map((o) => o.kind)).toEqual([
      "reject_always",
      "allow_always",
      "allow_once",
      "reject_once",
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(dedupe_options([])).toEqual([]);
  });

  it("leaves an already-unique list intact", () => {
    const options = [option("a", "allow_once"), option("r", "reject_once")];
    expect(dedupe_options(options)).toEqual(options);
  });
});
