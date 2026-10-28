export type CsvDialect = {
  delimiter: string;
  eol: "\n" | "\r\n";
  trailing_eol: boolean;
};

export type CsvSource = {
  dialect: CsvDialect;
  rows: string[][];
  raw_rows: string[];
};

type Tokenized = {
  rows: string[][];
  raw_rows: string[];
  eol: "\n" | "\r\n" | null;
  trailing_eol: boolean;
};

const DETECT_CANDIDATES = [",", ";", "\t", "|"];
const DETECT_SAMPLE_ROWS = 20;

function tokenize(
  text: string,
  delimiter: string,
  max_records = Infinity,
): Tokenized {
  const rows: string[][] = [];
  const raw_rows: string[] = [];
  let eol: Tokenized["eol"] = null;
  let record: string[] = [];
  let field = "";
  let record_start = 0;
  let in_quotes = false;
  let field_start = true;
  let trailing_eol = false;

  const end_record = (end: number, terminator_len: number) => {
    record.push(field);
    rows.push(record);
    raw_rows.push(text.slice(record_start, end));
    record = [];
    field = "";
    field_start = true;
    record_start = end + terminator_len;
    trailing_eol = terminator_len > 0;
  };

  let i = 0;
  while (i < text.length && rows.length < max_records) {
    const ch = text.charAt(i);
    if (in_quotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        in_quotes = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field_start) {
      in_quotes = true;
      field_start = false;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
      field_start = true;
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      const crlf = ch === "\r";
      eol ??= crlf ? "\r\n" : "\n";
      end_record(i, crlf ? 2 : 1);
      i += crlf ? 2 : 1;
      continue;
    } else {
      field += ch;
      field_start = false;
    }
    i++;
  }
  if (rows.length < max_records && record_start < text.length) {
    end_record(text.length, 0);
    trailing_eol = false;
  }
  return { rows, raw_rows, eol, trailing_eol };
}

function consistency_score(text: string, delimiter: string): number {
  const sample = tokenize(text, delimiter, DETECT_SAMPLE_ROWS).rows;
  const counts = new Map<number, number>();
  for (const row of sample) {
    counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  }
  let best_cols = 0;
  let best_rows = 0;
  for (const [cols, n] of counts) {
    if (n > best_rows || (n === best_rows && cols > best_cols)) {
      best_cols = cols;
      best_rows = n;
    }
  }
  return best_cols > 1 ? best_rows * 1000 + best_cols : 0;
}

function detect_delimiter(text: string): string {
  let best = ",";
  let best_score = 0;
  for (const candidate of DETECT_CANDIDATES) {
    const score = consistency_score(text, candidate);
    if (score > best_score) {
      best = candidate;
      best_score = score;
    }
  }
  return best;
}

export function parse_csv(text: string, delimiter: string | null): CsvSource {
  const resolved = delimiter ?? detect_delimiter(text);
  const tokens = tokenize(text, resolved);
  return {
    dialect: {
      delimiter: resolved,
      eol: tokens.eol ?? "\n",
      trailing_eol: text === "" ? true : tokens.trailing_eol,
    },
    rows: tokens.rows,
    raw_rows: tokens.raw_rows,
  };
}

function encode_field(value: string, delimiter: string): string {
  const needs_quotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\r") ||
    value.includes("\n");
  return needs_quotes ? `"${value.replaceAll('"', '""')}"` : value;
}

function same_row(a: string[], b: string[] | undefined): boolean {
  return (
    b !== undefined && a.length === b.length && a.every((v, i) => v === b[i])
  );
}

export function serialize_csv(rows: string[][], source: CsvSource): string {
  const { delimiter, eol, trailing_eol } = source.dialect;
  const records = rows.map((row, i) =>
    same_row(row, source.rows[i])
      ? source.raw_rows[i]
      : row.map((v) => encode_field(v, delimiter)).join(delimiter),
  );
  if (records.length === 0) return "";
  return records.join(eol) + (trailing_eol ? eol : "");
}
