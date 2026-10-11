// Set on transactions whose document change leaves the serialized Markdown
// byte-identical, so the session neither re-serializes nor flips dirty, and
// edit-reacting plugins leave them alone.
export const PRESENTATION_ONLY_META = "presentation_only";
