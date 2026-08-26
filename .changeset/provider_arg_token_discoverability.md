---
"carbide": patch
---

Document the CLI-provider arg placeholders where they are actually typed.

- **Settings → AI → Providers** now names all three substituted tokens (`{model}`, `{prompt}`, `{output_file}`) in its section description, and states the non-obvious part: omitting `{prompt}` is not "no prompt", it switches Carbide to piping the prompt on stdin. The same text mirrors into the settings search index, so searching for `prompt`, `output_file` or `stdin` surfaces the Providers entry.
- The **add-provider** Args field previously hinted `chat {model}` only — omitting the two tokens at exactly the moment a first-time user needs them. Both the add and edit forms now show the same hint, including `{output_file}`.
- `docs/ai_and_chat.md` gains a **Placeholders in CLI args** section: what each token expands to and where it is accepted, the two tokens whose mere presence changes behaviour (`{prompt}` selecting stdin, `{output_file}` opting the provider out of IWE transforms), that unrecognised tokens pass through to argv verbatim, and that the double-braced `{{context}}` in a generated `.iwe/config.toml` is IWE's token — written verbatim and never resolved by Carbide.

Copy and documentation only; no substitution behaviour changed.
