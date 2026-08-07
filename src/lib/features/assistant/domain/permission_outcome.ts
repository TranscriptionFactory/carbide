import type {
  PermissionOptionKind,
  PermissionOptionSpec,
} from "$lib/features/assistant/types/agent_events";

export type PermissionOutcomeClass = "approved" | "denied" | "dismissed";

// `cancelled` is the answer for a prompt the agent offered no refusal for:
// there is no option id to send back, only a refusal to proceed.
export type PermissionResponse =
  | { option_id: string; kind: PermissionOptionKind }
  | { kind: "cancelled" };

const APPROVED_PREFIX = "selected:allow";
const DENIED_PREFIX = "selected:reject";

// Anything the agent sends that is not a recognized grant is a dismissal:
// an unknown string must never widen access.
export function classify_outcome(outcome: string): PermissionOutcomeClass {
  if (outcome.startsWith(APPROVED_PREFIX)) return "approved";
  if (outcome.startsWith(DENIED_PREFIX)) return "denied";
  return "dismissed";
}

export function outcome_line(outcome: string, auto: boolean): string {
  switch (classify_outcome(outcome)) {
    case "approved":
      return auto ? "Allowed automatically" : "Allowed";
    case "denied":
      return auto ? "Denied automatically" : "Denied";
    case "dismissed":
      return "Dismissed";
  }
}

export type PermissionChoices = {
  primary: PermissionOptionSpec | null;
  escalation: PermissionOptionSpec | null;
  refusal: PermissionOptionSpec | null;
};

// The three answers a prompt can offer, picked from however many synonyms the
// agent sent. The mildest of each side wins, and allow_always only earns its
// own control when it is not already the primary.
export function select_permission_options(
  options: PermissionOptionSpec[],
): PermissionChoices {
  const of_kind = (kind: PermissionOptionKind): PermissionOptionSpec | null =>
    options.find((option) => option.kind === kind) ?? null;

  const allow_always = of_kind("allow_always");
  const primary = of_kind("allow_once") ?? allow_always;

  return {
    primary,
    escalation: allow_always !== primary ? allow_always : null,
    refusal: of_kind("reject_once") ?? of_kind("reject_always"),
  };
}
