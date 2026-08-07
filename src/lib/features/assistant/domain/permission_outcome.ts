import type { PermissionOptionSpec } from "$lib/features/assistant/types/agent_events";

export type PermissionOutcomeClass = "approved" | "denied" | "dismissed";

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

export function dedupe_options(
  options: PermissionOptionSpec[],
): PermissionOptionSpec[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.kind)) return false;
    seen.add(option.kind);
    return true;
  });
}
