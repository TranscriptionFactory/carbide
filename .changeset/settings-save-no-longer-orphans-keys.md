---
"carbide": patch
---

Stop a settings save from silently abandoning most of your global settings

Saving settings wrote each global setting one after another and stopped at the
first one that failed. The AI context token budget, which is unset while it is
on Automatic, could not be sent to the backend at all, so every save aborted
partway through and thirty-six settings after it — including MCP enablement,
close-to-tray, the embedding model, and the file tree, graph, outline and
document reader preferences — quietly never persisted. An unset setting is now
saved as an explicit empty value, so the save completes; Automatic still reads
back as Automatic after a reload. A save also no longer gives up on the
remaining settings when one fails, and reports which settings did not persist
instead of failing silently.
