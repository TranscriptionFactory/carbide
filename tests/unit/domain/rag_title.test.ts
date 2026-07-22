import { describe, expect, it } from "vitest";
import {
  sanitize_generated_title,
  should_autotitle,
} from "$lib/features/rag/domain/rag_session";
import type { RagSession } from "$lib/features/rag/domain/rag_types";

function session(overrides: Partial<RagSession> = {}): RagSession {
  return {
    id: "s1",
    title: "First chat",
    created_at: 1,
    updated_at: 2,
    messages: [],
    provider_id: "ollama",
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

describe("should_autotitle", () => {
  it("allows derived titles", () => {
    expect(should_autotitle(session({ title_source: "derived" }))).toBe(true);
  });

  it("treats legacy sessions without a title_source as derived", () => {
    expect(should_autotitle(session())).toBe(true);
  });

  it("skips manually renamed and already generated titles", () => {
    expect(should_autotitle(session({ title_source: "manual" }))).toBe(false);
    expect(should_autotitle(session({ title_source: "generated" }))).toBe(
      false,
    );
  });
});

describe("sanitize_generated_title", () => {
  it("trims whitespace and strips surrounding quotes", () => {
    expect(sanitize_generated_title('  "Caching strategies"  ')).toBe(
      "Caching strategies",
    );
    expect(sanitize_generated_title("'Vault search tips'")).toBe(
      "Vault search tips",
    );
    expect(sanitize_generated_title("“Smart quotes”")).toBe("Smart quotes");
  });

  it("accepts a plain short title unchanged", () => {
    expect(sanitize_generated_title("Note linking basics")).toBe(
      "Note linking basics",
    );
  });

  it("rejects empty or whitespace-only output", () => {
    expect(sanitize_generated_title("")).toBeNull();
    expect(sanitize_generated_title("   ")).toBeNull();
    expect(sanitize_generated_title('""')).toBeNull();
  });

  it("rejects multi-line output", () => {
    expect(sanitize_generated_title("Title\nwith detail")).toBeNull();
  });

  it("allows a trailing newline from the model", () => {
    expect(sanitize_generated_title("Clean title\n")).toBe("Clean title");
  });

  it("rejects titles longer than 60 characters", () => {
    expect(sanitize_generated_title("x".repeat(61))).toBeNull();
    expect(sanitize_generated_title("x".repeat(60))).toBe("x".repeat(60));
  });
});
