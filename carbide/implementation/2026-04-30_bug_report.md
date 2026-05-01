# Current issues

1. **cli broken hanging when warning on startup - might be  because of linked sources not found warning (path not found because absolute, but not relative, linked sources path has changed - see commit&#x20;**&#x39;37d107&#x64;**) issue blocking app opening? (e.g. if error is deferred,  relocation error prompt will happen at vault open each time, so when carbide cli starts, it will get stuck, unless you start the app from the cli and click through the warnings, then the cli works fine - indicates there may be two paths related to linked source resolution - one through CLI and one through app?)**
   1. also linked sources still not resolving when switching machines due to absolute path; not falling back to relative path (is this a cache issue? do i need to re-add the linked sources or delete application data/rebuild database?)
2. **linked images (inserted via wikilinks) broken after reparsing/save - i’m not sure; seems they are converted to the non-wikilink synxtax, then special characters are escaped (do wikilinks resolve special characters) and link breaks; replacing with wikilink restores again.  inserting the ‘!’ syntax for non-wikilinks breaks document parsing; source editor loses all structure; here is the source from a note with a broken image link that was converted to a standard markdown link (but is broken)  this is the link and the markdown document**
   ```markdown
   ![](6_BLOB/2026-04-17_1703.png)

   ```
   ```markdown
   ---
   title: "2026-04-17_1416"
   date_created: 2026-04-17
   ---

   ## FMT data

   1. SLIDE looks OK - most runs have a CV performance = 0.6 & same as permuted.
   2. Rerunning SLIDEcv with LOOCV

   ## Metaboloformer

   1. Masked set reconstruction finished - need to go back to **data alignment** and clean and rerun through pipeline ![](6_BLOB/2026-04-17_1703.png)

   ## Trauma saturday meeting

   1. Gasdermin-D results; need to first check if hyperparameter did anything useful

   ```
3. **Resizeable codeblocks have weird hiding behavior: if size is less than max(?) it will have invisible section after codeblock that disappears when block is extended: to reproduce, place codeblock in numbered list (not numbered, just below a nubmered element at the same indentation level) try to add new numbered entry after list → hidden unless extended and doesn’t break existing numbered elements below**

   **(pairs well with making more nodeviews collapsible - currently only a few of the nodeView embeds are collapsible)**
4. table toolbar z-index/persistence - if focused, blocks from other actions e.g. sidebar and toolbar focus behavior is strange and slightly too persistent
5. clicking task boxes after initial check/uncheck (works fine both directions); but unchecking multiple times will revert them to bullet points; might have an underlying issue with the remark/mdast parsing
6. trying to load git history for single document seems to be hanging;  no clear way to revert git changes from sidebar
7. dropped in images cant be resized (non-wikilink style images are the default for dropped in behavior
8. i have a vault that is shared between two computers (synced via icloud, but provider is irrelevant) - i notice when i first open the shared vault on one computer, i get the spinning mac wheel for about 10s (only the first time i open it on the computer after using it on a different computer) - what is the cause of this?