import type {
  ClauseGroup,
  ClauseType,
  JoinOp,
  ParseResult,
  ParsedQuery,
  QueryClause,
  QueryForm,
  QueryNode,
  ValueKind,
} from "../types";

const FORMS: Record<string, QueryForm> = {
  notes: "notes",
  note: "notes",
  folders: "folders",
  folder: "folders",
  files: "files",
  file: "files",
};

const CLAUSE_KEYWORDS: Record<string, ClauseType> = {
  named: "named",
  with: "with",
  in: "in",
};

const PROPERTY_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "contains"];

class Parser {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(): ParseResult {
    try {
      this.skip_whitespace();
      const form = this.parse_form();
      this.skip_whitespace();

      if (this.at_end()) {
        return {
          ok: false,
          error: {
            message: "Expected a query clause after form",
            position: this.pos,
            length: 0,
          },
        };
      }

      const root = this.parse_clause_chain();
      this.skip_whitespace();

      if (!this.at_end()) {
        return {
          ok: false,
          error: {
            message: `Unexpected text: "${this.remaining().slice(0, 20)}"`,
            position: this.pos,
            length: this.remaining().length,
          },
        };
      }

      return { ok: true, query: { form, root } };
    } catch (e) {
      if (e instanceof ParseError) {
        return { ok: false, error: e.to_error() };
      }
      throw e;
    }
  }

  private parse_form(): QueryForm {
    const word = this.peek_word();
    const form = FORMS[word.toLowerCase()];
    if (form) {
      this.advance(word.length);
      return form;
    }
    return "notes";
  }

  private parse_clause_chain(): QueryNode {
    const first = this.parse_single_clause();
    this.skip_whitespace();

    if (this.at_end() || this.peek_char() === ")") {
      return first;
    }

    const join = this.try_parse_join();
    if (!join) return first;

    const clauses: QueryNode[] = [first];
    let current_join = join;

    while (true) {
      this.skip_whitespace();
      const clause = this.parse_single_clause();

      if (current_join === join) {
        clauses.push(clause);
      } else {
        const prev = clauses.pop()!;
        clauses.push({
          kind: "group",
          join: current_join,
          clauses: [prev, clause],
        });
      }

      this.skip_whitespace();
      if (this.at_end() || this.peek_char() === ")") break;

      const next_join = this.try_parse_join();
      if (!next_join) break;
      current_join = next_join;
    }

    if (clauses.length === 1) return clauses[0]!;
    return { kind: "group", join, clauses };
  }

  private parse_single_clause(): QueryNode {
    this.skip_whitespace();

    if (this.peek_char() === "(") {
      return this.parse_grouped();
    }

    const negated = this.try_consume_word("not");
    if (negated) this.skip_whitespace();

    const pos = this.pos;
    const word = this.peek_word().toLowerCase();

    if (word === "linked") {
      return this.parse_linked_from(negated);
    }

    const clause_type = CLAUSE_KEYWORDS[word];
    if (!clause_type) {
      throw new ParseError(
        `Expected clause keyword (named, with, in, linked from), got "${word || this.peek_char()}"`,
        pos,
        Math.max(word.length, 1),
      );
    }

    this.advance(word.length);
    this.skip_whitespace();

    if (clause_type === "with") {
      return this.parse_with_clause(negated);
    }

    const value = this.parse_value(clause_type);

    return {
      kind: "clause",
      type: clause_type,
      negated,
      value,
    };
  }

  private parse_linked_from(negated: boolean): QueryClause {
    this.advance("linked".length);
    this.skip_whitespace();

    if (!this.try_consume_word("from")) {
      throw new ParseError('Expected "from" after "linked"', this.pos, 4);
    }

    this.skip_whitespace();
    const value = this.parse_value("linked_from");
    return { kind: "clause", type: "linked_from", negated, value };
  }

  private parse_with_clause(negated: boolean): QueryClause {
    const save = this.pos;
    const property_clause = this.try_parse_property_clause(negated);
    if (property_clause) {
      return property_clause;
    }
    this.pos = save;

    const value = this.parse_value("with");

    if (value.kind === "tag") {
      return { kind: "clause", type: "with", negated, value };
    }

    return { kind: "clause", type: "with", negated, value };
  }

  private try_parse_property_clause(negated: boolean): QueryClause | null {
    const save = this.pos;

    const prop_name = this.peek_word();
    if (!prop_name) return null;

    const after_prop = save + prop_name.length;
    const after_ws = this.skip_whitespace_at(after_prop);
    const remaining_after = this.input.slice(after_ws);

    let matched_op: string | null = null;
    for (const op of PROPERTY_OPERATORS) {
      if (remaining_after.startsWith(op)) {
        matched_op = op;
        break;
      }
    }

    if (!matched_op) return null;

    if (
      prop_name.toLowerCase() === "and" ||
      prop_name.toLowerCase() === "or" ||
      prop_name.toLowerCase() === "not"
    ) {
      return null;
    }

    this.pos = after_ws + matched_op.length;
    this.skip_whitespace();

    const value = this.parse_value("with_property");

    return {
      kind: "clause",
      type: "with_property",
      negated,
      value,
      property_name: prop_name,
      property_operator: matched_op,
    };
  }

  private parse_grouped(): QueryNode {
    this.expect("(");
    this.skip_whitespace();
    const inner = this.parse_clause_chain();
    this.skip_whitespace();
    this.expect(")");
    return inner;
  }

  private parse_value(context: ClauseType | string): ValueKind {
    const ch = this.peek_char();

    if (ch === '"' || ch === "'") {
      return this.parse_quoted_string();
    }
    if (ch === "[" && this.input[this.pos + 1] === "[") {
      return this.parse_wikilink();
    }
    if (ch === "#") {
      return this.parse_tag();
    }
    if (ch === "/") {
      return this.parse_regex();
    }
    if (ch === "{") {
      return this.parse_subquery();
    }

    return this.parse_bare_value(context);
  }

  private parse_quoted_string(): ValueKind {
    const quote = this.peek_char();
    this.advance(1);
    let value = "";
    while (!this.at_end() && this.peek_char() !== quote) {
      if (this.peek_char() === "\\") {
        this.advance(1);
        if (!this.at_end()) {
          value += this.peek_char();
          this.advance(1);
        }
      } else {
        value += this.peek_char();
        this.advance(1);
      }
    }
    if (!this.at_end()) this.advance(1);
    return { kind: "text", value };
  }

  private parse_wikilink(): ValueKind {
    this.advance(2);
    let target = "";
    while (
      !this.at_end() &&
      !(this.peek_char() === "]" && this.input[this.pos + 1] === "]")
    ) {
      target += this.peek_char();
      this.advance(1);
    }
    if (!this.at_end()) this.advance(2);
    return { kind: "wikilink", target };
  }

  private parse_tag(): ValueKind {
    this.advance(1);
    let tag = "";
    while (!this.at_end() && /[\w/\-.]/.test(this.peek_char())) {
      tag += this.peek_char();
      this.advance(1);
    }
    return { kind: "tag", tag };
  }

  private parse_regex(): ValueKind {
    this.advance(1);
    let pattern = "";
    while (!this.at_end() && this.peek_char() !== "/") {
      if (this.peek_char() === "\\") {
        pattern += this.peek_char();
        this.advance(1);
        if (!this.at_end()) {
          pattern += this.peek_char();
          this.advance(1);
        }
      } else {
        pattern += this.peek_char();
        this.advance(1);
      }
    }
    if (!this.at_end()) this.advance(1);
    let flags = "";
    while (!this.at_end() && /[gimsuy]/.test(this.peek_char())) {
      flags += this.peek_char();
      this.advance(1);
    }
    return { kind: "regex", pattern, flags };
  }

  private parse_subquery(): ValueKind {
    this.advance(1);
    const start = this.pos;
    let depth = 1;
    while (!this.at_end() && depth > 0) {
      if (this.peek_char() === "{") depth++;
      else if (this.peek_char() === "}") depth--;
      if (depth > 0) this.advance(1);
    }
    const sub_text = this.input.slice(start, this.pos);
    if (!this.at_end()) this.advance(1);

    const sub_parser = new Parser(sub_text);
    const sub_result = sub_parser.parse();
    if (!sub_result.ok) {
      throw new ParseError(
        sub_result.error.message,
        start + sub_result.error.position,
        sub_result.error.length,
      );
    }
    return { kind: "subquery", query: sub_result.query.root };
  }

  private parse_bare_value(_context: ClauseType | string): ValueKind {
    let value = "";
    while (!this.at_end()) {
      const ch = this.peek_char();
      if (/\s/.test(ch)) {
        const next_word = this.peek_word_at(this.pos + 1);
        const lower = next_word.toLowerCase();
        if (lower === "and" || lower === "or" || lower === "not") break;
        if (CLAUSE_KEYWORDS[lower]) break;
        if (lower === "linked") break;
      }
      if (ch === ")" || ch === "}") break;
      value += ch;
      this.advance(1);
    }
    return { kind: "text", value: value.trim() };
  }

  private try_parse_join(): JoinOp | null {
    const word = this.peek_word().toLowerCase();
    if (word === "and") {
      this.advance(3);
      return "and";
    }
    if (word === "or") {
      this.advance(2);
      return "or";
    }
    return null;
  }

  private try_consume_word(word: string): boolean {
    const peeked = this.peek_word();
    if (peeked.toLowerCase() === word) {
      this.advance(peeked.length);
      return true;
    }
    return false;
  }

  private peek_word(): string {
    return this.peek_word_at(this.pos);
  }

  private peek_word_at(from: number): string {
    let i = from;
    while (i < this.input.length && /\s/.test(this.input[i]!)) i++;
    let word = "";
    while (i < this.input.length && /\S/.test(this.input[i]!)) {
      word += this.input[i]!;
      i++;
    }
    return word;
  }

  private peek_char(): string {
    return this.input[this.pos]!;
  }

  private advance(n: number): void {
    this.pos += n;
  }

  private skip_whitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos]!)) {
      this.pos++;
    }
  }

  private skip_whitespace_at(from: number): number {
    let i = from;
    while (i < this.input.length && /\s/.test(this.input[i]!)) i++;
    return i;
  }

  private expect(ch: string): void {
    if (this.peek_char() !== ch) {
      throw new ParseError(`Expected "${ch}"`, this.pos, 1);
    }
    this.advance(1);
  }

  private at_end(): boolean {
    return this.pos >= this.input.length;
  }

  private remaining(): string {
    return this.input.slice(this.pos);
  }
}

class ParseError {
  constructor(
    readonly message: string,
    readonly position: number,
    readonly length: number,
  ) {}

  to_error() {
    return {
      message: this.message,
      position: this.position,
      length: this.length,
    };
  }
}

export function parse_query(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: { message: "Empty query", position: 0, length: 0 },
    };
  }
  return new Parser(trimmed).parse();
}
