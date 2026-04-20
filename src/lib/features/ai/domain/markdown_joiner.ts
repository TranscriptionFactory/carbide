const MAX_BUFFER = 30;

export class MarkdownJoiner {
  private buffer = "";
  private in_code_block = false;

  process_chunk(text: string): string {
    if (this.in_code_block) {
      return this.process_in_code_block(text);
    }

    this.buffer += text;
    return this.flush_ready();
  }

  flush(): string {
    const result = this.buffer;
    this.buffer = "";
    return result;
  }

  private process_in_code_block(text: string): string {
    const combined = this.buffer + text;
    this.buffer = "";

    const lines = combined.split("\n");
    const last = lines.at(-1) ?? "";

    if (last.startsWith("```") || last.startsWith("~~~")) {
      this.in_code_block = false;
      return combined;
    }

    if (!last.endsWith("\n") && lines.length === 1) {
      this.buffer = last;
      return "";
    }

    const complete = lines.slice(0, -1).join("\n") + "\n";
    this.buffer = last;
    return complete;
  }

  private flush_ready(): string {
    const buf = this.buffer;

    if (buf.length === 0) return "";

    if (this.check_fence_start(buf)) {
      this.in_code_block = true;
      this.buffer = "";
      return buf;
    }

    if (buf.includes("\n")) {
      const last_newline = buf.lastIndexOf("\n");
      const complete = buf.slice(0, last_newline + 1);
      const remainder = buf.slice(last_newline + 1);

      if (this.should_buffer(remainder)) {
        this.buffer = remainder;
        return complete;
      }

      this.buffer = "";
      return buf;
    }

    if (buf.length > MAX_BUFFER) {
      this.buffer = "";
      return buf;
    }

    if (this.should_buffer(buf)) {
      return "";
    }

    this.buffer = "";
    return buf;
  }

  private should_buffer(text: string): boolean {
    if (text.length === 0) return false;

    const last = text.at(-1)!;
    if (last === "|") return true;

    if (last === "*" || last === "_") {
      return this.count_delimiter_runs(text, last) % 2 !== 0;
    }

    if (last === "`") {
      return this.count_delimiter_runs(text, "`") % 2 !== 0;
    }

    if (this.has_unclosed_bracket(text)) return true;

    return false;
  }

  private count_delimiter_runs(text: string, char: string): number {
    let runs = 0;
    let in_run = false;

    for (const ch of text) {
      if (ch === char) {
        if (!in_run) {
          runs++;
          in_run = true;
        }
      } else {
        in_run = false;
      }
    }

    return runs;
  }

  private has_unclosed_bracket(text: string): boolean {
    let depth = 0;
    for (const ch of text) {
      if (ch === "[") depth++;
      else if (ch === "]") depth = Math.max(0, depth - 1);
    }
    return depth > 0;
  }

  private check_fence_start(text: string): boolean {
    const trimmed = text.trimStart();
    return trimmed.startsWith("```") || trimmed.startsWith("~~~");
  }
}
