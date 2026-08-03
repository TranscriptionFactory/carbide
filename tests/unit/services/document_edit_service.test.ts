import { describe, expect, it } from "vitest";
import { DocumentEditService } from "$lib/features/assistant";
import type { EditOpenTabTarget } from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_aborting_run_starter } from "../helpers/aborting_run_starter";
import { make_provider } from "../helpers/assistant_fixtures";

const provider = make_provider({ model: "qwen3:8b" });

const DOCUMENT_TARGET: EditOpenTabTarget = {
  kind: "document",
  path: "artifacts/report.html",
  title: "report",
  content: "<h1>Old</h1>",
};

const NOTE_TARGET: EditOpenTabTarget = {
  kind: "note",
  path: "notes/plan.md",
  title: "plan",
  content: "# Plan",
};

describe("DocumentEditService.edit", () => {
  it("returns the full streamed output on a clean run", async () => {
    const starter = create_test_run_starter(() => [
      { type: "text", text: "<h1>" },
      { type: "text", text: "New</h1>" },
      { type: "done" },
    ]);
    const service = new DocumentEditService(starter);

    const result = await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
    });

    expect(result).toEqual({ status: "done", output: "<h1>New</h1>" });
  });

  it("sends the document prompt through a text-mode kernel run", async () => {
    const starter = create_test_run_starter(() => [
      { type: "text", text: "x" },
      { type: "done" },
    ]);
    const service = new DocumentEditService(starter);

    await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
    });

    const spec = starter.specs[0];
    expect(spec?.request.mode).toBe("text");
    const request = spec?.request;
    const first_message =
      request?.mode === "text" ? request.messages[0] : undefined;
    expect(first_message?.content).toContain(
      "Document: report (artifacts/report.html)",
    );
    expect(first_message?.content).toContain("modernize");
  });

  it("uses the note wording for a note target and stamps the run origin", async () => {
    const starter = create_test_run_starter(() => [
      { type: "text", text: "x" },
      { type: "done" },
    ]);
    const service = new DocumentEditService(starter);

    await service.edit({
      provider_config: provider,
      target: NOTE_TARGET,
      instructions: "tighten",
    });

    const spec = starter.specs[0];
    const request = spec?.request;
    const first_message =
      request?.mode === "text" ? request.messages[0] : undefined;
    expect(first_message?.content).toContain("Note path: notes/plan.md");
    expect(spec?.origin).toEqual({ note_path: "notes/plan.md" });
  });

  it("reports a stopped run as stopped — a partial stream never becomes a rewrite", async () => {
    const starter = create_aborting_run_starter([
      { type: "text", text: "<h1>Half" },
    ]);
    const service = new DocumentEditService(starter);

    const result = await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
    });

    expect(result).toEqual({ status: "stopped" });
  });

  it("reports a provider error verbatim", async () => {
    const starter = create_test_run_starter(() => [
      { type: "error", message: "provider exploded" },
    ]);
    const service = new DocumentEditService(starter);

    const result = await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
    });

    expect(result).toEqual({ status: "error", message: "provider exploded" });
  });

  it("reports a whitespace-only stream as empty", async () => {
    const starter = create_test_run_starter(() => [
      { type: "text", text: "  \n" },
      { type: "done" },
    ]);
    const service = new DocumentEditService(starter);

    const result = await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
    });

    expect(result).toEqual({ status: "empty" });
  });

  it("exposes the run handle so presence and Stop work (I1)", async () => {
    const starter = create_test_run_starter(() => [
      { type: "text", text: "x" },
      { type: "done" },
    ]);
    const service = new DocumentEditService(starter);
    let run_id: string | null = null;

    await service.edit({
      provider_config: provider,
      target: DOCUMENT_TARGET,
      instructions: "modernize",
      on_run_started: (handle) => {
        run_id = handle.id;
      },
    });

    expect(run_id).toBe("run-1");
  });
});
