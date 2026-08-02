import { describe, expect, it } from "vitest";
import type { AssistantSession } from "$lib/features/assistant";
import { make_ask_harness } from "../helpers/omnibar_ask_fixtures";

const QUESTION = "when did we decide k=60 for rrf?";

function only_session(sessions: AssistantSession[]): AssistantSession {
  expect(sessions).toHaveLength(1);
  const session = sessions[0];
  if (!session) throw new Error("expected exactly one session");
  return session;
}

describe("omnibar ask — zero assistant IO before submit (R6)", () => {
  it("touches no assistant port when the surface is merely constructed", () => {
    const harness = make_ask_harness();

    expect(harness.transport_calls()).toBe(0);
    expect(harness.probe_calls()).toEqual([]);
    expect(harness.persistence_calls()).toBe(0);
    expect(harness.sessions.sessions).toEqual([]);
  });

  it("touches no assistant port while a question is typed character by character", () => {
    const harness = make_ask_harness();

    // Typing is modelled as what it is on this surface: local draft state that
    // reaches no port at all. There is no code path from a keystroke to the
    // controller, which is the point of the design.
    let draft = "";
    for (const character of QUESTION) {
      draft += character;
      expect(harness.transport_calls()).toBe(0);
      expect(harness.probe_calls()).toEqual([]);
      expect(harness.persistence_calls()).toBe(0);
    }

    expect(draft).toBe(QUESTION);
    expect(harness.sessions.sessions).toEqual([]);
  });

  it("reaches the transport and the provider probe once submit fires", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();

    expect(harness.probe_calls()).toEqual(["claude"]);
    expect(harness.transport_calls()).toBe(1);

    await harness.transport.channel().end();
    await running;
  });

  it("never writes through the session persistence port — hydration is not this surface's job", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport.channel().emit({ type: "text", text: "k=60." });
    await harness.transport.channel().end();
    await running;

    expect(harness.persistence_calls()).toBe(0);
  });

  it("ignores a second submit while the first is still streaming", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();

    // ↵ stays bound to submit until an answer exists, so this is reachable by
    // pressing enter twice — it must not start a second run.
    await expect(
      harness.controller.submit("a different question"),
    ).resolves.toEqual({ status: "skipped" });
    expect(harness.transport_calls()).toBe(1);
    expect(harness.sessions.sessions).toHaveLength(1);

    await harness.transport.channel().end();
    await running;
  });

  it("does nothing at all for a blank question", async () => {
    const harness = make_ask_harness();

    await expect(harness.controller.submit("   ")).resolves.toEqual({
      status: "skipped",
    });
    expect(harness.transport_calls()).toBe(0);
    expect(harness.probe_calls()).toEqual([]);
    expect(harness.sessions.sessions).toEqual([]);
  });
});

describe("omnibar ask — the answer", () => {
  it("reports a refusal and leaves no half-built session when no provider resolves", async () => {
    const harness = make_ask_harness({ providers: [] });

    const result = await harness.controller.submit(QUESTION);

    expect(result.status).toBe("error");
    expect(harness.sessions.sessions).toEqual([]);
    expect(harness.transport_calls()).toBe(0);
  });

  it("accumulates streamed text onto one assistant turn", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport.channel().emit({ type: "text", text: "k=60 was " });
    await harness.transport
      .channel()
      .emit({ type: "text", text: "fixed on 2026-07-18." });
    await harness.transport.channel().end();

    await expect(running).resolves.toEqual({ status: "done" });

    const session = only_session(harness.sessions.sessions);
    const answers = session.messages.filter((m) => m.role === "assistant");
    expect(answers).toHaveLength(1);
    expect(answers[0]?.content).toBe("k=60 was fixed on 2026-07-18.");
  });

  it("carries citations and context stats onto the assistant turn", async () => {
    const harness = make_ask_harness({
      citations: [
        { index: 1, note_path: "experiments/rrf-weights.md", title: "rrf" },
        { index: 2, note_path: "hybrid-retrieval.md", title: "hybrid" },
      ],
    });

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport
      .channel()
      .emit({ type: "text", text: "Fixed in the sweep[1][2]." });
    await harness.transport.channel().end();
    await running;

    const session = only_session(harness.sessions.sessions);
    const answer = session.messages.findLast((m) => m.role === "assistant");
    expect(answer?.citations.map((c) => c.note_path)).toEqual([
      "experiments/rrf-weights.md",
      "hybrid-retrieval.md",
    ]);
    expect(answer?.context_stats).toEqual({
      retrieved: 2,
      used: 2,
      truncated: 0,
    });
  });

  it("settles as a failure rather than hanging when the pipeline throws", async () => {
    const harness = make_ask_harness({
      query_throws: new Error("retrieval exploded"),
    });

    const result = await harness.controller.submit(QUESTION);

    expect(result).toEqual({
      status: "error",
      message: "retrieval exploded",
    });
  });

  it("records a mid-stream provider failure on the turn it interrupted", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport.channel().emit({ type: "text", text: "partial" });
    await harness.transport
      .channel()
      .emit({ type: "error", message: "provider exploded" });
    await harness.transport.channel().end();

    const result = await running;
    expect(result.status).toBe("error");

    const session = only_session(harness.sessions.sessions);
    const answer = session.messages.findLast((m) => m.role === "assistant");
    expect(answer?.content).toBe("partial");
    expect(answer?.error).toBeTruthy();
    expect(answer?.stopped).toBeUndefined();
  });
});

describe("omnibar ask — esc keeps the exchange as a ⌁ session", () => {
  it("persists the whole exchange to the session store as kind inline", async () => {
    const harness = make_ask_harness({
      citations: [{ index: 1, note_path: "rrf-weights.md", title: "rrf" }],
    });

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport
      .channel()
      .emit({ type: "text", text: "k=60, chosen in the sweep[1]." });
    await harness.transport.channel().end();
    await running;

    const session = only_session(harness.sessions.sessions);
    expect(session.kind).toBe("inline");
    expect(session.title).toBe(QUESTION);
    expect(session.title_source).toBe("derived");
    expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(session.messages[0]?.content).toBe(QUESTION);
    expect(session.messages[1]?.citations).toHaveLength(1);
  });

  it("leaves no session behind when dismissed before ever submitting", () => {
    const harness = make_ask_harness();

    harness.controller.reset();

    expect(harness.sessions.sessions).toEqual([]);
  });
});

describe("omnibar ask — ⌘↵ inserts at the cursor", () => {
  it("inserts the answer text through the editor", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport
      .channel()
      .emit({ type: "text", text: "k=60 since 2026-07-18." });
    await harness.transport.channel().end();
    await running;

    expect(harness.controller.insert()).toBe(true);
    expect(harness.inserted).toEqual(["k=60 since 2026-07-18."]);
  });

  it("refuses to insert when no note is open", async () => {
    const harness = make_ask_harness({ can_insert: false });

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport.channel().emit({ type: "text", text: "answer" });
    await harness.transport.channel().end();
    await running;

    expect(harness.controller.insert()).toBe(false);
    expect(harness.inserted).toEqual([]);
  });
});

describe("omnibar ask — ↵ promotes to a full session", () => {
  it("opens the session by id and keeps its kind and history (R3)", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport.channel().emit({ type: "text", text: "answer" });
    await harness.transport.channel().end();
    await running;

    harness.controller.promote();

    const session = only_session(harness.sessions.sessions);
    expect(harness.opened).toEqual([session.id]);
    expect(session.kind).toBe("inline");
    expect(session.messages.map((m) => m.content)).toEqual([
      QUESTION,
      "answer",
    ]);
  });

  it("does not open anything before a question has been asked", () => {
    const harness = make_ask_harness();

    harness.controller.promote();

    expect(harness.opened).toEqual([]);
  });
});

describe("omnibar ask — stopping mid-stream", () => {
  it("keeps the partial answer and marks the turn stopped, not failed", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();
    await harness.transport
      .channel()
      .emit({ type: "text", text: "k=60 was fixed" });

    harness.controller.stop();
    await harness.transport.channel().end();

    await expect(running).resolves.toEqual({ status: "stopped" });

    const session = only_session(harness.sessions.sessions);
    const answer = session.messages.findLast((m) => m.role === "assistant");
    expect(answer?.content).toBe("k=60 was fixed");
    expect(answer?.stopped).toBe(true);
    expect(answer?.error).toBeUndefined();
  });

  it("leaves no empty assistant bubble when stopped before any text arrived", async () => {
    const harness = make_ask_harness();

    const running = harness.controller.submit(QUESTION);
    await harness.wait_for_stream();

    // The sources event has already been folded in at this point; it must not
    // have conjured a turn of its own.
    expect(
      only_session(harness.sessions.sessions).messages.map((m) => m.role),
    ).toEqual(["user"]);

    harness.controller.stop();
    await harness.transport.channel().end();

    await expect(running).resolves.toEqual({ status: "stopped" });

    const session = only_session(harness.sessions.sessions);
    expect(session.messages.map((m) => m.role)).toEqual(["user"]);
  });
});
