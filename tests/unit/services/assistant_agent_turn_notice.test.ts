import { describe, expect, it, vi } from "vitest";
import { AgentRunner } from "$lib/features/assistant";
import { AssistantChatStore } from "$lib/features/assistant";
import { AssistantSessionStore } from "$lib/features/assistant";
import type { AgentCheckpointOutcome } from "$lib/features/assistant/application/agent_runner";
import type {
  AgentTurnProposalReport,
  AgentTurnProposalRequest,
} from "$lib/features/assistant/application/agent_proposal_service";
import { build_turn_report_notice } from "$lib/features/assistant/application/agent_turn_report_notice";
import type { RunEvent } from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { empty_proposal_report } from "../helpers/test_agent_proposals";

// The exact phrase AgentProposalService.STALE_ERROR carries. The notice keys on
// it to tell "your edit survived" apart from "the rollback failed", so a test
// that hardcodes anything looser would stop catching a drift in that string.
const STALE_ERROR =
  "the note changed on disk after the checkpoint; left as it is";

const provider: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
};

function report(overrides: Partial<AgentTurnProposalReport>) {
  return { ...empty_proposal_report(), ...overrides };
}

function write_note_events(): RunEvent[] {
  return [
    {
      type: "tool_start",
      id: "write-1",
      name: "mcp__carbide__update_note",
      kind: "other",
      input_summary: '{"path":"notes/a.md"}',
      paths: ["notes/a.md"],
      mutating: true,
      locations: [],
    },
    {
      type: "tool_end",
      id: "write-1",
      name: "mcp__carbide__update_note",
      ok: true,
      paths: ["notes/a.md"],
      mutating: true,
    },
  ];
}

// Runs one agent turn whose proposal producer returns `result`, and hands back
// every message the transcript ended up with.
async function run_turn_with_report(result: AgentTurnProposalReport) {
  const chat_store = new AssistantChatStore(new AssistantSessionStore());
  chat_store.set_mode("agent");
  chat_store.add_user_message("organize my notes");
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());

  const produce = vi.fn((_request: AgentTurnProposalRequest) =>
    Promise.resolve(result),
  );
  const runner = new AgentRunner(
    create_test_run_starter(() => write_note_events()),
    chat_store,
    vault_store,
    {
      create_checkpoint: vi.fn(
        (): Promise<AgentCheckpointOutcome> =>
          Promise.resolve({ status: "created", sha: "anchor-sha" }),
      ),
    },
    vi.fn(),
    vi.fn(),
    { produce },
    vi.fn(() => Promise.resolve(1_000)),
  );

  await runner.run_turn(provider, "organize my notes", "acp");
  return chat_store.messages;
}

function transcript_text(messages: { content: string }[]): string {
  return messages.map((message) => message.content).join("\n");
}

describe("build_turn_report_notice", () => {
  it("says nothing when every touched note became a proposal", () => {
    expect(
      build_turn_report_notice(report({ proposed: ["notes/a.md"] })),
    ).toBeNull();
  });

  it("names a creation as kept on disk rather than proposed", () => {
    const notice = build_turn_report_notice(
      report({ kept_creations: ["notes/new.md"] }),
    );

    expect(notice).toContain("notes/new.md");
    expect(notice).toContain("Created, left on disk and not reviewable");
  });

  it("names both halves of a rename, so the split is visible", () => {
    const notice = build_turn_report_notice(
      report({
        kept_creations: ["notes/new.md"],
        reverted_deletions: ["notes/old.md"],
      }),
    );

    expect(notice).toContain("notes/new.md");
    expect(notice).toContain("notes/old.md");
    expect(notice).toContain("restored from the checkpoint");
  });

  it("names a non-Markdown document as edited outside review", () => {
    const notice = build_turn_report_notice(
      report({ skipped_non_note: ["pages/index.html", "data/board.canvas"] }),
    );

    expect(notice).toContain("pages/index.html");
    expect(notice).toContain("data/board.canvas");
    expect(notice).toContain("Edited on disk outside review");
    expect(notice).toContain("only Markdown notes can be proposed");
  });

  it("names a binary-shaped change as left on disk", () => {
    const notice = build_turn_report_notice(
      report({ skipped_binary: ["notes/scan.md"] }),
    );

    expect(notice).toContain("no reviewable text diff");
  });

  it("reports a note that changed on disk as the user's edit surviving, not as an error", () => {
    const notice = build_turn_report_notice(
      report({ failed: [{ note_path: "notes/a.md", error: STALE_ERROR }] }),
    );

    expect(notice).toContain("your version was kept");
    expect(notice).not.toContain("Could not be rolled back");
  });

  it("keeps a real rollback failure distinct from a note that changed on disk", () => {
    const notice = build_turn_report_notice(
      report({
        failed: [
          { note_path: "notes/stale.md", error: STALE_ERROR },
          {
            note_path: "notes/broken.md",
            error: "could not roll the note back to the checkpoint",
          },
        ],
      }),
    );

    expect(notice).toContain("notes/stale.md");
    expect(notice).toContain("your version was kept");
    expect(notice).toContain("notes/broken.md");
    expect(notice).toContain("still on disk and unreviewed");
    // The two paths must not land in the same sentence: one is reassurance,
    // the other is a warning.
    const stale_line = lines(notice).find((entry) =>
      entry.includes("notes/stale.md"),
    );
    expect(stale_line).not.toContain("notes/broken.md");
  });

  it("caps the paths it lists so a wide turn stays compact", () => {
    const notice = build_turn_report_notice(
      report({
        kept_creations: ["a.md", "b.md", "c.md", "d.md", "e.md"],
      }),
    );

    expect(notice).toContain("a.md, b.md, c.md and 2 more");
    expect(notice).not.toContain("e.md");
  });

  it("explains a missing anchor, states the edits are on disk, and offers git init", () => {
    const notice = build_turn_report_notice(report({ status: "no_anchor" }));

    expect(notice).toContain("not a git repository");
    expect(notice).toContain("saved to disk");
    expect(notice).toContain("not reviewable");
    expect(notice).toContain("Initialize Git Repository");
  });

  it("does not initialize git itself — the notice only names the command", () => {
    const notice = build_turn_report_notice(report({ status: "no_anchor" }));

    expect(notice).toContain("Run ");
    expect(notice).toContain("command palette");
  });
});

function lines(notice: string | null): string[] {
  return (notice ?? "").split("\n");
}

describe("AgentRunner surfaces the turn report in the transcript", () => {
  it("adds no message when the turn's notes all became proposals", async () => {
    const messages = await run_turn_with_report(
      report({ proposed: ["notes/a.md"] }),
    );

    expect(transcript_text(messages)).not.toContain("could be proposed");
    expect(transcript_text(messages)).not.toContain("not reviewable");
  });

  it("tells the user in the transcript when the vault has no checkpoint", async () => {
    const messages = await run_turn_with_report(
      report({ status: "no_anchor" }),
    );

    expect(transcript_text(messages)).toContain("Initialize Git Repository");
    expect(transcript_text(messages)).toContain("saved to disk");
  });

  it("tells the user in the transcript which files were edited outside review", async () => {
    const messages = await run_turn_with_report(
      report({
        proposed: ["notes/a.md"],
        skipped_non_note: ["pages/index.html"],
      }),
    );

    expect(transcript_text(messages)).toContain("pages/index.html");
    expect(transcript_text(messages)).toContain(
      "Edited on disk outside review",
    );
  });

  it("tells the user in the transcript that a created note was kept on disk", async () => {
    const messages = await run_turn_with_report(
      report({ kept_creations: ["notes/new.md"] }),
    );

    expect(transcript_text(messages)).toContain("notes/new.md");
    expect(transcript_text(messages)).toContain("Created, left on disk");
  });
});
