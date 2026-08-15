---
"carbide": patch
---

Make ask mode stream its answer, stop it wandering the vault, and bound how long it can run

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
still where editing happens, and is unchanged. Inline generation is unchanged
too — it keeps its own invocation.

Nothing stopped a long run. The AI execution timeout in settings was never
applied to a streamed run, which is why cancelling by hand was the only way out.
It now applies: the run is stopped when the limit elapses and says so, naming
the limit, rather than waiting silently forever.

The waiting indicator also counts elapsed time now, so a slow answer looks slow
rather than stuck.

Existing provider settings pick all of this up on upgrade, keeping any command
path you had set. A provider whose arguments you edited by hand is left exactly
as you wrote it, and goes on behaving as before; reset it to the preset if you
want the new behaviour.
