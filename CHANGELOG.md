# carbide

## 2.30.3

### Patch Changes

- 04e8934: Refresh the markdown toolchain pins and verify every download

  The four language tools installed from Settings > Tools were pinned to versions
  that had drifted badly behind upstream, and half of them were being installed
  without any integrity check.

  Pins now track the current upstream releases:
  - rumdl `0.1.59` → `0.2.55` (93 releases behind)
  - IWE `0.0.67` → `0.19.1` (37 releases behind)
  - Markdown Oxide `0.25.10` → `0.25.12` (2 releases behind)
  - Marksman stays at `2026-02-08`, already current

  All sixteen tool/platform SHA-256 hashes are now real. Previously the IWE and
  Markdown Oxide entries carried the literal string `"TODO"`, which
  `downloader::download_tool` treats as "skip verification" — so eight of the
  sixteen downloads were being written to disk, marked executable, ad-hoc
  codesigned on macOS, and spawned as a long-lived LSP child process without their
  contents ever being checked. Each hash was computed from the released artifact
  and independently reconfirmed before being recorded.

  Also fixes IWE's Windows asset name, which asked for
  `iwe-v{version}-x86_64-pc-windows-msvc.tar.gz`. Upstream has only ever published
  that build as a `.zip`, so installing IWE on Windows had been 404-ing since the
  entry was first written — this was not upstream drift.

  A new registry test asserts that every SHA-256 is 64 hex characters, so a
  placeholder can no longer silently disable integrity verification.

- f9ee755: Fix Settings > Tools "Uninstall" leaving the tool on disk after a version bump

  `toolchain_uninstall` built its delete path from the _currently pinned_ version,
  so it could only ever remove `toolchain/<tool>/<current-pin>/<binary>`. Any copy
  installed under an earlier pin sat in a sibling directory and was never touched —
  while the command still reported success and flipped the UI to "Not installed".
  Uninstalling a tool you had installed before an app update therefore appeared to
  work and silently did nothing.

  Uninstall now removes the whole `toolchain/<tool>/` directory, clearing every
  downloaded version. This also fixes the related leak: old version directories
  were never garbage-collected on a bump, so each new pin left the previous
  binary behind permanently.

  Two smaller corrections in the same path: directory removal used non-recursive
  `remove_dir` behind `let _ =`, so a failure was silently discarded and reported
  as a successful uninstall — errors now propagate. And the cleanup no longer
  attempts to remove the shared `toolchain/` parent, which raced against other
  tools installing concurrently.

## 2.30.2

### Patch Changes

- 67c2c83: Stream CLI provider output as it arrives, run it without tools, and bound how long ask mode can take

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

- 4bb112a: Parse nested callouts and collapsible sections instead of showing raw HTML

  A callout written inside another callout, or inside a plain blockquote, stayed a
  quoted block: the inner `[!warning]` line was rendered as literal text rather
  than becoming a callout. A `<details>` block written inside a callout was worse
  — it showed the raw `<details>`, `<summary>` and `</details>` tags as visible
  text in the callout body, because the collapsible was never recognised there at
  all. The reverse nesting failed too: a callout written inside a `<details>`
  block came out as an ordinary quote.

  Markdown conversion only ever looked at the top level of a note, so anything
  written one level in was left as-is. It now descends through blockquotes,
  callout bodies and collapsible content, so callouts and collapsibles are
  recognised wherever they are nested and in either order. Existing notes pick
  this up on open, and the nested forms round-trip back to the same markdown they
  were written as.

  Inline HTML in ordinary prose is untouched — writing about the `<details>` tag
  mid-sentence still stays plain text.

  Embeds written inside a callout or a collapsible now work too. An image or note
  embed such as `![[diagram.png]]` inside a callout was previously left as plain
  text, and saving the note rewrote it to `\![[diagram.png]]` — an escaped form
  that no longer means an embed, so the picture never came back. An `<iframe>` or
  `<video>` in the same position stayed visible as raw HTML markup instead of
  becoming a player. Both are now recognised inside callouts and collapsibles, at
  any nesting depth, and saving no longer rewrites the embed syntax. Embeds in
  blockquotes and list items behave as they did before.

- 36e49e0: Remove a callout from its own menu, and turn a whole callout into something else

  Getting rid of a callout used to require knowing an undocumented gesture: put
  the caret at the very start of the title and press Backspace. Nothing in the
  interface said so, and there was no menu item, command or shortcut for it.
  Callouts now carry a "Remove callout" button in the menu behind the callout
  icon, next to the Collapsible toggle. It lifts the callout's content out in
  place — the title becomes an ordinary paragraph and every block in the body
  stays exactly as it was. The Backspace gesture still works and now produces an
  identical result, because both go through the same operation.

  Turn Into on a callout was also wrong, in two different directions depending on
  how you had selected it. With a single callout selected, only the one paragraph
  holding the caret converted and the callout itself survived — so "Turn Into →
  Heading 2" on a callout appeared to do almost nothing. With two or more blocks
  selected, the opposite happened: the entire callout, title and body together,
  was flattened into a single heading and the internal structure was lost.

  Both now do the same, sensible thing. A callout turned into Heading 2 becomes
  that heading from its title, followed by its body blocks as paragraphs:

  ```
  > [!note] Alpha              ## Alpha
  > Bravo          becomes
  > Charlie                    Bravo

                               Charlie
  ```

  Paragraph, Bullet List, Ordered List and Todo List follow the same rule, one
  target block per block inside the callout, and single-block and multi-block
  selections now agree for all of them. Collapsible sections behave the same way
  as callouts. This matches what Turn Into already did for blockquotes and lists,
  whose behaviour is unchanged.

  Turn Into in the right-click menu now also targets the block you right-clicked,
  the way Copy, Duplicate, Insert and Delete already did, instead of whichever
  block happened to hold the text cursor.

- 7c8ac76: Scope find and replace to the selected text, and keep the match count live

  Two find-in-file problems, both of which showed up as "replace doesn't work".

  Find now honours a selection. Opening the find bar with several lines selected
  scopes the search to exactly that range: the count, the highlights, Replace and
  Replace All all stop at its edges, so Replace All no longer rewrites the parts
  of the note you deliberately left out. Previously the selection vanished the
  moment the bar took focus and the search silently covered the whole document.
  The scope follows the text as you edit — replacing inside it keeps it aligned —
  and if you delete the scoped passage outright, find falls back to the whole
  note rather than searching an empty range.

  A third toggle beside Match case and Whole word shows and controls this. It
  appears whenever you had text selected as the bar opened, lit when find is
  scoped to that selection, and turning it off searches the whole note again
  without losing the range — so you can flip between the two. A short single-line
  selection seeds the query from it instead of scoping, and leaves the toggle
  available but off.

  The match count no longer goes stale. Typing new matching text into the note
  used to leave the counter reading its old value while the new matches were
  already highlighted on screen, and if the stale position pointed past the end of
  the match list, both Replace buttons greyed out even though matches were plainly
  visible. The count and the selected match now update as the document changes.

  One thing worth knowing, now noted on the find field itself: find searches the
  rendered text, not the Markdown source. Block markers that Carbide renders as
  structure rather than text — the `>` of a blockquote, a callout's `[!note]` —
  are not part of that text and cannot be found.

- 38d43d5: Make inline AI runs show up in history and open when you click them

  Inline AI edits were recorded only when you accepted one, and even then the row
  in the assistant panel's history did nothing when clicked. Everything else
  vanished: a suggestion you rejected, a run that errored partway, one whose menu
  you closed while it was still streaming, and every inline edit made in source
  mode left no trace at all.

  An inline run now opens its ⌁ history entry the moment it starts, and fills in
  the reply when it settles — accepted, rejected, failed, or cut short. Clicking
  any entry in the history opens its transcript, where before only chat sessions
  responded and everything else was a dead click. The ⌁ group in the history list
  also starts open rather than collapsed, so inline runs are visible without
  finding the disclosure first.

  Live runs in the assistant status popover now carry the note they belong to and
  the transcript they produced, so the run you are watching can be traced back to
  what asked for it.

  The toast that follows an accepted inline edit now says "View transcript",
  which is what its button has always done. It was labelled "Continue in chat"
  and never opened the chat.

## 2.30.1

### Patch Changes

- 99c4454: Let a custom AI provider change its transport after it is created

  A custom provider's transport — CLI or API — could be chosen once, on the form
  that created it, and never again. The edit panel exposed everything else about
  the provider (name, command, base URL, model, ACP agent) but not the one field
  that decides which of those are even applicable.

  That was more than an inconvenience, because the ACP agent picker only appears
  for CLI providers. A provider added as API could therefore never be given an ACP
  agent, and so was permanently shut out of agent mode. The only way across was to
  delete the provider and add it again, losing its settings.

  The edit panel now carries the same Transport control as the create form, for
  any provider you added yourself. Presets are unchanged — their transport is part
  of what makes them that preset.

  Switching transport keeps everything outside the transport (name, model) and
  starts the new transport's own fields empty, since the two kinds share none:
  command and arguments belong to CLI, base URL and API key variable to API. An
  ACP agent is dropped when you switch to API, where it would have no effect.

- 49969d5: Stop copied text from carrying callout and collapsible markup

  Selecting part of a callout and copying it pasted `> [!note] Title` and a `> `
  prefix on every line, even though the selection was plain prose. The same
  happened with collapsible sections, which pasted a full `<details>` and
  `<summary>` block. Whether it happened depended on where the selection started:
  dragging from the callout's title — the natural gesture — carried the markup,
  while starting inside the body did not.

  Worse, a selection that covered only the callout title or only the collapsible
  summary copied **nothing at all**. The clipboard came back empty with no
  indication anything had gone wrong.

  Copying a partial selection now yields exactly the text that was selected, with
  no callout or collapsible markup around it. Copying a whole callout or
  collapsible — by selecting the block or using the block menu's Copy — still
  produces `> [!note] …` and `<details>…</details>` as before, and a callout that
  sits untouched inside a wider selection keeps its markup too.

- 52ad03f: Show notes edited outside Carbide in search results

  Notes edited outside Carbide — by git, a sync tool, an agent, or another editor
  — now show up in search and in query blocks. Previously their old text kept
  being returned until you reopened the vault or opened the omnibar.

  Carbide watched for those edits and did the right thing in the editor: an open
  note reloaded, an unsaved one raised the conflict card. But it never told the
  search index, so the note's previous contents stayed searchable indefinitely. A
  full-text search, a `with "text"` query, and a `content contains` filter all
  answered from whatever the body had been at the last index build.

  Only the changed note is re-indexed, so pulling a branch that rewrites many
  notes no longer costs a full vault rebuild. Query blocks pick the change up on
  their next refresh.

- b964995: Stop autosave from silently invalidating an inline AI edit you accept

  Accepting an inline AI edit compared the note against the snapshot taken before
  the stream started, while autosave was free to write the note in the meantime.
  A slow stream, or any pause before clicking Accept, was enough: by the time you
  accepted, the file on disk no longer matched the snapshot, so the write was
  refused. Earlier versions did this silently — the text was on screen and on
  disk, so it looked fine, while the review centre quietly filled up with edits
  marked out of date. More recently it surfaced as a "Proposal is out of date"
  message on an edit that had plainly worked.

  Two things changed. While the editor is showing AI text you have not accepted
  yet, the note no longer autosaves — which also means rejecting the suggestion
  leaves nothing behind on disk, where before the text could already have been
  written. And accepting now compares against the note as it actually stands on
  disk rather than an editor snapshot, so it no longer matters whether the note
  had unsaved changes when the run started.

  An edit made outside Carbide while the AI is streaming is still caught and still
  refuses to apply — that check is unchanged.

  Accepting an inline edit also stopped raising the external-modification banner
  on the note you had just edited. The editor treats a note whose text is already
  on disk as saved, not as changed behind your back.

- 3662c49: Keep inline AI edits in the note they started in, and out of the model's chatter

  Two problems with inline AI (Cmd-K in the editor), both of which put text in
  your note that you never asked for.

  An inline run remembered only one note at a time, app-wide. Start an edit in one
  note, switch to another, then accept, and the accept was aimed at the note now
  on screen while still carrying the _other_ note's text — a change that reads as
  "delete everything here, paste everything from there". Accepting into a
  different note than the one the run started in is now refused outright, with a
  message naming the note to go back to.

  Nothing filtered what the model said. If it replied "Here is your response:" or
  wrapped its answer in a code fence, that went straight into the document —
  visibly in the visual editor, and irreversibly in source mode, which has no
  review step. Inline output is now cleaned once the reply is complete: a leading
  preamble and a fence wrapping the whole answer are removed, while fenced code
  that is itself the answer, and prose that merely opens like a preamble, are left
  alone. A free-form inline prompt also carries the same "output only the result,
  no commentary, no code fences" instruction the built-in commands always had —
  previously typing your own prompt replaced it.

- 29d29d0: Show an applied AI proposal in the editor without reopening the tab

  Accepting a proposal that targeted a note changed the file on disk, but the open
  editor kept showing the old text. Closing the tab and reopening it was the only
  way to see what had been applied — the edit had happened, it just wasn't
  visible. Proposals targeting an open document already updated in place; notes
  did not.

  Accepting now reconciles the open note with what was written, using the same
  rules the assistant's agent mode already followed for the files it edits.

  If the note has unsaved edits of its own, accepting no longer replaces them
  silently. The tab is marked as changed on disk and you decide which side to
  keep, exactly as when something outside Carbide edits a note you are working on.

  Accept also tells you when it did not apply anything. A proposal whose note
  changed after the draft was made is now reported as out of date instead of
  quietly landing in the review centre as stale, and a write that fails is
  reported with its reason rather than being recorded as applied.

- 251a97f: Fix `>=` and `<=` in queries returning nothing, and keep "not" when a clause changes kind

  A query written with `>=` or `<=` — from the query builder's operator dropdown,
  from the inline suggestions, or typed by hand — quietly matched nothing. The
  parser read only the first character of the operator and then swallowed the
  leftover `=` into the value, so `with due >= "now()-7d"` was solved as "due is
  greater than the text `= "now()-7d"`", which nothing can be. No error was shown;
  the result was simply an empty list. Both two-character operators now parse
  whole, and every operator the builder offers is covered by a test that runs
  builder output through the parser and into the query backend.

  In the structured builder, ticking "not" on a clause and then changing that
  clause's kind silently cleared the negation. The clause keeps its "not" now.

  The form selector at the top of the builder is gone, along with the `folders`
  and `files` query forms. Nothing ever read them — all three forms returned
  notes — so the selector only ever suggested a choice that did not exist.
  Queries starting with `notes`, or with no form word at all, are unaffected.

- b964995: Stop every save from triggering a file-tree refresh and an index sync

  Saving a note produces more than one filesystem event, and Carbide recognised
  only the first of them as its own. The trailing event — the one the atomic write
  produces when it moves the finished file into place — looked like somebody else
  had touched the note, so each save also refreshed the file tree, re-synced the
  note into the index, and refreshed the task list.

  That event now reports the same modification time as the write that produced it,
  which is how Carbide already recognises its own saves, so it is matched rather
  than acted on. A note genuinely created or replaced on disk by something else
  still reports a different time and is still picked up.

- fa45085: Stop the app freezing when you edit a note while the index is rebuilding

  Rebuilding the index while continuing to type would beachball the whole window
  for ten seconds at a stretch, over and over, until the rebuild finished. Nothing
  in the UI responded — not the editor, not the sidebar, not the menus.

  Editing a note is what triggered it. Every markdown change refreshes the task
  list, and the five commands behind that refresh ran on the thread that draws the
  app rather than on a background one. Each of them opened its own database
  connection, and opening one during a rebuild meant waiting on the rebuild's write
  lock — with the app's own event loop stuck behind that wait.

  Those commands now run in the background, so a rebuild can hold the database for
  as long as it needs without the window stopping. Two things go with it: your own
  saves no longer trigger a task-list refresh they never needed, and a save that
  lands while a folder is being re-indexed is written straight away instead of
  queueing behind the rest of the pass.

  The lint rule meant to catch exactly this class of mistake could not see those
  five commands, because it only recognised one of the two ways to write the
  attribute. It now recognises both, and covers ten further commands it had also
  been missing.

## 2.30.0

### Minor Changes

- ce4b54d: Replace the agent's Safe | Power control with a live Auto-approve switch

  Agent mode asked you to choose a permission posture up front, once, before you
  knew what the agent would request — and then held you to it for the rest of the
  conversation. The two labels also oversold both ends: Power still interrupted
  for deletions and shell commands, and Safe did not "ask before edits" for
  Carbide's own tools, it silently hid them.

  Auto-approve replaces it with one switch you can flip at any point, including
  while a permission prompt is on screen. Off (the default for every new session)
  every edit, command and deletion asks first. On, none of them do — and turning
  it on answers whatever prompt the agent is currently waiting on. The same state
  is reachable from the composer switch and from "Allow everything for this
  session" inside a permission prompt.

  Carbide's own vault tools are now always offered to the agent and gated at the
  moment of the call, so a blocked write comes back as an explanation the agent
  can relay to you rather than a capability it never appeared to have. Approving
  a prompt no longer risks the call being refused anyway.

  Ask | Agent is unchanged.

  **Removed:** the "Default Agent Permission" setting. Granting blanket approval
  to sessions that do not exist yet is exactly the pre-emptive consent this
  change removes; new sessions always start with auto-approve off. Existing
  sessions saved in Power mode carry over as auto-approved.

## 2.29.4

### Patch Changes

- 3c6adac: An agent turn can no longer revert your own edits, or edits you refused.

  Every agent turn ended by restoring each file the agent had touched back to a checkpoint taken before the turn. That restore was unconditional, and it had two ways of destroying work. If you edited one of those notes while the turn was still running, the restore wrote the pre-turn content over your edit — the end-of-turn comparison could not tell your bytes from the agent's, so it reverted both. And a tool you _denied_ still had its file reverted: the agent announces which files a tool intends to touch before asking your permission, and it repeats that list when the tool finishes, including when the tool never ran because you said no. Carbide was not checking whether the tool succeeded, so refusing an edit could still lose the version you were protecting.

  Both are closed. Carbide now records each file's modification time at the moment the agent last successfully wrote to it, and the restore refuses any file that changed on disk afterwards — your edit stays, and the turn reports the note as kept rather than proposed. Files belonging to tools that failed or that you denied are excluded from the restore entirely, while the vault refresh still accounts for them, so a partially completed write does not leave the file tree stale.

  Two smaller hardening changes ride along: the CLI's `git restore` route now requires an explicit confirmation flag, matching the discard route it sits beside, and restoring a file refuses when the working copy differs from the last commit rather than overwriting it. That second change also applies to restoring a version from the history panel.

- 3c6adac: Messages typed while the assistant is replying are no longer swallowed, and the composer grows with what you write.

  Pressing Enter during a reply appeared to send — the composer cleared — but nothing was sent and nothing was queued. The text was gone. Because the Send button is replaced by Stop while a reply streams, Enter was the only way to reach this, which is why it read as a message vanishing at random rather than as a disabled control.

  A message sent mid-reply is now held, shown in the transcript as a pending bubble so you can see it is waiting, and sent when the reply finishes. If you **stop** the reply instead, the held message is returned to the composer as editable text rather than being sent or discarded — stopping says something about whether to send, not about whether you wanted the words. A reply that errors does the same. Switching conversations discards a held message rather than carrying it across, so it can never be sent into the wrong conversation.

  Three other places that quietly ate a message now hand it back the same way: AI turned off, no provider configured, and a provider that does not support agent mode.

  The composer also grows as you type, up to a maximum height, instead of staying two lines tall.

- 3c6adac: Semantic indexing no longer stalls partway through, and the progress indicator no longer restarts or hangs.

  Embedding and text indexing shared a single cancellation signal, so any work that touched the text index — opening a vault, rebuilding, indexing a batch of paths — aborted an embedding pass that happened to be running. The follow-up request that would have restarted it was then dropped, because the system still believed a pass was in flight. The practical result was sections of your vault left unembedded, and staying that way until you reopened the vault.

  Embedding now has its own cancellation signal, and a pass interrupted or requested while another is running is re-queued exactly once rather than discarded. Cancelled passes no longer report themselves as completed.

  Two visible fixes come with it. A vault where every note is already embedded but sections are still pending now finishes and clears the "Embedding sections" indicator instead of showing it indefinitely. And saving while a vault-wide sync is running no longer restarts that sync from the beginning — with autosave on, a long sync could be reset every couple of seconds and visibly count back up from zero without ever finishing.

  Also fixed: when part of a note failed to encode, the note was recorded as embedded anyway using only the parts that succeeded, permanently. Those notes are now left for the next pass to retry.

- 3c6adac: Renaming a note shortly after saving it no longer risks losing the file.

  Carbide commits your work automatically a few seconds after a save, and it queued the _paths_ it was going to commit rather than resolving them at commit time. Renaming a note inside that window left a queued path pointing at a file that no longer existed, and the commit stage treated "no file here" as "the user deleted this" — so an automatic commit labelled `Update:` could stage a deletion of the note you had just renamed. The renamed file was never queued at all, because a rename produces no save, so it stayed untracked and a later "Discard All" would delete it outright.

  Automatic commits can no longer stage a deletion under any circumstances; that is now reserved for the explicit delete path. Queued paths are re-checked against the vault at commit time, and a rename inside the window moves the queued entry onto the new name, so the file that actually exists is the one that gets committed and tracked.

  Two related fixes. In interval mode, a commit now lands on schedule instead of being pushed further out by every save — previously, continuous work could postpone an automatic commit indefinitely. And concurrent commits no longer overwrite each other: a commit verifies the branch is where it expected before moving it.

  Finally, saving a note whose file changed on disk behind Carbide's back no longer silently overwrites those changes. Closing or quitting with such a note open now stops and asks, offering to overwrite the disk copy, discard your version, or cancel — and quitting waits for that answer rather than writing over the file on its way out. The two places that save without a user present, link repair and window restore, now skip the write and log it instead of forcing it through.

- 3c6adac: Ask replies now show how much of the retrieval budget the answer used.

  When Carbide answers a question from your vault, it gathers as much of the matching material as fits a configurable budget and silently drops the rest. There was no way to tell whether an answer had been given the whole picture or a fraction of it. The Sources section of a reply now reports the share of that budget the turn consumed, with the underlying figures alongside it.

  This is deliberately labelled as the Ask retrieval budget and measured in characters, because that is the quantity Carbide actually knows. It is not the model's context window, and no token figure is shown: the agent backends do not report token usage at all today, so any such number would have been invented. Agent-mode turns therefore show no meter rather than a misleading one.

- 3c6adac: An agent turn now tells you when its edits could not be offered for review.

  Carbide reviews an agent's work by comparing the vault against a checkpoint taken before the turn and offering each change as a proposal you accept or reject. Several kinds of edit fall outside that mechanism, and until now they fell out of it silently: files the agent created (so a rename, which is a create plus a delete, was invisible in both halves), anything that is not a Markdown note, and every edit in a vault with no git repository or no commits yet. In each case the work was written to disk and simply never appeared for review, with no indication that anything had been skipped.

  The turn now reports what happened in the transcript: which files were edited outside review, which were kept on disk rather than proposed, and — where there was no checkpoint to compare against — why, along with an offer to initialise git so future turns are reviewable. Carbide never initialises git on its own; the notice names the command and leaves it to you.

  A turn where everything became a proposal adds nothing to the transcript, so this is silent in the ordinary case.

  Note that a note you edited yourself during a turn is reported distinctly from a failure: it tells you your version was kept and nothing was proposed for that file.

- 3c6adac: Typing while a note saves no longer risks losing those keystrokes.

  When a save finished, Carbide marked the buffer clean against whatever text the editor had most recently handed to it — not against the bytes it had actually written to disk. Those two can differ. Serialising the editor's document is deferred slightly, so a save that takes longer than that delay writes one version and then baselines a newer one. The buffer went clean over content that had never been written, autosave stops re-firing once a buffer is clean, and the next automatic commit captured the older file.

  A save now baselines exactly the bytes it wrote, and then re-checks the live document. If you kept typing during the write, the buffer stays dirty — correctly, because what you see genuinely differs from what is on disk — and the next autosave picks it up.

  The check reads from whichever surface is actually live, so this behaves correctly in source mode and split view, where the rich-text document is intentionally not the authority.

- d015442: Agent tool calls now show what they actually ran, instead of `Terminal {}`.

  A tool call is announced the moment the model starts emitting it, before its arguments have finished streaming — so the first frame carries an empty input, and for tools whose display name is derived from that input, an empty name too. Carbide took its summary and its title from that first frame and never revisited them. The corrected values arrived a moment later and were decoded, used internally to work out which files the call touched, and then thrown away. A shell command therefore showed as `Terminal {}` for the entire life of the call, however long it ran.

  Tool cards now pick up the refined command and name when they arrive. A later update that carries nothing cannot overwrite a summary that already arrived, so a call does not lose its detail partway through. Where a permission prompt already had the complete arguments, that text is now used to repair a placeholder rather than being discarded.

  Calls that genuinely never report arguments now render no summary at all, instead of an empty `{}`.

- d56fe48: Saving a note no longer raises a spurious "modified externally" card. Carbide watches the vault so it can react to edits made outside the app, and it muted the filesystem event caused by its own save — but only one such event. A single save rarely produces exactly one: the watcher flushes a pending change event as soon as a structural event for the same path arrives, so one save could be delivered as two, and on macOS a save surfaces as several separate notifications. The extra delivery arrived unmuted, Carbide read its own save as somebody else's edit, and if the note had unsaved changes it raised a conflict card that offered to discard them. Typing while autosave ran made this the ordinary case rather than a rare one.

  Carbide now recognises its own writes by what it wrote rather than by counting events: a save records the modification time it produced, and every echo of that save reports the same time and is ignored, however many arrive. An edit from anywhere else carries a different time and still raises the card immediately — that path is unchanged, and deliberately so, since silently swallowing a real external edit would be the worse failure.

  Renaming or deleting a note from inside Carbide also no longer produces a spurious card or closes a tab unexpectedly; those operations previously muted nothing at all. Muting is now specific to the operation that armed it, so an internal rewrite of a file cannot hide somebody else's deletion of it.

  The two places that raise the card now log distinctly, with the event type and how long ago Carbide last wrote the path, so a future report of this symptom can be read from the log rather than reconstructed.

## 2.29.3

### Patch Changes

- 94affc6: Linked sources in the file explorer now show their subfolders. A linked source is a folder of PDFs and saved pages that lives outside the vault, and the explorer only ever presented it as one flat list: every document a scan found was filed directly under the source, no matter which subfolder it actually sat in. Two papers with the same file name in different subfolders resolved to the same entry, so one silently replaced the other, and anything more than three levels below the source folder was never scanned at all. Reference libraries are rarely flat — Zotero stores each attachment under its own key, and hand-kept folders are usually split by project or year — so this was most of the structure being dropped.

  Documents now keep their location inside the source: subfolders appear as real folders in the explorer, expand like any other folder, and same-named files in different subfolders stay distinct. The walk reaches sixteen levels deep instead of three. Existing sources correct themselves on the next scan; the entry a document had under the old flat layout is replaced rather than left behind as a duplicate.

## 2.29.2

### Patch Changes

- e8664dd: Agent mode for the Claude, Codex and pi presets now runs against pinned adapter versions and checks the Node runtime before it starts. Those three presets do not speak the agent protocol themselves — Carbide launches them through an adapter package fetched with npx — and until now that package was resolved fresh on every cold launch, so an upstream release nobody had run could reach every user at once with the agent's full system access, and a bug report had no version to cite. The adapter versions are now fixed and change only when we change them. Carbide also reads the version of the Node that actually backs the resolved npx, rather than whichever Node happens to come first on PATH, and says so plainly when it is too old; previously npx resolved fine and the adapter died part-way through its handshake, which surfaced as nothing but a session that never started. Carbide does not install Node, and a Node it cannot find or read never blocks a launch. The opencode preset speaks the protocol directly and is unaffected — it still needs no Node at all.

  Editing a note through an agent now explains a failed match instead of only refusing it. When the text an agent asks to replace is not found byte-for-byte, Carbide retries the search under progressively looser rules and reports which difference was responsible — trailing spaces, line endings, indentation, or curly quotes and dashes — so the model can correct the specific thing rather than guess. When the text genuinely differs, it names the closest region of the note by line number and quotes it. When several copies match, it lists the line of each so a unique one can be picked. A near-match is only ever described, never applied: an approximate edit to your notes is worse than a failed one, so nothing is written on a guess. This matters most with smaller local models, which produce these near-misses constantly and previously got a single unhelpful sentence in reply.

## 2.29.1

### Patch Changes

- 4447075: Fixed semantic search producing no embeddings on Apple Silicon. Since June the encoder has run in half precision on the GPU, where the attention mask it builds internally evaluates to "not a number" — so every vector it produced was invalid. The vectors were stored anyway and quietly ruined every semantic result; the recent ingest guard started refusing them instead, which is why the embedding counter sat at zero. The encoder now runs in full precision on every device, checks itself against a known input the moment it loads so a broken encoder refuses to start rather than filling a vault with unusable vectors, and reports a failed batch once with the detail needed to diagnose it rather than once per section. Embeddings on affected machines rebuild in the background on first launch.

## 2.29.0

### Minor Changes

- f706e23: Semantic search now uses each embedding model the way it was trained, which makes results measurably better. Four of the five offered models — including the default, Arctic Embed XS — take their sentence vector from the first token rather than an average over all of them, and expect search queries to carry a short retrieval instruction; Carbide previously averaged for every model and never added the instruction. Long sections are no longer silently cut off at the token limit but split, embedded in full, and combined, and the content above a note's first heading now gets a vector of its own, so notes without headings are searchable for the first time. Because the stored vectors change meaning, **existing embeddings are discarded and rebuilt in the background on first launch** — search stays available throughout, and the status bar now distinguishes the section pass from the note pass, reports a real completion instead of finishing twice, and finally shows embedding failures rather than hiding them.
- df5a028: The background embedding pass got substantially faster and harder to derail, which matters most on the first launch after this release, when every note is re-embedded at once. Notes without headings — the ones that need a whole-note vector — were embedded strictly one at a time; they now go through the encoder in batches, roughly a tenfold difference on that group, and an overlong note is trimmed before tokenizing rather than after, so a large note no longer costs many times what is kept of it. Section embedding stopped copying each note's full text once per section and now reads each note once. Saving a note no longer stalls the database on a first-run model download: the load moves to the background and that one save is picked up by the next pass, and the note's old vector is dropped immediately instead of lingering in search results with pre-edit content until the next restart. A model load that crashes, or a model switched while another is still loading, no longer wedges embedding off until restart, and a failed load is no longer retried by every waiting thread in turn. Vaults above about 32,000 notes were silently falling back to the slowest path on every pass — a size limit in one database query — and now do not. Finally, embeddings that cannot produce a meaningful result are refused everywhere they enter the index rather than being stored and ranked: a degenerate vector previously scored as a perfect match against every possible query, putting it at the top of every search.
- 4660dd2: The filesystem watcher no longer loses external edits or orphans renamed notes. Rapid successive writes from an external editor or sync client used to be dropped outright when they landed within half a second of one another; they are now trailing-edge debounced, so the last write always reaches the app (and no write waits longer than 750ms). Renaming a note or folder outside Carbide is now reported as a removal plus an addition instead of two "changed" events, so the old path stops lingering in the search index and the file tree refreshes for renamed folders. Deleting a note that has unsaved changes now marks the tab as conflicted instead of silently discarding the buffer, matching how external modifications already behave.

### Patch Changes

- 8db1646: Bases views that filter on a task column (`task_count`, `tasks_done`, `tasks_todo`, `next_due_date`) now work. The row query and the count query had drifted apart — only the row query carried the `task_agg` join — so any such view errored out at the SQL layer; and because filter values arrive as strings while the joined counts are integers, SQLite ranked every count below the threshold and matched nothing. Both are fixed, and the join now has a single definition shared by all three statements so they cannot drift again. Heading search no longer sorts every heading in the vault on each keystroke, and stops early once it has enough exact matches. A cancelled vault index no longer reports itself as completed, and no longer records the git revision as fully indexed; `sync_index_paths` in particular used to roll back and then try to commit, surfacing a cancellation as an index failure.
- cd7bbd7: Security dependency bumps: pdfjs-dist 6.2.108 (fixes arbitrary JavaScript execution on opening a malicious PDF), mermaid 11.16.1 (prototype pollution, CSS injection, and DoS fixes), and js-yaml 3.15.1/4.3.1 overrides (quadratic CPU in `!!omap` resolution, CVE-2026-59870).

## 2.28.0

### Minor Changes

- ffd4389: Agent mode now speaks the Agent Client Protocol instead of parsing each CLI's proprietary stream. Claude Code and Codex run through the official ACP adapters (one persistent process per chat session — Codex gains cross-turn resume for free), and any ACP-speaking agent can be wired in as a custom command. Safe mode's guarantee moved server-side: each agent run gets a scoped MCP bearer token, and the Carbide MCP server itself refuses mutating tool calls outside the granted toolset — an agent that ignores its client-side restrictions can no longer reach them. Transcript tool cards gained real substance from the richer protocol: in-card line diffs with gap collapsing, terminal-style command output with ANSI handling, per-kind icons, file:line location chips, and mid-call streaming updates, all persisted with size caps so sessions reload with the same fidelity. Permission requests are auto-answered by preset policy this release (safe allows reads, power allows everything) and every auto-decision is recorded in the event stream; interactive per-tool-call approval builds on this next. The old harness field on providers migrates to the new ACP agent spec automatically, and the native API loop's prompt no longer claims edit powers that safe mode would refuse.
- d78a4b5: Agent tool calls can now ask you first. Safe and power presets are the default prompt policy rather than a tool blocklist: reads and searches run freely, safe mode asks before file edits, and shell commands and deletions ask in both modes. The prompt appears inline on the tool's transcript card — Allow once as the primary action, an escalating "Always allow" grant, and a quiet Deny — while the run shows "Waiting for approval" and Stop remains available (stopping settles the prompt as dismissed, and unanswered prompts time out after ten minutes). "Always allow" grants persist per agent and tool, are listed in settings with per-row revoke, and the native API loop now surfaces the same prompts instead of silently refusing writes in safe mode. Every resolution — user-chosen or automatic — is recorded on the transcript, and reloaded sessions show settled outcomes.
- 85225e1: Agent transcripts get a proper tool-call kit: each call renders as a collapsible card (collapsed by default, auto-expanding only on a live failure) with a status-by-exception header — spinner while running, a transient check on live completion, a destructive cross on failure — and an expandable body showing the full input, the tool's result summary in a mono block, and clickable path chips. Tool results now carry a `result_summary` through the whole event chain, and agent-mode reasoning streams into the transcript instead of being dropped. Safe/power hygiene rode along: a new chat always starts in Ask mode, the retrieval scope bar hides in agent mode where it was inert, and the Power toggle's hint now says what the grant actually is per backend — vault-scoped edits on native, full system access on a CLI harness.
- a82c5a0: The no-vault open page is now a proper launcher instead of a floating dialog card: a brand rail on the left (wordmark, app version, Open Folder, and Settings/Help links) with the vault picker on the right — search, pinned and recent sections, per-row pin/remove actions, mono paths, right-aligned note-count/last-opened metadata, and a footer hint bar surfacing the existing ↑↓/↵ keyboard flow. The first-run empty state explains what a vault is and offers Open Folder directly. The vault dialog keeps its previous compact layout; `vault_selection_panel` lost its now-unused non-dialog card branch.

## 2.27.1

### Patch Changes

- a1adaaa: Saving a note no longer waits for search indexing: the save replies as soon as the file is written, while the FTS/embedding/HNSW upsert drains asynchronously on the vault's writer thread (with `metadata-changed` now emitted after the index commit, and the types UI and plugin `write_note` RPC explicitly opting into waiting since they read the index right after). Format-on-save now runs before the write inside the save pipeline — one disk write per save instead of the old format-then-resave double save — with a guard that keeps keystrokes typed during formatting. Backlinks and graph refresh key off the index-commit event instead of the editor's dirty-flag edge, so they also pick up external and frontmatter-driven changes.
- 152b016: Editor and save-path fixes: source mode no longer renders in the bottom half of the pane (the hidden visual row kept its flex slot); saving no longer triggers a spurious vault tree refresh + index sync from the watcher echo of our own atomic writes; and markdown serialization moved off the keystroke path onto a debounced idle task with a forced flush on every save read, removing the per-keystroke O(document) main-thread cost on large notes.
- 3c6fd34: Omnibar Search/Ask mode toggle moved from ⌘/ to Shift+Tab: the global editor-mode hotkey (CmdOrCtrl+/, capture phase) always won the chord, so the palette toggle flipped the note's source/visual mode instead. Clearing all filters, previously on Shift+Tab, is now the X mnemonic inside the Tab filter layer.

## 2.27.0

### Minor Changes

- e3ea18f: Agent capability is now derived from a provider's transport instead of chosen from a
  free-floating four-way descriptor.

  API providers always get the native OpenAI-compatible agent loop. CLI providers are
  agent-capable only when the transport itself names the harness protocol the CLI speaks
  (`harness: "claude" | "codex"`); a plain CLI such as `lms chat <model> -p <prompt>` is
  text-only — the incoherent states the old model could express (an OpenAI-compat descriptor
  on a CLI, a Claude descriptor on an API server) are no longer representable. Persisted
  settings carrying the old `agent` descriptor, or descriptor-less `claude`/`codex` preset
  ids, migrate on vault open.

  The settings UI shows the computed capability under every provider and offers a Harness
  select on custom CLI providers. The chat-mode badge names the actual harness (Claude Code
  or Codex), vault handoff is refused for non-Claude providers instead of sending Codex a
  Claude-only flag set, and the Rust dispatcher now errors on an unknown adapter instead of
  silently falling back to Claude.

## 2.26.3

### Patch Changes

- edc4e3b: AI vault context now names related notes with a one-line gist instead of nothing.

  Search-index results carried no note summary at all, so the related-notes sections of an
  AI prompt — similar notes, backlinks, outlinks — assembled to nothing once the
  `undefined` that used to crash them was cleaned up. The index has stored a summary for
  every note all along, in `notes.content_snippet`; it simply was not on the struct the
  frontend receives. It is now, and it flows through backlinks, outlinks, single-note
  lookups, similar notes, search hits and wiki-link suggestions.

  The summary is the same 80-character gist shown in the file tree and peek tooltip, so
  related-note lines read `- Title (path): first line of the note`. No reindex is needed —
  the column is already populated for anything indexed recently. A note indexed before the
  column existed shows no gist until its next index run.

- 312a7b9: Fixed four assistant and omnibar defects, and made the status-bar assistant chip legible.

  Inline AI edits no longer fail with "undefined is not an object" when vault context is
  enabled. Every backlink, outlink and similar-note reference reached the prompt assembler
  with no note summary at all; the adapter now supplies an empty summary instead of
  passing `undefined` through.

  Non-streaming CLI providers such as Codex work in Ask again. They were refused unless a
  note was open, but the one-shot call writes to a temporary file and runs in the vault
  directory — it never needed a note. Only an open vault is required now, and the message
  says so.

  Failed assistant runs can be dismissed. The runs popover gained a "Clear finished"
  action that discards finished and failed records while live runs keep streaming;
  previously errors accumulated with no way to clear them.

  Switching between omnibar Search and Ask carries what you typed across the switch in
  both directions, instead of making you retype it. The mode segment now shows its
  shortcut.

  The status bar assistant chip reads "Ready" at the status bar's own text colour rather
  than a dimmed muted grey on an already-recessive surface.

## 2.26.2

### Patch Changes

- 580abc0: fix(settings): saving two settings at once no longer discards one of them

  Saving a setting read the whole settings file, added the one key and wrote the file back, with
  nothing stopping two of those cycles from overlapping. Two settings changed at the same moment
  could end with one of them silently discarded — the write appeared to succeed and the value was
  back to its old state on the next read. Those writes are now serialized.

  Reading or writing a setting also no longer occupies a background worker while it waits on the
  disk. This matters most for per-vault settings, which live inside the vault folder itself and so
  sit on the same cloud-synced storage that could stall vault open.

## 2.26.1

### Patch Changes

- 9f64aee: fix(startup): opening a vault on a cloud-synced folder no longer freezes the app

  Opening a vault stored in OneDrive, iCloud Drive, Dropbox or Google Drive could hang Carbide
  indefinitely — one report sat unresponsive for over ten minutes with the window never painting.

  The cause was structural rather than a slow disk. Cloud providers leave files as **online-only
  placeholders**, and reading one parks the caller in the kernel until the sync daemon downloads the
  content. Every Carbide command that touched the filesystem ran on the macOS main thread, so a single
  such read stopped the UI, the window, and every pending asset response along with it. Building a
  folder listing opened and read _every_ note in the folder, which made a stalled read close to certain.

  Two things change. Filesystem work now runs on a background thread, so a slow or unavailable
  filesystem makes Carbide slow rather than frozen — the window keeps painting and the app stays
  responsive. And the file tree is built from the search index instead of by reading each note, so a
  folder opens without touching note contents at all. Vaults on ordinary local disks will also notice
  folders opening faster.

  There is a visible trade-off in that second change. A note's title, summary, colour and icon now come
  from the index, so a note the index has not caught up with yet lists under its filename with no
  summary — most often on the first listing after opening a vault, since that runs before indexing
  starts. Reopening the folder once indexing has progressed shows the full metadata. Folders opened in
  browse mode are never indexed, so they always list by filename.

  Startup is now self-diagnosing too. The vault-open path logs each step it reaches, any command taking
  longer than 250ms reports itself with a duration, and the log file keeps 5 MB across three files
  instead of the previous 40 KB — so if a slow filesystem does cause trouble, the log says where.

## 2.26.0

### Minor Changes

- 1f63d7c: feat(assistant): the panel scopes to the note you are reading, and Carbide can offer link fixes in the margin

  The chat panel's scope bar gains a **This note** chip. Turning it on restricts retrieval to the note
  you are currently reading, alongside the folder, tag and base chips that were already there.

  The chip **snapshots** the note when you turn it on; it does not silently follow you. Navigate
  somewhere else and the chip re-labels itself from "This note" to that note's title, so the scope bar
  never claims a scope it is not holding — click it again to re-point it at whatever you are reading
  now. A question already in flight is unaffected by changing notes mid-answer. If the scoped note is
  renamed or deleted, the chat tells you the scope matched nothing rather than quietly answering from
  the whole vault.

  **Ambient link checks — off by default, on per vault.** Enable them in Settings → Editor and Carbide
  watches the note you are reading for two things it can be certain about: links pointing at notes that
  no longer exist, and a note nothing links to yet. Findings appear as cards in the editor's right
  margin, anchored to the text they are about.

  Ambient never edits anything. A card offers one action and a dismiss, and accepting an offer queues a
  **proposal** you review like any other AI edit — the same queue, the same checkpoint, the same
  apply. A finding with no reliable repair carries no offer at all: "Nothing links to this note yet"
  states the fact and leaves, rather than inventing a link into some other note to have something to
  suggest. The checks read a single indexed lookup per note and never touch the vault graph, so turning
  them on does not make opening a note slower.

  **Chat over MCP now behaves like chat in the app.** Two fixes, both user-visible:
  - **Your retrieval settings apply to MCP.** `rag_query` ignored `ai_rag_retrieve_limit` and
    `ai_rag_context_token_budget` and answered at the built-in defaults instead. Because those defaults
    happen to equal the shipped setting values, this was invisible until you moved either slider — at
    which point the app honoured you and MCP did not. If you run off-default settings, MCP answers will
    change to match what the panel gives you.
  - **MCP respects the AI kill switch.** Turning the assistant off in settings did not stop `rag_query`
    from answering. It now declines, and does so before probing for a provider.

  Two smaller changes you may notice:
  - **Background runs get their own glyph (`◌`) in the runs popover.** They previously shared `▤` with
    note runs, which made the two indistinguishable in the one surface built to tell runs apart.
  - The inline AI command set is resolved once per invocation instead of twice, and not at all when you
    retry — the retry path was recomputing a value it never read.

  Under the hood, the retrieval engine and the conversation have been separated: `rag` now owns
  retrieval and readiness only, and everything conversation-shaped — prompts, citations, streaming,
  scope, agent turns, the panel and the MCP bridge — belongs to the assistant. This is why the same
  question now gets the same treatment whichever surface you ask it from.

- 2b7e918: feat(assistant): one context assembler behind every AI surface, and question chips you can edit

  The four places Carbide builds context for a model — the inline AI menu in the visual
  editor, the same menu in source mode, the AI panel, and vault chat — each had their own
  idea of what "context" meant. They ordered it differently, deduplicated it differently
  (or not at all), and only chat had a budget. All four now declare which context sources
  they want and hand them to one assembler that orders, deduplicates, budgets and
  truncates them the same way.

  A recipe now carries a policy — which context sources it reads, what it may do with
  tools, and how its output is applied — so the same recipe means the same thing whether
  you run it inline or from the panel. Built-in recipes keep their existing behaviour
  exactly; they simply inherit each surface's defaults.

  Chat question chips ("Summarize", "Action items", "Open questions", "Timeline") are now
  editable in Settings → AI, alongside the inline commands. Override a built-in's label or
  wording, reset it, or add your own; write `{scope}` wherever the active scope should
  appear.

  Five behaviour changes came with the consolidation, all deliberate:
  - **Retrieved context is ordered deterministically.** Chat previously broke score ties by
    whatever order search happened to return results in, so the same question against an
    unchanged vault could send different context. Ties now break on the note itself.
  - **A truncated note can no longer come back longer than the original.** The old chat
    assembler had an off-by-one that, when a note was cut to exactly its head, appended the
    entire note after the truncation marker and blew the context budget.
  - **Pinned `@mentions` reserve their budget explicitly** rather than relying on a sentinel
    score to sort first. Same result, but it no longer depends on an arbitrary large number.
  - **A whitespace-only selection is ignored.** Selecting a few blank lines and running an
    inline command or a panel edit used to send that whitespace as the prompt; it now falls
    back to the surrounding context, as it does when nothing is selected.
  - **Chat reports a pinned note's score as 0** in the sources list instead of a sentinel.

  The AI panel still sends the whole note uncapped — consolidating the assemblers did not
  change that, and capping it is a separate decision.

- 60573f5: feat(assistant): the bottom Assistant tab, persistent proposals, and editing the open tab

  The bottom panel's **AI** tab becomes **Assistant** — a projection of the one assistant chat, so a
  conversation started in the sidebar continues in the panel and vice versa. `Cmd/Ctrl+Shift+A`, the
  Tools menu and the palette command all open it; a persisted hotkey override for the old action id
  migrates automatically. Opening it seeds an untouched conversation with what you are looking at: an
  open note becomes a "This note" scope, an open editable document is attached.

  **Pending proposals now survive a restart.** They persist per vault in
  `.carbide/assistant/proposals.json`; applied and rejected proposals are never written and cannot
  resurrect, and a note edited while the app was closed still resolves stale at accept. The review
  centre groups proposals by day (Today / Yesterday / date) with per-session provenance inside, and
  is now reachable from the chat strip's "Review proposals →", the chat header count, the presence
  popover, a toast after accepting a notice, and the **Review AI Proposals** palette command.

  **Editing the open tab** moves into the assistant: the composer's secondary **Edit** button
  proposes a rewrite of the open note or an editable document (e.g. an `.html` artifact), and **This
  document** attaches the document so Ask can answer questions about it. Results land as reviewable
  proposals — accepting a document proposal stages the buffer and marks the tab dirty; saving the tab
  writes disk. The legacy AI Assistant dialog is retired (archived on `archive/ai-panel-main`);
  inline ask/edit in the editor is unchanged.

- 19c9b5e: feat(assistant): AI edits become reviewable proposals behind a single checkpoint

  AI used to write to your notes the moment you accepted — each surface with its own
  apply path, and no way to see everything the assistant wanted to change in one place.
  Every AI note-mutation now flows through one proposal queue.

  What changes for you: a **Proposal review center** opens as a workspace tab, grouping
  pending changes by the session that produced them. Each proposal shows its hunks, you
  toggle the ones you want, and accepting a batch takes **one** git checkpoint before
  writing — not one per file, and not none. Reject leaves your notes untouched. The
  inline decorations and the panel's diff view are now two renderings of that same
  queue rather than two separate ways to write to disk, so what you see in the review
  center is exactly what will be applied.

  Proposals know what they were computed against. If a note changes after a proposal is
  generated, that proposal is flagged **stale** at apply time rather than silently
  patching the wrong lines — a note that moved or was deleted is reported back to you as
  a decision, not as an error. Proposals are in-memory: restarting clears the queue and
  leaves your notes exactly as they were.

  If your vault is not a git repository, proposals still apply — Carbide just records
  that no checkpoint could be taken, rather than refusing to work or quietly promising
  an undo that does not exist.

  **Agent turns now go through the same queue.** An agent in power mode still writes
  real files as it works, so it can read back what it just wrote mid-turn. When the turn
  ends, Carbide diffs the vault against the checkpoint it took before the turn, restores
  the notes the agent edited, and queues those edits as proposals for you to review —
  so an agent turn no longer silently rewrites notes you never looked at. Notes the
  agent _created_ are left in place (there is nothing to restore them from, so deleting
  them would lose content), and a note the agent deleted is restored and reported rather
  than removed on its own authority. The trade-off: a follow-up turn in the same
  conversation reads notes without its own earlier edits until you accept them. If the
  vault has no git repository there is no checkpoint to diff against, so agent turns
  write directly, exactly as before.

  Two user-visible fixes ride along:
  - **Multi-file diffs merged unrelated files together.** Hunk boundaries were detected
    by comparing each new hunk's header against only the _previous_ hunk, so two
    different files whose hunks shared a header — two new single-line files both
    reporting `@@ -0,0 +1 @@`, for example — collapsed into one entry with both files'
    content interleaved. Consecutive binary files hit the same bug through a constant
    `[Binary file]` marker. Diff hunks now carry their file path and boundaries are keyed
    on it, so a multi-file diff shows one entry per file.
  - **Per-hunk toggles did nothing.** In the review tab, expanding a proposal and
    deselecting a hunk updated only the view; the selection never reached the store that
    apply actually reads. Deselected hunks were applied anyway, silently. The toggle now
    drives the real selection state, so what you deselect is what stays out.

- 6712546: feat(assistant): every AI request is now a tracked run you can see and stop

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

- 2b7e918: feat(assistant): one session history for every AI surface — sessions as tabs, omnibar Ask, inline ⌁ logging

  Chat, inline edits and background AI work now share a single session store with one
  persisted format (`.carbide/assistant/`, per-session files; legacy `rag/` sessions
  migrate read-through on first save) and one hydration pass per vault switch. The
  chat panel's session list shows every kind with filters and a collapsed ⌁ group;
  sessions open as workspace tabs that stay live (renames sync both ways) and restore
  across restarts, with a friendly empty state when the session is gone. Accepted
  inline edits are logged as ⌁ sessions with a "Continue in chat" toast action, and
  sessions older than a configurable retention window (default 30 days) are pruned on
  vault open. The omnibar gains an Ask mode (click or ⌘/): cited streaming answers
  from anywhere, on explicit submit only — esc stops a live run and keeps the answer,
  ⌘↵ inserts at the cursor, ↵ continues in a chat tab. Stopping a run is now
  distinguishable from success everywhere — a stopped title generation writes
  nothing, and Stop works from the instant a run exists, including during provider
  resolution. The old flat inline history (`ai/history.json`) is retired.

### Patch Changes

- e637e4e: feat(assistant): run presence follows you into the inline menu and the chat header

  The run kernel already tracked every AI run, but the only place to see one was the
  status bar popover. Presence now sits where the work is started: the inline AI menu and
  the Vault Chat header both show the same indicator, with the same Stop on each listed
  run.

  The presence label now names the provider of the newest active run, so `claude · 2 runs`
  tells you what is actually working rather than only how much.

  While an inline edit streams, the menu shows a Stop for that specific run — the newest
  active run of kind `inline`, never a chat or agent run that happens to be in flight at
  the same time.

  The Vault Chat header no longer disappears when the chat is empty, so presence and
  **New chat** stay reachable from a fresh panel.

- 7fd2c96: fix(search): semantic search stops silently dropping notes

  Semantic search could omit a note that clearly matched, with no error and no
  sign anything was wrong — the same query could return it on one run and not the
  next. Roughly one note in sixteen was affected at any given time, and which ones
  changed every time the index was rebuilt.

  The cause is upstream, in the `hnsw_rs` graph library: when a note is placed on
  an upper layer of the search graph, the library files its reverse link on the
  wrong layer, so the note ends up with no inbound edge on the bottom layer that
  every query finishes its traversal in. The note is in the index, and simply
  cannot be reached by a search. There is no newer release to upgrade to.

  Vaults up to 4096 notes now answer semantic queries by scanning every note
  directly, using the same distance metric the graph used, so results are exact
  rather than approximate — measured at 1.39 ms per query at the 4096-note limit,
  which is well inside what the search feels like at any size. Loading a saved
  index also rebuilds the vectors it needs instead of coming back half
  initialised, which is what made a reloaded index disagree with a freshly built
  one.

  **Vaults larger than 4096 notes still traverse the graph and remain exposed to
  this bug.** Fixing it there means patching the library itself; a one-line
  upstream correction was measured and cuts the miss rate from ~6.5% to ~0.2% but
  does not eliminate it, so it is deliberately not shipped here.

  Also fixed: setting up the MCP connection read and wrote the auth token through
  process-wide environment variables, which two operations running at once could
  interleave — one could read a half-written value, and unrelated work reading the
  same variables could observe them changing underneath it. The token path and the
  home directory are now passed in directly.

## 2.25.1

### Patch Changes

- bc88474: fix(graph): double-click opens notes; focus mode gets an exit everywhere

  Double-click on a vault-graph node had been reassigned to focus mode while every other graph surface opened the note, leaving right-click "Open note" as the only (hidden) opener. Double-click now opens the note on all surfaces and "Focus node" lives in the context menu.

  Focus-mode ergonomics: the graph tab shows the same "Focused / Exit focus" bar the sidebar had, and exiting re-runs the force layout instead of leaving nodes frozen in the radial arrangement. Restored graph tabs land on the vault view instead of an empty neighborhood screen, the view-mode button no longer cycles into the broken hierarchy error screen, the command palette gains "Open Vault Graph" (replacing the dead "Load Hierarchy" entry), and the semantic/smart-link toggles disable outside vault view.

- bc88474: fix(graph): stop semantic edges from freezing the app on graph open

  Opening the vault graph force-enabled semantic and smart-link edges for vaults up to 2000 notes and ran two synchronous O(n²) commands on the main thread, stalling the whole app — and re-enabled them after the user opted out. Inferred edges now compute only when their toggles are on, both commands run on a blocking worker thread (smart-links releases its DB locks between notes so concurrent searches are never starved), and the orphaned "Graph Auto-Edge Threshold" setting is removed.

  Search-graph semantic edges are lazy too: the batch KNN runs only when the per-tab toggle is on, with results cached per tab and computed on demand when toggled later.

  The frontend vault index also stops rebuilding wholesale on every note switch: a saved or externally changed note refreshes in place with a single read (saves are detected via the editor's dirty-to-clean transition; note add/remove still drops the index).

- bc88474: fix(ai): chat sources and markdown links now open their notes

  Agent-mode citations kept the absolute paths harness CLIs report and dropped the structured path list the backend sends precisely because the JSON input summary truncates — so clicking a source toasted "Note no longer exists". Citations are now derived from the structural tool paths and normalized to vault-relative before lookup.

  Plain markdown links in AI responses were rendered as real anchors that nothing intercepted. Clicks are now routed: relative links open the note in the workspace, external URLs open in the system browser, and fragment-only or malformed-URI hrefs are handled safely instead of navigating the webview.

## 2.25.0

### Minor Changes

- 7aac039: feat(editor): correct block context-menu targeting and add insert actions
  - **Right-click no longer deletes the wrong block**: pointer-to-block resolution ignored the browser's `inside` hint, so atom node views (embeds, images, math, callouts) resolved to nothing and the menu silently fell back to acting on the _caret's_ block instead. Targeting now uses the pointed-at node, with a DOM-based fallback, and an unresolved target is a no-op rather than a destructive guess.
  - **Copy, Duplicate and Delete agree on their target** for single-block selections.
  - **Insert Above / Insert Below** are available from the block menu.
  - **Embeds, videos, note embeds and raw HTML blocks are draggable**, matching the other block types.
  - The caret stays in a valid position after deleting a block next to an atom, and right-clicking an image no longer opens two menus.

- 7aac039: feat(editor): copy a link to any block

  Block anchors could be parsed, suggested and transcluded, but nothing in the app could create one — you had to type the `^id` by hand.
  - **Copy Block Link** and **Copy Block ID** are in the block context menu. The first use mints a short id and appends it to the block; later uses reuse the existing id rather than appending a second one.
  - The copied `[[note#^id]]` navigates to that block, and the ` ^id` survives a save/reload round-trip.
  - Works on paragraphs, headings, quotes, lists, callouts and collapsible blocks. Hidden on blocks that cannot meaningfully carry an id — code and raw HTML (where the id would land in the content), embeds, images, math, and tables.

  A block whose only content is its own `^id` is now recognised as an anchor, matching Obsidian; previously such a link was silently dead.

- 7aac039: feat(git): discard uncommitted changes

  Source control could stage, unstage, commit and restore a past version, but there was no way to throw away a working-tree change — `git_restore_file` auto-committed, which is the wrong semantics for "undo my edits".
  - **Discard a single change** from the change card or the diff viewer footer, and **Discard All** from the Changes section.
  - A modified file is reset to its committed content, an untracked file is deleted, and a deleted file is restored — **without creating a commit**.
  - Conflicted files are refused with a clear error rather than silently resolved, and a batch discard is rejected up front if any file in it is conflicted.
  - Every path is behind an explicit confirmation dialog. The headless CLI/MCP route has no dialog, so it rejects the request unless `"confirm": true` is passed.

  Discarding the note you have open updates the editor in place, and discarding an untracked open note closes its tab.

- 7aac039: feat(graph): group the vault graph by tag or connectedness, and order the groups
  - **Group by tag** clusters notes by their tags, and **group by degree** clusters them by how connected they are, alongside the existing grouping modes. Both render with the usual group hulls.
  - **Order groups** by name, created date, or modified date, so group placement is predictable instead of incidental.
  - The chosen grouping and ordering persist across restarts.

  High-cardinality tag groups are hashed into the existing tint palette so colours stay stable.

- 7aac039: feat(mcp): serve app and plugin documentation as MCP resources

  The MCP server advertised no resources and returned an empty list — the handlers were stubs. Connected assistants can now discover and read Carbide's own documentation instead of guessing at its features.
  - App guides are served at `carbide://help/{slug}` and the bundled docs ship with the app.
  - Each installed plugin exposes help at `carbide://plugin/{id}/help`, serving its README when it has one and falling back to its manifest description and settings schema when it does not.
  - The `resources` capability is advertised during initialization, so clients know to ask.

  Plugin authors can point at a docs file from the plugin manifest; this is documented in the plugin guide. Also reconciles four bundled plugins that were missing from the packaged resources.

- 7aac039: feat(export): export a note as HTML or EPUB, and copy it as rich HTML
  - **Export as HTML** writes a standalone document — math, diagrams and images are inlined, so the file opens correctly on its own.
  - **Export as EPUB** reuses the EPUB3 writer built for web clipping, generalized to serve notes as well (optional source URL, generated identifier, stylesheet manifest entry). Single-chapter for now.
  - **Copy as HTML** was a dead command palette entry with no handler behind it; it now renders the note body and writes rich HTML to the clipboard, so it pastes formatted.
  - **Raw HTML in PDF export** renders as a syntax-highlighted code block, and promoted embeds render as a labelled placeholder with their URL, instead of being dropped. Raw HTML is still not executed.

  No new dependencies. Web-clip EPUB export is unchanged.

### Patch Changes

- 7aac039: fix(agent): make agent-mode file edits visible in the app
  - **Changed files are recorded again**: tool paths were parsed out of a 200-character-truncated JSON summary whose keys serde sorts alphabetically, so for `Write` the `content` field pushed `file_path` past the cutoff and the path never survived. Paths and a `mutating` flag now ride structurally on the `ToolStart` event from both the Claude and Codex harness adapters, with the summary parse kept only as a fallback.
  - **The vault refreshes after every mutating turn**, keyed off "a mutating tool ran" rather than off successfully-resolved paths, so a parse failure can no longer swallow the refresh.
  - **Open notes reload without prompting**: a clean open note picks up an agent's edit immediately; a dirty one surfaces a conflict instead of being clobbered.
  - **Deleted and renamed notes clean up their tab** rather than attempting to reopen a path that no longer exists.
  - **Self-write suppression is one-shot** (2s) instead of a blanket 10-second per-path mute, so an agent write landing just after an autosave is no longer swallowed.
  - **Background-tab saves are mtime-guarded**, closing the last hole where an external write could be overwritten silently.

  Native-backend runs also record changed files for the first time — their tool names are unprefixed, so the previous name-based check never matched.

- 7aac039: fix(editor): unfreeze the HTML preview and drop its phantom padding
  - **The preview was permanently frozen, not slow**: `update()` recorded the new source as "last rendered" _before_ the 250ms debounce fired, so the render then early-returned forever and only a theme change could refresh it. Bookkeeping now happens after a successful render, so edits re-render as you type.
  - **Loose HTML no longer renders inside a code-block box**: a bare `<div>` paragraph is styled as plain content instead of inheriting code-block chrome.
  - **Previews size to their content**: the frame no longer reserves a fixed 18rem for a one-line preview — the iframe reports its measured content height and the parent clamps it to a sane range. The always-mounted resize strip collapses until hover.

  Preview theme tokens are cached per theme change rather than recomputed on every render.

- 7aac039: fix(editor): stop the caret jumping when walking through formatted text

  Arrow-keying across `**bold**`, `==highlight==`, `` `code` `` or `***both***` skipped columns and recoiled at the end of a run. The revealed delimiters were rendered as text-bearing zero-width widgets, so ProseMirror's node-skipping and the browser's native cursor movement compounded into multi-column jumps.

  Delimiters are now inline decorations drawn with CSS pseudo-elements — the same approach the heading markers already use — so they occupy no selectable positions. Every caret position across a formatted run is reachable in exactly one keypress in each direction.

  Reveal is also per-textblock rather than per-run, so line layout stays stable while walking, and mark escaping happens in `appendTransaction` instead of dispatching mid-keydown.

- 7aac039: fix(ui): keep the keyboard selection visible in the omnibar and suggest dropdowns

  Arrowing past the visible fold moved the highlight out of view with no scrolling, in both the file list and `>` command mode. The selected row now scrolls into view as you move through it.

  The same fix is applied to the folder suggest input, the property combobox, and the vault switcher dropdown.

- 7aac039: fix(ui): make chat and problems panel content selectable

  Text in the AI chat panel and the Problems panel could not be selected or copied. A global `user-select: none` default-deny meant content regions that were never allow-listed — the user bubble, reasoning body, tool-call rows, and error rows — simply inherited it, while citation chips and diagnostic rows are `<button>`-like elements that a later, equally-specific re-deny rule re-blocked on source order.
  - Content regions now declare selectability where it outranks the deny rule by construction, leaving the app-wide "controls stay non-selectable" intent intact.
  - Drag-selection can start in the panel's padding and gutters, not just directly on text.
  - The Copy button routes through the clipboard service instead of calling `navigator.clipboard.writeText` directly, so a failed copy raises a toast rather than an unhandled rejection.
  - The same treatment is applied to the inline AI assistant panel.

- 7aac039: fix(editor): stop corrupting wiki links that carry a heading or block anchor
  - **`[[note#Heading]]` no longer breaks on save**: the `.md` extension was appended _after_ the fragment (`note#Heading.md`), and no wiki stringify handler existed, so a typed anchor link persisted to disk as a broken markdown link. The extension now extends only the path portion, and wiki links round-trip back to `[[...]]` unchanged.
  - **Anchor links navigate**: `[[note#Heading]]` and `[[#Heading]]` scroll to the heading, and `[[note#^block-id]]` scrolls to the anchored block.
  - **Anchor links read as `note > Heading`** instead of exposing the raw target, and the `@` palette no longer inserts a visible `.md`.
  - **Heading fragment matching uses one slugger** — the outline panel's separate variant disagreed with the wiki slug on non-word characters.
  - **`@#` with no query shows the legend** rather than an empty dropdown.

  Also fixes the `[[` suggester dropping the embed flag, leaking block results into note tab-completion, and sharing mutable state across editor instances.

## 2.24.0

### Minor Changes

- 6c005dd: feat(editor): callout fold UX
  - **Mod+Enter now works where it was dead**: the fold toggle no longer bails on a non-empty selection, so callouts inserted by the slash command — which arrive collapsed with their title selected — can be toggled immediately. The toggle also accepts a selection anywhere inside the callout body, not just the title.
  - **Collapsed callouts can always be reopened**: `foldable: false` callouts (markdown-parsed and turn-into) previously could not be opened once collapsed. The `foldable` gate now applies only to _collapsing_, never to opening.
  - **Collapsing keeps the callout in view**: the caret parks at the end of the title and scrolls into view, so the viewport no longer jumps.
  - **Chevron and header placement**: the header is top-anchored instead of vertically centred, and sticks to the top of a tall callout while scrolling so the title and chevron stay reachable.

- 7a2f405: feat(editor): recents in the @ palette, same-day related links, and context-rail layout fixes
  - **@ palette recents**: a bare `@` now opens on a "Recently edited" section instead of showing no notes at all — the MRU list merged with the most recently modified notes, filtered as you type, resolved in-memory with no IPC. The free `r:` prefix scopes the palette to recents.
  - **Created this day**: the Related tab gains a "Created this day" section listing notes created or modified on the same calendar day as the open note's creation date, derived client-side from note metadata.
  - **Same-day smart link rule**: the `same_day` rule compared modification times on both sides despite being named for creation. It now anchors on the source note's creation day and matches a candidate's creation _or_ modification day, so a note drafted alongside the anchor but edited later is finally suggested.
  - **Context rail**: the docked rail no longer clips its right edge on narrow windows (its minimum pane width may now claim up to 45%); the spotlight/theater overlay panel stops short of the icon strip so the rail's tabs stay visible and clickable; and the `tasks` rail tab — which rendered a blank panel because TaskPanel lives in the sidebar — now routes `Cmd+Alt+T` and the task view-mode commands to the sidebar view instead.

- e6c15d3: feat(graph): vault graph folder grouping, cluster tints, and a toolbar grouping control
  - **Folder grouping is live**: the vault graph adapter now tags every node with its containing folder, and grouping forces are always sent to the layout worker instead of only for search graphs — so folders actually pull apart and get convex hulls.
  - **Cluster grouping is visible**: computed cluster assignments feed back into the canvas as node groups, re-running the layout with cluster forces and painting nodes and hulls per group. Group tints come from new `--graph-group-1..5` tokens — chart-token hues re-stepped in OKLCH until every pair clears colorblind-separation, chroma, and contrast thresholds against both the light and dark surface.
  - **Grouping control**: the graph tab toolbar gets a Folder / Cluster / No grouping select (previously grouping could only be cycled blind from the small panel's icon button), backed by a new `graph.set_group_mode` action.
  - **Cleanup**: the dead `graph_tauri_adapter`, which invoked Tauri commands the backend never registered, is archived out of the feature.

### Patch Changes

- 579f037: fix(editor): block context-menu ops and gutter geometry
  - **Right-click targets the block under the pointer**: the context menu resolved its target from the caret, which the menu itself had just moved, so Delete and Duplicate silently no-oped. The menu now captures the pointer-resolved block position plus a fresh block-selection snapshot when it opens, and routes single-block ops through position-taking transforms.
  - **Copy works again**: the block-context copy path no longer falls back to `execCommand("copy")` (which copied nothing once the menu took focus). Selected blocks — or the right-clicked one — are serialized into a rich `data-pm-slice` payload and written through the clipboard service, so failures raise the existing clipboard toast.
  - **Handles stay in the gutter**: editor padding now reads `--editor-gutter-inline` per element instead of resolving it once at `:root`, so the wide width mode no longer pushes the block handle into the text column. The insert button and grip grew to 24px targets.

- 2ae26df: fix: clip dialog folder candidates + Cmd+Q unsaved-changes guard
  - **Web clip dialog**: opening the dialog now lists the vault's folders, so the Location field offers the whole folder tree and drill-down works instead of showing only the vault root; Shift+Enter leaves the folder suggestions and returns to the URL field, matching the Save As dialog.
  - **Quit guard**: Cmd+Q from the app menu used to terminate the process natively, discarding unsaved changes without a prompt. It now routes through the same unsaved-changes confirmation as the window close button and the tray's Quit Carbide.

- cf33d7e: fix(folder): close the gaps in OS drag-and-drop import
  - **Drilldown mode accepts drops**: external file drops previously worked only in the tree file-tree mode; drilldown now handles them too, and recents/bases accept a container-level drop to the vault root.
  - **Assets follow the drop target**: non-markdown files no longer all land in the vault-root attachment folder — a PDF dropped on `projects/` is now stored under `projects/`.
  - **Dropping on a file row targets its parent folder** instead of falling back to the vault root.
  - **Import results are reported**: imports now surface an "Imported N files, skipped M" toast instead of failing silently to the log.

  Dropped directories continue to be skipped with a toast; recursive folder import is not included.

- aee23c6: fix(editor): readable HTML previews and embeds in both themes
  - **Author-styled documents render neutral**: fenced ` ```html preview ` blocks and `![[file.html]]` embeds that carry their own colors now render on a neutral light surface (`color-scheme: light`, white page, dark default text) in both app themes, so author colors compose as designed instead of landing light-on-light or dark-on-dark. Content that declares no colors keeps the token-themed surface.
  - **No more background flattening**: the dark-mode `body :where(*) { background: transparent !important }` reset, which destroyed author backdrops in HTML embeds, is gone.
  - **Theme toggle**: fenced HTML previews re-render on theme change instead of staying on the previous theme's tokens, matching the embed path.
  - **Token alignment**: fenced preview styles now use the same `--editor-*` tokens as the embed path.

- 860a39b: fix(editor): typing inside a revealed inline mark no longer eats its syntax
  - **Backspace at a run's end** deletes a character again instead of unwrapping the whole run and orphaning a delimiter — while typing inside bold the caret is always at the run's end, so every Backspace used to strip the mark without deleting anything. It also stops shadowing `undoInputRule`, so typing `**bold**` and pressing Backspace restores the literal text.
  - **Type-to-close**: typing a run's closing delimiter at its end exits the run rather than inserting the delimiter as marked text. Two-character delimiters (`**`, `~~`, `==`) exit when the second character completes the pair; a delimiter character that does not complete a pair stays literal, so nested emphasis still works.
  - **IME safety**: Backspace and text-input handling defer to the composition.

  Backspacing at a run's start still unwraps the mark and leaves the closing delimiter behind as literal text.

## 2.23.1

### Patch Changes

- 97dfdd3: fix(editor): backspacing a revealed inline-mark delimiter keeps its partner

  Deleting either delimiter of a revealed inline mark now drops the mark and leaves the opposite delimiter behind as literal text (`**bold**` → `**bold`), the way source-level editing behaves; previously both delimiters vanished together. Backspace at a span's start boundary is handled too, taking precedence over block joining when the span opens the block.

## 2.23.0

### Minor Changes

- 1f2e52e: feat(editor): inline-mark syntax reveal + 5-branch editor/UI bug batch
  - **Inline mark syntax reveal**: Obsidian-style delimiter reveal for inline marks — markdown delimiters show while the caret/selection touches the mark and hide otherwise.
  - **Shortcuts & clipboard**: Mod-Enter toggles callout fold (toggle is a real button, code-block escape keeps precedence); AI/RAG/query inputs submit only on unmodified Enter (no more modifier/IME-triggered generation); shifted punctuation hotkeys normalize via `event.code` so `CmdOrCtrl+Shift+\`` (terminal toggle) matches; new highlight formatting command on Mod-Alt-h with toolbar button; copy block writes a rich pm-slice clipboard payload (text/html + markdown) built synchronously in the gesture so paste resolves native; shared KbdHint marks hidden Cmd/Ctrl+Enter submit affordances.
  - **Gutter & layout**: block drag handle moved into a reserved in-box gutter and enlarged; px floors enforced for right rail and outline panes; dark-mode contrast fixed for sandboxed HTML embeds.
  - **Inline AI in source view**: inline AI menu now anchors and executes correctly in source view.
  - **Panel stability**: chatrag duplicate-key crash fixed; plugin panels keep alive across switches; clip-dialog focus restored.

## 2.22.0

### Minor Changes

- 4209db7: feat(ai): generalized agent framework (codex CLI, native loop, citations, inline edit) + transport regression fixes
  - **Codex CLI agent support**: `codex_cli` providers now resolve to a dedicated harness adapter with per-CLI MCP wiring. Codex config isolation honors the user's `~/.codex` auth/model/endpoint while resetting `mcp_servers` to carbide-only (verified against codex-cli 0.144.3 `-c` deep-merge), mirroring the claude adapter's `--strict-mcp-config` posture.
  - **Native agent loop**: bounded history replay with eviction, plus a `HarnessAdapter` seam and data-driven capability descriptors behind it.
  - **Agent-mode citations**: read-tool events are surfaced as citations in agent replies.
  - **Agentic inline edit**: native-backend inline edits with a read-only tool selector and diff-apply sink.
  - **Surface policy + safe mode**: harness safe mode excludes mutating MCP tools, at parity with the native agent (pinned by a real-catalog read-only parity test).
  - **Transport regression fixes**: guard transport-less provider reads (`transport?.kind`) so auto-backend detection no longer crashes on persisted providers; gate "unreachable / check your connection" wording on API transport so CLI providers get a local-cause hint (auth/model/endpoint); replace the dead-end "No streaming-capable provider" toast with an actionable message; name the failing command in opaque non-zero-exit errors.

## 2.21.3

### Patch Changes

- 6d02ac6: fix(editor): persist collapse on language-less code blocks and stop wide-mode drag handles overlapping content
  - Code-block collapse now survives save→reload even when the fence has no language. remark only emits fence meta when a language is present (and any info-string on a bare fence re-parses as the language), so the `collapsed` token was silently dropped for language-less blocks. The no-language case now encodes the flag in the lang slot (` ```collapsed `) and decodes it back — idempotent (expand → bare fence) and Obsidian-safe. Languaged blocks (query, mermaid, ```js) already persisted.
  - In wide width mode the block drag handles no longer overlap the content column. They are now anchored by their right edge just left of the text (growing leftward into the padding) instead of by a fixed left offset that assumed the normal-mode gutter.

## 2.21.2

### Patch Changes

- 5f4e508: fix(editor): correct table toolbar and drag handle positioning in wide mode

  The table toolbar jumped to the top-left of the window when a table was switched to full-width layout: toggling the `layout` attr replaces the `<table>` element, but the floating-ui `autoUpdate` kept its now-detached anchor, so `computePosition` collapsed to ~(0,0). The toolbar now rebinds its anchor whenever the underlying table element is swapped.

  Block drag handles were invisible when a note used wide width mode: `.ProseMirror` fills the pane (`max-width: none`), so the handle's `left: -1.75rem` gutter offset fell off the pane edge. In wide mode the handle is now anchored inside the padding gutter instead.

## 2.21.1

### Patch Changes

- 5afd313: fix(editor): persist collapsed state of code/query/mermaid blocks across note reopen and app restart

  The `collapsed` node attr shared by all `code_block`-based views (plain code, mermaid, smart-block queries) was never serialized, so a folded block sprang back open on save→load. It now round-trips through the fence meta string (like the existing `preview` token), giving reopen- and restart-persistence via a single serialize/parse path.

## 2.21.0

### Minor Changes

- e8c3083: Individual list items (including tasks) now have their own drag handles at every nesting depth and can be dragged and dropped to reorder within or across lists using ProseMirror's schema-aware placement, instead of the whole list moving as one block.

### Patch Changes

- 7f783b1: Fix editor block operations: single-block Copy now serializes to the clipboard across notes, and Turn Into → Bullet List on a task list now clears the task attrs instead of no-opping.
- 05c7bb8: Table toolbar no longer vanishes after clicking an option (the transient focusout from ProseMirror rebuilding cell/table DOM is now ignored while focus stays in the editor), and terminal Option+Arrow again jumps by word (mapped to meta-b/meta-f, with macOptionIsMeta restored).
- 79bc906: Fix fold/collapse editor bugs: Enter/ArrowDown at a collapsed details/callout boundary now skips past the section instead of force-opening it, and heading fold state survives edits without reattaching to a neighbouring heading.

## 2.20.1

### Patch Changes

- e35ac7b: DSL query/base autocomplete now sources note-name suggestions from the search index instead of a full-vault file walk. Suggestions are always fresh — newly created or renamed notes appear immediately — and there is no first-use lag on large vaults.

  Vault loading also does less disk work: note metadata (title, blurb, color/icon/type) is now derived from a single read of each note's head instead of reading the file three times.

## 2.20.0

### Minor Changes

- 49dd382: Native Agent Mode: agent mode now works with any OpenAI-compatible API provider
  (Ollama, LM Studio, OpenAI, …), not just Claude Code. A Carbide-owned tool loop
  drives the vault MCP catalog directly — vault-scoped by construction, with safe
  mode withholding mutating tools and power mode auto-approving them. The panel
  header shows which backend is active ("vault-scoped" vs "full access"), sessions
  persist tool calls/results, and the MCP tool schemas gained hygiene fixes plus a
  new `edit_note` tool for targeted string edits.

## 2.19.0

### Minor Changes

- 4977384: Agent Mode: the assistant panel gains an Ask|Agent toggle that runs Claude Code
  headless against your vault — live tool-call rows, changed-files list with
  click-to-open, abort, and session resume, with a git checkpoint before every
  agent turn. Safe mode (default) limits the agent to Carbide's note tools; Power
  mode allows file edits (per-session picker, default configurable in settings).
  Also adds "Open Vault in Agent Terminal" to the palette, launching an
  interactive Claude Code session at the vault root with Carbide's MCP tools
  preconfigured.

## 2.18.0

### Minor Changes

- 1ec22c9: AI UX overhaul: streaming in the assistant panel with Stop, API providers for inline AI, in-app API keys (OS keychain) with per-provider Test, RAG message actions (copy/regenerate/fork) and auto-titles, @-mention typeahead with chips, pre-generation sources drawer, head-tail context truncation, assistant history persistence, AI hotkeys (CmdOrCtrl+Shift+A / CmdOrCtrl+Shift+J), opt-in inline vault context, and a collapsible reasoning/thinking channel for API `reasoning_content` and CLI `<think>` output.

## 2.17.1

### Patch Changes

- 81ebb1e: Quitting via the tray menu or Cmd+Q now prompts to save unsaved changes, matching the window close button. The post-update restart toast persists until dismissed instead of expiring after 30 seconds.

## 2.17.0

### Minor Changes

- ed66b43: Clip web page: new palette command fetches a URL, extracts readable content,
  and saves any combination of markdown note (default), HTML artifact, and EPUB.
  Images are downloaded into the vault (capped at 20, 5MB each) so clipped pages
  never need re-fetching; failed images keep their remote URL and are counted in
  the completion toast. Clipped notes and artifacts carry source/clipped-at
  provenance.

  Security: plugin HTTP fetch now re-validates every redirect hop (max 5)
  against SSRF rules, closing a redirect-to-private-address bypass, and blocks
  IPv6 ULA, link-local, and IPv4-mapped private addresses.

  Routing: omnibar results and graph nodes now open through the centralized
  note_open route, so non-markdown files consistently open in the document
  viewer from every entry point.

## 2.16.0

### Minor Changes

- f805018: Watcher: self-save suppression now keys on note path and covers the `.tmp`
  sibling of atomic writes, eliminating the save flicker, file-close lag, and
  save/close freezes caused by unsuppressed self-triggered reloads.

  Omnibar: Cmd+O no longer inherits a stale all-vaults scope from a previous
  Cmd+Shift+O session, and applying filters keeps vault groups expanded instead
  of bouncing back to vault selection.

  Editor: wikilinks with heading anchors (`[[note#Heading]]`) scroll to the
  target heading even when the note is already open.

  Graph: renderer teardown no longer races async worker, resize, and RAF
  callbacks (`t.geometry` / `_texturePool` unhandled errors).

  App: closing the window with unsaved changes now asks before quitting, the
  update-installed toast gains a Restart button, and pdf_extract glyph-mapping
  warnings are filtered out of logs.

## 2.15.0

### Minor Changes

- 0b22a16: Themes: culled to 5 kept blueprints with a migration fallback for removed
  themes; all 14 theme-\*.css files are deleted and kept themes are static
  `[data-theme]` blocks. New accent identity purple `#7e1dfb`, hand-tuned
  Carbide Light/Dark, and a lint-enforced token-only theme contract.

  Tokens: chrome type scale with density-wired sizes, canonical `--shadow-1..3`
  elevation scale with hairline seams, radius scale aligned to 4/6/8/12, and a
  motion budget (120–200ms micro-interactions, 1s ambient). Bundled Inter and
  IBM Plex Mono now render by default.

  Chrome: activity bar, tab bar, and editor status bar rebuilt (24px controls,
  density/indicator spec, Tolaria badge suite with compact mode); bottom panel
  rebuilt on shadcn Tabs with roving tabindex; context rail on 24px controls
  with hairline dividers; breadcrumb is a divider-free 28px row; the find bar
  floats as a popover overlay at the top-right of the editor.

  Layout: layout presets are independent of themes, panels render docked or
  overlay, zen-mode guards consolidated into a single `show_chrome` flag,
  sidebar views are registry-driven, and all pane sizes persist across restart.
  The right-panel exclusion is enforced and FloatingOutline is removed.

  Editor: Tab is trapped inside the hand-rolled overlays, the omnibar and slash
  menu ignore incidental mouse hover via an intentional-movement guard, empty
  states are uniform, and chrome text is no longer selectable by default.

  Outline: built off the keystroke path with idle debouncing and now resolves
  the real scroll container.

  Git: note-relative diff view toggle for the active tab, including a
  working-tree comparison mode.

### Patch Changes

- 1c2b23c: Tabs: closing the active tab no longer leaves a ghost note in the editor pane.
  With a split open, closing a primary tab now activates the most recent tab in
  the same pane (instead of hopping to the secondary pane by MRU), pane focus
  follows the tab that takes over, and when the last primary tab closes the
  primary editor clears instead of continuing to render the closed note.

## 2.14.1

### Patch Changes

- f8ee2e3: Git: remote failures now surface a real error message — git stderr is captured
  instead of dropped, and toasts fall back to a sensible message when the error
  string is empty.

  Editor: markdown that can't be converted is preserved as raw nodes instead of
  being silently dropped, callout dividers no longer fuse into setext headings,
  and raw_inline marks pass `undefined` rather than `null`.

## 2.14.0

### Minor Changes

- 6c4a74f: Context rail: the right context rail is docked beside the editor instead of
  floating over it, and reopening the docked outline from the rail works again.

  Editor: per-note normal/wide width toggle persisted in frontmatter; session
  transitions are serialized and teardown is hardened against throwing destroys,
  fixing the duplicated toolbar left behind by an overlapping recreate_session
  via the lazy port.

  Outline: the docked outline is now the default with persisted pane width, and
  clicking a heading moves the active marker to the clicked heading.

  Explorer: dragging OS files onto the file tree imports them into the vault —
  Markdown becomes indexed notes with client-side uniquify, other files reuse the
  pasted-asset pipeline, folder rows target that folder, and per-file errors log
  and continue.

  Graph: inferred edges are shown by default and the vault-size cap is dropped.

  AI: the streaming CLI provider runs in the vault directory, and CLI prompt
  serialization no longer injects `<system>`/`<user>` role tags (with a
  regression guard test).

  Themes: all 28 confirmed theme-audit findings applied — statusbar fg/bg
  pairing, layout-variant scope prefixes, radius/size token fixes, and dead CSS
  archived.

## 2.13.0

### Minor Changes

- 040ca8d: Outline: docked mode renders the outline as a resizable pane beside the
  editor with persisted width; the active heading follows the editor cursor
  and scroll position, with the panel keeping the active item in view and
  heading clicks centering the target; level-aware typography, indent
  guides, truncation tooltips, and a sliding accent marker with
  aria-current; alt-click on a chevron folds the section in the editor;
  scroll-spy geometry recomputes on editor resize and content growth, and
  scroll-spy/navigation are suppressed in source mode where positions are
  meaningless.

  Editor: link and image toolbar buttons are functional — URL popover
  (Mod-k) with edit/remove for existing links, image insertion through the
  vault asset pipeline — and all toolbar buttons now reflect the caret's
  real block type and disable where commands can't apply, with
  platform-aware shortcut tooltips; the floating table toolbar tracks
  scroll/resize via floating-ui autoUpdate; suggest dropdowns no longer
  flash at the viewport origin on first open and defer until the cursor DOM
  is laid out; note embeds handle missing targets gracefully and heal when
  the target note is created.

  Links: insert-link buttons on backlinks, related notes, and RAG citations
  insert [[Title]] at the cursor; the context rail no longer closes when
  clicking into the editor.

  Query DSL: symbolic property operators (=, !=, >, <) now map to bases
  operators so range filters like created > "now()-15d" return results;
  builtin date properties and now() values appear in autocomplete.

  AI/RAG: inline AI stream errors preserve partial output and restore
  deleted selections, aborts propagate to the backend, and execution can't
  double-trigger; RAG retrieval limit and context token budget are real
  settings, and changing the embedding model triggers the promised clear
  and re-embed; RAG chat renders markdown with honest readiness and scope
  hints; MCP search states when semantic mode degraded to keyword-only,
  stops exposing inverted raw BM25 scores, and rescales the title boost so
  fusion ranks correctly.

  Search/indexing: embedding toggles actually gate per-save and batch
  embedding, changed-section invalidation runs unconditionally, status
  reports real worker activity, query paths never download models
  synchronously, and storage reconciles changed vectors after unclean
  exits; rebuild flows show visible progress, toasts, and busy states, with
  embedding progress mirrored into the status bar.

## 2.12.0

### Minor Changes

- 060e97b: Query DSL: grammar-aware autocomplete for the notes and task query DSLs —
  in query/base code blocks (scoped to their blocks only), the task panel
  textarea, and the query panel — plus visual query builders that emit DSL
  text, mounted behind panel/DSL-mode toggles, and an omni-query dialog with
  a Build query… command action.

  AI/RAG: indexing banner with readiness-aware placeholder and rotating
  example prompts, generating stage showing the provider name with a stop
  control, provider/stream errors normalized into readable messages, AI
  provider status badges with a Test button and tri-state CLI availability
  in settings, CLI resolution via a tilde/PATH/login-shell cascade, and
  current-note images now sent along on both chat surfaces.

  Graph: search-tuned forces with label-aware collision and real
  convergence, percentile-based zoom-to-fit on new snapshots with a legible
  initial view, label truncation, and an expand-graph toggle that collapses
  the result list.

  Editor: keyboard-accessible drag handle and insert button with snapped
  drop indicator, section-drag badge, and offscreen-handle culling; ghost
  placeholder hint on empty docs; scroll-jump and scroll-fighting fixes;
  table layout, callout title, and fold state persist through markdown; Tab
  moves between table cells; pasted images no longer overwrite existing
  assets.

  Accessibility and UI: polite live-region announcer wired to toasts and RAG
  progress, forced-colors and print media styles, themed caret, and
  keyboard-navigable omnibar vault headers.

  Build: CodeMirror chunk kept out of startup modulepreload, KaTeX fonts
  shipped woff2-only, git2 trimmed to no-default-features without vendored
  OpenSSL, and unused pdfkit/blob-stream/isomorphic-git dependencies
  dropped.

## 2.11.1

### Patch Changes

- 86d4d2e: Editor: `![[note]]` and `![[file.pdf]]` embeds now resolve their targets like wiki links (exact → case-insensitive → basename lookup), so transclusions load when the target lives in a subfolder or differs in casing.

## 2.11.0

### Minor Changes

- c1d7c13: Search: omnibar sort modes (relevance/name/recency) and kind filters
  (notes/commands/settings) on top of the existing file-type filters, with
  Kind and Sort rows in the filter overlay, mnemonics, and removable active
  chips; kind filters also apply to the empty-query MRU list.

  Fixes: code-block HTML previews render via the carbide-html: protocol
  instead of CSP-blocked srcdoc iframes, tab scroll position restores after
  the buffer swap instead of being clobbered by it, duplicate
  --editor-code-bg token no longer trips the settings token search, and
  macOS titlebar drags work over themes that reposition the workspace
  layout.

## 2.10.1

### Patch Changes

- 069688c: Fixing linked sources path resolution bug

## 2.10.0

### Minor Changes

- b293c48: Metadata & styling: inline frontmatter widget in the visual editor with
  key/value suggestion dropdowns; color/icon pickers with arbitrary-path
  frontmatter writes; folder notes carry color/icon metadata into tree and
  drill-down rows; color/icon styling from note row context menus; vault-wide
  tag color palette with persisted mapping and choosable tag-pill colors in
  visual mode; configurable callout type/color/collapse. AI: editing enabled
  for all editable documents in any view mode, with the AI command surfaced
  for document tabs. Shell: file explorer mode tabs renamed to
  Tree/Folders/Recents/Bases.

  Fixes: omnibar surfaces all sidebar views and blends commands into bare
  search, working context menus in Folders drill-down and Recents tabs, and
  dependency audit remediation (npm 43 → 1 low, cargo 8 → 0).

## 2.9.0

### Minor Changes

- 455de32: Layout & shell: resizable 2-pane editor split with direction toggle,
  persistence, and direction-aware drop-zone overlay; inbox recent-notes feed
  with view switcher and Views/Types rail sections (live counts) folded into a
  Bases mode tab; configurable activity bar and sidebar views with
  command-palette access; status-bar quick-access icons for bottom panel tabs;
  overlay titlebar with native vibrancy for glass themes and an always-present
  macOS drag strip. Editor: "+" drag-handle button opening a block-type
  dropdown, warm-neutral curated palette, typography-as-data spec, OK-easing
  motion with AI-state indicators, and persisted HNSW search graph that skips
  the 33s startup rebuild.

  Fixes: window dragging and top-bar click regressions, dashboard/theater rails
  and inbox virtualizer under the macOS drag strip, secondary split pane
  receiving note content, bases sort keeping property-less notes at the end,
  create-type input and hidden-type visibility, block-insert dropdown scroll
  fighting hover, restored heading-level gutter markers, and reverted table
  engine/edge-control regressions.

## 2.8.0

### Minor Changes

- 69a8664: Editor: rich block support (web embeds, video, iframe conversion), live preview
  panes for code blocks and the slash menu, code-fence metadata preserved through
  markdown round-trips, flat-grid table restyle with edge insert bars, table
  backspace selection/deletion, case-sensitive/whole-word find, reversible
  Backspace input rules, and stronger paste-as-markdown detection.

  Fixes: recursive folder list in the save-path picker, RAG scope-filter errors
  surfaced instead of silently widening, fuzzy @-palette re-ranking, tab-switch
  scroll jump, themed HTML embeds, callout fold-state persistence, and spurious
  backslash escapes on round-trip.

## 2.7.0

### Minor Changes

- 07bcdc9: Let live HTML load remote CDN dependencies at the networked trust tier, and harden vault search query routing and ranking.
  - Live HTML at the live+net trust tier now permits remote `https:` scripts and stylesheets (Tailwind, Chart.js, Google Fonts, and other CDN deps), matching that tier's existing `unsafe-eval` and `connect-src *` capability. The no-network live tier stays a real "runs code, cannot phone home" guarantee, `http:` is never added to `script-src`/`style-src`, and the iframe sandbox stays exactly `allow-scripts` (no `allow-same-origin`). The Rust and TypeScript CSP builders emit one canonical tier-aware policy, pinned by drift tests on both runtimes.
  - Search no longer routes plain-English queries (`in progress`, `with images`, `named entities`) through the structured query solver: structured mode is now gated on a form prefix (`notes`/`files`/`folders`), unambiguous value syntax (`#tag`, `/regex/`, `[[wikilink]]`, quoted strings, property operators), or `linked from`.
  - Suggestion ranking is consistent: `index_suggest` now negates BM25 scores unconditionally before its early return, so the exposed score no longer flips sign depending on how many FTS hits came back.
  - Search is faster and more correct: the last query embedding is cached to skip a redundant BERT pass, and the client-supplied result limit is forwarded through `index_search` instead of being dropped.

## 2.6.0

### Minor Changes

- 3b8a9c9: Add editable note properties and a CSV table viewer, and harden the vault search index against drift.
  - The properties rail is now fully editable: add, edit, and delete frontmatter properties with combobox key/value pickers whose fuzzy-ranked suggestions blend a curated Carbide field catalog with the keys and values already used across your vault. List-valued properties (keywords, aliases, etc.) render as chips instead of raw `["a","b"]` text and stay lists when edited. Edits write straight to the note's frontmatter.
  - `.csv` files now open in a sortable, virtualized table with click-to-copy cells instead of falling through to the plain-text editor.
  - Externally edited notes now re-embed automatically: every index sync (including the vault-open background sync) chases its work with an embed pass, so notes changed outside the app no longer keep stale vectors until an unrelated trigger fires.
  - Vector search no longer returns deleted or renamed notes — they are evicted from the in-memory HNSW indices on path sync instead of lingering until the next full rebuild — and changed content re-embeds via a content hash so edits actually update their vectors.
  - HNSW indices now compact once dead nodes pass a staleness threshold, reclaiming the space left by re-embeds that previously grew the graph unbounded until restart.
  - Search indexing is faster: larger per-transaction batches on full rebuild, `PRAGMA optimize` after rebuild/sync to keep the query planner sound as the vault grows, and a capped embedding yield to reclaim idle time.
  - Collapsible sections (callouts, collapsible blocks, and other nested wrappers) are preserved across save and tab-switch syncs instead of being unwrapped and hoisted out.
  - Bundled plugins now resolve correctly under Tauri's `_up_` resource prefix.

## 2.5.1

### Patch Changes

- b1a9c03: Fix six reported bugs across file opening, the editor, the search graph, the Related panel, and PDF indexing.
  - Non-markdown files (`.sh`, `.py`, `.txt`, etc.) opened from any panel — Related, backlinks, tags, query results, tasks, RAG citations, the tab bar, deep links, and ~20 other surfaces — now open in the code/text viewer with syntax highlighting instead of the markdown editor. PDFs, HTML, and EPUBs opened from those surfaces likewise route to their proper viewers.
  - Switching between markdown tabs now restores each tab's saved cursor position (including a cursor at the very start of the document) instead of jumping to the end.
  - Search-graph drill-down results now have a right-click menu (open, open to side, copy path, reveal in file manager, open in default app, find similar notes, focus node).
  - Search-graph results can be sorted ascending or descending — with a new alphabetical sort — and the sort choice persists with the graph tab alongside the other filters.
  - The "Similar notes" similarity badge is clearer: capped below 100% for non-identical notes, with a tooltip explaining it is the cosine similarity of note embeddings (1.0 = identical meaning).
  - A single unmappable glyph in a PDF no longer discards the entire document's text during indexing; extraction now salvages every readable page.

## 2.5.0

### Minor Changes

- 9448c8a: Add EPUB reading and make books findable in vault search.
  - New EPUB reader in the document viewer (vendored `foliate-js` engine): renders reflowable and fixed-layout books, with a table-of-contents sidebar, internal-link navigation, prev/next paging, an in-book search, a reading-progress indicator, and theme-following light/dark styling.
  - Reader preferences in Settings → Documents: reading mode (scrolled by default, or paginated), columns, text width, font size, and line spacing — applied live.
  - Resume-where-you-left-off: reading position persists per vault in `.carbide/reading_positions.json` (relative path → CFI) and is restored on reopen.
  - Security: book content renders in same-origin `blob:` iframes (required for pagination) with book JavaScript neutralized by a strict per-document CSP (`script-src 'none'`) and script resources blocked at load — the inverse of the trusted-HTML posture, by design.
  - Vault full-text search now indexes EPUBs (title + spine body text), so a phrase from a book surfaces in the omnibar, and `[label](book.epub)` links resolve as attachments — mirroring the existing HTML/PDF paths.

## 2.4.0

### Minor Changes

- 7e4b046: Add RAG-powered chat over the vault.
  - Unified scope picker (folders · tags · bases) with suggestion navigation and lazy loading
  - Deterministic query analysis: topic extraction plus date-range parsing, pushed into hybrid/block search as an mtime filter with scope over-fetch
  - Section-granular hybrid retrieval, query rewriting, @mention pinned context, and inline citations
  - Scope-aware prompt templates in the chat empty state
  - MCP `rag_query` and `rag_status` tools via the front-end event bridge
  - OpenAI-compatible API streaming with LM Studio and llama-server presets
  - Authored/discovered link split in the right rail, vault-wide "Recently edited", and a hover "Link" action that converts every unlinked mention of a note's title into a wiki-link
  - Smart blocks: unified insertion on the slash menu, and fixed a tasks-block XSS hole plus a reactivity gap

## 2.3.1

### Patch Changes

- e096889: ### Bug Fixes
  - **Search: rank verbatim multi-word phrases correctly**: A multi-word query was lowered to independent prefix-AND tokens (`name of the game` → `"name"* "of"* "the"* "game"*`), with no phrase semantics. When every term is a common word each term's IDF collapses toward zero, bm25 goes flat across all matches, and the note containing the verbatim phrase ranked arbitrarily — often far down — below notes that merely repeated the words. Multi-term queries now OR an exact-phrase clause with the prefix-AND clause; the phrase carries real IDF and lifts verbatim matches to the top while the prefix-AND arm preserves recall when no exact phrase exists. Single-word queries are unchanged.
  - **Search: scope multi-word autocomplete to title/name/path**: `suggest()` built `{title name path} : "a"* "b"*`, but an FTS5 column filter binds only to the phrase that immediately follows it, so only the first term was column-restricted and trailing terms matched unrestricted columns including the body. Multi-word autocomplete (wiki-links, omnibar note-name completion) could therefore surface notes whose body — not title/name/path — contained the later terms. The term group is now parenthesized so the filter applies to every term.
  - **Search: preserve backend relevance order in the omnibar re-rank**: The omnibar re-rank overwrote each hit's backend (BM25 / hybrid) score with a title/name/path-only score, so within a match-kind bucket the backend relevance ordering was discarded and dropped from the emitted score. The backend's best-first ordering is now threaded through as a normalized relevance signal and folded into the omnibar score, so results stay ordered by relevance within each bucket while match-kind and recency continue to dominate.

## 2.3.0

### Minor Changes

- 8aacfa6: ### Features
  - **Menu-bar tray icon + close-to-hide (headless-capable MCP)**: Carbide can now keep running with its window closed, reachable from a macOS menu-bar icon, so the in-process MCP server on `:3457` and the `carbide mcp` CLI stay live without an open window. Gated behind a new `app.closeToTray` setting (default off, preserving today's close=quit behavior). The tray menu shows the MCP server status, a **"Keep running in menu bar"** checkbox that persists the flag, **Show Carbide**, and **Quit Carbide**. With the flag on, the window close button hides the window instead of exiting; Cmd+Q / Quit still exit fully. The dock icon is retained. Settings service gains sync `set_setting_value`/`get_setting_value` cores plus a pure, unit-tested `read_bool` helper so the tray handler persists without an async runtime.

## 2.2.2

### Patch Changes

- ebb511a: ### Fixes
  - **Inline AI replaces the selection (BUG-1)**: `start_stream` now deletes the active selection in the same transaction before anchoring the AI range, so generated text replaces the selection instead of being shoved beside it. The pristine pre-AI document is snapshotted once on `open` (survives retries), and a first-class `retry` action deletes the previous AI range and re-streams the cached prompt rather than firing an unknown `"retry"` command id — fixing both "Try again" appending a second generation and reject-after-retry failing to restore the original doc.
  - **Terminal Option+Arrow word motion (BUG-3)**: removed `macOptionIsMeta:true` so xterm.js emits the standard escape sequences that default zsh/bash readline bindings recognise, restoring word-by-word cursor movement.
  - **Drill-down file explorer context menu (BUG-4)**: drill-down rows are now wrapped in `ContextMenu.Root` with star / copy-path / open-to-side / reveal / rename / delete actions, mirroring the tree-row affordances via the same optional callback props.
  - **Linked source resolution by existence, portable anchors first (BUG-5)**: resolution preferred the absolute `external_file_path` recorded on the indexing machine over the portable anchors, so on a second machine the stale path made sources look missing. `resolve_linked_path` (scan relocation) now prefers vault-relative then home-relative anchors and treats `external_file_path` as a cache hint; the Rust open/preview resolver builds candidates in portability order and returns the first that exists on disk, falling back to the most-portable candidate. `linked_source_list_files` is bounded by a 5s timeout so an unreachable mount returns promptly, and a new "Refresh sources" action re-validates and rescans on demand.
  - **Task-query embed shows the leaf section, full path on hover (BUG-6)**: the embed renderer no longer sets the full slash-joined ancestry as visible text; section labels are centralised through `leaf_of_section` / `full_section_path` so embed and the Svelte component both show the leaf with the full path in the `title` attribute.
  - **HTML document scroll persists across tab switches (BUG-7)**: added `initial_scroll_top` / `on_scroll_change` plumbing to `html_viewer.svelte` and `html_live_renderer.svelte`. The safe viewer reads/writes scroll via `contentDocument.scrollingElement` with a debounce; the document content wrapper passes through `viewer_state.scroll_top`, matching the existing code/csv viewer pattern.
  - **Problems panel severity filter (BUG-8)**: replaced the binary log/diagnostics toggle with two orthogonal axes — Stream (all / diagnostics / logs) and Severity (all / error / warning / info / hint / debug / trace). The pure filter/merge logic is extracted into `problems_panel_filter.ts` for direct unit testing; "all" merges both streams sorted by timestamp.
  - **Tag palette fuzzy/hierarchical matching (BUG-9)**: `handle_tag_suggest_query` and `handle_at_palette_tag_query` now use `rank_tags` from `tag_matcher` instead of `startsWith`, so hierarchical, substring, and fuzzy scoring apply to both palettes and ranked order is preserved.

## 2.2.1

### Patch Changes

- fb0e7e1: ### Features
  - **`@` palette prefix legend**: the `@` command palette now renders a compact legend above the dropdown listing the active prefixes (`#tag`, `[[note]]`, `>cmd`, etc.) so the available routes are discoverable without memorising them. Lives entirely in `at_palette_plugin.ts` + `editor.css`.
  - **Task list: truncated section labels with full path on hover**: `task_list_item.svelte` now shows only the leaf segment of a heading-stack section (`Subproject B` instead of `Project A/Subproject B`) and exposes the full ancestry in a native `title` tooltip. Keeps the list scannable for deeply-nested headings.

  ### Performance
  - **Embeddings: f16 weights on Metal + larger batches**: `features/search/embeddings.rs` and `service.rs` load model weights as f16 on Metal devices, run pooling and L2 normalisation on the CPU side, and bump the encode batch size from 16 → 32. Measurable speedup for vault-wide re-embeds without changing output semantics.

  ### Fixes
  - **Editor: `is_canvas_tab` guard survives the minifier**: rewrote the helper in `note_editor.svelte` so the production minifier no longer strips the parens that gated tab-type detection, preventing canvas tabs from being treated as note tabs after a release build.
  - **Editor: `active_tab` no longer crashes on transient null**: the deriveds in `note_editor.svelte` that consume `active_tab` now guard against the brief null between `workspace.close_tab` and the next render, fixing the intermittent "Cannot read properties of null" crash when closing the last tab.
  - **Vite: unstick override that pinned the workspace to v6**: removed the stale `pnpm.overrides` entry that held `vite` at v6 across the workspace and blocked the v8 upgrade. Drops ~50 transitive duplicates from the lockfile.

  ### Dependencies
  - **Tauri 2.10 → 2.11** with a re-vendored `wry` 0.55.1 patch under `src-tauri/patches/wry-0.55.1/` (replaces the old 0.54.4 patch). `@tauri-apps/*` npm packages aligned to match the Rust side.
  - **Vite 8, Vitest 4, TypeScript 6, Svelte plugins 7** (wave 2). Test helpers (`svelte_client_runtime.ts`, plugin RPC tests, `link_repair_fixture.test.ts`) updated for the new APIs.
  - **`pdfjs-dist` 4.10 → 6.0** (wave 4) with `pdf_viewer.svelte` and `file_embed_view_plugin.ts` updated for the new worker entrypoint.
  - **`@lucide/svelte` + `lucide-static` 0.56 → 1.17** (wave 3); the old per-icon import workaround in `vite.config.ts` is no longer needed.
  - **Wave 1 minor/patch npm bumps** across the workspace, plus `pnpm.overrides` moved from `package.json` to `pnpm-workspace.yaml` to satisfy pnpm 10's new placement rule.

  ### Dev / DX
  - **Error handler logs origin object**: the global error/rejection handler in `+layout.svelte` now also calls `console.error` with the original error (in addition to the throttled toast) so a devtools-attached build sees the full stack and cause chain.
  - **`tauri.conf.json` formatted**: Prettier-style single-line arrays + trailing newline; no behaviour change.

## 2.2.0

### Minor Changes

- 116a44c: ### Features
  - **File explorer UX overhaul (Phase 1 + 2)**: a coordinated pass on the sidebar / editor relationship driven by `carbide/plans/2026-05-29_file_explorer_ux_improvements.md`.
    - **Path breadcrumb above the editor**: renders `vault → ancestor folders → current note` whenever a note is open. Ancestor clicks reveal the folder in the file tree (expand path, select, switch sidebar to explorer); the trailing note segment re-reveals the active note. New `filetree_reveal_folder` action mirrors `filetree_reveal_note` for folder targets.
    - **Finder-style drill-down explorer mode**: `DrillDownFileTree` renders one folder at a time with an "up" row and single-click activation. A new `filetree.toggle_mode` action flips between the tree and drill-down views in the explorer header; the choice persists via the existing `EditorSettings.file_tree_mode` field. Navigation reuses `filetree_reveal_folder` so the breadcrumb works as ancestor nav.
    - **Files / Views sub-tabs in the sidebar**: the explorer pane now has a Files tab (the existing virtualized tree) and a Views tab that lists the vault's saved bases views (`.carbide/bases/*.json`). Clicking a view loads it and switches the sidebar to the bases panel. New `ui.explorer_subtab` UIStore state and `ui.select_explorer_subtab` action wire it up; `dispatches bases_list_views` when switching to Views.
    - **Folder-note click-through**: single-clicking a folder in either tree or drill-down mode now opens the matching folder note (`folder/<basename>.md`) when one exists, gated to the expand transition so a collapse no longer steals tab focus. Uses the same same-name convention enforced by link resolution.
    - **Hover-peek preview in drill-down view**: `PeekTooltip` shows a small floating popover (title + path + blurb) after 500 ms hover, reusing `NoteMeta.blurb` so the feature requires no I/O. Wired into `DrillDownFileTree` for v1.
    - **Drag-and-drop wikilink insertion**: dragging a markdown file from the tree onto the editor now inserts `[[basename]]` via the new `build_wiki_link` helper. Non-markdown paths still produce the existing relative file links; mixed drops produce a mix.
    - **Cmd+P pre-fill from the focused folder**: when the omnibar opens with an empty query and focus is inside a `[data-vim-nav-region="file_tree"]` subtree, it pre-fills the query with the selected folder path (suffixed with `/`) and immediately runs the prefixed search.
  - **Bases: tree view mode + group_by config**: new `tree` `ViewMode` that nests rows under multi-level grouping by property values (e.g. `["tags", "status"]`). Empty `group_by` falls back to a flat row list so the mode is always usable. Rust `BaseViewDefinition` now persists kanban / calendar / tree configs; previously kanban/calendar were silently dropped on save round-trip.
  - **Bases: default saved views seeded on first vault open**: new `bases_seed_default_views` Tauri command writes six default views (By Tag, By Created Month, By Status, Modified This Week, Orphan Notes, Smart Archive) to `.carbide/bases/`. A `.carbide/bases/.seeded` sentinel prevents re-seeding. Seeds requiring a frontmatter property are skipped when that property isn't present in the vault.
  - **Context rail: Related tab with siblings + tag chips**: new `RelatedPanel` surfaces (1) recent notes in the current folder, (2) siblings of the open note (same parent folder), and (3) shared-tag chips. Clicking a tag chip pivots the sidebar to bases with a tag filter applied. Added as a fourth tab on the existing `ContextRail` (Compass icon).

  ### Fixes
  - **Refresh button now rescans the filesystem**: the sidebar refresh action invalidated UI-side state and reloaded every previously-expanded folder, but the Rust folder-listing cache (30s TTL) returned stale entries within that window, so files added or removed externally weren't picked up. New `clear_folder_cache(vault_id)` Tauri command drops every cache entry for the vault, and runs at the start of `folder_refresh_tree` before the per-folder reloads.
  - **Bases `now()` / `mtime` filters wired up**: the default "Modified This Week" and "Smart Archive" views were dead because `now()-Nd` values were never substituted and `modified` / `accessed` were read as frontmatter props. `query_bases` now resolves `now()` / `now()-Nd` to epoch-ms and maps `modified→mtime_ms`, `created→ctime_ms`, `accessed→mtime_ms` (accessed is a mtime proxy; no atime tracked). Both seeds are ungated so they return rows; Orphan Notes stays gated until `backlink_count` becomes a computed column.

  ### Notes
  - Includes the `2026-05-29_file_explorer_ux_improvements.md` planning doc that scoped Phase 1 + 2 of this work.

## 2.1.0

### Minor Changes

- 58f00d7: ### Features
  - **HTML Live mode via `carbide-html:` custom scheme**: Live-mode iframes now load through a dedicated Tauri URI scheme (`src-tauri/src/shared/live_html.rs`) instead of `blob:` or `data:` URLs. The handler resolves trust per request, streams the doc bytes with a tight CSP, and serves vault-relative asset requests (images, fonts, stylesheets sitting next to the HTML file) from the doc's folder. The meta CSP in the served HTML is kept in sync with the response-header CSP so the page works under both. The status bar grew a trust indicator that opens the new Trust panel (`trust_panel_content.svelte`) for revoking per-file / per-folder grants without leaving the editor.
  - **Mermaid + KaTeX pre-rendering in HTML Live mode**: `html_live_prerender.ts` walks the HTML AST and pre-renders `<pre><code class="language-mermaid">` blocks and `$…$` / `$$…$$` math nodes server-side, so Live-mode HTML matches markdown rendering even when the doc author did not ship a script tag for either. `mermaid_prerender.ts` runs Mermaid through the existing render path and inlines the SVG; KaTeX is rendered to static HTML with the standard fonts. Both are covered by unit tests in `tests/unit/domain/html_live_prerender.test.ts`.
  - **AI assistant + edit dialog now understand HTML documents**: The assistant panel and edit dialog pick up the active HTML document's title, body text, and selection context, so "summarize this", "extract the action items", and inline edit prompts work on HTML files just like markdown notes. `ai_prompt_builder.ts` gained an HTML-aware path; `ai_service`, `ai_actions`, `ai_store`, and the dialog UI route through it. Source-mode AI editing is documented in `docs/html_artifacts.md`.

  ### Fixes
  - **Live-mode iframe lifecycle hardening**: `SandboxedIframe` no longer applies a default `csp` attr (the response-header CSP is authoritative). `drop_guard.ts` ensures Live-mode iframes detach cleanly when the workspace tears down, preventing the lingering window references that surfaced during tab close and panel resize. Covered by `tests/unit/utils/drop_guard.test.ts`.
  - **Live-mode CSP alignment**: The meta CSP injected into served HTML now mirrors the `live_html.rs` response-header CSP exactly, so DOM-level resource loads (images, fonts) succeed under the same policy that the browser enforces from the header.

  ### Notes
  - Includes the `2026-05-29_html_doc_parity_plan.md` planning doc that scoped the mermaid / KaTeX / asset-resolution work, plus a lint + format pass over the HTML parity changes.

## 2.0.0

### Major Changes

- dff4cf3: ### Features
  - **HTML artifacts as first-class vault citizens**: HTML files now reach full parity with PDFs across indexing, rendering, and embedding.
    - `FileCategory::Html` split from `Code`; `.html`/`.htm` classified as attachments on both sides (`ATTACHMENT_EXT_RE`, `ATTACHMENT_EXTENSIONS`) so markdown links create attachment edges instead of phantom outlinks.
    - New `scraper`-based HTML extractor walks the DOM, skips `script`/`style`/`noscript`/`template`, normalizes whitespace, and pulls `title` (or first `h1`) into `meta.title`. FTS now sees visible text instead of class names and inline JS.
    - Three render modes — **Source / Safe / Live** — with per-file / per-folder trust grants persisted under `.carbide/trusted_html.json`. Default-deny: the trust dialog never appears unless the user explicitly clicks Live.
    - `![[file.html]]` transclusion renders inline as a sandboxed Safe-mode iframe (sanitized + no scripts, regardless of the file's own trust level); the existing "Open in tab" affordance is the path to Live mode. `parse_embed_fragment` now returns `{page, height, params}`; `file_embed` schema gained a `params` attr with JSON DOM round-trip. Vault-relative `src`/`href`/`poster` resolved against the embedder's directory; safe-embed CSP allows `carbide-asset:` while keeping `connect-src 'none'`.
    - New `document.paste_html_artifact` action reads HTML from the clipboard, derives a slugged+timestamped filename, writes the file and a `.meta.json` sidecar in the open note's folder, and inserts a `![[…]]` transclusion at the cursor.
    - Provenance banner above the HTML renderer (fed by `DocumentStore.provenance` map and `DocumentService.refresh_provenance`); ✕ button runs `document.clear_provenance`, deleting the sidecar via a new `DocumentPort.delete_file` method wired through the Tauri `delete_vault_file` command.
    - Full documentation in `docs/html_artifacts.md` covering render modes, trust grants, transclusion, paste-from-clipboard, the provenance banner, theme variables, FTS, the security envelope, and known limitations.
  - **Omnibar ranking overhaul with recency boost**: The omnibar scoring rule is now a constant table (`OMNIBAR_SCORES`: exact_prefix 1.0 > substring 0.6 > fuzzy 0.3 + recency boost capped at 0.3) applied to every note-producing branch (structured query / hybrid / FTS) via `rank_notes`. `NotesStore` tracks per-note access timestamps in a 24h sliding window (max 16 ts/note). New `find_notes_by_name(vault_id, query, limit)` Tauri command does a bounded vault walk used as a fallback (100ms timeout) so newly created notes that miss the index still resolve.
  - **Hierarchical heading scoping in task queries**: `extract_tasks` now maintains a heading stack indexed by depth; each task's section is stored as slash-joined ancestry (`Project A/Subproject B`) instead of just the nearest heading. New `section under <heading>` operator translates to `(section = ? OR section LIKE 'value/%')`, finding tasks at the heading and every descendant. `section is <heading>` aliases exact match. `include_subheadings:false` keyword opts out.
  - **Fuzzy + hierarchical tag search**: `score_tag` scores by `max(hierarchical, substring, fuzzy)` — `#parent` matches `#parent/child` at 1.0; substring at 0.6; fuzzy normalized to ≤ 0.95 so it never beats a literal hierarchical hit. `query_solver.resolve_with` falls back to `list_all_tags` + top-5 fuzzy when prefix lookup misses, so typos like `with #prjects` still surface `#projects/carbide` notes.
  - **`search_headings` primitive**: New `search_db::search_headings(conn, query, limit)` streams `note_headings`, rebuilds per-note hierarchy stacks inline, and scores headings by the omnibar rule. Returns `HeadingMatch { note_path, level, text, line, heading_path, score }`. Exposed via Tauri command, `SearchPort`, and `SearchService.search_headings_matching` for plugins/callers.
  - **Transclusion edit-in-place**: New Pencil button on the `note_embed` toolbar (between collapse and open-in-tab) converts the rendered embed back into editable `![[display_src` text without the closing `]]` so the embed plugin's `appendTransaction` does not immediately re-render. The wiki_suggest dropdown reactivates because `is_embed` is detected from the leading `!`. `build_embed_edit_transaction` is a pure helper covering display_src round-trip, heading-fragment preservation (`folder/note#Heading`), and src→display_src fallback.
  - **PDF extraction cache**: Content-addressed cache (`reference::scan_cache::ScanCache`) keyed on blake3 of the file bytes. Cache hits skip the PDF subprocess and `lopdf` metadata pass entirely; `file_path` and `modified_at` re-derived from the live file so cached results survive renames. Cache lives under `~/.carbide/linked_source_cache/` with a `schema_version` field.

  ### Fixes
  - **`code_lsp` PATH lookups memoized**: cached via `LazyLock<Mutex<HashMap>>`; spawn gated on `code_lsp.enabled` / `code_lsp.languages` from settings. One `warn` per missing server instead of an INFO loop every second.
  - **Save-As drill-down**: Untrack the query read in `folder_suggest_input.svelte` so the trailing slash and live typing aren't stomped by the value→query mirror; `ArrowRight` now drills into the highlighted folder.
  - **Tab close hardening**: `clear_open_note` resets `split_view`; `close_tab_immediate` flushes the editor when closing the active tab, draining pending mode-transition syncs before teardown.
  - **Link repair on MCP/CLI move and rename**: Extracted `repair_links_for()` as the canonical helper used by both `rename_note_and_update_links` and the reworked `move_note`. Move now detects folder vs file via metadata, walks the destination to build a per-child `path_map`, and reports `updated_links` over `cli_move` + `cli_rename` JSON responses. `repair_links_for` `index_upserts` each new path before querying backlinks, encoding the writes-complete-first/reads-fall-back policy documented in `shared_ops` module docs.
  - **PDF extraction observability**: `warn!(path, cause)` on both the in-process indexer path (`search::text_extractor::extract_content`) and the subprocess-isolated linked-source path (`reference::linked_source::extract_pdf`) — previously `unwrap_or_default()` swallowed errors silently. The in-process `recv_timeout` now distinguishes timeout (parser slow) from disconnect (worker panicked). Added per-stage `Instant` timing around `extract_pdf` (meta/text/ids phases).
  - **`create_note` timing audit**: Per-phase debug timing (resolve / pre_write / write / total, plus bytes) added to the MCP `create_note` path so future slow reports have actionable data. End-to-end audit confirmed no synchronous reindex, contended lock, or embedding call on the write path.
  - **Task attr consistency across navigate-away-and-back**: In-editor task creation now sets `task_status="todo"` alongside `checked=false` (`block_transforms.ts` × 2 sites, the `wrap_as_todo` loop, and `slash_command_plugin.ts make_todo_insert`). Previously, a freshly created `[ ]` task had `{checked: false, task_status: null}` while the mdast→pm parse path set `{checked: false, task_status: "todo"}` for the same syntax — so the same task clicked behaved differently before vs. after a navigate-away-and-back. Both paths now produce matching attrs.
  - **Comment regex tightened in task query parser**: `(?:^|\s)#\s` so `section under #Heading` parses correctly (the leading `#` is no longer eaten as a comment marker).

  ### Notes
  - Source-mode editor keeps LSP completion; wiki/tag/at-palette syntax completion in source mode is a documented gap (lifting the PM suggest factory to CodeMirror primitives would duplicate suggest orchestration; the resolved bias is the LSP fallback).
  - A shared link-repair parity fixture at `tests/fixtures/link_repair_cases.json` drives matching tests on both the Rust (`search_service::rewrite_note_links`) and TS (`LinkRepairService`) sides; markdown-link rewriting is pinned as a documented gap so a future fix updates both suites in lockstep.

## 1.44.3

### Patch Changes

- 9b184b8: ### Fixes
  - **Inline code (and other inline marks) did not terminate after the closing delimiter**: After commit `04337ff7` made `code_inline`, `strikethrough`, and `highlight` inclusive (so they can be extended by typing inside the marked range), typing `` `foo` `` via the input rule left the code mark as a stored mark at the cursor. The next typed character was then absorbed into the inline code run, and the same applied to bold/italic/highlight. The four inline-mark input rules now call `tr.removeStoredMark(mark_type)` after applying the mark, so subsequent typing produces plain text. Extending an existing mark by positioning the cursor inside it still works, and the existing `ArrowRight` escape behavior is unchanged.

## 1.44.2

### Patch Changes

- a4f4348: ### Fixes
  - **Image markdown collapses surrounding linebreaks**: Inserting a canonical `![alt](url)` image (and subsequently switching between source/visual or saving) collapsed every block in the document onto one line. The `image-block` ProseMirror node was being serialized as a top-level mdast `image` (phrasing) node, which is malformed at block level — `remark-stringify` dropped the blank lines between every sibling. `pm_to_mdast` now wraps the image in a `paragraph` mdast node so adjacent blocks keep their separators.
  - **Images do not render in exported PDFs**: The hidden export webview loads from `pdfexport://localhost/` with a strict CSP, so `carbide-asset://` URLs, relative paths, `file://` paths, and remote URLs were all blocked. `render_note_to_html` now accepts an optional `image_resolver` callback, pre-resolves every image src (canonical `![alt](path)`, wiki-embed `![[image.png]]`, absolute paths, and `http(s)` URLs) to a data URI, and inlines them into the HTML before printing. Wiki-embeds whose target is not an image extension are left untouched. Failed loads render a faint placeholder with the alt text so the document flow stays intact.

## 1.44.1

### Patch Changes

- 9d4f012: ### Fixes
  - **PDF export build (Linux/Windows)**: Fixed Rust compile errors in `src-tauri/src/features/export/mod.rs` that broke the v1.44.0 release pipeline. Corrected the `webkit2gtk` trait import path (the crate has no `prelude` module) and dropped a vestigial `gtk::prelude::PrintSettingsExt` import since `PrintSettings::set` is inherent. On Windows, dropped a `BOOL::as_bool()` call now that `webview2-com`'s `PrintToPdfCompletedHandler` passes a plain `bool`.

## 1.44.0

### Minor Changes

- a63b16e: ### Features
  - **Note PDF export rework**: Replaced the old in-app PDF engine with a self-contained HTML renderer plus a `PdfExportPort`/Tauri adapter and an `export_html_to_pdf` command that captures HTML to PDF natively on macOS, Windows, and Linux. Export now routes through `DocumentService`, with mermaid diagrams, math fences (rendered as centered italic text with inline KaTeX CSS), and SVG-to-PNG rasterization supported.
  - **Plugin management**: Added marketplace update support and plugin uninstall, plus an `md-export` PDF plugin.

  ### Fixes
  - **macOS PDF export**: Paginate output via `NSPrintOperation` and avoid the WKWebView print deadlock by running `runOperationModalForWindow` asynchronously.
  - **Plugin install**: Allow subdirectory paths in plugin filenames during install, and use camelCase `downloadUrl` to match the Rust serde `rename_all` casing.
  - **Rendering**: Fixed h1 underline position and full-width HR in the plugin.
  - **UI**: Made toast text selectable.

## 1.43.1

### Patch Changes

- b98b7b9: Fix markdown links with alt text (e.g. `[text](path/to/note.md)`) resolving incorrectly in nested folders. They were using vault-global lookup like wikilinks instead of resolving relative to the current file per standard markdown semantics.

## 1.43.0

### Minor Changes

- a9260cf: Add frontmatter command with ensure_frontmatter CLI/MCP route (TS + Rust), fix Cmd+Click for block selection with Shift+Click restored for text selection, add user-select: none to non-editable editor chrome elements, and fix partial details/callout node handling during clipboard serialization.

## 1.42.0

### Minor Changes

- f84d72f: ### Features
  - **Search graph multi-select and filtering**: Cmd/Ctrl+click to toggle individual node selection, Shift+click for range selection. Added toolbar controls for hiding neighbor nodes and filtering by minimum score threshold. Canvas export respects multi-selection.

  ### Fixes
  - **Mermaid fullscreen close controls**: Added floating toolbar with zoom, export, and close button to fullscreen mermaid view. Escape key also exits fullscreen.
  - **Mermaid diagram drag and sizing**: Removed CSS transition during drag to eliminate lag/jitter, removed max-width constraint for natural SVG sizing, added vertical resize and fullscreen expand/collapse.
  - **Terminal WebGL error suppression**: Scoped error interceptor catches xterm WebGL addon errors from advanced escape sequences, disposes the addon (falling back to canvas), and prevents error toast spam.

## 1.41.0

### Minor Changes

- 2066035: ### Features
  - **Mermaid diagrams in slides export**: Mermaid code blocks are now rendered as diagrams when exporting to slides.
  - **Vault graph and neighborhood canvas exports in command palette**: Added commands to export vault graph and neighborhood canvas directly from the command palette.

  ### Fixes
  - **Mermaid SVG export uses Tauri save dialog**: Mermaid SVG export now uses the native Tauri save dialog instead of a browser download.
  - **Command palette caret and mermaid zoom/pan/export**: Fixed command palette caret positioning and mermaid diagram zoom, pan, and export interactions.
  - **Last list item bottom margin**: Removed extra bottom margin from the last paragraph in the last list item for cleaner spacing.

## 1.40.0

### Minor Changes

- c3883e9: ### Features
  - **Collapsible section in Turn Into menu**: Added collapsible grouping to the block Turn Into menu for better organization.
  - **Fuzzy matching in graph filter**: Graph filter now uses fuzzy matching for more forgiving node search.
  - **Continuous semantic neighbor scoring**: Semantic neighbor results use continuous similarity scoring instead of binary thresholds, improving relevance ranking.

  ### Fixes
  - **Hybrid search RRF merge**: Pure-vector hits are now included in the Reciprocal Rank Fusion merge, fixing cases where semantically relevant results were dropped.
  - **Task query view**: Fixed section display, optimistic toggle behavior, and doing state rendering in task query results.
  - **Round-trip doing task state**: The `[-]` (doing) task state now correctly round-trips through the editor without being lost or corrupted.

## 1.39.0

### Minor Changes

- af61593: ### Features
  - **Due date sentinels**: `due today` now resolves at query execution time via SQLite `date('now', 'localtime')` instead of at parse time, keeping saved and embedded queries fresh.
  - **Relative date expressions**: Added `due this week`, `due next N days`, `due last week` with sentinel-based range filters resolved in Rust via SQLite date arithmetic.
  - **Inclusive before/after**: `due before Friday` and `due after Monday` now use `<=` / `>=` instead of strict `<` / `>`.
  - **Task panel DSL entry point**: Toggle button switches between simple text search and full DSL textarea with inline parse error display.
  - **List view grouping**: Extracted shared `group_tasks()` function used by kanban, list view, and embedded query results. List view now renders group headers with label + count.
  - **Sort controls**: Sort select (status, due date, path, text) with ascending/descending toggle in task panel toolbar.
  - **Tag filtering**: `tag includes urgent` and `has tag` query expressions, implemented via text contains with auto-prepended `#`.
  - **showCompleted as backend filter**: Hide-completed toggle now injects a filter atom server-side instead of client-side filtering.
  - **Navigate to source note from embedded results**: Filename in embedded task query results is a clickable link that opens the source note.
  - **Task count in header**: Badge displayed next to "Tasks" label when tasks > 0.
  - **MCP connection details**: Added MCP connection details section for other agents.
  - **In-app changelog**: Added changelog to in-app help guides.

  ### Fixes
  - **Embedded task toggle**: Fixed double status cycle bug in embedded task query toggle.

## 1.38.0

### Minor Changes

- b54d108: ### Features
  - **Boolean operator support for task queries**: Added `FilterExpr` type with AND/OR/NOT combinators for task filtering. Parentheses required after NOT to avoid clashing with `not done` keyword. Includes Rust unit tests for `build_filter_sql` and `FilterExpr` deserialization.
  - **Vault context for AI**: Added vault context types, settings, and prompt builder support. Wired vault context into AI service, actions, and UI. Added vault context settings UI controls with tests. Simplified vault context code for cleaner layering.

  ### Fixes
  - **Task SQL builder**: Added `starts_with` operator and fixed `readVaultFile` call.

## 1.37.1

### Patch Changes

- 2f690a7: ### Fixes
  - **Formatting marks now inclusive with universal escape**: Removed `inclusive: false` from code_inline, strikethrough, and highlight marks so users can extend them by typing at the boundary (matching bold/italic behavior). Updated mark escape plugin to escape from all user-facing formatting marks on ArrowRight.
  - **Prevent `.carbide/` folder creation in browse mode**: Added backend guards on Tauri write commands to reject writes when vault is in browse mode. Frontend plugin lifecycle reactor now skips `initialize_active_vault` for non-vault modes. `smart_links::config::load_rules` returns defaults in-memory without writing when config file is missing.

## 1.37.0

### Minor Changes

- 8f78b5d: ### Bases views
  - Add kanban, gallery, and calendar views
  - Add kanban drag-and-drop with property update
  - Add content_snippet and first_image_path to gallery view

  ### Graph
  - Add cluster detection and focus mode with radial layout
  - Add force-directed canvas layout with GroupNode from clusters
  - Add Export as Canvas UI entry points

  ### Canvas
  - Add note content loading infrastructure and embedded markdown in file nodes
  - Add graph-to-canvas export actions and domain function
  - Add click-to-open with animated focus transition and edge labels

  ### Fixes
  - Resolve 5 post-audit bugs in visual features
  - Fix bases panel header overflow in sidebar
  - Fix async clipboard fallback for visual editor paste

## 1.36.1

### Patch Changes

- eb43995: ### Editor fixes
  - Preserve cursor position when switching between visual and source mode
  - Use block-anchor for stable cursor position across mode toggles
  - Allow Ctrl+Shift selection across callout/details blocks

  ### Linked source resolution
  - Resolve linked source paths in wiki link navigation
  - Resolve linked source PDF paths in citation picker and editor embeds

  ### AI provider
  - Preserve AI result when switching providers

  ### Large files
  - Show file size and "Load anyway" button for files exceeding 5 MB

  ### Infrastructure
  - Start HTTP server unconditionally at app launch

## 1.36.0

### Minor Changes

- 256d966: ### Bases improvements
  - Add search, filter, and sort capabilities to bases views
  - Fix file-type routing in bases and add expand-to-tab view
  - Extract `BASES_TAB_ID`/`TITLE` to domain constant
  - Review fixes: `$derived.by`, state sync, deduplicate filter upsert

  ### Editor fixes
  - Fix table toolbar appearing in source mode and blocking text selection
  - Fix folder autocomplete drill-down staying open after selection

  ### Inline AI
  - Auto-focus the "Ask AI to write" textarea when the inline AI menu opens
  - Re-focus the textarea when pressing Cmd+Shift+I while the menu is already open

## 1.35.0

### Minor Changes

- f6548ba: ### Attachment links
  - Add attachment link detection in Rust backend (images, PDFs, etc.) — filters attachment targets from wikilink resolution
  - Add Attachments section to the links panel UI with paperclip icon; opens files via system shell
  - Extend `LinksSnapshot` and store/service layers with attachments field

  ### MCP tool surface
  - Router auto-injects `vault_id` from active vault when omitted
  - Add `append_note` and `prepend_note` tools
  - Add `mode=semantic` to `search_notes` for hybrid vector+FTS search
  - Add `query_tasks` tool with status/path/due_before filters
  - `rename_note` now updates wikilinks in backlinking notes automatically

  ### Backlink-aware rename (in-app)
  - The in-app `rename_note` Tauri command now rewrites wikilinks in backlinking notes after rename, matching MCP behavior

  ### Fixes
  - Add standard markdown link extraction (`[text](url.md)`) to Rust `extract_links` — search DB now indexes both wikilinks and markdown-style links
  - Fix cursor-past-match-end guard in `markdown_link_input_rule` preventing premature link conversion
  - Fix plugin marketplace 404 by correcting default repo URL; improve error handling

## 1.34.0

### Minor Changes

- d277f07: ### Backlinks
  - Backlinks now work natively via search DB; merge with LSP when available
  - Resolve outlinks on individual note upserts (not only during full sync)
  - Fall back to search DB results when LSP is not running or errors

  ### Update flow
  - Manual update check shows a confirmation toast with Update/Later buttons instead of auto-installing

  ### Plugin marketplace
  - Add plugin marketplace: fetches listings from a configurable GitHub repo, displays in a Browse tab, and installs plugins to ~/.carbide/plugins/
  - Includes Rust backend commands, TS port/adapter/service/store, DI wiring, action registration, and Browse tab UI

## 1.33.1

### Patch Changes

- 1cd65f8: ### Theming
  - Expose Tier 3 component tokens in CSS token reference UI
  - Add activity bar Tier 3 tokens for independent customization
  - Remove redundant foreground token entries from theme blueprints and palette generator

  ### Vault indexing
  - Resolve wikilink targets to vault-relative paths at index time
  - Add backlinks resolution tests and register snapshot in specta

  ### External MCP sidecar
  - Inject expanded PATH into external MCP sidecar process
  - Skip non-JSON stdout lines in external MCP stdio reader

## 1.33.0

### Minor Changes

- 33b15ea: ### Hover panel
  - Sticky hover panel with rendered markdown and clear button, clears on tab change
  - Link tooltips populate the hover panel store
  - Source mode hover populates panel store
  - Clickable links in floating hover tooltips with `clear_hover` method

  ### External MCP sidecar
  - Generic external MCP client in Rust for stdio-based MCP servers
  - `sidecar.*` plugin API for spawning and communicating with external MCP servers
  - `wiki-compiler` plugin using the sidecar system
  - `vault.get_root` RPC action
  - Added `.llmwiki/` to builtin vault ignore patterns
  - Integration tests for sidecar RPC handler, adapter, and ExternalMcpState

  ### File embeds
  - Route file embed "open" action through `document_open`
  - Register `book-open` icon and fix reserved word in interface
  - Ensure leading paragraph before NodeView at document start
  - Deduplicated embed plugin code

  ### Sidebar
  - Widen sidebar and persist width across open/close

  ### Fixes
  - Preserve collapse state across non-note tabs and respect attachment folder for dropped files
  - Flush pending `didChange` before LSP completion requests
  - Fix layering violation and type error from checks
  - Rename lib crate from `carbide_lib` to `carbide`
  - Bridge Carbide AI provider config to wiki-compiler plugin

## 1.32.0

### Minor Changes

- 0f01601: ### Collapsible node views
  - Code blocks, file embeds, and note embeds now support a collapse toggle
  - Collapse state is persisted via ProseMirror node attributes

  ### Image drag-to-resize
  - Dropped images now have a drag handle for resizing

  ### Plugin system enhancements
  - Bridged action registry to plugin RPC system
  - Added plugin icon registry with ~50 curated Lucide icons
  - Fixed `vault.read` RPC to return markdown string instead of NoteDoc object

  ### Source mode (CodeMirror) improvements
  - LSP hover and completion support in source mode
  - Fixed diagnostic tooltip, hover flicker, and completion paths
  - Prevented duplicate LSP hover tooltip on wiki links
  - Fixed lifecycle crash when switching to source mode

  ### Editor polish
  - Task checkbox no longer reverts to bullet after multiple toggles
  - Codeblock list layout and table toolbar dismiss fixes
  - Nodeview collapse requires single click, fixed sticky focus
  - Added remark parse plugin for wikilink embeds (`![[...]]`)

  ### Performance & startup
  - Decoupled startup from blocking dialog and deferred heavy rescan
  - Git history no longer hangs for single document

  ### UI fixes
  - Use file-text icon for smart-templates sidebar panel

## 1.31.0

### Minor Changes

- fa29f6f: ### @ palette file filtering
  - `/` prefix filters to markdown files only, `//` prefix filters across all file types
  - Documented the @ palette inline mention system

  ### LSP/native suggest coordination
  - Extensible coordination layer between LSP completions and native suggestion providers (e.g. @ palette)
  - Prevents LSP popups from interfering with native suggest UIs

  ### MCP tool descriptions
  - Improved MCP tool descriptions and CLI help text for better LLM usability

  ### Fixes
  - `vault.list` now queries the backend instead of returning stale in-memory data
  - Fixed carbide-cli sidecar builds for local Tauri development
  - Reload expanded folders correctly during file tree refresh

## 1.30.1

### Patch Changes

- d711b41: fixed file explorer refreshing when deleting/moving folders

## 1.30.0

### Minor Changes

- 8e99e88: ### Smart templates
  - Template library plugin with built-in and custom templates
  - Template picker UI with search and categorized browsing
  - Template settings panel for managing custom templates

  ### Three-tier token system
  - Added `tokens.css` (Tier 1) and `themes.css` (Tier 2) foundation layers
  - Affordance mirror (`apply_affordances`) with tests for Tier 3 token propagation
  - Rewired editor components, tab bar, and status bar to Tier 3 tokens
  - Affordance contract CSS connecting Tier 2 semantic tokens to Tier 3 component tokens
  - Added `css_theme` and `density` settings fields with `BP_TERMINAL` blueprint
  - Tests for css_theme, density, and FOUC cache fields

  ### Theme UI
  - Replaced theme gallery grid with grouped Select dropdown
  - Removed duplicate Editor tab from theme advanced panel

## 1.29.0

### Minor Changes

- 667ad75: ### Help guides
  - Added Guides section to Help dialog with categorized, searchable help articles
  - Guide data module with keyboard shortcuts, markdown syntax, and navigation guides

  ### Note embeds
  - New `note_embed` schema node for `![[note]]` syntax
  - Block suggest mode with editor_service block handling
  - Note embed detection, rendering, serialization, and CSS
  - Wired note_embed through lazy adapter, prod ports, and full scan
  - Fixed note embed converting while cursor is inside brackets

  ### Fixes
  - Auto-update CLI symlink on server start
  - Removed duplicate `cat` visible_alias in CLI
  - Allow empty daily notes folder (vault root)
  - Resolve linked source PDFs from omnibar/graph views

## 1.28.0

### Minor Changes

- 292c582: ### Omnibar filter mode + query persistence
  - Tab-triggered filter overlay with mnemonic chips for file type filtering (Markdown, PDF, Code, Drawing, Images) and source scope (Vault/All)
  - Query, scope, and filters persist across open/close within a session
  - Shift+Tab progressively clears filters then query; text auto-selected on reopen
  - Fixed auto-select re-firing on every render, causing typed text to be overwritten

  ### Graph view fixes
  - Route non-markdown files (PDFs, etc.) to document viewer instead of forcing markdown open
  - Resolve @linked/... virtual paths to real file paths before opening documents

  ### Performance
  - Git push/fetch/pull/push_with_upstream made async with spawn_blocking to avoid blocking the UI thread
  - Removed redundant git_status calls in commit and push flows
  - Cached find_remote("origin") in git_status
  - Added timeouts to git_add_remote/git_set_remote_url

## 1.27.0

### Minor Changes

- db4b032: ### Drift layout variant
  - Added new "Drift" layout with overlay-first design, floating activity dock, and transparent editor canvas
  - Iterative fixes: sidebar/dock alignment, grid coverage, keyframe scoping, backdrop removal, editor pane isolation

  ### Daily notes
  - Full daily notes feature: settings, sidebar view, app integration, tests
  - Configurable subfolder structure (e.g. `YYYY/MM`) and name format via settings UI
  - "Open Today's Note" command palette entry with hotkey
  - Fixed daily note that exists on disk but not in store

  ### Task query DSL
  - New task query DSL parser with slash command integration
  - TaskQueryState in CodeBlockView, callbacks wired through editor extension system
  - CSS styles for task query results

  ### Source control panel
  - Git staging state and `commit_staged` action
  - Working-tree diff viewer
  - Collapsible section extraction, layout cleanup
  - Fixed duplicate source control panel, restored activity bar in lattice layout

  ### Lattice layout
  - New lattice layout variant with title bar and right panel
  - Vertical icon strip replacing context rail tab bar, overlay panel
  - AI assistant moved from context rail to bottom panel with two-column layout

  ### Theme system overhaul
  - Converted all builtin themes to `ThemeBlueprint` + `expand_blueprint`
  - Added V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`)
  - `generate_ui_tokens()` with surface params and precedence tests
  - Hardcoded oklch values replaced with token references
  - New Obsidian Dark theme with glass/grain/glow variant

  ### Query panel
  - "View as graph" button added to query panel
  - Documented `?` prefix for query syntax

  ### Folder suggest
  - Drill into subfolders when selecting a parent folder in suggest

  ### Search improvements
  - Sort/filter controls and date/source/extension metadata on search graph result list
  - Prefix matching in FTS search queries
  - Word-order-insensitive fuzzy scoring

  ### Other fixes and improvements
  - Table layout toggle (fit content / full width), toolbar dismissal on blur
  - Inline AI panel dismissible via Escape in all modes
  - Generic suggest plugin factory extraction
  - Bundled plugins shipped with Carbide
  - Vault startup parallelized for non-blocking init
  - Remark/image/paste bug fixes
  - Sidebar icons updated for tags and bases

## 1.26.0

### Minor Changes

- dea327d: ### Features
  - Daily notes: full feature with folder/name-format settings, sidebar view, app integration, and daily-note-exists-on-disk handling
  - Theme system: V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`), `generate_ui_tokens()` with surface params, and `ThemeBlueprint` + `expand_blueprint` for all builtin themes
  - Daily notes folder and name format exposed in settings UI
  - Task query blocks: Obsidian Tasks-style DSL parser, `/tasks` slash command, live-rendered query results in `language="tasks"` code fences with grouped task list, toggleable checkboxes, and debounced re-render

  ### Fixes
  - Vault startup made non-blocking by parallelizing independent ops
  - `remark_details` inner parse, dead branch removal, and `pm_to_mdast` image merge fix
  - Diagnostics `get_markdown` moved from module scope into call site
  - Redundant `image_toolbar_plugin.ts` deleted
  - Type annotation for `nodesBetween` callback return
  - Four bug fixes: folder save, AI panel, paste handler, image resize
  - Theme token consistency and test coverage improvements
  - Daily note that exists on disk but not in store now handled correctly

  ### Refactors
  - Generic suggest plugin factory extracted
  - Hardcoded oklch values in theme CSS replaced with token refs
  - Sidebar icons updated for tags and bases

## 1.25.0

### Minor Changes

- 0c8bb36: ### Theme architecture and layout variants
  - Added Obsidian Dark theme with glass/grain/glow layout variant
  - Added lattice layout variant with title bar and right panel

  ### Source control panel
  - Added source control sidebar panel with git staging state and commit action
  - Added working-tree diff viewer with inline unified diff display
  - Extracted CollapsibleSection component for reuse across sidebar panels

  ### AI assistant layout
  - Moved AI assistant from context rail to bottom panel with two-column layout
  - Replaced context rail tab bar with vertical icon strip and overlay panel

  ### Search graph enhancements
  - Added date/source/extension metadata to search graph nodes
  - Added sort/filter controls to search graph result list

  ### Editor improvements
  - Added table layout toggle (fit content / full width)
  - Shipped bundled plugins with Carbide

  ### Welcome dialog polish
  - Added key shortcuts inline in welcome dialog step 2
  - Added built-in feature pills (Mermaid Diagrams, etc.) to welcome screen
  - Removed hero tagline, consolidated into feature pills
  - Renamed Open Notes to Omnifind in welcome shortcut list

  ### Fixes
  - Fixed inline AI panel dismissibility via Escape in all modes
  - Fixed FTS search to use prefix matching in queries
  - Fixed table toolbar dismissal when editor loses focus
  - Fixed duplicate source control panel and restored activity bar in lattice layout

## 1.24.0

### Minor Changes

- d482ae7: ### Welcome onboarding dialog
  - Added first-run welcome dialog with 3-step onboarding (vault, omnibar, AI/graph)
  - Step-completion indicators: checkmarks for vault anchoring (step 1) and AI configuration (step 3) derived from live state
  - Steps 2–3 are gated behind vault existence (dimmed with "Open a vault first" label)
  - Fixed invisible close button caused by transparent shell styling
  - Added scroll overflow for short viewports
  - Uses `Dialog.Close` primitive for accessible close behavior

  ### Configurable embedding model
  - New "Embedding Model" setting under Semantic category with 5 BERT-architecture options (Arctic XS/S/M, BGE Small, MiniLM L6)
  - Rust backend accepts model ID parameter, reinitializes when model changes, and clears/re-indexes embeddings on model version mismatch

  ### Other
  - Omnibar path resolution improvements

## 1.23.0

### Minor Changes

- f79dc15: ### Features
  - **Inline AI**: Phase 3 inline AI menu with streaming execution pipeline — context-aware commands (explain, simplify, fix, expand, custom prompt), configurable via settings, filtered to CLI providers only, wired to hotkey system (Cmd+Shift+I), clean CLI output stripping in streaming
  - **@ palette**: Unified @ mention palette replacing the date suggest plugin
  - **Settings panel**: Reorganized settings — split Layout into Editor/Sidebar, renamed Misc to Storage
  - **Command palette**: 'Plugin' badge on plugin-derived commands; reapplied plugin keyword boost and diagnostics display toggle
  - **Slides plugin**: Wiki-image support with path resolution fallback; auto-shrink overflow text

  ### Fixes
  - Fixed heading backspace and inline math double-click editing
  - Fixed heading modification on blank lines
  - Fixed cursor position issues
  - Fixed linked source bug; graph panel tidying and linked sources hidden from file tree based on settings toggle

## 1.22.0

### Minor Changes

- 5f5dbd8: ### Features
  - **Callout blocks**: Full callout block support — remark plugin, ProseMirror schema/node view, slash commands, foldable toggle, keymap navigation, Backspace deletion, and drag handle
  - **Block operations**: Turn-into, duplicate, delete operations; content-visibility optimization; multi-block selection
  - **Code editor improvements**: markdown-it port with insert handle, focus mode, language memory, fallback parse; Tab/Shift-Tab indent in both editors; focus and scroll to cursor on source→visual switch
  - **LSP enhancements**: Toggle UI controls, inline diagnostics in visual editor, LSP-sourced suggestion labels, code document sync and language server operations, position mapping and tooltip improvements, Cmd+. hover at cursor
  - **Graph view**: "View as graph" action in omnibar search results; Phase 4 performance — degradation profiles, edge sampling, degree sizing
  - **References pane**: Flat/by-source/tree view modes
  - **File explorer**: Setting to hide @linked sources from tree
  - **Plugin system**: Sidebar panel rendering with live iframe UI, plugin lifecycle activation, Smart Templates plugin, SDK extensibility — all 42 RPC methods exposed
  - **Terminal & editing**: Native xterm defaults; Paste HTML as Markdown command; within-document anchor link scrolling
  - **Theming**: Removed unused themes; lightened default dark mode
  - **Offline**: Bundled fonts for offline use

  ### Fixes
  - Fixed multiple tab-switch bugs: source editor dirty state, cursor restoration, stale content, visual editor persisting after last tab closed, source-mode edits lost
  - Fixed frontmatter loss on selectAll and undoable doc replacements
  - Fixed invisible blocks after Enter in visual editor
  - Fixed Cmd+. code actions conflict and diagnostic tooltip labels
  - Fixed missing linked-sources toggle and broken catalog categories
  - Fixed LSP & plugin coexistence: block ref handoff, hover panel routing

## 1.21.0

### Minor Changes

- ba3643f: ### Features
  - **Hybrid omnibar search improvements**: Promoted the hybrid search pipeline to the primary omnibar path, added structured queries, scoped search, semantic graph edges, and graph interaction improvements
  - **Heading autocomplete in wiki links**: Added heading completion support for `[[note#heading]]` and `[[#heading]]` flows
  - **Editor and plugin workflow improvements**: Added plugin commands to the command palette, HTML source editing support, and document metadata access via `editor.get_info`
  - **LSP provider architecture upgrades**: Introduced shared `LspProvider` abstractions, generalized provider config handling, and added Markdown Oxide support in shared client and frontend settings

  ### Fixes
  - Fixed plugin sub-resource requests to fall back to the active vault
  - Reduced embedding latency and corrected note/block embedding behavior
  - Fixed link-repair bugs, hybrid search edge cases, dirty-state handling, toolbar undo, and related search indexing issues
  - Hardened LSP behavior by addressing race conditions, stale responses, timeouts, diagnostics metadata, settings mismatches, and bundled default server configs

## 1.20.0

### Minor Changes

- c72351b: ### Features
  - **HTML-to-markdown converter plugin**: New plugin that converts HTML files to markdown, with single-file conversion support and error routing
  - **PDF export rewrite**: Migrated PDF export from jsPDF to PDFKit with bundled Inter fonts, standalone browser build, and hardened error handling
  - **Inline note embedding on save**: Notes are now embedded inline on save using blake3 change detection for efficient diffing
  - **CLI/MCP tooling improvements**: Enhanced CLI and MCP tool integrations

  ### Fixes
  - Format and lint-fix actions are now undoable via Ctrl+Z
  - Serialized xterm.js writes to eliminate TUI app flickering
  - PDF export gated to only active note tabs; frontmatter stripped from export output
  - Resolved CLI sidecar path in bundled macOS app directory
  - Resolved cargo warnings and test failures

## 1.19.0

### Minor Changes

- 161ad73: ### Search Graph
  - Full search graph tab: domain types, subgraph extraction, store, service methods, actions, DI wiring, UI components, command palette entry, and keybinding
  - Visual enhancements: color-coded nodes, score-based sizing, folder clustering
  - Reactivity and macOS hotkey fixes

  ### Graph
  - Smart link edges rendered with dashed lines and hover provenance
  - Smart link edges added to graph data model

  ### Plugin System
  - `network.fetch` and `ai.execute` RPC namespaces for plugins
  - RPC timeouts, rate limiting, and consecutive error budget
  - Settings schema: textarea type, min/max, placeholder support
  - Slash command contribution point
  - Metadata-changed event bridge to plugin SDK
  - AI and network namespace docs, permissions, and `allowed_origins`

  ### MCP Tools
  - Tier 2: backlinks, outlinks, properties, references
  - Tier 3: git_status, git_log, rename_note, plugin MCP bridge

  ### CLI
  - Git, reference, bases, tasks, and dev CLI commands with backend routes
  - Built-in termimad markdown renderer (replaces external glow dependency)

  ### Settings & UI
  - Storage & Cleanup settings section
  - Tool status cards in Settings > Tools
  - Editor width standardized as CSS custom properties

  ### File System
  - Symlinked files and folders supported in file explorer with full read+write
  - Symlink safety guardrails on all WalkDir traversals

  ### Fixes
  - Embedding pipeline CPU thrash resolved; Metal GPU support added
  - `embed_sync` no longer cancels in-flight embeds
  - Linked sources open in-app with file name as blurb
  - Import linked source entries to reference library

## 1.18.0

### Minor Changes

- c6b30b3: ### New Features
  - **HTML viewer for linked sources:** View linked source files and vault files in an HTML viewer, wired up with proper rendering
  - **Embedding toggle controls:** Disable/enable embedding per-source via settings UI toggle switches and command palette actions
  - **STT feature-gated:** Speech-to-text subsystem gated behind `stt` Cargo feature flag, removed from default main build to reduce binary size and compile times

  ### Fixes
  - **Editor:** Catch ProseMirror position errors in `dispatchTransaction` to prevent silent crashes
  - **Vault sync:** Preserve linked source content during vault sync instead of overwriting
  - **Performance:** Defer linked source embedding to batch path; reduce CPU spike when adding linked source folders; stop embedding from blocking the writer thread
  - **UI:** Fix FolderSuggestInput trailing slash and nested path bugs
  - **STT stability:** Prevent CoreAudio SIGSEGV, fix model loading blocking the async runtime, prevent transcription spinner from hanging, correct VAD model resource path
  - **Deps:** Pin `tauri-plugin-dialog` to 2.6.0
  - **CI:** Switch `generate-bindings` to macOS for `ort_sys` linker fix; make candle accelerate feature macOS-only for Linux builds

## 1.17.0

### Minor Changes

- 906703f: ### New Features
  - **Speech-to-text (STT):** Full dictation support with configurable Whisper model, custom model path, keyboard shortcut, and settings UI with expandable model catalog
  - **Block drag-and-drop:** Drag handles on editor blocks with section-aware positioning and baseline alignment per block type
  - **Block embeddings & semantic search:** Section embedding pipeline, HNSW vector index for O(log n) approximate nearest-neighbor search, `block_knn_search`, and `find_similar_blocks` command via smart links

  ### Fixes
  - **Embeddings:** Off-by-two tokenizer truncation crash, N+1 query in block similarity, stale data and tag regression, proportional throttle in dev, include last line of section in embedding text
  - **Logging:** Crash-proof logging and console cleanup, silence settings/HNSW debug spam, replace `console.error` with `create_logger` in STT adapter
  - **Editor:** Drag grip opacity, CLI sidecar resolution from correct bundle location

## 1.16.0

### Minor Changes

- c5a8ab7: ### Generic source editing, CLI enhancements, and reliability fixes
  - **Generic source editing**: Non-markdown files (YAML, TOML, JSON, etc.) can now be edited through the LSP workspace edit pipeline, using a text-by-default architecture.
  - **CLI `reindex` command**: New `carbide reindex` subcommand triggers vault re-indexing via both CLI and MCP.
  - **CLI `edit` command**: Edit vault files directly from the command line.
  - **CLI `cat` command**: Read/display file contents with glow-rendered markdown output.
  - **CLI `search --paths-only`**: Search results can now return file paths only for scripting use.
  - **CLI `tags --filter`**: Filter tags listing by pattern.
  - **CLI exit codes**: Proper exit codes for all CLI commands, enabling reliable scripting.
  - **Dynamic shell completions**: Tab completions generated from live vault state.
  - **Glow rendering**: `read` and `open` commands now render markdown through glow for rich terminal output.
  - **Undoable workspace edits**: IWE workspace edits are now undoable in both the code and visual editors.
  - **Tag normalization**: Frontmatter tags with `#` prefix are now normalized consistently.
  - **URI handling**: Fixed double-prefixed `file://` URIs from the IWE LSP server.
  - **MCP protocol**: Added camelCase serde rename to MCP protocol structs for spec compliance.
  - **CodeAction fix**: Skip `codeAction/resolve` when the action already carries an edit field.
  - **Sidecar downloads**: Added curl timeouts/retries; removed broken `--version` call from download scripts.
  - **Security**: Triaged dependabot alerts — upgraded deps and removed unused `serde_yml`.

## 1.14.0

### Minor Changes

- 6c34c7c: ### LSP typed session model and reliability improvements
  - **Typed LSP status**: `MarkdownLspStatus` enum in Rust and TypeScript replaces fragile string-based status tracking. Statuses: Starting, Running, Restarting, Stopped, Failed.
  - **Provider resolution**: Extracted `provider.rs` module for markdown LSP provider resolution (IWES/Marksman) with capability metadata.
  - **Lint lifecycle fix (BUG-010)**: `lint_close_file` returns Ok when no session exists instead of erroring.
  - **Transport diagnostics (BUG-009)**: Stderr ring buffer, init timeout (30s default, 10s for cloud-backed vaults), typed init errors (`InitTimeout`, `InitEof`, `InitFailed`), retryable/non-retryable classification.
  - **IWES packaging (BUG-005)**: Populated `platform_binaries` for auto-download from upstream `iwe-org/iwe` releases. Removed vendored sidecar binary and submodule.
  - **Vault-aware startup**: Detect iCloud/Dropbox/OneDrive vault paths, apply shorter init timeouts for cloud-backed vaults.
  - **Document lifecycle**: Added `markdown_lsp_did_close` end-to-end. Editor features gated by provider health and capabilities.
  - **MCP stdio transport**: Claude Code setup now prefers stdio via `carbide mcp` CLI proxy (matching Claude Desktop), avoiding bearer tokens in `.mcp.json`.
  - **CLI install paths**: Default to `~/.local/bin/carbide` on macOS/Linux, `%LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe` on Windows.
  - **Comprehensive test coverage**: Wave 4 verification tests for provider types, status serde, toolchain registry, store state, service lifecycle, and release validation script.

## 1.11.1

### Patch Changes

- 273265b: omnifind and file search memory fixes

## 1.11.0

### Minor Changes

- c8ac662: Changeset: High-Priority Feature Implementation — 2026-04-01

## 1.10.0

### Minor Changes

- f7e41dc: Linked sources & search integration: embed linked sources in vault and add search inclusion toggle. Auto-load reference library on vault open. Fix infinite reactive loop in virtual file tree ROW_HEIGHT effect.

## 1.9.0

### Minor Changes

- 6aea234: Restore reference backend (linked sources, Zotero BBT, annotations); fix window close permissions, trailing whitespace in paragraphs, find-replace after buffer switch, virtualizer row height re-measurement, and iCloud settings write.

## 1.8.1

### Patch Changes

- c58da8c: Fix process cleanup on app close via RunEvent::Exit handler; fix vault-open CPU hotspot with async URI handlers, deferred plugin iframes, and lazy images; add asset response cache with HTTP cache headers

## 1.8.0

### Minor Changes

- c1fa394: Add Editor tuning panel (font, size, line height, zoom) under Theme > Advanced; fix OmniFind FTS thread contention causing UI blocking; fix PDF export CSP violations and wire up editor zoom hotkeys

## 1.7.1

### Patch Changes

- 49641a9: Prevent .iwe directory creation in browse mode, fix ai_prompt_builder test

## 1.7.0

### Minor Changes

- 0306368: Task management improvements (M0-M6), indexing/embedding/watcher bug fixes, tree refresh on settings change, prompt builder

## 1.5.0

### Minor Changes

- 4495f15: ### File tree blurbs
  - AI-generated note descriptions displayed inline in the file tree
  - Configurable blurb position (below heading, below caption) and toggle in Layout settings
  - Markdown formatting stripped from blurbs for clean display

  ### Theme & CSS token editor
  - New CSS token reference tab with inline editing and revert
  - Theme-aware source editor styling

  ### Editor improvements
  - Split view mode with dedicated toggle
  - Heading markers toggle for visual editor
  - Cursor sync fixes in split editor
  - Escape key clears lightbulb decoration without dismissing dropdown
  - Editor status persistence across sessions

  ### Settings
  - Spell check toggle for rich and source editors
  - Terminal customization options
  - Reference manager UI wiring

  ### IWE dynamic transforms
  - Dynamic AI provider substitution for IWE transforms
  - Config-driven transform actions wired from IWE settings
  - Config reset properly reapplies provider and guards redundant restarts
  - Open config reveals in file manager

  ### LSP
  - Proper client capabilities and config logging
  - Undoable code actions

## 1.4.0

### Editor Pipeline Rewrite

- Replaced markdown-it with remark/mdast pipeline for parsing and serialization
- Extracted ProseMirror plugins into 16 composable extensions (Moraya Pattern)
- Added Yjs integration with PM-only Y.Doc binding via ySyncPlugin
- Removed prosemirror-markdown dependency

### LSP Unification — IWE → Marksman

- Replaced IWE language server with Marksman LSP
- Deleted IWE backend, frontend modules, and all related tests
- Renamed LSP plugins (iwe*\* → lsp*\*) and cleaned DI wiring
- Unified document sync reactor across all LSP clients

### Backend Simplification

- Deleted Rust-side parsers, tags service, references service, and graph service
- Moved link extraction, metadata extraction, and graph building to frontend
- Removed ~5,000 lines of dead backend code (link_parser, frontmatter, markdown_doc, linked_source)

### Layout System

- Added 10 new layout variants: Spotlight, Cockpit, Theater, Triptych, Grounded Heavy, HUD, Zen Deck, Dashboard, Command Deck, Monolith
- Replaced split-view system with multi-tab side pane
- Added ActivityBar component with layout-aware positioning

### Stability & Performance

- Fixed memory leaks, data races, and timer deduplication issues (11 findings from state/memory audit)
- Fixed git sync spinner hang and cache thrashing
- Repaired broken CSS in glass, zen-deck, and command-deck themes
- Fixed linked source PDF loading (vault scheme, double-slash normalization)

### Status Bar

- Merged count displays, collapsed git section, removed sync button

## 1.3.0

### Minor Changes

- Reskinning prototypes: bases panel UI, LSP results redesign, IWE results streamlined
- Linked source watcher refactored to pull-based; fixed PDF loading in content pane
- Toolchain manager with binary resolver, SHA-256 verification, lifecycle management
- Composable query language with parser, evaluator, saved `.query` files, lens views
- Unified diagnostics store, AST error surfacing, unresolved link diagnostics
- Tag completion plugin, ParsedNote frontend cache, unified LSP document sync

## 1.1.0

### Minor Changes

- Full LSP client infrastructure (hover, go-to-definition, completion, formatting, rename, inlay hints, diagnostics)
- Resizable code blocks, inline SVG preview, collapsible headings and details sections
- Plugin system with lifecycle, settings UI, iframe sandboxing
- Metadata sidebar, hierarchical tag tree, heading anchors, folder path autocomplete
- Split view with real-time content sync
- System color scheme preference, file tree style variants, theme persistence
- Vault startup optimization, state management efficiency improvements
- AST-indexed schema with property registry

## 1.0.0

### Major Changes

- Plugin system and markdown lint infrastructure
- Semantic search integration with vault graph visualization
- PDF viewer, canvas, fuzzy matching, and editor polish
- Tags sidebar panel, date links, note naming templates
- Type-safe IPC, ProseMirror migration, find & replace, and theme redesign

## 0.4.0

### Minor Changes

- Plugin system, semantic search, PDF viewer, canvas, tags, ProseMirror migration

## 0.3.0

### Major Changes

- Full-vault graph view, sqlite-vec embeddings, zen mode, native menubar
