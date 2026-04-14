1. Undo queue is buggy; look at various actions + normal use
2. Vault re-indexing (manual )failing with:
   ```bash
   no such column: path in DELETE FROM note\_headings WHERE path NOT LIKE
     '@linked/%' at offset 32

   ```
3. LInked sources re-adding when link changes (even when its resolved - e.g vault and linked sources are both in the same cloud folder, but triggering on absolute path change)
4. bases expressions/query options (e.g. doesn’t contain); also

   &#x20;bases view crashes when ’tag’ or ’task’ column(can’t remember which one) is clicked

   &#x20;`Wrong number of parameters passed to query. Got 1, needed 0 -`
5. Save pill doesn’t register smart links actions
6. turn off Auto-correct in search
7. Seeing whitespace token `&#x20;` being copied (leading space in this case - there is an entire empty line and then whitespace token and then text when these were a single block of text) - not critical, just want to review 
