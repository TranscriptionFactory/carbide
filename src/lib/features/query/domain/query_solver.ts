import { type VaultId, as_note_path } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { SearchPort, WorkspaceIndexPort } from "$lib/features/search";
import type { TagPort } from "$lib/features/tags";
import type { BasesPort } from "$lib/features/bases";
import type {
  ClauseGroup,
  ParsedQuery,
  QueryClause,
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
  const items = await resolve_node(vault_id, query.root, backends);
  const elapsed_ms = Math.round(performance.now() - start);

  return {
    items,
    total: items.length,
    elapsed_ms,
    query_text: "",
  };
}

async function resolve_node(
  vault_id: VaultId,
  node: QueryNode,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (node.kind === "group") {
    return resolve_group(vault_id, node, backends);
  }
  return resolve_clause(vault_id, node, backends);
}

async function resolve_group(
  vault_id: VaultId,
  group: ClauseGroup,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (group.clauses.length === 0) return [];

  if (group.join === "and") {
    return resolve_and(vault_id, group.clauses, backends);
  }
  return resolve_or(vault_id, group.clauses, backends);
}

async function resolve_and(
  vault_id: VaultId,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  if (clauses.length === 0) return [];
  let result = await resolve_node(vault_id, clauses[0]!, backends);

  for (let i = 1; i < clauses.length; i++) {
    const next = await resolve_node(vault_id, clauses[i]!, backends);
    const next_paths = new Set(next.map((item) => item.note.path));
    result = result.filter((item) => next_paths.has(item.note.path));
    for (const item of result) {
      const match = next.find((n) => n.note.path === item.note.path);
      if (match) {
        item.matched_clauses.push(...match.matched_clauses);
      }
    }
  }

  return result;
}

async function resolve_or(
  vault_id: VaultId,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const all_results = await Promise.all(
    clauses.map((clause) => resolve_node(vault_id, clause, backends)),
  );

  const seen = new Map<string, QueryResultItem>();
  for (const results of all_results) {
    for (const item of results) {
      const existing = seen.get(item.note.path);
      if (existing) {
        existing.matched_clauses.push(...item.matched_clauses);
      } else {
        seen.set(item.note.path, { ...item });
      }
    }
  }

  return Array.from(seen.values());
}

async function resolve_clause(
  vault_id: VaultId,
  clause: QueryClause,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  let results: QueryResultItem[];

  switch (clause.type) {
    case "with":
      results = await resolve_with(vault_id, clause.value, backends);
      break;
    case "named":
      results = await resolve_named(vault_id, clause.value, backends);
      break;
    case "in":
      results = await resolve_in(vault_id, clause.value, backends);
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
    return paths.map((path) => ({
      note: path_to_meta(path),
      matched_clauses: [`with:#${value.tag}`],
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

async function resolve_with_property(
  vault_id: VaultId,
  property_name: string,
  operator: string,
  value: ValueKind,
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const text = extract_text(value);
  const results = await backends.bases.query(vault_id, {
    filters: [{ property: property_name, operator, value: text }],
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
