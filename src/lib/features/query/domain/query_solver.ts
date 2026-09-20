import { type VaultId, as_note_path } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type {
  SearchPort,
  SectionFilter,
  WorkspaceIndexPort,
} from "$lib/features/search";
import { rank_tags, type TagPort } from "$lib/features/tags";
import type { BasesPort } from "$lib/features/bases";
import {
  result_item_key,
  type ClauseGroup,
  type ClauseType,
  type ParsedQuery,
  type QueryClause,
  type QueryForm,
  type QueryNode,
  type QueryResult,
  type QueryResultItem,
  type ValueKind,
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
  const resolved = await resolve_node(
    vault_id,
    query.form,
    query.root,
    backends,
  );
  const items =
    query.form === "sections"
      ? await as_section_rows(vault_id, resolved, backends)
      : resolved;
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
    !a.section || !b.section || a.section.heading_id === b.section.heading_id
  );
}

// Under the `sections` form a note-level row (`with #tag`, a negation) stands
// for every section of its note.
async function as_section_rows(
  vault_id: VaultId,
  items: QueryResultItem[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const note_rows = items.filter((item) => !item.section);
  if (note_rows.length === 0) return items;
  const scanned = await scan_constrained_sections(
    vault_id,
    [],
    [note_rows],
    backends,
  );
  return merge_by_key([...items.filter((item) => item.section), ...scanned]);
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

  if (group.join === "or") {
    return resolve_or(vault_id, form, group.clauses, backends);
  }
  return form === "sections"
    ? resolve_section_and(vault_id, group.clauses, backends)
    : resolve_and(vault_id, form, group.clauses, backends);
}

async function resolve_and(
  vault_id: VaultId,
  form: QueryForm,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const [first = [], ...rest] = await Promise.all(
    clauses.map((clause) => resolve_node(vault_id, form, clause, backends)),
  );
  return rest.reduce(constrain, first);
}

// Every non-section operand (`with`, properties, links, negations, nested
// groups) is resolved first and narrows the one section scan by note path, so a
// clause order never changes the rows and the scan's cap applies after the
// narrowing rather than per clause.
async function resolve_section_and(
  vault_id: VaultId,
  clauses: QueryNode[],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const { merged, rest } = split_section_clauses(clauses);
  const constraints = await Promise.all(
    rest.map((node) => resolve_node(vault_id, "sections", node, backends)),
  );
  return scan_constrained_sections(vault_id, merged, constraints, backends);
}

// One scan narrowed to the notes every constraint agrees on, then constrained
// row by row so labels fold in and nested section rows meet by heading.
async function scan_constrained_sections(
  vault_id: VaultId,
  clauses: QueryClause[],
  constraints: QueryResultItem[][],
  backends: QueryBackends,
): Promise<QueryResultItem[]> {
  const paths =
    constraints.length > 0 ? intersect_note_paths(constraints) : undefined;
  if (paths?.length === 0) return [];
  const rows = await query_section_rows(vault_id, clauses, backends, paths);
  return constraints.reduce(constrain, rows);
}

const SECTION_CLAUSES = new Set<ClauseType>(["named", "in", "under"]);

function is_section_clause(node: QueryNode): node is QueryClause {
  return (
    node.kind === "clause" && !node.negated && SECTION_CLAUSES.has(node.type)
  );
}

// One clause per filter field folds into the single scan; a repeated type
// (`named A and named B`) resolves on its own and intersects by heading.
function split_section_clauses(nodes: QueryNode[]): {
  merged: QueryClause[];
  rest: QueryNode[];
} {
  const merged: QueryClause[] = [];
  const rest: QueryNode[] = [];
  for (const node of nodes) {
    const mergeable =
      is_section_clause(node) &&
      !merged.some((clause) => clause.type === node.type);
    (mergeable ? merged : rest).push(node);
  }
  return { merged, rest };
}

function intersect_note_paths(results: QueryResultItem[][]): string[] {
  const path_sets = results.map(
    (rows) => new Set(rows.map((row) => row.note.path as string)),
  );
  const [first = new Set<string>(), ...others] = path_sets;
  return [...first].filter((path) => others.every((set) => set.has(path)));
}

// Keeps the rows the constraint agrees with and folds its labels in.
function constrain(
  rows: QueryResultItem[],
  constraint: QueryResultItem[],
): QueryResultItem[] {
  const by_path = new Map<string, QueryResultItem[]>();
  for (const item of constraint) {
    const group = by_path.get(item.note.path);
    if (group) {
      group.push(item);
    } else {
      by_path.set(item.note.path, [item]);
    }
  }

  const kept: QueryResultItem[] = [];
  for (const row of rows) {
    const match = (by_path.get(row.note.path) ?? []).find((candidate) =>
      keys_compatible(row, candidate),
    );
    if (match) {
      kept.push({
        ...row,
        matched_clauses: [...row.matched_clauses, ...match.matched_clauses],
      });
    }
  }
  return kept;
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

  return merge_by_key(all_results.flat());
}

function merge_by_key(items: QueryResultItem[]): QueryResultItem[] {
  const seen = new Map<string, QueryResultItem>();
  for (const item of items) {
    const key = result_item_key(item);
    const existing = seen.get(key);
    if (existing) {
      existing.matched_clauses.push(...item.matched_clauses);
    } else {
      seen.set(key, { ...item });
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
  const results =
    form === "sections" && SECTION_CLAUSES.has(clause.type)
      ? await query_section_rows(vault_id, [clause], backends)
      : await resolve_note_clause(vault_id, clause, backends);

  if (!clause.negated) return results;

  const all_paths = await backends.index.list_note_paths_by_prefix(
    vault_id,
    "",
  );
  const excluded = new Set(results.map((r) => r.note.path as string));
  return all_paths
    .filter((p) => !excluded.has(p))
    .map((path) => ({
      note: path_to_meta(path),
      matched_clauses: [`not:${clause.type}`],
    }));
}

async function resolve_note_clause(
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

const SECTION_QUERY_LIMIT = 200;

async function query_section_rows(
  vault_id: VaultId,
  clauses: QueryClause[],
  backends: QueryBackends,
  paths?: string[],
): Promise<QueryResultItem[]> {
  const specs = clauses.map(section_clause_spec);
  const filter: SectionFilter = {
    limit: SECTION_QUERY_LIMIT,
    ...(paths ? { paths } : {}),
  };
  for (const spec of specs) Object.assign(filter, spec.fields);
  const labels = specs.map((spec) => spec.label);

  const hits = await backends.search.query_sections(vault_id, filter);
  return hits.map((hit) => {
    const { note, ...section } = hit;
    return { note, section, matched_clauses: [...labels] };
  });
}

function section_clause_spec(clause: QueryClause): {
  fields: Partial<SectionFilter>;
  label: string;
} {
  const text = extract_text(clause.value);
  switch (clause.type) {
    case "named":
      return clause.value.kind === "regex"
        ? {
            fields: { title: clause.value.pattern, title_is_regex: true },
            label: `named:/${clause.value.pattern}/${clause.value.flags}`,
          }
        : { fields: { title: text }, label: `named:"${text}"` };
    case "in":
      return {
        fields: { path_prefix: text.endsWith("/") ? text : `${text}/` },
        label: `in:${text}`,
      };
    case "under":
      return { fields: { heading_path_under: text }, label: `under:${text}` };
    default:
      return { fields: {}, label: `${clause.type}:${text}` };
  }
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
