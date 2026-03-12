# Carbide vs. Lokus: Codebase Investigation Report

## 1. Executive Summary

This investigation evaluates whether Carbide should continue building on its current Otterly base (Svelte 5 / Tauri 2) or switch to Lokus (React 19 / Tauri 2). 

While Lokus boasts impressive feature breadth—including graph views, database bases, task boards, and extensive UI customization—its implementation is horizontally coupled and heavily relies on global state assumptions. Otterly, by contrast, enforces a strict, future-proof vertical-slice clean architecture (Ports & Adapters, synchronous Stores, orchestration Services). 

Switching bases would sacrifice Carbide's disciplined foundation and require a massive replay of already completed work (Terminal panel, Document Viewer, robust Git workflows). Therefore, Carbide should treat Otterly as the implementation architecture and Lokus strictly as an architecture and product design donor.

## 2. Recommendation

**Stay on Otterly and use a Hybrid Strategy.** 
Carbide should retain Otterly as its foundational base. The required implementation path is to adapt Lokus's highest-value capabilities (Bases, Graph data flow, deep UI customization) into Otterly’s clean architecture as new feature slices. Do not transplant Lokus's React UI or global configuration models.

## 3. Decision Matrix

| Criteria | Stay on Otterly | Switch to Lokus | Hybrid Strategy (Adapt Lokus -> Otterly) |
| :--- | :--- | :--- | :--- |
| **Architecture** | **Pros:** Strict vertical slices, explicit DI, clear side-effect boundaries.<br>**Cons:** Slower to achieve feature parity. | **Pros:** Broad feature subsystems already exist.<br>**Cons:** Horizontal coupling, React context entanglement. | **Pros:** Best of both worlds; clean implementation of validated product ideas. |
| **Extensibility** | **Pros:** Excellent fit for secure iframe-based plugin host. | **Pros:** Existing plugin manager.<br>**Cons:** Security and isolation model is deeply tied to its React runtime. | **Pros:** Build native plugin host on Otterly using Lokus API schemas as inspiration. |
| **Replay Cost** | **Pros:** Zero. Existing Carbide work is preserved. | **Cons:** Extremely high. Lose Terminal, Git UI, multi-vault isolation, and document viewer. | **Pros:** Preserves all completed Carbide work. |

## 4. Feature Portability Matrix

| Feature | Classification | Notes |
| :--- | :--- | :--- |
| **a. Graph** | **Adapt with moderate rewrite** | Extract data-flow shape (GraphData.js), link extraction, and indexing logic. Reimplant the UI natively in Svelte over Otterly's LinksStore. |
| **b. Bases** | **Adapt with moderate rewrite** | Use BaseSchema.js and QueryExecutor.js as architectural blueprints. Requires building a structured frontmatter metadata layer in Otterly first. |
| **c. Extensions** | **Architecture donor (Adapt)** | Borrow the manifest schema and contribution point definitions. Reimplement the runtime using Otterly's sandboxed iframe + postMessage RPC design. |
| **d. Kanban** | **Product design donor** | Reimplement natively. Lokus's Kanban binds tightly to its single workspace assumption. Must build a strict task domain first. |
| **e. Tasks** | **Product design donor** | Borrow UX triggers (e.g., !task parsing) and editor affordances. Reimplement domain logic completely. |
| **f. Calendar** | **Reimplement as last resort** | Lokus calendar stack (CalDAV/iCal) is heavily coupled and expensive to port. Reimplement basic scheduling views only when the task domain is stable. |
| **g. Customization** | **Direct port / Adapt** | Highest short-term win. Aggressively adapt Lokus's live CSS-variable mutation and typography controls to Otterly's ThemeStore. |
| **h. AI CLI** | **Keep Otterly's** | Otterly's AI assistant panel and inline integration are already well-adapted. Lokus's MCP server is a good reference for context retrieval. |
| **i. Terminal** | **Keep Otterly's** | Otterly's tauri-plugin-pty implementation is superior and already cleanly embedded in the layout. |
| **j. Vault vs Global Settings** | **Keep Otterly's** | Lokus fails here (its ConfigManager ignores target scoping and writes globally). Otterly already implements strict vault vs. global boundaries natively. |

## 5. Framework and Tooling Comparison

| Aspect | Lokus | Otterly (Carbide) | Verdict |
| :--- | :--- | :--- | :--- |
| **Frontend Stack** | React 19, Vite 7, Zustand, Radix, Tailwind 3 | Svelte 5 (Runes), SvelteKit 2, Vite 5, bits-ui, Tailwind 4 | Otterly's Svelte implementation is smaller, more explicit, and better aligned with strict architecture boundaries. |
| **Backend Stack** | Tauri 2 (Rust). Heavy dependency surface (iroh, CalDAV, audio capture). | Tauri 2 (Rust). Lean, focused backend (rusqlite, git2, tauri-plugin-pty). | Otterly provides a cleaner backend base for incremental feature extension. |
| **Testing/Linting** | Vitest, Playwright (E2E heavy), ESLint | Vitest, oxlint, custom structural Layering Linter (lint_layering_rules.mjs) | Lokus wins on E2E testing; Otterly wins heavily on architectural governance and guardrails. |
| **Future Proofing** | Weaker. Global assumptions and React context sprawl make optimization difficult. | **Stronger.** Explicit IO ports, synchronous stores, and dedicated reactor bounds ensure predictable scaling. | **Otterly** is significantly more extensible and maintainable over the long term. |

## 6. Lokus Design and Vault/Workspace Assumptions

Lokus's design assumptions conflict directly with Carbide's strict multi-vault, Markdown-native direction:
*   **Single Root Assumption:** Lokus centers entirely around a single workspacePath (src/core/workspace/manager.js). Multi-root vault graphs are not naturally supported.
*   **Global Config Bias:** Lokus is globally biased. Its settings manager defaults to writing state globally, whereas Carbide strictly requires differentiating between global app settings and vault-scoped preferences.
*   **Permissive Workspace Bounds:** Lokus allows almost any folder to be treated as a workspace, injecting a .lokus metadata folder on the fly. This lacks the structured boundary guarantees Carbide requires for bases and isolated metadata caches.
*   **Feature Context Binding:** Kanban boards, bases, and calendar instances in Lokus bind their initialization implicitly to the active root context.

## 7. Replay Cost if Lokus Becomes the New Base

If Carbide were to switch to Lokus, the following existing Otterly/Carbide implementations would need to be entirely redesigned and replayed onto a less disciplined React architecture:
1.  **Terminal Panel:** Rebuilding the integrated tauri-plugin-pty layer and pane layout.
2.  **In-App Document Viewer:** Reimplementing the PDF (pdf.js), image, CSV, and code-block viewer pane dispatchers.
3.  **Git Integration:** Re-porting the git2 remote operations (Push/Pull/Fetch), status widgets, and commit history dialogs.
4.  **Vault Switcher & Clean Architecture:** Untangling Lokus's global config to reinstall strict vault isolation, plus rewriting the Moraya-style vault switcher UI.
5.  **Multi-pane Split View:** Replacing Lokus's layout manager with Carbide's document-level split viewer.

## 8. Recommended Implementation Order

1.  **Phase 1: Deep Customization & Graph MVP:** Aggressively adapt Lokus's UI/theme settings to Otterly. Extract Lokus's node/link derivation logic for a native Svelte graph view.
2.  **Phase 2: Metadata & Bases:** Establish a structured frontmatter metadata cache in Otterly. Adapt Lokus's BaseSchema and query engine to build table/gallery views over this cache.
3.  **Phase 3: Task Domain & Kanban:** Create an explicit task entity domain in Otterly. Build Kanban and Calendar as derived views on top of the task/base data (using Lokus purely for UX reference).
4.  **Phase 4: Plugin System:** Build the plugin host natively using sandboxed iframes and postMessage RPC, utilizing Lokus’s manifest structures as a design blueprint.

## 9. Top 10 Files in Lokus to Study

1.  `src/bases/core/BaseSchema.js` *(Architecture for metadata bases)*
2.  `src/bases/query/QueryExecutor.js` *(Query syntax and filtering engine)*
3.  `src/core/graph/GraphData.js` *(Node/edge extraction and real-time updating)*
4.  `src/views/ProfessionalGraphView.jsx` *(Graph UX/UI presentation)*
5.  `src/core/editor/live-settings.js` *(Live CSS variable injection)*
6.  `src/views/Preferences.jsx` *(Highly customizable preferences UX)*
7.  `src/plugins/manifest/ManifestValidator.js` *(Plugin permission schema)*
8.  `src/plugins/PluginManager.js` *(Lifecycle and sandbox isolation)*
9.  `src/components/KanbanBoard.jsx` *(Task grouping and drag-and-drop UX)*
10. `src/core/workspace/manager.js` *(To understand Lokus's single-root constraints)*

## 10. Top 10 Files in Otterly to Study

1.  `docs/architecture.md` *(The definitive guide on the strict Port/Adapter/Store/Service flow)*
2.  `scripts/lint_layering_rules.mjs` *(The AST parser that enforces clean architecture)*
3.  `src/lib/app/di/create_app_context.ts` *(The composition root and DI container)*
4.  `src/lib/app/orchestration/ui_store.svelte.ts` *(Cross-screen ephemeral state manager)*
5.  `src/lib/app/bootstrap/ui/workspace_layout.svelte` *(The multi-pane resizable layout host)*
6.  `src/lib/features/settings/domain/settings_catalog.ts` *(Strictly typed settings schema)*
7.  `src/lib/features/settings/application/settings_service.ts` *(Vault vs. Global persistence logic)*
8.  `src/lib/features/editor/application/editor_service.ts` *(Milkdown integration state)*
9.  `src/lib/features/editor/adapters/milkdown_adapter.ts` *(ProseMirror manipulation boundary)*
10. `src/lib/features/links/application/links_service.ts` *(The foundation for the future Graph MVP)*
