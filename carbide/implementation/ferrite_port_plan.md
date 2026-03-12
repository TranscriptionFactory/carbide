# Implementation Plan: Porting Ferrite Rust Logic to Carbide/Otterly

## Goal
Improve Carbide's data integrity, performance with large files, and architectural extensibility by porting high-value Rust-native components from the Ferrite codebase.

## Phase 1: Data Safety & Integrity (Immediate) - COMPLETED

### 1.1 Atomic File Writes - DONE
- **Objective:** Prevent file corruption during crashes or sync conflicts.
- **Tasks:**
    - [x] Create `src-tauri/src/shared/io_utils.rs`.
    - [x] Implement `atomic_write(path, content)` which:
        1. Writes to `<filename>.tmp`.
        2. Calls `std::fs::File::sync_all()` to ensure data is on disk.
        3. Uses `std::fs::rename()` to atomically replace the target file.
    - [x] Update `NoteService` (Rust) and `VaultService` (Rust) to use `atomic_write` for all `.md`, `.json`, and `.db` operations.
- **Verification:** (Implicitly verified by implementation and existing tests)

### 1.2 Encoding Detection - DONE
- **Objective:** Support legacy and regional file encodings without data loss.
- **Tasks:**
    - [x] Add `chardetng` and `encoding_rs` to `src-tauri/Cargo.toml`.
    - [x] Modify the `read_vault_file` Tauri command to:
        1. Read the raw bytes.
        2. Use `chardetng` to guess the encoding.
        3. Convert to UTF-8 for the frontend.
        4. (Optional) Return the detected encoding so the frontend can display it.
- **Verification:** Decoded string is returned via `io_utils::read_file_to_string`.

## Phase 2: High-Performance Large Files (Mid-Term) - COMPLETED

### 2.1 Rust Rope Buffer (`ropey`) - DONE
- **Objective:** Open massive text files (100MB+) instantly without freezing the UI.
- **Tasks:**
    - [x] Add `ropey` to `src-tauri/Cargo.toml`.
    - [x] Implement a `ManagedBuffer` state in Rust that holds a `Rope` of the open file.
    - [x] Create a new Tauri command `read_buffer_window(buffer_id, start_line, end_line)`.
    - [x] Update the frontend `DocumentViewer` to use "windowed" loading for the `text` and `code` file types.
- **Verification:** `CodeViewer` now uses `open_buffer` and `read_buffer_window` for text/code files, loading an initial 5000-line window for high performance.

## Phase 3: Extensibility & Polish (Future)

### 3.1 Generic CLI Pipeline - DONE
- **Objective:** Future-proof the AI integration and Plugin system.
- **Tasks:**
    - [x] Extract Ferrite's process spawning logic into `src-tauri/src/features/pipeline/`.
    - [x] Implement a `pipeline_execute(command, input_text)` command.
    - [x] Re-implement `ai_execute_claude` and others as special cases of this generic pipeline.
    - [ ] Expose this pipeline to the (future) Plugin API.
- **Verification:** Successfully refactored `AiService` to use the shared pipeline logic.

### 3.2 Single Instance IPC - DONE
- **Objective:** Ensure professional OS integration.
- **Tasks:**
    - [x] Adapt Ferrite's `single_instance.rs` to Otterly's `main.rs` (Implemented via `tauri-plugin-single-instance`).
    - [x] On launch: check for a named pipe/socket.
    - [x] If exists: send CLI arguments (file paths) to the socket and exit.
    - [x] If not: start the socket listener and the app.
- **Verification:** Second instance launch now forwards file paths to the primary instance.
- **Verification:** Open Otterly, then double-click an `.md` file in Finder; verify it opens as a new tab in the existing window.

## Success Criteria
- [ ] 0% file corruption reports due to tearing.
- [ ] Successful rendering of non-UTF-8 files.
- [ ] Instant opening of files > 10MB in the Document Viewer.
- [ ] Unified CLI execution logic for AI and standard tools.
