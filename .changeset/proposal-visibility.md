---
"carbide": patch
---

An agent turn now tells you when its edits could not be offered for review.

Carbide reviews an agent's work by comparing the vault against a checkpoint taken before the turn and offering each change as a proposal you accept or reject. Several kinds of edit fall outside that mechanism, and until now they fell out of it silently: files the agent created (so a rename, which is a create plus a delete, was invisible in both halves), anything that is not a Markdown note, and every edit in a vault with no git repository or no commits yet. In each case the work was written to disk and simply never appeared for review, with no indication that anything had been skipped.

The turn now reports what happened in the transcript: which files were edited outside review, which were kept on disk rather than proposed, and — where there was no checkpoint to compare against — why, along with an offer to initialise git so future turns are reviewable. Carbide never initialises git on its own; the notice names the command and leaves it to you.

A turn where everything became a proposal adds nothing to the transcript, so this is silent in the ordinary case.

Note that a note you edited yourself during a turn is reported distinctly from a failure: it tells you your version was kept and nothing was proposed for that file.
