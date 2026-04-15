# Smart Templates Plugin for Carbide

**Plugin ID:** `smart-templates`  
**Version:** `1.0.0`  
**Author:** Carbide Community  
**Date:** 2026-04-14

---

## Vision

Create an intelligent, context-aware template system that goes far beyond static templates. This plugin provides dynamic templates that can intelligently adapt to the current context, pull in related content, and render live previews. It transforms Carbide from a note-taking app into a dynamic content generation platform.

### What Makes This Unique

Unlike Obsidian's static templates, Smart Templates:
1. **Context-Aware** — Automatically adapts based on current note, selection, metadata, and vault state
2. **Live Preview** — Real-time rendering with interactive preview panel
3. **Metadata-Driven** — Leverages Carbide's metadata engine for intelligent content insertion
4. **Template Composition** — Build complex templates from simple, reusable components
5. **Intelligent Variables** — Variables that evaluate to contextual content, not just text

### User Impact

- **Researchers:** Generate literature notes with automatic citation integration
- **Students:** Create structured study notes with dynamic outlines
- **Project Managers:** Generate consistent project documents with status tracking
- **Content Creators:** Create content frameworks with automatic cross-references
- **Knowledge Workers:** Build reusable content patterns for any workflow

### Template Types by Use Case

**1. Meeting & Communication Templates**
- **Meeting Notes** — auto-populates date, time, agenda from frontmatter
- **Standup Reports** — pulls action items, blockers, progress from tagged notes
- **Email Templates** — contextual content based on current note/selection
- **Status Reports** — aggregates project data across multiple notes
- **Action Item Lists** — queries vault for tasks with specific tags/statuses

**2. Academic & Research Templates**
- **Literature Notes** — citation fields, abstract, key findings, related papers
- **Research Outlines** — structured sections, source integration, bibliography
- **Study Guides** — question/answer format, pulled from course notes
- **Citation Lists** — queries metadata for papers, formats in style
- **Abstracts** — structured summary with methodology, results, conclusions

**3. Project & Task Management Templates**
- **Project Briefs** — template structure for new projects
- **Sprint Planning** — pulls backlog items, estimates, capacity
- **Retrospectives** — what went well, what didn't, action items
- **Bug Reports** — structured format with steps, expected vs actual
- **Feature Specifications** — user stories, acceptance criteria, mockups

**4. Content Creation Templates**
- **Blog Posts** — title, tags, categories, SEO metadata
- **Technical Documentation** — API docs, code examples, usage patterns
- **Book Notes** — chapter summaries, key concepts, quotes
- **Tutorial Writeups** — prerequisites, steps, troubleshooting
- **Product Reviews** — pros/cons, ratings, use cases

**5. Personal & Life Management Templates**
- **Daily Journals** — date-stamped entries, daily prompts, mood tracking
- **Goal Tracking** — SMART goals, progress metrics, deadlines
- **Habit Tracking** — daily check-ins, weekly reviews, streaks
- **Reading Notes** — book info, key takeaways, quotes, recommendations
- **Recipe Collections** — ingredients, instructions, tags, difficulty level

### Template Types by Intelligence Level

**Level 0: Static Templates**
- Plain text/markdown with no variables
- Simple text replacement only
- No context awareness
- Example: Basic note header with fixed structure

```markdown
# Project Documentation

## Overview
Brief project description...

## Requirements
List of requirements...

## Implementation
Implementation details...
```

**Level 1: Contextual Templates**
- Adapt to current note metadata and editor state
- Include date/time, current note title, selection
- Basic conditional logic
- Example: Meeting notes with dynamic date/time

```markdown
# Meeting: {{current_note.title}}

**Date:** {{date:MMMM DD, YYYY}}
**Time:** {{time:HH:mm}}

{{#if current_note.frontmatter.attendees}}
**Attendees:** {{current_note.frontmatter.attendees}}
{{/if}}

## Agenda
1. Topic 1
2. Topic 2
```

**Level 2: Dynamic Data Templates**
- Query vault metadata for live data
- Include backlinks, tags, file cache data
- Example: Note with backlinks and stats

```markdown
# {{current_note.name}}

## Backlinks
{{#each backlinks}}
- [[{{path}}]]
{{/each}}

## Tags
{{#each fileCache.tags}}
- {{this}}
{{/each}}

## Stats
- Words: {{fileCache.stats.word_count}}
- Tasks: {{fileCache.stats.tasks_done}}/{{fileCache.stats.task_count}}
```

> **Note:** Cross-note aggregation (e.g., "filter all notes where project=X and
> status=done") requires calling `vault.list` + `metadata.getFileCache` per note.
> This is expensive (rate-limit constrained) and must be cached aggressively.

**Level 3: Intelligent Templates**
- Advanced logic, loops, template composition
- Example: Literature note using file cache frontmatter

```markdown
# {{fileCache.frontmatter.title.[1]}}

**Authors:** {{fileCache.frontmatter.authors.[1]}}
**Journal:** {{fileCache.frontmatter.journal.[1]}}

## Key Findings
{{#if selection.text}}
> Selected: {{selection.text}}

{{/if}}
## Related Work (Backlinks)
{{#each backlinks}}
- [[{{path}}]]
{{/each}}

## Outgoing Links
{{#each fileCache.links}}
- [[{{target}}]]
{{/each}}
```

> **Limitation:** `find_similar_notes`, `group_by_property`, `filter_where` do not
> exist in the plugin API. Related-note discovery is limited to backlinks + outgoing
> links from `getFileCache`.

**Level 4: AI-Enhanced Templates** (Future Phase)
- Content suggestions based on current context
- Automatic template generation from note patterns
- Smart variable suggestions
- Example: System suggests relevant content to include based on note topic

---

> **Architecture Constraints (from plugin API audit):**
> - Plugins run in **sandboxed iframes** (`allow-scripts` only, no `allow-same-origin`)
> - All host communication is via **postMessage RPC** (no `rpc.invoke()`)
> - Available RPC methods: `editor.get_info`, `editor.get_value`, `editor.set_value`, `editor.get_selection`, `editor.replace_selection`
> - **No cursor position API** — `getCursor()` / `setCursor()` do not exist
> - **No vault info API** — `vault.name` / `vault.path` not exposed to plugins
> - Metadata API: `query`, `list_properties`, `get_backlinks`, `get_stats`, `getFileCache` only
> - Sidebar panels are **stubs** — plugins cannot render custom HTML into them
> - Rate limit: **100 RPC calls / 60 seconds** per plugin
> - Plugins cannot use Svelte, access host DOM, or import host components

## Core Features

### 1. Dynamic Template Variables

**Context Variables** — Automatically available:
- `{{current_note.path}}` — Full path of the active note (via `editor.get_info`)
- `{{current_note.title}}` — Note title (via `editor.get_info`)
- `{{current_note.frontmatter.*}}` — Any frontmatter property (via `metadata.getFileCache`)
- `{{selection.text}}` — Selected text in editor (via `editor.get_selection`, empty if none)
- `{{selection.length}}` — Character count of selection

**Date/Time Variables**:
- `{{date:YYYY-MM-DD}}` — Current date (format configurable)
- `{{date:MMMM DD, YYYY}}` — Formatted date
- `{{time:HH:mm}}` — Current time
- `{{datetime:ISO}}` — ISO 8601 format

**Metadata Query Variables** (queries Carbide's metadata API):
```
{{metadata:backlinks(current_note.path)}}    // via metadata.get_backlinks
{{metadata:stats(current_note.path)}}        // via metadata.get_stats
{{metadata:file_cache(current_note.path)}}   // via metadata.getFileCache
{{metadata:tags()}}                          // via search.tags
{{metadata:search("query")}}                 // via search.fts
{{metadata:properties()}}                    // via metadata.list_properties
```

### 2. Template Logic & Control Flow

**Conditional Logic**:
```
{{#if selection.text}}
Selected text: {{selection.text}}
{{else}}
No text selected.
{{/if}}
```

**Conditional Metadata**:
```
{{#if current_note.frontmatter.status}}
Status: {{current_note.frontmatter.status}}
{{else}}
Status: Needs review
{{/if}}
```

**Loops & Iteration**:
```
Related notes:
{{#each metadata:backlinks(current_note.path)}}
- [[{{title}}]] ({{date}})
{{/each}}
```

**Template Composition**:
```
{{> meeting_header }}
{{#if selection.text}}
## Selected Content
{{selection.text}}
{{/if}}
{{> footer }}
```

### 3. Live Preview System

> **Constraint:** Plugins cannot render custom HTML into sidebar panels (stubs only).
> Preview must run **within the plugin's own iframe**. The iframe is the plugin's
> entire UI surface — template editor and preview both render there.

**Rendering**:
- Preview renders within the plugin iframe (split-pane layout inside the iframe)
- Updates on: template edit (debounced), note switch (`active-file-changed` event)
- Template source and rendered output shown side-by-side in the iframe

**Preview Throttling** (rate limit aware):
- Batch all context-gathering RPC calls (get_info, get_selection, getFileCache) into a single burst
- Debounce preview updates to 1000ms minimum (not 200ms — rate limit is 100 calls/60s)
- Cache context data between previews; only re-fetch on `active-file-changed` or `editor-selection-changed` events

### 4. Template Library & Organization

**Template Categories**:
- **Notes** — Meeting notes, research notes, journal entries
- **Projects** — Project briefs, status updates, retrospectives
- **Academic** — Literature notes, citations, summaries
- **Personal** — Daily planning, goal tracking, reflections
- **Code** — Technical documentation, API docs, code reviews

**Template Storage**:
- Templates stored as markdown files in `templates/` folder
- Each template is a note with special frontmatter
- Hierarchical organization via folders and tags
- Template metadata in frontmatter:

```yaml
---
template:
  name: "Meeting Notes"
  description: "Structured meeting note template"
  category: "meetings"
  variables:
    - date
    - attendees
    - agenda
  icon: "users"
  keywords: ["meeting", "notes", "minutes"]
---
```

### 5. Template Authoring UI

> **Constraint:** Plugins render inside a sandboxed iframe. No Svelte, no host DOM
> access, no drag-and-drop between host and plugin. All UI must be vanilla HTML/JS
> or a bundled framework within the iframe.

**Approach:** Code-first template editor with toolbar buttons for inserting template syntax.
A visual drag-and-drop builder is infeasible within the iframe sandbox constraints —
instead, provide a **toolbar-assisted code editor** with snippet insertion.

**Toolbar Categories** (insert template syntax at cursor in a `<textarea>`):
- **Variables:** Insert `{{current_note.title}}`, `{{date:YYYY-MM-DD}}`, etc.
- **Logic:** Insert `{{#if ...}}...{{/if}}`, `{{#each ...}}...{{/each}}`
- **Metadata:** Insert `{{metadata:backlinks(...)}}`, `{{metadata:tags()}}`
- **Includes:** Insert `{{> template_name }}`

---

## Implementation Plan

### Phase 1: Core Template Engine

**Session Type:** TypeScript  
**Duration:** 4-6 hours

**Components to Build:**

#### 1. Template Parser (`core/template_parser.ts`)

**Responsibility:** Parse template syntax into an Abstract Syntax Tree (AST)

**Public API:**
```typescript
interface TemplateParser {
  parse(source: string): TemplateAST;
  validate(source: string): ValidationResult;
}

interface TemplateAST {
  type: 'program';
  body: TemplateNode[];
  variables: string[];
}

type TemplateNode = 
  | TextNode 
  | VariableNode 
  | ConditionalNode 
  | EachNode 
  | IncludeNode 
  | HelperNode;

interface VariableNode {
  type: 'variable';
  name: string;
  modifier?: 'raw' | 'escaped';
  filters?: FilterExpression[];
}

interface ConditionalNode {
  type: 'conditional';
  test: Expression;
  consequent: TemplateNode[];
  alternate: TemplateNode[] | null;
}

interface EachNode {
  type: 'each';
  iterable: Expression;
  valueVar: string;
  indexVar?: string;
  body: TemplateNode[];
}

interface IncludeNode {
  type: 'include';
  templateName: string;
  data?: Record<string, Expression>;
}
```

**Implementation Recommendation:**

> **Strongly recommend using Handlebars.js** (`~4KB gzipped`) instead of building
> a custom recursive-descent parser. Handlebars already provides:
> - `{{variable}}` interpolation with dot-path resolution
> - `{{#if}}`, `{{#each}}`, `{{#unless}}` block helpers
> - `{{> partial}}` template composition
> - Custom helper registration (for `date:FORMAT`, metadata queries, etc.)
> - Precompilation to AST for caching
> - Runs in browser/iframe without Node.js dependencies
>
> Building a custom parser is 2-3 weeks of work for a subset of what Handlebars
> provides out of the box. The template syntax in this spec is already Handlebars-
> compatible by design.

#### 2. Template Renderer (`core/template_renderer.ts`)

**Responsibility:** Execute AST with context data and return rendered output

**Public API:**
```typescript
interface TemplateRenderer {
  render(ast: TemplateAST, context: RenderContext): string;
  renderAsync(ast: TemplateAST, context: RenderContext): Promise<string>;
}

interface RenderContext {
  // Editor State (from editor.get_info + editor.get_selection)
  editor: {
    currentNote: { path: string; name: string };
    selection: { text: string };
    // NOTE: No cursor position — getCursor() does not exist in the plugin API
  };

  // File Cache (from metadata.getFileCache — richest data source)
  fileCache: {
    frontmatter: Record<string, [string, string]>; // key → [type, value]
    tags: string[];
    headings: { level: number; text: string }[];
    links: { target: string; display: string }[];
    embeds: { target: string; display: string }[];
    stats: {
      word_count: number; char_count: number; heading_count: number;
      outlink_count: number; reading_time_secs: number;
      task_count: number; tasks_done: number; tasks_todo: number;
    };
    ctime_ms: number;
    mtime_ms: number;
  } | null;

  // Backlinks (from metadata.get_backlinks)
  backlinks: { path: string }[];

  // Date/Time (local, no RPC needed)
  date: Date;
  time: string;

  // Lazy query functions (resolved at render time, counted against rate limit)
  search: {
    fts(query: string, limit?: number): Promise<unknown[]>;
    tags(pattern?: string): Promise<unknown[]>;
  };

  // Helpers
  helpers: Record<string, HelperFunction>;
}
```

**Rendering Algorithm:**
1. Walk AST depth-first
2. For TextNode: append text directly to output
3. For VariableNode: resolve from context, apply filters, append to output
4. For ConditionalNode: evaluate test, render consequent or alternate
5. For EachNode: evaluate iterable, render body for each item
6. For IncludeNode: resolve template, render recursively with merged context

**Error Handling:**
- Catch undefined variables → render empty string (configurable: throw error)
- Catch template not found → render error message in preview, log warning
- Catch infinite loops → implement iteration limit (default: 1000)
- Timeout long renders → 5 second limit with partial output

#### 3. Context Providers (`core/context_providers.ts`)

**Responsibility:** Gather context data from Carbide for template rendering

> **Constraint:** All host communication is via postMessage RPC. The plugin must
> implement a client-side RPC wrapper (request ID → promise map). There is no
> `rpc.invoke()` — the examples below use a hypothetical `pluginRpc.call()` wrapper
> that the plugin must implement over `window.postMessage`.

**Provider Interface:**
```typescript
interface ContextProvider {
  name: string;
  priority: number;
  provide(rpc: PluginRpcClient): Promise<ContextData>;
}

// Plugin-side RPC client (must be implemented by the plugin)
interface PluginRpcClient {
  call(method: string, ...params: unknown[]): Promise<unknown>;
}

// Implemented providers:
const editorProvider: ContextProvider = {
  name: 'editor',
  priority: 10,
  async provide(rpc) {
    // editor.get_info → {path, name}
    // editor.get_selection → selected text string
    // NOTE: No getCursor() — cursor position is NOT available
    const [info, selection] = await Promise.all([
      rpc.call('editor.get_info'),
      rpc.call('editor.get_selection'),
    ]);
    return { currentNote: info, selection: { text: selection } };
  }
};

const metadataProvider: ContextProvider = {
  name: 'metadata',
  priority: 20,
  async provide(rpc) {
    // Gather frontmatter, tags, headings, links, stats for current note
    const info = await rpc.call('editor.get_info') as { path: string };
    if (!info?.path) return {};
    const [fileCache, backlinks] = await Promise.all([
      rpc.call('metadata.getFileCache', info.path),
      rpc.call('metadata.get_backlinks', info.path),
    ]);
    return { fileCache, backlinks };
  }
};

const dateProvider: ContextProvider = {
  name: 'date',
  priority: 0,
  async provide() {
    return {
      date: new Date(),
      time: new Date().toISOString().split('T')[1].slice(0, 5)
    };
  }
};

const searchProvider: ContextProvider = {
  name: 'search',
  priority: 30,
  async provide(rpc) {
    return {
      fts: async (query: string) => rpc.call('search.fts', query),
      tags: async (pattern?: string) => rpc.call('search.tags', pattern),
    };
  }
};
```

**Context Merging:**
- Higher priority providers override lower (later wins)
- Editor context always available (even if no note open → empty values)
- **Rate limit awareness:** All provider calls counted against 100/60s limit.
  Batch with `Promise.all()`, cache aggressively, re-fetch only on events.

#### 4. Template Library (`core/template_library.ts`)

**Responsibility:** Manage template storage, retrieval, and organization

**Storage Strategy:**

> **Constraint:** Plugins access files via `vault.read`/`vault.create`/`vault.modify`/`vault.list`,
> which operate on markdown notes. No arbitrary filesystem access, no YAML files, no
> subdirectory creation. Two viable approaches:

**Option A: Templates as regular vault notes** (recommended)
Store templates as markdown notes in a `templates/` folder. Use frontmatter for metadata.
The plugin discovers templates by calling `vault.list` and filtering paths starting with `templates/`.

```
templates/
├── meetings/
│   ├── daily-standup.md
│   ├── meeting-notes.md
│   └── retro.md
├── projects/
│   ├── project-brief.md
│   └── sprint-planning.md
└── academic/
    └── literature-note.md
```

**Option B: Plugin settings storage**
Store template index in `settings.set("template_index", JSON.stringify(...))`.
Template content still lives as vault notes, but the index is in plugin settings.

**Template Frontmatter** (metadata in each template note):
```yaml
---
template:
  name: "Meeting Notes"
  description: "Structured meeting notes with action items"
  category: "meetings"
  keywords: ["meeting", "notes", "agenda", "action-items"]
  icon: "users"
  version: "1.0.0"
  variables:
    - name: "attendees"
      type: "string"
      required: false
      description: "Meeting attendees"
    - name: "agenda"
      type: "textarea"
      required: false
      description: "Meeting agenda items (one per line)"
  insert_mode: "replace_selection"  # replace_selection | replace_all
---
```

> Note: `insert_position: "cursor"` is infeasible — there is no cursor position API.
> Only `editor.replace_selection` and `editor.set_value` are available.

**Public API:**
```typescript
interface TemplateLibrary {
  getAll(): Promise<TemplateSummary[]>;
  getById(id: string): Promise<Template>;
  getByCategory(category: string): Promise<Template[]>;
  search(query: string): Promise<Template[]>;
  create(template: Template): Promise<void>;
  update(id: string, template: Template): Promise<void>;
  delete(id: string): Promise<void>;
  importFromFile(path: string): Promise<Template>;
  exportToFile(id: string, path: string): Promise<void>;
}
```

#### 5. Helper Functions (`core/helpers.ts`)

**Built-in Helper Functions:**

```typescript
const builtInHelpers = {
  // Date/Time
  'date': (format: string, date?: Date) => 
    formatDate(date || new Date(), format),
  
  'date_plus': (value: string, unit: string, format: string) => 
    addToDate(value, unit, format),
  
  'time': (format: string) => 
    formatDate(new Date(), format),
  
  // String
  'uppercase': (str: string) => str.toUpperCase(),
  'lowercase': (str: string) => str.toLowerCase(),
  'trim': (str: string) => str.trim(),
  'truncate': (str: string, length: number) => str.slice(0, length),
  'slugify': (str: string) => str.toLowerCase().replace(/\s+/g, '-'),
  
  // Array/Collection
  'split': (str: string, delimiter: string) => str.split(delimiter),
  'join': (arr: string[], delimiter: string) => arr.join(delimiter),
  'first': (arr: unknown[]) => arr[0],
  'last': (arr: unknown[]) => arr[arr.length - 1],
  'slice': (arr: unknown[], start: number, end?: number) => arr.slice(start, end),
  'length': (arr: unknown[]) => arr.length,
  'reverse': (arr: unknown[]) => [...arr].reverse(),
  'sort': (arr: unknown[], key?: string) => sortBy(arr, key),
  'uniq': (arr: unknown[]) => [...new Set(arr)],
  
  // Conditional
  'eq': (a: unknown, b: unknown) => a === b,
  'ne': (a: unknown, b: unknown) => a !== b,
  'gt': (a: number, b: number) => a > b,
  'gte': (a: number, b: number) => a >= b,
  'lt': (a: number, b: number) => a < b,
  'lte': (a: number, b: number) => a <= b,
  'and': (...args: boolean[]) => args.every(Boolean),
  'or': (...args: boolean[]) => args.some(Boolean),
  'not': (val: boolean) => !val,
  
  // Math
  'add': (a: number, b: number) => a + b,
  'sub': (a: number, b: number) => a - b,
  'mul': (a: number, b: number) => a * b,
  'div': (a: number, b: number) => a / b,
  'mod': (a: number, b: number) => a % b,
  'round': (num: number, decimals: number) => 
    Number(num.toFixed(decimals)),
  
  // Utility
  'default': (value: unknown, fallback: unknown) => 
    value ?? fallback,
  'json': (obj: unknown) => JSON.stringify(obj, null, 2),
  'markdown': (text: string) => parseMarkdown(text),
  
  // Metadata helpers
  'limit': (arr: unknown[], count: number) => arr.slice(0, count),
  'offset': (arr: unknown[], start: number) => arr.slice(start),
};
```

#### 6. Plugin UI (Vanilla HTML/JS in Iframe)

> **Constraint:** The plugin runs in a sandboxed iframe. It cannot use Svelte
> (that's the host framework) or access host DOM. All UI must be vanilla HTML/JS
> or a framework bundled into the plugin's `index.html`.

The plugin's `index.html` contains the full template editor UI. Example structure:

```html
<!-- Plugin iframe: index.html -->
<div id="app">
  <div id="toolbar">
    <!-- Snippet insertion buttons -->
    <button data-insert="{{current_note.title}}">Title</button>
    <button data-insert="{{date:YYYY-MM-DD}}">Date</button>
    <button data-insert="{{selection.text}}">Selection</button>
    <button data-insert="{{#if selection.text}}&#10;{{/if}}">If</button>
    <button data-insert="{{#each backlinks}}&#10;{{/each}}">Each</button>
  </div>
  <div id="editor-container">
    <textarea id="template-editor" placeholder="Enter template..."></textarea>
    <div id="preview-panel">
      <div id="preview-header">Preview</div>
      <div id="preview-content"></div>
    </div>
  </div>
  <div id="actions">
    <button id="insert-btn">Insert into Note</button>
    <button id="save-btn">Save Template</button>
  </div>
</div>
```

The plugin JS bundles the template parser, renderer, and RPC client.
Insert action calls `editor.replace_selection` or `editor.set_value` via RPC.

### Phase 2: Template Editor UI (In-Iframe)

**Session Type:** TypeScript (vanilla or lightweight framework bundled into iframe)
**Duration:** 4-6 hours

> **Constraint:** All UI runs inside the plugin's sandboxed iframe. No Svelte (host
> framework), no host DOM access, no drag-and-drop between host and plugin. The
> plugin must bundle its own UI framework or use vanilla HTML/JS.

**Components to Build:**

**1. Toolbar-Assisted Editor** (HTML `<textarea>` + toolbar buttons)

The editor is a `<textarea>` with a toolbar that inserts template syntax snippets.
This is the only feasible approach within the iframe sandbox.

**Snippet Categories:**
```
Variables:        {{current_note.title}}, {{date:YYYY-MM-DD}}, {{selection.text}}
Metadata:         {{metadata:backlinks(...)}}, {{metadata:tags()}}, {{metadata:stats(...)}}
Logic:            {{#if ...}}...{{/if}}, {{#each ...}}...{{/each}}
Includes:         {{> template_name }}
```

**2. Split-Pane Preview** (rendered markdown output below/beside the editor)

The preview panel renders the template output as plain text/markdown within the
iframe. Preview updates are debounced to 1000ms to respect the 100 calls/60s rate limit.

**3. Template Picker** (list of available templates from vault)

A searchable list rendered in the iframe. Templates discovered via `vault.list` +
filtering for `templates/` prefix, then reading frontmatter from each template note.

**4. Preview Integration**

**Preview Rendering Pipeline:**
```
User Types in Editor
        │
        ▼ (debounce 1000ms — rate limit aware)
Parse Template → AST (local, no RPC)
        │
        ▼
Collect Context (batched RPC — ~3-4 calls)
  • editor.get_info        (1 call)
  • editor.get_selection   (1 call)
  • metadata.getFileCache  (1 call)
  • metadata.get_backlinks (1 call, optional)
        │
        ▼
Render AST → Markdown String (local)
        │
        ▼
Display in Preview Panel (innerHTML in iframe)
```

**Rate Limit Budget:**
```typescript
// 100 calls / 60s = ~1.67 calls/sec
// Each preview render costs ~3-4 RPC calls
// Max safe preview frequency: 1 render per 2-3 seconds
// Use 1000ms debounce + skip render if context unchanged

const PREVIEW_DEBOUNCE_MS = 1000;
const MAX_PREVIEW_SIZE_BYTES = 100_000;

let lastContextHash = '';

const debouncedPreview = debounce(async (template: string) => {
  try {
    const ast = parser.parse(template);
    const context = await gatherContext(); // ~3-4 RPC calls

    // Skip render if context unchanged (saves rate limit budget)
    const contextHash = hashContext(context);
    if (contextHash === lastContextHash && template === lastTemplate) return;
    lastContextHash = contextHash;

    const output = await renderer.render(ast, context);

    if (output.length > MAX_PREVIEW_SIZE_BYTES) {
      preview = output.slice(0, MAX_PREVIEW_SIZE_BYTES) + '\n\n... (truncated)';
    } else {
      preview = output;
    }
    error = null;
  } catch (e) {
    error = e.message;
  }
}, PREVIEW_DEBOUNCE_MS);
```

**State Management:**
- Template state managed in plain JS within the iframe (no Svelte)
- Debounced preview updates (1000ms minimum)
- Context caching to minimize RPC calls

### Phase 3: Advanced Features

**Session Type:** TypeScript  
**Duration:** 8-10 hours

**Features to Build:**

#### 1. Template Library Management

**Import/Export System:**
```typescript
interface TemplateImportExport {
  // Export formats
  exportToJSON(templateId: string): Promise<JSONTemplate>;
  exportToMarkdown(templateId: string): Promise<string>;
  exportToZIP(categoryId: string): Promise<Blob>;
  
  // Import formats
  importFromJSON(json: JSONTemplate): Promise<Template>;
  importFromMarkdown(markdown: string): Promise<Template>;
  importFromURL(url: string): Promise<Template>;
  
  // Template validation
  validateImport(data: unknown): ImportValidationResult;
}

// JSON export format
interface JSONTemplate {
  version: "1.0";
  template: {
    id: string;
    name: string;
    content: string;
    category: string;
    keywords: string[];
    variables: VariableDefinition[];
    frontmatter: Record<string, unknown>;
  };
  metadata: {
    exportedAt: string;
    exportedBy: string;
    version: string;
  };
}
```

**Template Versioning:**
```typescript
interface TemplateVersion {
  version: string;
  content: string;
  createdAt: string;
  changelog?: string;
}

interface TemplateVersioning {
  getVersions(templateId: string): Promise<TemplateVersion[]>;
  createVersion(templateId: string, content: string, changelog?: string): Promise<void>;
  revertToVersion(templateId: string, version: string): Promise<void>;
  diff(v1: string, v2: string): Promise<DiffResult>;
}
```

**Sharing Between Vaults:**
```typescript
interface TemplateSharing {
  // Generate shareable template bundle
  createBundle(templateIds: string[]): Promise<TemplateBundle>;
  
  // Share via various methods
  shareToClipboard(bundle: TemplateBundle): Promise<void>;
  shareToFile(bundle: TemplateBundle, path: string): Promise<void>;
  generateShareLink(bundle: TemplateBundle): Promise<string>; // For future registry
  
  // Import shared templates
  importFromBundle(bundle: TemplateBundle): Promise<ImportResult>;
}
```

#### 2. Metadata Integration (Within Existing API)

> **Constraint:** The plugin metadata API provides: `query`, `list_properties`,
> `get_backlinks`, `get_stats`, `getFileCache`. There are no `groupBy`, `findSimilar`,
> `timeline`, graph traversal, or cross-note aggregation APIs.

**What's Available:**
```typescript
// These map directly to plugin RPC methods:
interface AvailableMetadata {
  // metadata.getFileCache(path) → frontmatter, tags, headings, links, embeds, stats
  getFileCache(notePath: string): Promise<FileCache>;

  // metadata.get_backlinks(path) → [{path}]
  getBacklinks(notePath: string): Promise<{path: string}[]>;

  // metadata.get_stats(path) → note statistics
  getStats(notePath: string): Promise<NoteStats>;

  // metadata.list_properties → all frontmatter property names across vault
  listProperties(): Promise<string[]>;

  // metadata.query(query) → query results (schema TBD)
  query(query: unknown): Promise<unknown>;

  // search.fts(query, limit) → full-text search results
  fts(query: string, limit?: number): Promise<unknown[]>;

  // search.tags(pattern?) → notes matching tag pattern
  tags(pattern?: string): Promise<unknown[]>;
}
```

**Client-Side Aggregation:**
For groupBy, findSimilar, and timeline features, the plugin must:
1. Call `vault.list` to get all note paths
2. Call `metadata.getFileCache` for each note (expensive — rate limit aware)
3. Aggregate/group/sort client-side in the iframe

This is expensive and should be done lazily with aggressive caching.

**Backlink-Based "Related Notes":**
```typescript
// The closest approximation to "graph neighbors" using existing APIs
async function getRelatedNotes(rpc: PluginRpcClient, notePath: string) {
  const backlinks = await rpc.call('metadata.get_backlinks', notePath);
  const fileCache = await rpc.call('metadata.getFileCache', notePath);
  // outgoing links from fileCache.links + incoming from backlinks
  return { incoming: backlinks, outgoing: fileCache?.links ?? [] };
}
```

> **Future:** If Carbide adds graph traversal APIs (`get_graph_neighbors`, etc.),
> the template engine should adopt them. For now, backlinks + outgoing links are
> the only graph primitives available.

#### 3. Template Composition System

**Include System:**
```typescript
interface TemplateInclude {
  // Resolve template from various sources
  resolve(name: string): Promise<Template | null>;
  
  // Support paths
  //   {{> header }}           → same category
  //   {{> meetings/header }}  → specific category
  //   {{> /header }}          → root templates
  
  // Template data merging
  mergeContext(partial: Template, data: Record<string, unknown>): RenderContext;
}

interface TemplateInheritance {
  // Layout system: base templates with sections to override
  extends(parentName: string): TemplateAST;
  
  // Define sections
  // {{$ yield}}               → where child content goes
  // {{$ section "sidebar"}}  → define a section
}
```

**Partial Templates:**
```typescript
// Partial: _meeting-header.md
```markdown
# {{title}}

**Date:** {{date:YYYY-MM-DD}}
**Attendees:** {{#each attendees}}{{.}}, {{/each}}

---
```

```handlebars
// Usage in parent template:
{{> _meeting_header title="Weekly Standup" attendees=teamMembers}}
```

#### 4. Performance Optimizations

**Template Caching:**
```typescript
class TemplateCache {
  private astCache: Map<string, { ast: TemplateAST; hash: string }> = new Map();
  private renderCache: LRUCache<string, string> = new LRUCache(100);
  
  parse(template: string): TemplateAST {
    const hash = sha256(template);
    const cached = this.astCache.get(template.id);
    
    if (cached && cached.hash === hash) {
      return cached.ast;
    }
    
    const ast = this.parser.parse(template);
    this.astCache.set(template.id, { ast, hash });
    return ast;
  }
  
  render(contextKey: string, ast: TemplateAST, context: RenderContext): string {
    const cacheKey = `${ast.id}:${JSON.stringify(contextKey)}`;
    const cached = this.renderCache.get(cacheKey);
    
    if (cached && !this.isContextStale(context)) {
      return cached;
    }
    
    const result = this.renderer.render(ast, context);
    this.renderCache.set(cacheKey, result);
    return result;
  }
  
  invalidate(templateId: string): void {
    this.astCache.delete(templateId);
    // Invalidate related render caches
    this.renderCache.clear(); // Simplified; in production, selective
  }
}
```

**Async Metadata Query Batching:**
```typescript
class MetadataQueryBatcher {
  private pending: Map<string, Promise<unknown>> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private BATCH_DELAY_MS = 50;
  
  async query(queries: MetadataQuery[]): Promise<unknown[]> {
    // Deduplicate identical queries
    const uniqueQueries = this.deduplicate(queries);
    
    // Return cached if in flight
    const inFlight = uniqueQueries
      .map(q => this.pending.get(q.id))
      .filter(Boolean);
    
    if (inFlight.length === uniqueQueries.length) {
      return Promise.all(inFlight);
    }
    
    // Batch execute
    return new Promise((resolve) => {
      uniqueQueries.forEach(q => {
        this.pending.set(q.id, Promise.resolve(executeQuery(q)));
      });
      
      setTimeout(() => {
        const results = uniqueQueries.map(q => this.pending.get(q.id));
        this.pending.clear();
        resolve(results);
      }, this.BATCH_DELAY_MS);
    });
  }
}
```

**Event-Driven Context Refresh:**
```typescript
// Only re-fetch context on relevant events (not on every preview)
// Subscribe via events.on RPC call during plugin activation

const contextCache = {
  data: null as RenderContext | null,
  stale: true,

  markStale() { this.stale = true; },

  async get(rpc: PluginRpcClient): Promise<RenderContext> {
    if (!this.stale && this.data) return this.data;

    // ~3-4 RPC calls, batched
    const [info, selection] = await Promise.all([
      rpc.call('editor.get_info'),
      rpc.call('editor.get_selection'),
    ]);
    const path = (info as any)?.path;
    const [fileCache, backlinks] = path ? await Promise.all([
      rpc.call('metadata.getFileCache', path),
      rpc.call('metadata.get_backlinks', path),
    ]) : [null, []];

    this.data = {
      editor: { currentNote: info, selection: { text: selection } },
      fileCache, backlinks,
      date: new Date(),
      time: new Date().toISOString().split('T')[1].slice(0, 5),
      search: { /* lazy query wrappers */ },
      helpers: builtInHelpers,
    } as RenderContext;
    this.stale = false;
    return this.data;
  }
};

// Mark stale on relevant events
rpc.call('events.on', 'active-file-changed');
rpc.call('events.on', 'editor-selection-changed');
rpc.call('events.on', 'metadata-changed');
// Handle events via postMessage listener
window.addEventListener('message', (e) => {
  if (e.data?.type === 'event') contextCache.markStale();
});
```

### Phase 4: Polish & UX

**Session Type:** TypeScript + Svelte  
**Duration:** 4-6 hours

**Features to Build:**
1. **Template Creation Wizard**
   - Step-by-step template creation
   - Template from current note
   - Template from selection

2. **Advanced Preview Features**
   - Preview themes/styles
   - Export preview as standalone file
   - Print-friendly preview

3. **Settings & Customization**
   - Default date/time formats
   - Template folder location
   - Preview panel preferences
   - Keyboard shortcuts

4. **Help & Documentation**
   - Built-in template examples
   - Interactive tutorial
   - Contextual help tooltips

---

## Technical Architecture

### Plugin Structure

> **Note:** Carbide plugins are served from `carbide-plugin://<plugin_id>/`.
> The plugin must be a self-contained bundle (HTML + JS + CSS) that runs in an iframe.
> No `.svelte` files — those are host-side only.

```
smart-templates/
├── manifest.json           # Plugin manifest (id, permissions, allowed_origins)
├── index.html              # Plugin entry point (loaded in iframe)
├── main.js                 # Bundled JS (includes all core/ and utils/)
├── styles.css              # Plugin styles
└── src/                    # Source (compiled into main.js)
    ├── rpc_client.ts       # postMessage RPC wrapper (request/response)
    ├── template_parser.ts
    ├── template_renderer.ts
    ├── context_providers.ts
    ├── template_library.ts
    ├── template_cache.ts
    ├── date_formatter.ts
    └── template_helpers.ts
```

### Template Syntax (Extended Handlebars)

**Variables:**
```handlebars
{{variable}}
{{nested.property}}
{{array.[0]}}
{{date:YYYY-MM-DD}}
```

**Control Flow:**
```handlebars
{{#if condition}}
  Content
{{else}}
  Alternative
{{/if}}

{{#each items}}
  {{this}}
{{/each}}
```

**Template Inclusion:**
```handlebars
{{> template_name }}
{{> folder/template_name }}
```

**Helpers:**
```handlebars
{{#if (eq status "active")}}
  Active
{{/if}}

{{#unless (eq status "done")}}
  Not done yet
{{/unless}}

{{format_date date "MMMM DD, YYYY"}}
```

### Data Flow

```
User triggers "Insert Template" command
    │
    ▼
Host sends command.execute to plugin iframe via postMessage
    │
    ▼
Plugin iframe shows template picker (vault.list → filter templates/)
    │
    ▼
User selects template → plugin reads it (vault.read)
    │
    ▼
Template Parser → AST (runs locally in iframe)
    │
    ▼
Context gathering via postMessage RPC (~3-4 calls):
  • editor.get_info → {path, name}
  • editor.get_selection → selected text
  • metadata.getFileCache → frontmatter, tags, stats
  • metadata.get_backlinks → incoming links
    │
    ▼
Template Renderer → Generated Markdown (local in iframe)
    │
    ▼
Preview displayed in iframe (textContent, not innerHTML)
    │
    ▼
User clicks "Insert" → editor.replace_selection or editor.set_value via RPC
```

### Performance Considerations

1. **Template Caching**
   - Cache parsed AST for each template (local, no RPC cost)
   - Cache rendered output keyed by context hash
   - Invalidate cache on `active-file-changed` and `metadata-changed` events

2. **RPC Call Optimization (Critical)**
   - 100 calls / 60 seconds hard limit enforced by host
   - Batch context-gathering calls with `Promise.all()`
   - Cache context data; only re-fetch on events
   - Debounce preview updates to 1000ms minimum
   - Never call getFileCache in a loop over all notes

3. **Large Document Handling**
   - Limit preview content size (100KB)
   - Truncate template output with "... (truncated)" indicator

---

## Security Considerations

### Permission Requirements

**Required Permissions:**
- `editor:read` — Access current note info and selection (`editor.get_info`, `editor.get_selection`)
- `editor:modify` — Insert rendered template into note (`editor.replace_selection`, `editor.set_value`)
- `metadata:read` — Query vault metadata (`metadata.getFileCache`, `metadata.get_backlinks`, etc.)
- `search:read` — Full-text search and tag queries (`search.fts`, `search.tags`)
- `fs:read` — Read template files from vault (`vault.read`, `vault.list`)
- `fs:write` — Save custom templates to vault (`vault.create`, `vault.modify`)
- `commands:register` — Register template-related commands and keyboard shortcuts
- `events:subscribe` — Listen for `active-file-changed`, `editor-selection-changed` events
- `settings:register` — Register plugin settings tab

**Optional Permissions:**
- `network:fetch` — For template sharing/sync features (future)

> **Note:** `ui:panel` is listed but sidebar panels are currently stubs — the plugin
> cannot render custom HTML into them. The plugin's UI lives entirely within its
> own iframe, which is always available without additional permissions.

### Security Measures

1. **Template Validation**
   - Sanitize all template content
   - Limit template execution time (5 second timeout)
   - Prevent infinite loops in template logic (iteration limit: 1000)
   - Validate variable names to prevent prototype pollution

2. **Data Access Controls**
   - Respect Carbide's existing permission model
   - No direct filesystem access outside templates
   - Metadata queries limited to granted permissions
   - Template-specific sandbox for context providers

3. **XSS Prevention**
   - Plugin runs in iframe with `connect-src none` CSP — no outbound network from iframe
   - Template output is **plain text/markdown**, not rendered as HTML
   - Preview displayed via `textContent` assignment, not `innerHTML`
   - If HTML preview is needed, use a sanitization library (DOMPurify), not regex

4. **Template Security Rules**
```typescript
const templateSecurityRules = {
  // Block dangerous variable access
  blockedVariables: [
    '__proto__',
    'constructor',
    'prototype',
    'globalThis',
    'window',
    'document'
  ],

  // Block dangerous helper functions
  blockedHelpers: [
    'eval',
    'Function',
    'require',
    'import'
  ],

  // Execution limits
  maxIterations: 1000,
  maxDepth: 10,
  maxExecutionTime: 5000, // ms
  maxOutputSize: 100000, // bytes
  maxQueryResults: 100,

  // NOTE: Regex-based sanitization is bypassable. The iframe sandbox
  // provides defense in depth, but use textContent (not innerHTML) for
  // preview rendering. If HTML rendering is required, bundle DOMPurify.
};
```

5. **Rate Limit Awareness**
```typescript
// The host enforces 100 RPC calls / 60 seconds per plugin.
// The plugin has NO control over this — it's enforced by PluginRateLimiter.
// Template rendering must budget RPC calls carefully:
//
// Per preview render: ~3-4 calls (get_info, get_selection, getFileCache, get_backlinks)
// Max safe renders: ~25-30 per minute
// Debounce preview: 1000ms minimum
//
// For templates with metadata queries in loops (e.g., getFileCache for each backlink),
// the plugin must implement client-side caching to avoid exhausting the rate limit.

const RATE_LIMIT_BUDGET = {
  maxCallsPerMinute: 100,  // enforced by host
  callsPerPreview: 4,      // typical
  safePreviewsPerMinute: 25,
  minDebouncMs: 1000,
};
```

---

## User Experience

### Onboarding Flow

1. **First Run**
   - Show notice via `ui.show_notice` with welcome message
   - Permission request handled by Carbide's built-in permission dialog
   - Sample templates created in `templates/` folder via `vault.create`

2. **Template Usage**
   - Command palette: "Smart Templates: Insert Template" (via `commands.register`)
   - Command palette: "Smart Templates: Create Template" (via `commands.register`)

> **Note:** Plugins cannot bind keyboard shortcuts directly. Commands registered
> via `commands.register` appear in the command palette. Users can bind shortcuts
> to commands through Carbide's hotkey settings if supported.

### Command Palette Integration

```
Smart Templates: Insert Template
Smart Templates: Create New Template
Smart Templates: Create from Current Note
Smart Templates: Open Template Editor
```

> All commands registered via `commands.register({id, label, description, keywords, icon})`.
> No `checkCallback` or `editorCallback` variants exist yet in the plugin API.

---

## Integration with Carbide Features

### Search Integration
- Templates are regular vault notes — automatically indexed by Carbide's search
- Find templates by tags and keywords via `search.fts` and `search.tags`

### Metadata Integration
- Use `metadata.getFileCache` for frontmatter-driven template variables
- Use `metadata.get_backlinks` for related-note discovery
- Use `search.tags` for tag-based content queries
- All queries subject to the 100 calls/60s rate limit

### Editor Integration
- Template insertion via `editor.replace_selection` (replaces selected text)
- Apply template to entire note via `editor.set_value` (replaces all content)
- Template-based note creation: `vault.create` + `editor.set_value`

> **Limitation:** No cursor-position insertion without selection. `editor.replace_selection`
> works with empty selection (inserts at cursor in Obsidian), but behavior with empty
> selection should be verified against Carbide's implementation.

---

## Example Templates

> **WARNING: The example templates below use fictional metadata query functions**
> (`metadata:filter_by_property`, `metadata:find_similar_notes`, `metadata:group_by_property`)
> **that do not exist in Carbide's plugin API.** These templates illustrate the
> *aspirational* template syntax, not what's currently implementable.
>
> With the current API, templates can use:
> - `backlinks` (via `metadata.get_backlinks`)
> - `fileCache.frontmatter.*`, `fileCache.tags`, `fileCache.links`, `fileCache.stats` (via `metadata.getFileCache`)
> - `search.fts(query)` and `search.tags(pattern)` for vault-wide queries
>
> Cross-note property filtering would require a new plugin API (e.g., `metadata.filter`)
> or client-side aggregation via `vault.list` + per-note `getFileCache` calls (rate-limit expensive).

### 1. Advanced Meeting Notes Template

**File:** `templates/meetings/advanced-meeting-notes.md`

```handlebars
---
template:
  name: "Advanced Meeting Notes"
  description: "Smart meeting notes with automatic action item extraction and follow-up scheduling"
  category: "meetings"
  version: "2.0.0"
  variables:
    - name: "agenda"
      type: "textarea"
      required: false
      description: "Meeting agenda items (one per line)"
    - name: "attendees"
      type: "string"
      required: false
      description: "Comma-separated list of attendees"
    - name: "meeting_type"
      type: "select"
      options: ["standup", "planning", "review", "brainstorm", "other"]
      default: "standup"
  icon: "users"
---

# {{current_note.title}}

**Meeting Type:** {{meeting_type}}  
**Date:** {{date:MMMM DD, YYYY}} ({{date:dddd}})  
**Time:** {{time:HH:mm}} - {{#with (addTime time "00:30")}} {{.}} {{/with}}

{{#if attendees}}
**Attendees:** {{#each (split attendees ",")}} [[{{trim .}}]] {{/each}}
{{/if}}

## 📋 Agenda
{{#if agenda}}
{{#each (split agenda "\n")}}
{{#if (gt (length (trim this)) 0)}}
{{inc @index}}. {{trim this}} {{#if (contains (trim this) "decision") }} ⚡ {{else}} {{/if}}
{{/if}}
{{/each}}
{{else}}
1. Opening remarks
2. Discussion topics
3. Action items
4. Next steps
{{/if}}

## 📝 Discussion Notes

{{#if selection.text}}
### Context from Selection
> {{selection.text}}

{{/if}}
{{#each (metadata:filter_by_property("status" "active" "tags" (concat "#" (slugify current_note.title))) | limit:5)}}
**Related:** [[{{title}}]] ({{frontmatter.status}})
{{/each}}

## ✅ Action Items

{{#if (metadata:filter_by_property("meeting_action" "true" "due_date" date:YYYY-MM-DD) | length)}}
**Due Today:**
{{#each metadata:filter_by_property("meeting_action" "true" "due_date" date:YYYY-MM-DD)}}
- [ ] [[{{title}}]] - {{frontmatter.assigned_to}} {{#if frontmatter.priority}} ({{uppercase frontmatter.priority}}){{/if}}
{{/each}}
{{/if}}

{{#if (metadata:filter_by_property("meeting_action" "true" "due_date" (date_plus:days:1:YYYY-MM-DD)) | length)}}
**Due Tomorrow:**
{{#each metadata:filter_by_property("meeting_action" "true" "due_date" (date_plus:days:1:YYYY-MM-DD))}}
- [ ] [[{{title}}]] - {{frontmatter.assigned_to}}
{{/each}}
{{/if}}

{{#unless (or (metadata:filter_by_property("meeting_action" "true" "due_date" date:YYYY-MM-DD) | length) (metadata:filter_by_property("meeting_action" "true" "due_date" (date_plus:days:1:YYYY-MM-DD)) | length))}}
_Action items will be extracted from discussion notes after meeting._
{{/unless}}

## 🔗 Related Meetings

{{#if (metadata:filter_by_property("tags" (concat "#" (slugify current_note.title)) "sortBy" "date" | slice:0:3) | length)}}
**Recent related meetings:**
{{#each metadata:filter_by_property("tags" (concat "#" (slugify current_note.title)) "sortBy" "date" | slice:0:3)}}
- [[{{title}}]] ({{date:YYYY-MM-DD}})
{{/each}}
{{/if}}

## 📅 Next Steps

{{#if (eq meeting_type "standup")}}
**Tomorrow's Focus:**
{{#each (metadata:filter_by_property("project" current_note.title "status" "in-progress" | slice:0:3)}}
- 🔄 [[{{title}}]] - {{frontmatter.assignee}}
{{/each}}
{{else}}
**Follow-up Actions:**
1. Schedule follow-up meeting: {{date_plus:days:7:YYYY-MM-DD}}
2. Update project status for attendees
3. Share meeting notes within 24 hours
{{/if}}

{{#if (and current_note.frontmatter.next_meeting (gt (length current_note.frontmatter.next_meeting) 0))}}
**Next Meeting:** {{current_note.frontmatter.next_meeting}}
{{/if}}

---
_Meeting generated: {{date:YYYY-MM-DD HH:mm}} | Template v2.0_
```

### 2. Literature Note Template

**File:** `templates/academic/literature-note.md`

```handlebars
---
template:
  name: "Literature Note"
  description: "Comprehensive literature note with citation management and related work tracking"
  category: "academic"
  variables:
    - name: "authors"
      type: "string"
      required: true
      description: "Paper authors (Last, First format)"
    - name: "title"
      type: "string"
      required: true
      description: "Paper title"
    - name: "year"
      type: "number"
      required: true
      description: "Publication year"
    - name: "journal"
      type: "string"
      required: false
      description: "Journal or conference name"
    - name: "doi"
      type: "string"
      required: false
      description: "Digital Object Identifier"
    - name: "keywords"
      type: "textarea"
      required: false
      description: "Paper keywords (one per line)"
    - name: "abstract"
      type: "textarea"
      required: false
      description: "Paper abstract"
  icon: "book-open"
---

# {{title}}

**Authors:** {{authors}}  
**Year:** {{year}}  
{{#if journal}}**Venue:** {{journal}}{{/if}}
{{#if doi}}**DOI:** [{{doi}}](https://doi.org/{{doi}}){{/if}}

{{#if abstract}}
## Abstract

{{abstract}}
{{/if}}

## Summary

{{#if selection.text}}
### From Selection
> {{selection.text}}

{{/if}}
### Key Contributions
1. 
2. 

## Methodology

| Aspect | Details |
|--------|---------|
| Method | |
| Data | |

## Key Findings

-

## Related Work

{{#each (metadata:find_similar_notes(keywords | limit:3))}}
- [[{{title}}]] ({{frontmatter.year}}) - related via {{frontmatter.keywords}}
{{/each}}

## Action Items
- [ ] Write summary in own words
- [ ] Extract key quotes
- [ ] Link to related notes
- [ ] Add to bibliography

## Bibliography

```bibtex
@article{{{slugify title}},
  author = {{{authors}}},
  title = {{{title}}},
  journal = {{{journal}}},
  year = {{{year}}},
  {{#if doi}}doi = {{{doi}}},{{/if}}
}
```

---
**Tags:** #research #literature #{{year}} {{#each (split keywords "\n")}}{{#if (gt (length (trim this)) 0)}}#{{trim (slugify this)}} {{/if}}{{/each}}
```

### 3. Project Status Report Template

**File:** `templates/projects/status-report.md`

```handlebars
---
template:
  name: "Weekly Status Report"
  description: "Project status report with automated progress tracking and blocker identification"
  category: "projects"
  variables:
    - name: "project_name"
      type: "string"
      required: true
      description: "Name of the project"
    - name: "sprint"
      type: "string"
      required: false
      description: "Sprint number or name"
    - name: "focus_area"
      type: "textarea"
      required: false
      description: "Main focus areas this week"
  icon: "trending-up"
---

# Project Status: {{project_name}}

**Report Date:** {{date:YYYY-MM-DD}}  
**Week:** {{date:week}} of {{date:MMMM YYYY}}
{{#if sprint}}**Sprint:** {{sprint}}{{/if}}

## Executive Summary

{{#if selection.text}}
### From Selection
{{selection.text}}

{{/if}}
## 📊 Progress Metrics

| Metric | Current | Change |
|--------|---------|--------|
| Total Tasks | {{metadata:filter_by_property("project" project_name "status" "done" | length}} | +{{metadata:filter_by_property("project" project_name "status" "done" "modified_since" (date_plus:days:-7) | length}} |
| In Progress | {{metadata:filter_by_property("project" project_name "status" "in-progress" | length}} | |
| Blocked | {{metadata:filter_by_property("project" project_name "status" "blocked" | length}} | |
| Todo | {{metadata:filter_by_property("project" project_name "status" "todo" | length}} | |

## ✅ Completed This Week

{{#each (metadata:filter_by_property("project" project_name "status" "done" "completed_date" (date:YYYY-MM-DD) | limit:10)}}
- [[{{title}}]] - completed {{completed_date}}
{{/each}}

{{#if (eq (metadata:filter_by_property("project" project_name "status" "done" "completed_date" (date:YYYY-MM-DD) | length) 0)}}
_No items completed today_
{{/if}}

## 🔄 In Progress

{{#each (metadata:filter_by_property("project" project_name "status" "in-progress" | limit:5)}}
- **[[{{title}}]]**
  - Due: {{frontmatter.due_date}}
  - Assignee: {{frontmatter.assignee}}
  - Progress: {{frontmatter.progress}}%
{{/each}}

## 🚧 Blocked Items

{{#each (metadata:filter_by_property("project" project_name "status" "blocked") | limit:5)}}
- **[[{{title}}]]**
  - Blocker: {{frontmatter.blocked_by}}
  - Since: {{frontmatter.blocked_date}}
{{/each}}

{{#if (eq (metadata:filter_by_property("project" project_name "status" "blocked" | length) 0)}}
✅ No blocked items
{{/if}}

## 🎯 Upcoming (Next 7 Days)

{{#each (metadata:filter_by_property("project" project_name "status" "todo" "due_date" (date_plus:days:7:YYYY-MM-DD) | limit:5)}}
- [ ] **[[{{title}}]]** - due {{due_date}}
{{/each}}

## Risks & Dependencies

-

## Focus Areas

{{#if focus_area}}
{{focus_area}}
{{else}}
- 
{{/if}}

---
_Generated: {{date:YYYY-MM-DD HH:mm}} | Project: {{project_name}}_
```

### 4. Daily Journal Template

**File:** `templates/personal/daily-journal.md`

```handlebars
---
template:
  name: "Daily Journal"
  description: "Personal daily journal with mood tracking, habit tracking, and gratitude logging"
  category: "personal"
  variables:
    - name: "mood"
      type: "select"
      options: ["great", "good", "okay", "low", "struggling"]
      default: "okay"
    - name: "energy"
      type: "select"
      options: ["high", "medium", "low"]
      default: "medium"
    - name: "weather"
      type: "string"
      required: false
      description: "Today's weather"
  icon: "sun"
---

# {{date:MMMM DD, YYYY}}

**Day:** {{date:dddd}} | **Week:** {{date:week}}

{{#if weather}}**Weather:** {{weather}}{{/if}}
**Mood:** {{mood}} | **Energy:** {{energy}}

## 🌅 Morning

### What am I grateful for?
1. 

### What would make today great?
1. 

### Daily Affirmation
_

## ☀️ Afternoon

### What happened today?
-

### Wins
{{#each (metadata:filter_by_property("tags" "win" "date" (date:YYYY-MM-DD) | limit:5)}}
- {{title}}
{{/each}}

## 🌙 Evening

### What did I learn today?
-

### Who did I connect with?
-

### Tomorrow's Priorities
1. 

## 📊 Habit Check

| Habit | Status |
|-------|--------|
| Exercise | ⬜ |
| Meditation | ⬜ |
| Reading | ⬜ |
| Healthy eating | ⬜ |
| Sleep before 11 | ⬜ |

## 📈 Tomorrow's Focus

-
---

_Mood tracked via Smart Templates_

### User Engagement
- Templates created per user (target: 5+ in first month)
- Template usage frequency (target: 3+ uses per week)
- Template library growth (templates per vault)

### Performance Metrics
- Template render time (target: <200ms for typical templates)
- Preview update latency (target: <500ms)
- Metadata query performance (target: <100ms per query)

### Feature Adoption
- Visual template editor usage vs. code-based editing
- Template sharing between vaults
- Custom template component creation

### Community Impact
- Template sharing on forums/Discord
- Template marketplace potential
- Integration with other Carbide features

---

## Future Enhancements

### Phase 5: AI-Powered Templates
- **Smart Content Suggestions** — AI suggests relevant content to include
- **Template Learning** — System learns from user behavior to improve templates
- **Automatic Template Generation** — Generate templates from existing note patterns

### Phase 6: Collaboration Features
- **Template Sharing** — Share templates between users
- **Template Marketplace** — Browse and install community templates
- **Template Collaboration** — Multiple users can contribute to template library

### Phase 7: Advanced Analytics
- **Template Analytics** — Which templates used most, when, and by whom
- **Content Insights** — Analyze generated content for patterns
- **Productivity Metrics** — Time saved through template usage

### Phase 8: Mobile Support
- **Mobile Template Editor** — Simplified editor for mobile devices
- **Voice Template Creation** — Create templates using voice commands
- **Mobile-Optimized Templates** — Templates that work well on small screens

---

## Conclusion

The Smart Templates plugin represents a unique opportunity to transform Carbide from a note-taking application into a dynamic content creation platform. By combining Carbide's existing strengths (metadata engine, graph view, secure plugin system) with intelligent template functionality, this plugin can significantly enhance user productivity and workflow automation.

The plugin's success depends on:
1. **Seamless integration** with Carbide's existing features
2. **Intuitive user experience** through visual editing
3. **Performance** that doesn't slow down the editor
4. **Security** that respects Carbide's permission model
5. **Extensibility** that allows for future enhancements

This plugin would demonstrate Carbide's commitment to user productivity while showcasing the power and flexibility of its plugin ecosystem.