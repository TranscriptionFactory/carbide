import type { JoinOp, QueryForm } from "../types";

export type QueryBuilderClause =
  | { kind: "named"; negated?: boolean; name: string }
  | { kind: "tag"; negated?: boolean; tag: string }
  | { kind: "folder"; negated?: boolean; folder: string }
  | { kind: "linked_from"; negated?: boolean; note: string }
  | {
      kind: "property";
      negated?: boolean;
      property: string;
      operator: PropertyOperator;
      value: string;
    };

export type PropertyOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains";

export type QueryBuilderClauseEntry = {
  connective?: JoinOp;
  clause: QueryBuilderClause;
};

export type QueryBuilderSpec = {
  form: QueryForm;
  clauses: QueryBuilderClauseEntry[];
};

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function render_clause(clause: QueryBuilderClause): string {
  const prefix = clause.negated ? "not " : "";
  switch (clause.kind) {
    case "named":
      return `${prefix}named ${quote(clause.name)}`;
    case "tag":
      return `${prefix}with #${clause.tag}`;
    case "folder":
      return `${prefix}in ${quote(clause.folder)}`;
    case "linked_from":
      return `${prefix}linked from ${quote(clause.note)}`;
    case "property":
      return `${prefix}with ${clause.property} ${clause.operator} ${quote(
        clause.value,
      )}`;
  }
}

export function build_query_text(spec: QueryBuilderSpec): string {
  const clauses = spec.clauses
    .map((entry, index) => {
      const connective = index === 0 ? "" : `${entry.connective ?? "and"} `;
      return `${connective}${render_clause(entry.clause)}`;
    })
    .join(" ");
  return `${spec.form} ${clauses}`.trim();
}
