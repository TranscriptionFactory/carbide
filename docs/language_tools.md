# Language Tools

Carbide runs Language Server Protocol (LSP) servers to bring editor
intelligence — completion, go-to-definition, hover, rename, diagnostics — to
both your Markdown notes and code files. All of these settings live under
**Settings → Toolchain**.

## Markdown LSP

Enable **Markdown LSP** to power wiki-link completion, go-to-definition on
links, hover previews, symbol navigation, and link diagnostics. Pick one server
under **Markdown LSP Provider**:

| Provider           | Focus                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| **IWE**            | Graph transformations (extract, inline, restructure) plus the standard set. |
| **Markdown Oxide** | PKM-oriented completions and references.                                    |
| **Marksman**       | Standard Markdown LSP features.                                             |

Capabilities vary by server — hover, completion, references, definition, code
actions, rename, formatting, inlay hints, and workspace/document symbols are
negotiated at startup, and IWE additionally exposes its transform actions.

Leave **Markdown LSP Binary Path** empty to auto-detect the server from `PATH`
or the bundled toolchain, or point it at a specific binary.

### Native vs LSP features

Carbide has built-in link handling that can overlap with an LSP. Three toggles
let you hand each concern to the server instead, avoiding double UI:

- **Native Link Hover** — disable to let the LSP provide hover.
- **Native Wiki Suggest** — disable to let the LSP provide `[[` completion.
- **Native Link Navigation** — disable to let LSP go-to-definition handle clicks.

**Show Diagnostics** controls whether linter/LSP squiggles are drawn in the
editor.

## Markdown linting (rumdl)

Independent of the LSP, **Enable Markdown Linting** runs [rumdl](https://github.com/rvben/rumdl)
in the background to flag style and formatting issues. Related settings:

- **Format on Save** and **Formatter** — auto-format the current file on save
  (Prettier recommended).
- **Rule Overrides (TOML)** — custom rumdl rules merged with the defaults, e.g.
  `MD013 = false`.
- **rumdl Binary Path** — leave empty to use the bundled rumdl.

## Code LSP

Open a source file and Carbide starts the matching language server for its
extension — Rust, TypeScript/JavaScript, Python, Go, C/C++, Java, C#, Ruby,
shell, JSON/TOML/YAML, HTML/CSS/SCSS, Svelte, Vue, Lua, Kotlin, Swift, and Zig.
Servers are discovered from your environment; when none is installed for a
language, that language's status shows **unavailable** and the file opens without
intelligence.

## Where binaries and config live

LSP binaries resolve from your `PATH` (or a bundled toolchain, or an explicit
binary-path setting). Server config files (such as IWE's) are stored per vault.
See [Data Storage](./data_storage_locations.md) for exact locations.
