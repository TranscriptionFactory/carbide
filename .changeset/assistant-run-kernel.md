---
"carbide": minor
---

feat(assistant): every AI request is now a tracked run you can see and stop

AI work used to be owned by whichever surface started it. An inline edit, a panel
message, a chat question and an agent turn each had their own cancellation, their own
error wording, and their own idea of which provider `auto` meant — and closing the
surface could silently strand or kill the work. All of it now runs through one run
kernel.

What changes for you: the status bar shows how many AI runs are in flight, and its
popover lists them with a working Stop on each. Runs are no longer tied to the thing
that started them — **closing the inline AI menu no longer cancels the run**; it keeps
going and stays stoppable from the popover. Errors from every surface are worded the
same way, once.

Stop now works on providers that could never be stopped before. A CLI that writes to a
file instead of streaming (the codex preset, for example) had no cancellation at all —
pressing Stop did nothing. Those runs are now genuinely cancelled, and the underlying
CLI process is killed rather than left running.

`auto` now checks that a provider is actually installed before choosing it, everywhere.
Several paths — retrieval questions, the MCP bridge, and both plugin AI entry points —
previously took the first configured provider without probing it, so `auto` could
select a provider whose CLI was not installed and fail at the point of use.

Three fixes to the CLI plumbing underneath, all of which could bite regardless of the
above:

- A CLI that hit its timeout was never actually killed. The timeout waited on the child
  process while holding the lock its own kill path needed, so it blocked until the CLI
  exited on its own and then reported a timeout late.
- Provider errors were sometimes replaced by `Failed to write to stdin: Broken pipe`.
  Any CLI that takes its prompt as an argument, ignores stdin, or exits early could trip
  this, and it discarded the CLI's own error message — the one explaining what actually
  went wrong.
- Pressing Stop could surface an error toast instead of simply cancelling, because the
  cancellation acknowledgement was being treated as a provider failure.
