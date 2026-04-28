 Task: Improve all MCP tool descriptions and CLI help text in Carbide for LLM usability.

  Context: LLMs parse tool descriptions to decide when and how to call tools. Vague
  descriptions lead to wrong tool usage, missing parameters, or tools not being called at
  all.

  Files to update:
  - src-tauri/src/features/mcp/tools/*.rs — all MCP tool definitions
  - src-tauri/crates/carbide-cli/src/main.rs — CLI command help text

  What to improve for each tool/command:

  1. Main description — State what it returns, not just what it does. Include when to use
  it vs similar tools. E.g. "List all notes in a vault with pagination. Returns paths,
  titles, and metadata. Use folder to filter by directory. Use search_notes instead for
  full-text search."
  2. Parameter descriptions — Be explicit about:
    - Whether it's optional (if not in required)
    - Format/examples: "Vault-relative folder path (e.g. 'projects/active'). Omit to list
  all notes."
    - Bounds: "Max 500" or "default: 200"
    - What values are valid: list operators explicitly for query tools
  3. Cross-references — Tell LLMs which tool to prefer for related tasks. E.g. list_notes
  vs search_notes vs query_notes_by_property
  4. Return format — Briefly describe what the response shape looks like so LLMs can parse
   results

  Specific gaps found:
  - create_note: doesn't say it fails if note exists, or that path must end in .md
  - search_notes: doesn't say which fields are searched (title, content, tags?)
  - query_notes_by_property: lists operators as "supports equality, comparison, and
  contains" — enumerate them explicitly (eq, neq, lt, gt, lte, gte, contains)
  - list_notes vs CLI files: naming inconsistency — document the mapping
  - Several tools lack return format hints

  Rules:
  - Keep descriptions concise — no essays, just the info an LLM needs to call correctly
  - Don't change any behavior, only descriptions/help text
  - Run cargo check in src-tauri/ after changes