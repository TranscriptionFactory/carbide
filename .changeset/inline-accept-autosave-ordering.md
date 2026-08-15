---
"carbide": patch
---

Stop autosave from silently invalidating an inline AI edit you accept

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
