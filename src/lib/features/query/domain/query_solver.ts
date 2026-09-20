import { type VaultId, as_note_path } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type {
  SearchPort,
  SectionFilter,
  WorkspaceIndexPort,
} from "$lib/features/search";
import { rank_tags, type TagPort } from "$lib/features/tags";
import type { BasesPort } from "$lib/features/bases";
import type {
  ClauseGroup,
  ParsedQuery,
  QueryClause,
  QueryForm,
  QueryNode,
  QueryResult,
  QueryResultItem,
  ValueKind,
} from "../types";

export type QueryBackends = {
  search: SearchPort;
  index: WorkspaceIndexPort;
  tags: TagPort;
  bases: BasesPort;
};

export async function solve_query(
  vault_id: VaultId,
  query: ParsedQuery,
  backends: QueryBackends,
): Promise<QueryResult> {
  const start = performance.now();
  const items = await resolve_node(vault_id, query.form, query.root, backends);
  const elapsed_ms = Math.round(performance.now() - start);

  return {
    items,
    total: items.length,
    elapsed_ms,
    query_text: "",
  };
}

// A section row and a note-level row of the same note satisfy each other: the
// note-level clause is a statement about the note, not about one heading.
function keys_compatible(a: QueryResultItem, b: QueryResultItem): boolean {
  return (
    !a.section ||
    !b.section ||
    a.section.heading_path === b.section.heading_path
  );
}

async function resolve_node(
  vault_id: VaultId,
  form: QueryForm,
  node: QueryNode,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (node.kind === "group") {
    return resolve_group(vault_id, form, node, backends);
  }
  return resolve_clause(vault_id, form, node, backends);
}

async function resolve_group(
  vault_id: VaultId,
  form: QueryForm,
  group: ClauseGroup,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (group.clauses.length === 0) return [];

  if (group.join === "and") {
    return resolve_and(vault_id, form, group.clauses, backends);
  }
  return resolve_or(vault_id, form, group.clauses, backends);
}

async function resolve_and(
  vault_id: VaultId,
  form: QueryForm,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (clauses.length === 0) return [];
  let result = await resolve_node(vault_id, form, clauses[0]!, backends);

  for (let i = 1; i < clauses.length; i++) {
    const next = await resolve_node(vault_id, form, clauses[i]!, backends);
    const next_by_path = new Map<string, QueryResultItem[]>();
    for (const item of next) {
      const group = next_by_path.get(item.note.path);
      if (group) {
        group.push(item);
      } else {
        next_by_path.set(item.note.path, [item]);
      }
    }

    result = result.filter((item) =>
      (next_by_path.get(item.note.path) ?? []).some((candidate) =>
        keys_compatible(item, candidate),
      ),
    );
    for (const item of result) {
      const match = (next_by_path.get(item.note.path) ?? []).find((candidate) =>
        keys_compatible(item, candidate),
      );
      if (match) {
        item.matched_clauses.push(...match.matched_clauses);
      }
    }
  }

  return result;
}

async function resolve_or(
  vault_id: VaultId,
  form: QueryForm,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const all_results = await Promise.all(
    clauses.map((clause) => resolve_node(vault_id, form, clause, backends)),
  );

  const seen = new Map<string, QueryResultItem>();
  for (const results of all_results) {
    for (const item of results) {
      // A section row is identified by its heading path, so two sections of the
      // same note stay distinct through an OR; a note-level row keys on the
      // note alone, which is what every `notes` query keys on.
      const key = item.section
        ? `${item.note.path}\u0000${item.section.heading_path}`
        : item.note.path;
      const existing = seen.get(key);
      if (existing) {
        existing.matched_clauses.push(...item.matched_clauses);
      } else {
        seen.set(key, { ...item });
      }
    }
  }

  return Array.from(seen.values());
}

async function resolve_clause(
  vault_id: VaultId,
  form: QueryForm,
  clause: QueryClause,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const sections = form === "sections";
  let results: QueryResultItem[];

  switch (clause.type) {
    case "with":
      results = await resolve_with(vault_id, clause.value, backends);
      break;
    case "named":
      results = sections
        ? await resolve_sections(vault_id, clause.value, "named", backends)
        : await resolve_named(vault_id, clause.value, backends);
      break;
    case "in":
      results = sections
        ? await resolve_sections(vault_id, clause.value, "in", backends)
        : await resolve_in(vault_id, clause.value, backends);
      break;
    case "under":
      results = await resolve_sections(
        vault_id,
        clause.value,
        "under",
        backends,
      );
      break;
    case "linked_from":
      results = await resolve_linked_from(vault_id, clause.value, backends);
      break;
    case "with_property":
      results = await resolve_with_property(
        vault_id,
        clause.property_name!,
        clause.property_operator!,
        clause.value,
        backends,
      );
      break;
    default:
      results = [];
  }

  if (clause.negated) {
    const all_paths = await backends.index.list_note_paths_by_prefix(
      vault_id,
      "",
    );
    const excluded = new Set(results.map((r) => r.note.path as string));
    results = all_paths
      .filter((p) => !excluded.has(p))
      .map((path) => ({
        note: path_to_meta(path),
        matched_clauses: [`not:${clause.type}`],
      }));
  }

  return results;
}

async function resolve_with(
  vault_id: VaultId,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (value.kind === "tag") {
    const paths = await backends.tags.get_notes_for_tag_prefix(
      vault_id,
      value.tag,
    );
    if (paths.length > 0) {
      return paths.map((path) => ({
        note: path_to_meta(path),
        matched_clauses: [`with:#${value.tag}`],
      }));
    }

    // Fallback: fuzzy-match against all known tags, union their notes.
    // Triggers when an exact / hierarchical-prefix lookup misses, so a
    // typo'd query like `#prjects` still surfaces `#projects/*` notes.
    const all_tags = await backends.tags.list_all_tags(vault_id);
    const ranked = rank_tags(
      value.tag,
      all_tags.filter((info) => info.promoted).map((info) => info.tag),
      5,
    );
    if (ranked.length === 0) return [];
    const note_paths = new Set<string>();
    const matched_tags: string[] = [];
    for (const match of ranked) {
      const fuzzy_paths = await backends.tags.get_notes_for_tag_prefix(
        vault_id,
        match.tag,
      );
      for (const p of fuzzy_paths) note_paths.add(p);
      matched_tags.push(`#${match.tag}`);
    }
    return [...note_paths].map((path) => ({
      note: path_to_meta(path),
      matched_clauses: [`with:fuzzy(${matched_tags.join(",")})`],
    }));
  }

  const text = extract_text(value);
  const hits = await backends.search.search_notes(
    vault_id,
    { raw: text, text, scope: "content", domain: "notes" },
    200,
  );
  return hits.map((hit) => ({
    note: hit.note,
    matched_clauses: [`with:"${text}"`],
  }));
}

// Section-level resolvers all run through the one `query_sections` command, so
// an AND of section clauses costs one call per clause and a note-level clause
// (`with …`) meets them by note path.
const SECTION_QUERY_LIMIT = 200;

async function resolve_sections(
  vault_id: VaultId,
  value: ValueKind,
  clause: "named" | "in" | "under",
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const text = extract_text(value);
  const filter: SectionFilter = {
    limit: SECTION_QUERY_LIMIT,
    ...(clause === "named"
      ? value.kind === "regex"
        ? { title: value.pattern, title_is_regex: true }
        : { title: text }
      : {}),
    ...(clause === "in"
      ? { path_prefix: text.endsWith("/") ? text : `${text}/` }
      : {}),
    ...(clause === "under" ? { heading_path_under: text } : {}),
  };

  const hits = await backends.search.query_sections(vault_id, filter);
  const label =
    clause === "named"
      ? value.kind === "regex"
        ? `named:/${value.pattern}/${value.flags}`
        : `named:"${text}"`
      : `${clause}:${text}`;

  return hits.map((hit) => {
    const { note, ...section } = hit;
    return { note, section, matched_clauses: [label] };
  });
}

async function resolve_named(
  vault_id: VaultId,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const text = extract_text(value);

  if (value.kind === "regex") {
    const all_paths = await backends.index.list_note_paths_by_prefix(
      vault_id,
      "",
    );
    const regex = new RegExp(value.pattern, value.flags);
    return all_paths
      .filter((p) => regex.test(path_to_name(p)))
      .map((path) => ({
        note: path_to_meta(path),
        matched_clauses: [`named:/${value.pattern}/${value.flags}`],
      }));
  }

  const hits = await backends.search.search_notes(
    vault_id,
    { raw: text, text, scope: "title", domain: "notes" },
    200,
  );
  return hits.map((hit) => ({
    note: hit.note,
    matched_clauses: [`named:"${text}"`],
  }));
}

async function resolve_in(
  vault_id: VaultId,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const folder = extract_text(value);
  const prefix = folder.endsWith("/") ? folder : folder + "/";
  const paths = await backends.index.list_note_paths_by_prefix(
    vault_id,
    prefix,
  );
  return paths.map((path) => ({
    note: path_to_meta(path),
    matched_clauses: [`in:${folder}`],
  }));
}

async function resolve_linked_from(
  vault_id: VaultId,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const target = extract_text(value);
  const note_path = target.endsWith(".md") ? target : target + ".md";

  const snapshot = await backends.search.get_note_links_snapshot(
    vault_id,
    note_path,
  );
  return snapshot.outlinks.map((note) => ({
    note,
    matched_clauses: [`linked_from:${target}`],
  }));
}

const BASES_OPERATORS: Record<string, string> = {
  "=": "eq",
  "!=": "neq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
};

async function resolve_with_property(
  vault_id: VaultId,
  property_name: string,
  operator: string,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const text = extract_text(value);
  const bases_operator = BASES_OPERATORS[operator] ?? operator;
  const results = await backends.bases.query(vault_id, {
    filters: [
      { property: property_name, operator: bases_operator, value: text },
    ],
    sort: [],
    limit: 200,
    offset: 0,
  });
  return results.rows.map((row) => ({
    note: row.note,
    matched_clauses: [`${property_name}${operator}${text}`],
  }));
}

function extract_text(value: ValueKind): string {
  switch (value.kind) {
    case "text":
      return value.value;
    case "wikilink":
      return value.target;
    case "tag":
      return value.tag;
    case "regex":
      return value.pattern;
    case "subquery":
      return "";
  }
}

function path_to_name(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1]!;
}

function path_to_title(path: string): string {
  return path_to_name(path).replace(/\.md$/, "");
}

function path_to_meta(path: string): NoteMeta {
  const np = as_note_path(path);
  return {
    id: np,
    path: np,
    name: path_to_name(path),
    title: path_to_title(path),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}
