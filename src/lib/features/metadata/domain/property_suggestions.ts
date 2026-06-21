import { fuzzy_score } from "$lib/shared/utils/fuzzy_score";
import type {
  KeySuggestion,
  PropertyType,
  StandardField,
  ValueSuggestion,
  VaultProperty,
} from "../types";
import { find_standard_field, STANDARD_FIELDS } from "./standard_fields";

const PROPERTY_TYPES: PropertyType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "array",
  "tags",
];

function as_property_type(raw: string): PropertyType {
  return PROPERTY_TYPES.includes(raw as PropertyType)
    ? (raw as PropertyType)
    : "string";
}

function merge_keys(
  vault_props: VaultProperty[],
  standard: StandardField[],
): Map<string, KeySuggestion> {
  const entries = new Map<string, KeySuggestion>();
  for (const field of standard) {
    entries.set(field.key, {
      key: field.key,
      type: field.type,
      description: field.description,
      source: "standard",
      count: null,
      indices: [],
    });
  }
  for (const prop of vault_props) {
    const existing = entries.get(prop.name);
    if (existing) {
      existing.count = prop.count;
    } else {
      entries.set(prop.name, {
        key: prop.name,
        type: as_property_type(prop.property_type),
        description: null,
        source: "vault",
        count: prop.count,
        indices: [],
      });
    }
  }
  return entries;
}

function default_key_order(a: KeySuggestion, b: KeySuggestion): number {
  if (a.source !== b.source) return a.source === "standard" ? -1 : 1;
  if (a.count !== b.count) return (b.count ?? 0) - (a.count ?? 0);
  return a.key.localeCompare(b.key);
}

export function build_key_suggestions(
  query: string,
  vault_props: VaultProperty[],
  existing_keys: string[],
  standard: StandardField[] = STANDARD_FIELDS,
): KeySuggestion[] {
  const exclude = new Set(existing_keys);
  const entries = [...merge_keys(vault_props, standard).values()].filter(
    (e) => !exclude.has(e.key),
  );

  const q = query.trim();
  if (!q) return entries.sort(default_key_order);

  const scored: { entry: KeySuggestion; score: number }[] = [];
  for (const entry of entries) {
    const key_match = fuzzy_score(q, entry.key);
    const keyword_score = (
      find_standard_field(entry.key)?.keywords ?? []
    ).reduce((best, kw) => {
      const match = fuzzy_score(q, kw);
      return match && match.score > best ? match.score : best;
    }, -Infinity);
    const score = Math.max(key_match?.score ?? -Infinity, keyword_score);
    if (score === -Infinity) continue;
    entry.indices = key_match?.indices ?? [];
    scored.push({ entry, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || default_key_order(a.entry, b.entry),
  );
  return scored.map(({ entry }) => entry);
}

export function value_suggestions_for_key(
  key: string,
  query: string,
  vault_props: VaultProperty[],
  standard: StandardField[] = STANDARD_FIELDS,
): ValueSuggestion[] {
  const field = standard.find((f) => f.key === key);
  const vault = vault_props.find((p) => p.name === key);
  const values = [
    ...new Set([...(field?.values ?? []), ...(vault?.unique_values ?? [])]),
  ];

  const q = query.trim();
  if (!q) return values.map((value) => ({ value, indices: [] }));

  const scored: { value: string; score: number; indices: number[] }[] = [];
  for (const value of values) {
    const match = fuzzy_score(q, value);
    if (!match) continue;
    scored.push({ value, score: match.score, indices: match.indices });
  }
  scored.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
  return scored.map(({ value, indices }) => ({ value, indices }));
}
