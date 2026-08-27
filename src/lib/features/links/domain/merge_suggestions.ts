import type { NoteMeta } from "$lib/shared/types/note";
import type {
  SmartLinkRuleMatch,
  SmartLinkSuggestion,
} from "$lib/features/smart_links";
import type { SuggestedLink } from "$lib/features/links/state/links_store.svelte";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

export function path_to_note_meta(path: string): NoteMeta {
  const name = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
  return {
    id: path as NoteId,
    path: path as NotePath,
    name,
    title: name,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function dedup_rules(rules: SmartLinkRuleMatch[]): SmartLinkRuleMatch[] {
  const by_id = new Map<string, SmartLinkRuleMatch>();
  for (const rule of rules) {
    const existing = by_id.get(rule.ruleId);
    if (!existing || rule.rawScore > existing.rawScore) {
      by_id.set(rule.ruleId, rule);
    }
  }
  return [...by_id.values()];
}

// A smart-link suggestion carries a cosine only when the semantic rule fired;
// every other rule scores a metadata overlap, which is not a similarity.
function semantic_rule_similarity(
  rules: SmartLinkRuleMatch[],
): number | undefined {
  return rules.find((rule) => rule.ruleId === "semantic_similarity")?.rawScore;
}

export function merge_suggestions(
  semantic_hits: { note: NoteMeta; distance: number }[],
  smart_suggestions: SmartLinkSuggestion[],
  similarity_threshold: number,
  limit: number,
): SuggestedLink[] {
  const by_path = new Map<string, SuggestedLink>();

  for (const hit of semantic_hits) {
    const similarity = 1 - hit.distance;
    if (similarity <= similarity_threshold) continue;
    by_path.set(hit.note.path, {
      note: hit.note,
      similarity,
      rank_score: similarity,
      rules: [{ ruleId: "semantic_similarity", rawScore: similarity }],
    });
  }

  for (const s of smart_suggestions) {
    const existing = by_path.get(s.targetPath);
    if (existing) {
      // `s.score` is a weighted sum over enabled rules, so it can exceed 1 and
      // is not comparable to a cosine. It orders, it does not describe.
      existing.rank_score = Math.max(existing.rank_score, s.score);
      existing.rules = dedup_rules([...(existing.rules ?? []), ...s.rules]);
      const semantic = semantic_rule_similarity(existing.rules);
      if (semantic !== undefined) existing.similarity = semantic;
    } else {
      const similarity = semantic_rule_similarity(s.rules);
      by_path.set(s.targetPath, {
        note: path_to_note_meta(s.targetPath),
        ...(similarity !== undefined ? { similarity } : {}),
        rank_score: s.score,
        rules: s.rules,
      });
    }
  }

  return [...by_path.values()]
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, limit);
}
