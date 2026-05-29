# Bug Reports — 2026-05-16

> **DEPRECATED (2026-05-29):** Duplicate of `carbide/implementation/2026-05-16_bug_reports.md`. Retained here for history.

## BUG-1: CLI not recognizing app open / stubborn restart attempts

**Component:** CLI ↔ App lifecycle
**Severity:** Medium
**Status:** Open

**Description:**
The CLI fails to detect that the Carbide app is already running. Instead of connecting to the existing instance, it attempts to start a new one or repeatedly retries, resulting in a stuck/stubborn loop.

**Expected behavior:**
CLI should detect a running Carbide instance (via IPC socket, PID file, or platform API) and route commands to it without attempting a redundant launch.

**Actual behavior:**
CLI does not recognize the app is open. It either tries to launch a second instance or enters a retry loop trying to start/connect.

**Reproduction steps:**
1. Open Carbide normally (via dock/launcher).
2. Run a CLI command (e.g., `carbide open <file>`).
3. Observe CLI failing to connect and attempting to start the app.

**Investigation areas:**
- IPC/socket detection logic — is the socket path correct and accessible?
- Race condition between app readiness and CLI connection attempt?
- Platform-specific detection (macOS `lsof`, `pgrep`, or Tauri single-instance lock)?

---

## BUG-2: AI panel conversation lost when switching providers

**Component:** AI Panel / Provider Management
**Severity:** High
**Status:** Open

**Description:**
Switching the AI provider in the AI panel causes the current conversation to be cleared. The conversation is not persisted and cannot be recovered after the switch.

**Expected behavior:**
Conversations should be persisted independently of the active provider. Switching providers should either:
- Preserve the conversation in-place (with a provider label), or
- Archive it to conversation history so it remains accessible.

**Actual behavior:**
Conversation state is wiped on provider change. No undo, no history entry, no recovery path.

**Reproduction steps:**
1. Start a conversation in the AI panel.
2. Switch to a different provider from the provider selector.
3. Observe the conversation is gone with no way to recover it.

**Investigation areas:**
- Is conversation state tied to the provider instance rather than a separate store?
- Is there a persistence layer (localStorage, file, DB) that should retain conversations across provider switches?
- Should conversations be keyed by session ID independent of provider?

---

## BUG-3: Cursor position not preserved when toggling source/visual mode

**Component:** Editor / Mode Switching
**Severity:** Medium
**Status:** Open

**Description:**
When switching between source mode and visual (rich-text) mode, the cursor position is not preserved. The cursor jumps to an unexpected location (typically the start or end of the document).

**Expected behavior:**
Cursor position should be idempotent across mode switches. Switching source → visual → source should leave the cursor at the same logical position (same line/offset or same block/node).

**Actual behavior:**
Cursor resets on mode switch. Round-tripping between modes does not return the cursor to its original position.

**Reproduction steps:**
1. Open a document in visual mode.
2. Place cursor at a specific position (e.g., middle of a paragraph).
3. Switch to source mode.
4. Observe cursor position — likely not at the corresponding source location.
5. Switch back to visual mode — cursor is not at the original position.

**Investigation areas:**
- Is there a position-mapping layer between ProseMirror doc offsets and source text offsets?
- Does the mode switch re-render the editor from scratch (destroying position state)?
- Can we store a stable anchor (e.g., block ID + relative offset) before switching?

---

## BUG-4: Block-structured selection breaks Ctrl+Shift cursor select

**Component:** Editor / Selection
**Severity:** Medium
**Status:** Open

**Description:**
Using keyboard-based text selection (Ctrl/Cmd + Shift + Arrow keys) behaves awkwardly in the block-structured editor. The block boundaries interfere with continuous selection, causing jumps, selection drops, or inability to extend selection smoothly across blocks.

**Expected behavior:**
Ctrl+Shift selection should extend continuously across block boundaries, behaving like a standard text editor. Users should be able to select arbitrary ranges of text regardless of underlying block structure.

**Actual behavior:**
Selection gets "stuck" at block boundaries, jumps unexpectedly, or fails to extend past the current block. The block structure is leaking into the selection UX.

**Reproduction steps:**
1. Place cursor in the middle of a paragraph.
2. Use Ctrl+Shift+Down (or Cmd+Shift+Down on macOS) to extend selection.
3. Observe selection behavior at block boundaries — it may jump, stop, or behave inconsistently compared to a plain text editor.

**Investigation areas:**
- ProseMirror selection model — are we using `TextSelection` vs `NodeSelection` correctly at boundaries?
- Custom key bindings or input rules intercepting selection extension?
- Block node `isolating` or `selectable` schema properties preventing cross-block selection?
