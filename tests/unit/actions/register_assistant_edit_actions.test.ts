import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  ATTACHMENT_MAX_CHARS,
  AssistantChatStore,
  AssistantProposalStore,
  AssistantSessionStore,
  register_assistant_edit_actions,
} from "$lib/features/assistant";
import type {
  AssistantDocumentPort,
  AssistantKernelService,
  DocumentEditService,
  EditOpenTabRequest,
  EditOpenTabResult,
} from "$lib/features/assistant";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { make_provider } from "../helpers/assistant_fixtures";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const provider = make_provider({ model: "qwen3:8b" });

const DOCUMENT = {
  path: "artifacts/report.html",
  title: "report",
  content: "<h1>Old</h1>\nbody",
};

type HarnessOptions = {
  ai_enabled?: boolean;
  provider?: AiProviderConfig | null;
  open_document?: typeof DOCUMENT | null;
  open_note?: { path: string; title: string; markdown: string } | null;
  edit_result?: EditOpenTabResult;
};

function create_harness(options: HarnessOptions = {}) {
  const registry = new ActionRegistry();
  const sessions = new AssistantSessionStore();
  const chat_store = new AssistantChatStore(sessions);
  const assistant_proposals = new AssistantProposalStore();

  const ui = new UIStore();
  ui.editor_settings.ai_enabled = options.ai_enabled ?? true;
  ui.editor_settings.ai_default_provider_id = provider.id;

  const open_note = options.open_note ?? null;
  const stores = {
    ui,
    op: new OpStore(),
    editor: {
      open_note: open_note
        ? {
            meta: {
              path: open_note.path,
              title: open_note.title,
              name: open_note.title,
            },
            markdown: open_note.markdown,
          }
        : null,
    },
  };

  const open_document = options.open_document ?? null;
  const read_document = vi.fn((path: string) =>
    open_document && open_document.path === path ? { ...open_document } : null,
  );
  const stage_document = vi.fn(() => true);
  const documents = {
    read_document,
    stage_document,
  } as unknown as AssistantDocumentPort;

  const assistant_kernel = {
    resolve_provider: vi.fn(() =>
      Promise.resolve(
        options.provider === undefined ? provider : options.provider,
      ),
    ),
  } as unknown as AssistantKernelService;

  const edit = vi.fn<
    (request: EditOpenTabRequest) => Promise<EditOpenTabResult>
  >(() =>
    Promise.resolve(
      options.edit_result ?? {
        status: "done" as const,
        output: "<h1>New</h1>\nbody",
      },
    ),
  );
  const document_edit = { edit } as unknown as DocumentEditService;

  register_assistant_edit_actions({
    registry,
    stores: stores as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    chat_store,
    assistant_proposals,
    assistant_kernel,
    document_edit,
    documents,
    active_document_path: () => open_document?.path ?? null,
  });

  return {
    registry,
    chat_store,
    assistant_proposals,
    read_document,
    stage_document,
    edit,
    stores,
  };
}

describe("assistant.attach_document", () => {
  it("attaches the active editable document as composer state", async () => {
    const h = create_harness({ open_document: DOCUMENT });

    await h.registry.execute(ACTION_IDS.assistant_attach_document);

    expect(h.chat_store.attached_document).toEqual({
      path: DOCUMENT.path,
      title: DOCUMENT.title,
    });
  });

  it("refuses an oversized document — never truncates", async () => {
    const h = create_harness({
      open_document: {
        ...DOCUMENT,
        content: "x".repeat(ATTACHMENT_MAX_CHARS + 1),
      },
    });

    await h.registry.execute(ACTION_IDS.assistant_attach_document);

    expect(h.chat_store.attached_document).toBeNull();
  });

  it("is a guarded no-op when no editable document is open", async () => {
    const h = create_harness({ open_document: null });

    await h.registry.execute(ACTION_IDS.assistant_attach_document);

    expect(h.chat_store.attached_document).toBeNull();
  });

  it("detach clears the composer state", async () => {
    const h = create_harness({ open_document: DOCUMENT });
    await h.registry.execute(ACTION_IDS.assistant_attach_document);

    await h.registry.execute(ACTION_IDS.assistant_detach_document);

    expect(h.chat_store.attached_document).toBeNull();
  });
});

describe("assistant.edit_open_tab", () => {
  it("turns a clean run into a PENDING document proposal — never auto-accepts (I5)", async () => {
    const h = create_harness({ open_document: DOCUMENT });

    await h.registry.execute(
      ACTION_IDS.assistant_edit_open_tab,
      "modernize the heading",
    );

    const [proposal] = h.assistant_proposals.proposals;
    expect(proposal?.target).toEqual({
      kind: "document",
      file_path: DOCUMENT.path,
    });
    expect(proposal?.status).toBe("pending");
    expect(h.stage_document).not.toHaveBeenCalled();
  });

  it("stamps the proposal origin with the chat session and the run id", async () => {
    const h = create_harness({ open_document: DOCUMENT });
    h.edit.mockImplementation((request) => {
      request.on_run_started?.({
        id: "run-42",
        stop: () => {},
        outcome: Promise.resolve({ status: "aborted", text: "" }),
      });
      return Promise.resolve({
        status: "done" as const,
        output: "<h1>New</h1>\nbody",
      });
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    const [proposal] = h.assistant_proposals.proposals;
    expect(proposal?.origin.run_id).toBe("run-42");
    expect(proposal?.origin.session_id).toBe(h.chat_store.active_id);
  });

  it("records the exchange as a completion message, not a streamed diff", async () => {
    const h = create_harness({ open_document: DOCUMENT });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    const messages = h.chat_store.messages;
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("modernize");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toContain("Proposed 1 change to report");
    expect(messages[1]?.content).not.toContain("<h1>");
  });

  it("edits the open note when no document tab is active", async () => {
    const h = create_harness({
      open_note: { path: "notes/plan.md", title: "plan", markdown: "# Plan" },
      edit_result: { status: "done", output: "# Better plan" },
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "improve");

    const [proposal] = h.assistant_proposals.proposals;
    expect(proposal?.target).toEqual({
      kind: "note",
      note_path: "notes/plan.md",
    });
  });

  it("does nothing when the assistant is disabled", async () => {
    const h = create_harness({ open_document: DOCUMENT, ai_enabled: false });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.edit).not.toHaveBeenCalled();
  });

  it("does nothing while another chat turn is in flight (shared op key)", async () => {
    const h = create_harness({ open_document: DOCUMENT });
    h.stores.op.start("rag.ask", Date.now());

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.edit).not.toHaveBeenCalled();
  });

  it("does nothing without a resolvable provider", async () => {
    const h = create_harness({ open_document: DOCUMENT, provider: null });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.edit).not.toHaveBeenCalled();
  });

  it("refuses when nothing editable is open", async () => {
    const h = create_harness({ open_document: null, open_note: null });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.edit).not.toHaveBeenCalled();
  });

  it("a stopped run produces NO proposal — a partial stream never becomes a rewrite", async () => {
    const h = create_harness({
      open_document: DOCUMENT,
      edit_result: { status: "stopped" },
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.chat_store.error).toBeNull();
  });

  it("an errored run produces NO proposal and surfaces the error", async () => {
    const h = create_harness({
      open_document: DOCUMENT,
      edit_result: { status: "error", message: "provider exploded" },
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.chat_store.error).toBe("provider exploded");
  });

  it("an empty run produces NO proposal and says so in the transcript", async () => {
    const h = create_harness({
      open_document: DOCUMENT,
      edit_result: { status: "empty" },
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.chat_store.messages[1]?.content).toContain("nothing to apply");
  });

  it("an identical rewrite produces NO proposal", async () => {
    const h = create_harness({
      open_document: DOCUMENT,
      edit_result: { status: "done", output: DOCUMENT.content },
    });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.chat_store.messages[1]?.content).toContain("No changes");
  });

  it("clears the in-flight op either way", async () => {
    const h = create_harness({ open_document: DOCUMENT });

    await h.registry.execute(ACTION_IDS.assistant_edit_open_tab, "modernize");

    expect(h.stores.op.is_pending("rag.ask")).toBe(false);
  });
});
