---
"carbide": patch
---

Stream CLI provider output as it arrives, run it without tools, and bound how long ask mode can take

Asking a question with the Claude Code provider could sit on a spinner reading
"Waiting for Claude Code…" for minutes, while the same question in agent mode
came back in under one. Three separate things were wrong.

The answer was never streamed. Carbide decided a command-line provider could
stream by checking that its arguments did not name an output file — true of the
Claude preset, whose output format nevertheless holds everything back until the
process exits. So the panel waited for the entire answer and then printed it at
once. A provider now states its streaming invocation outright instead of having
it guessed, and the Claude preset asks for real streaming output, so text
appears as it is generated.

The question was answered by a full agent, not a reader. Ask mode launched the
provider inside your vault with every tool enabled, so a question phrased like
an instruction — "use a regex to edit this note" — became a filesystem session
that searched, read and tried to edit its way through your notes, even though
the notes it needed had already been retrieved and handed to it. Ask runs now
launch with no tools at all. Ask answers from the retrieved notes; agent mode is
still where editing happens, and is unchanged.

**Inline edits change too, and deliberately.** A provider has one streaming
invocation, not one per surface, so inline generation — Cmd-K and the rest —
now shares it. Two consequences worth knowing. Inline output streams as it is
written, where before it was pinned to the same buffered format and arrived in
one lump at the end. And inline prompts now run with no tools and no MCP servers:
if you have been relying on an MCP server answering an inline prompt, that will
stop working. A rewrite-this-paragraph instruction has no business searching your
vault, but the trade is a real one and you should not have to discover it.

Nothing stopped a long run. The AI execution timeout in settings was never
applied to a streamed run, which is why cancelling by hand was the only way out.
It now applies to ask mode, which stops when the limit elapses and says so,
naming the limit, rather than waiting silently forever. Inline edits stay
unbounded on purpose: they are interactive and the popover's Stop is a better
answer there than a timer cutting off a rewrite mid-sentence.

The waiting indicator also counts elapsed time now, so a slow answer looks slow
rather than stuck.

Existing provider settings pick all of this up on upgrade, keeping any command
path you had set. A provider whose arguments you edited by hand is left exactly
as you wrote it, and goes on behaving as before; reset it to the preset if you
want the new behaviour.
