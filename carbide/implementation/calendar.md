# Calendar Utility — Implementation Plan

## Decision Log

| #   | Decision                                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Port Lokus Rust backend verbatim into `src-tauri/src/features/calendar/`                                  | The Lokus backend is production-tested, handles all OAuth PKCE, CalDAV WebDAV, iCal parsing, deduplication, and keyring credential storage. Both apps target Tauri 2 on the same platforms. The cost of rewriting from scratch dwarfs the adaptation cost (~200 LOC surface changes).                                                 |
| D2  | Full frontend rewrite from React to Svelte 5; no React-to-Svelte bridge                                   | Lokus React hooks/context have no mechanical translation to Svelte 5 $state. The hook logic maps cleanly to CalendarStore + CalendarService. Attempting to run React code in a Svelte app would be architecturally unsound and untestable.                                                                                            |
| D3  | Calendar events stored in a dedicated per-vault SQLite table, not in the main notes DB                    | Calendar data has a different access pattern (time-range queries, recurring events, provider-specific metadata) from notes/FTS. Sharing the notes DB schema risks coupling two orthogonal domains. Use the same DB file but a clearly scoped schema namespace (`calendar_events`, `calendars`).                                       |
| D4  | Local-only events first (Phase 1); sync added in Phase 3                                                  | Shipping local CRUD validates the entire frontend architecture (store, service, actions, UI) without the OAuth + network complexity. De-risks Phase 3 by ensuring the data layer is solid before layering sync on top.                                                                                                                |
| D5  | `date-fns` v4 for all date manipulation; no `dayjs`, no native `Date` arithmetic                          | Lokus already uses `date-fns` v4.1.0. Tree-shakeable, immutable, no prototype pollution, full TypeScript support. Consistent with Lokus precedent. Avoid mixing two date libraries.                                                                                                                                                   |
| D6  | CalendarStore holds normalized event map (`Map<string, CalendarEvent>`), not a raw array                  | O(1) lookup by ID for update/delete mutations. Avoids repeated `.find()` across the event list. Derived sorted arrays are cheap with `$derived`.                                                                                                                                                                                      |
| D7  | Sync reactor polls on a configurable interval; not a persistent WebSocket or SSE stream                   | Calendar APIs (Google, CalDAV) are request/response. A reactor watching sync config store changes fires a background sync. Interval-based polling is appropriate and matches Lokus's sync engine design.                                                                                                                              |
| D8  | iCal subscriptions are read-only in the UI; no write-back to remote `.ics` feeds                          | RFC 5545 iCal feeds are HTTP GET resources. Writing back is not part of the iCalendar subscription model. Users who want write access should use the CalDAV or Google Calendar provider.                                                                                                                                              |
| D9  | Event deduplication is provider-side (Rust) with a deterministic fingerprint; frontend shows merged view  | Deduplication logic is non-trivial and already implemented in `sync/dedup.rs` and `sync/fingerprint.rs`. Keeping it in Rust avoids shipping fingerprint logic to the frontend and keeps the canonical deduplicated list server-authoritative.                                                                                         |
| D10 | Task-calendar integration uses a `ScheduleBlock` join entity; no direct mutation of task or event records | Linking tasks to calendar time slots should not mutate either entity's canonical identity. A `ScheduleBlock { task_id, event_id, vault_id }` join table expresses the relationship without coupling the task domain to the calendar domain.                                                                                           |
| D11 | Month/week/day views are separate Svelte components sharing a single `CalendarViewStore` for navigation   | Each view has distinct rendering logic (grid layout, hour rows, day columns). Separating them avoids one fat component with complex conditionals. Shared store ensures consistent date navigation (prev/next/today).                                                                                                                  |
| D12 | OAuth redirect URI uses a Tauri deep link (`carbide://auth/calendar/callback`) not `localhost`            | `localhost` redirect requires spinning up an HTTP server in the app. Deep links integrate cleanly with Tauri 2's `tauri-plugin-deep-link`. Matches Lokus's approach and avoids port conflicts.                                                                                                                                        |
| D13 | Use `@event-calendar/core` (vkurko/calendar) for calendar grid views; not hand-rolled                     | MIT, native Svelte 5 (v4.0+), ~33KB brotli, modular plugins (day-grid, time-grid, interaction). Eliminates ~600 LOC of grid layout code. Reactive options object maps directly to `$state` stores. Battle-tested on 70K+ sites.                                                                                                       |
| D14 | Calendar is a core feature module, not a Carbide plugin                                                   | The plugin system uses iframe sandbox + postMessage RPC — serializing every event render and drag interaction across the boundary would kill performance. `@event-calendar/core` is a Svelte component that needs reactive `$state` prop binding. Calendar belongs alongside `graph`, `canvas`, `editor` as a vertical feature slice. |

---

## Rejected Alternatives

| Alternative                                                    | Why Rejected                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fullcalendar` (JS library)                                    | Heavy dependency (~150KB gzip). Designed for React/Angular/Vue, not Svelte. Would fight the architecture (events managed externally, not in stores).                                                                                      |
| `cal-heatmap` for event visualization                          | Heatmap is the wrong primitive for a calendar utility; not appropriate for event scheduling views.                                                                                                                                        |
| Store events only in `calendar_events` SQLite table            | Already selected this. Rejected alternative was: store events only in memory (CalendarStore). Memory-only events are lost on restart, breaking local CRUD.                                                                                |
| Sharing `notes` DB connection pool for calendar                | The notes DB schema would need calendar migrations added to it, coupling unrelated features. Use the same DB file but separate migration management.                                                                                      |
| Exposing sync as a Svelte `$effect` in a component             | Components must not import services (layering rule 6). Sync scheduling belongs in a Reactor.                                                                                                                                              |
| Single universal `CalendarEvent` for all providers             | Provider-specific fields (Google `htmlLink`, CalDAV `etag`, iCal `url`) cannot be cleanly unified without an opaque `metadata: Record<string, unknown>`.                                                                                  |
| Using `tauri-plugin-oauth` for Google auth                     | Plugin is alpha, unmaintained in 2025. Lokus implements PKCE flow directly with `tauri-plugin-http` + deep link callback — portable and battle-tested.                                                                                    |
| Embedding calendar in the editor as ProseMirror node           | Overcomplicated. Calendar is a first-class feature panel/tab, not an editor extension.                                                                                                                                                    |
| Wiring calendar through Carbide plugin system (iframe sandbox) | Plugin system designed for third-party sandboxed extensions. iframe boundary adds serialization overhead for every event render/drag/navigate. Kills Svelte 5 `$state` reactivity. Calendar is a core feature like graph/canvas/editor.   |
| Hand-rolled month/week/day grid components                     | `@event-calendar/core` provides production-grade grid layout, viewport management, event overlap resolution, and drag interaction for ~33KB. Rewriting this from scratch is ~600 LOC of non-trivial layout math with diminishing returns. |

---

## Portability Assessment

### Rust Backend — High portability

| Module                        | Portability | Est. LOC (Lokus) | Adaptation needed                                                                                  | Effort |
| ----------------------------- | ----------- | ---------------- | -------------------------------------------------------------------------------------------------- | ------ |
| `models.rs`                   | Copy-as-is  | ~300             | None; pure type definitions                                                                        | 0.5h   |
| `storage.rs`                  | Minimal     | ~250             | Replace Lokus `AppHandle` state key names; adapt `keyring` target identifier                       | 1h     |
| `google/auth.rs`              | Minimal     | ~400             | Update redirect URI to `carbide://auth/calendar/callback`; replace Lokus app name strings          | 1.5h   |
| `google/api.rs`               | Copy-as-is  | ~600             | None; pure HTTP client against Google API                                                          | 0.5h   |
| `caldav/client.rs`            | Copy-as-is  | ~1400            | None; pure WebDAV/CalDAV protocol implementation                                                   | 0.5h   |
| `ical/parser.rs`              | Copy-as-is  | ~350             | None; pure iCalendar parser                                                                        | 0.5h   |
| `sync/engine.rs`              | Minimal     | ~500             | Adapt `AppHandle` state references to Carbide's `AppState` pattern                                 | 1h     |
| `sync/dedup.rs`               | Copy-as-is  | ~300             | None; pure deduplication logic                                                                     | 0.5h   |
| `sync/fingerprint.rs`         | Copy-as-is  | ~150             | None; pure deterministic hashing                                                                   | 0.5h   |
| `sync/storage.rs`             | Minimal     | ~200             | Adapt file path resolution to Carbide's vault data directory convention                            | 1h     |
| Tauri command handlers        | Moderate    | ~400             | Re-register all commands in Carbide's `app/mod.rs` invoke handler; adapt `State<>` type parameters | 3h     |
| SQL schema (`calendar_*.sql`) | Moderate    | ~150             | Carbide uses per-vault SQLite with a migration runner; integrate into the vault migration sequence | 2h     |

**Total Rust: ~5050 LOC copied, ~11h adaptation**

### Frontend — Full rewrite required

| Lokus React component/hook               | Carbide Svelte equivalent                               | Est. LOC to write | Notes                                                                |
| ---------------------------------------- | ------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| `CalendarContext` + `useCalendar`        | `CalendarStore` + `CalendarService`                     | ~200              | React context → Svelte $state class + service                        |
| `useCalendarEvents`                      | `CalendarStore.events` + `CalendarService`              | ~80               | Derived map in store; load logic in service                          |
| `useUpcomingEvents`                      | `$derived` in `CalendarStore`                           | ~40               | Pure derivation from event map + current time                        |
| `useDeduplicatedEvents`                  | `CalendarService.load_deduplicated()`                   | ~60               | Calls `get_all_events_deduplicated` Tauri command                    |
| `useSyncConfig` + sync controls          | `SyncReactor` + `calendar_actions`                      | ~120              | Reactor replaces hook effect; actions replace callbacks              |
| `MonthView`, `WeekView`, `DayView`       | `calendar_panel.svelte` wrapping `@event-calendar/core` | ~100              | Library handles grid layout; we provide reactive options + theme CSS |
| Drag-to-schedule (tasks onto time slots) | `time_block_actions.ts` + `drop_zone.svelte`            | ~300              | Svelte 5 drag events + `ScheduleBlock` service method                |
| Upcoming events sidebar widget           | `upcoming_events_widget.svelte`                         | ~150              | Derived from `CalendarStore.upcoming_events`                         |

**Total Frontend: ~1050 LOC new**

---

## A. Data Structures

### Rust types (`src-tauri/src/features/calendar/models.rs`)

```rust
// Portability: copy verbatim from Lokus models.rs

pub enum CalendarProvider {
    Google,
    CalDAV,
    ICloud,
    ICal,
    Local,
}

pub struct Calendar {
    pub id: String,
    pub name: String,
    pub provider: CalendarProvider,
    pub color: Option<String>,
    pub read_only: bool,
    pub enabled: bool,
}

pub struct CalendarEvent {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub all_day: bool,
    pub location: Option<String>,
    pub recurrence_rule: Option<String>,
    pub provider_event_id: Option<String>,
    pub etag: Option<String>,
    pub url: Option<String>,
    pub read_only: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct DeduplicatedEvent {
    pub canonical: CalendarEvent,
    pub duplicates: Vec<String>,  // provider_event_ids
}

pub struct SyncConfig {
    pub vault_id: String,
    pub auto_sync: bool,
    pub sync_interval_minutes: u32,
    pub sync_past_days: u32,
    pub sync_future_days: u32,
    pub last_synced_at: Option<DateTime<Utc>>,
}

pub struct ICalSubscription {
    pub id: String,
    pub name: String,
    pub url: String,
    pub last_fetched_at: Option<DateTime<Utc>>,
    pub event_count: usize,
}

pub struct CalDAVAccount {
    pub id: String,
    pub display_name: String,
    pub server_url: String,
    pub username: String,
    pub calendars: Vec<Calendar>,
}

pub struct ScheduleBlock {
    pub id: String,
    pub vault_id: String,
    pub task_id: String,
    pub event_id: String,
    pub created_at: DateTime<Utc>,
}
```

### TypeScript types (`src/lib/features/calendar/types/`)

```typescript
// calendar_event.ts
export type CalendarProvider =
  | "google"
  | "caldav"
  | "icloud"
  | "ical"
  | "local";

export interface Calendar {
  id: string;
  name: string;
  provider: CalendarProvider;
  color: string | null;
  read_only: boolean;
  enabled: boolean;
}

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  start: string; // ISO 8601
  end: string; // ISO 8601
  all_day: boolean;
  location: string | null;
  recurrence_rule: string | null;
  provider_event_id: string | null;
  etag: string | null;
  url: string | null;
  read_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeduplicatedEvent {
  canonical: CalendarEvent;
  duplicates: string[];
}

export interface SyncConfig {
  vault_id: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
  sync_past_days: number;
  sync_future_days: number;
  last_synced_at: string | null;
}

export interface ICalSubscription {
  id: string;
  name: string;
  url: string;
  last_fetched_at: string | null;
  event_count: number;
}

export interface CalDAVAccount {
  id: string;
  display_name: string;
  server_url: string;
  username: string;
  calendars: Calendar[];
}

export interface ScheduleBlock {
  id: string;
  vault_id: string;
  task_id: string;
  event_id: string;
  created_at: string;
}

export type CalendarViewMode = "month" | "week" | "day";

export interface CalendarDateRange {
  start: Date;
  end: Date;
}
```

---

## B. Backend Changes

### SQL Schema (`src-tauri/src/features/calendar/migrations/`)

```sql
-- 001_calendar_tables.sql
CREATE TABLE IF NOT EXISTS calendars (
    id          TEXT PRIMARY KEY,
    vault_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    provider    TEXT NOT NULL CHECK (provider IN ('google','caldav','icloud','ical','local')),
    color       TEXT,
    read_only   INTEGER NOT NULL DEFAULT 0,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id                  TEXT PRIMARY KEY,
    calendar_id         TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    vault_id            TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    start_time          TEXT NOT NULL,  -- ISO 8601 UTC
    end_time            TEXT NOT NULL,  -- ISO 8601 UTC
    all_day             INTEGER NOT NULL DEFAULT 0,
    location            TEXT,
    recurrence_rule     TEXT,
    provider_event_id   TEXT,
    etag                TEXT,
    url                 TEXT,
    read_only           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE(calendar_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_vault_time
    ON calendar_events (vault_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id
    ON calendar_events (calendar_id);

CREATE TABLE IF NOT EXISTS sync_configs (
    vault_id                TEXT PRIMARY KEY,
    auto_sync               INTEGER NOT NULL DEFAULT 1,
    sync_interval_minutes   INTEGER NOT NULL DEFAULT 30,
    sync_past_days          INTEGER NOT NULL DEFAULT 14,
    sync_future_days        INTEGER NOT NULL DEFAULT 90,
    last_synced_at          TEXT
);

CREATE TABLE IF NOT EXISTS ical_subscriptions (
    id              TEXT PRIMARY KEY,
    vault_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    last_fetched_at TEXT,
    event_count     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
    id          TEXT PRIMARY KEY,
    vault_id    TEXT NOT NULL,
    task_id     TEXT NOT NULL,
    event_id    TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    UNIQUE(task_id, event_id)
);
```

### Rust modules (`src-tauri/src/features/calendar/`)

```
calendar/
├── mod.rs                    # Re-exports; registers commands and managed state
├── models.rs                 # All types (port from Lokus)
├── storage.rs                # Keyring credential store (port from Lokus; adapt app name)
├── db.rs                     # SQLite queries: CRUD for events, calendars, sync_config
├── commands.rs               # All #[tauri::command] handlers (port + re-register)
├── google/
│   ├── mod.rs
│   ├── auth.rs               # OAuth PKCE flow (port from Lokus; update redirect URI)
│   └── api.rs                # Google Calendar REST client (port verbatim)
├── caldav/
│   ├── mod.rs
│   └── client.rs             # WebDAV/CalDAV protocol client (port verbatim)
├── ical/
│   ├── mod.rs
│   └── parser.rs             # RFC 5545 iCalendar parser (port verbatim)
└── sync/
    ├── mod.rs
    ├── engine.rs             # Sync orchestration (port from Lokus; adapt state types)
    ├── dedup.rs              # Deduplication (port verbatim)
    ├── fingerprint.rs        # Event fingerprinting (port verbatim)
    └── storage.rs            # Sync state persistence (port from Lokus; adapt path resolution)
```

### `db.rs` key functions

```rust
// Read
pub fn get_calendars(db: &Connection, vault_id: &str) -> Result<Vec<Calendar>>
pub fn get_events_in_range(db: &Connection, vault_id: &str, start: DateTime<Utc>, end: DateTime<Utc>) -> Result<Vec<CalendarEvent>>
pub fn get_all_events(db: &Connection, vault_id: &str) -> Result<Vec<CalendarEvent>>
pub fn get_sync_config(db: &Connection, vault_id: &str) -> Result<SyncConfig>

// Write
pub fn upsert_event(db: &Connection, event: &CalendarEvent) -> Result<()>
pub fn delete_event(db: &Connection, vault_id: &str, event_id: &str) -> Result<()>
pub fn upsert_calendar(db: &Connection, calendar: &Calendar) -> Result<()>
pub fn upsert_sync_config(db: &Connection, config: &SyncConfig) -> Result<()>
pub fn upsert_schedule_block(db: &Connection, block: &ScheduleBlock) -> Result<()>
pub fn delete_schedule_block(db: &Connection, task_id: &str, event_id: &str) -> Result<()>
pub fn get_schedule_blocks_for_task(db: &Connection, task_id: &str) -> Result<Vec<ScheduleBlock>>
```

### Tauri commands (`src-tauri/src/features/calendar/commands.rs`)

**Auth:**

- `calendar_google_auth_start(app: AppHandle) -> Result<String, String>` — returns authorization URL
- `calendar_google_auth_complete(app: AppHandle, code: String, state: String) -> Result<(), String>`
- `calendar_google_auth_status(app: AppHandle) -> Result<bool, String>`
- `calendar_disconnect(app: AppHandle, provider: String) -> Result<(), String>`

**Events (local):**

- `calendar_get_events(app: AppHandle, vault_id: String, start: String, end: String) -> Result<Vec<CalendarEvent>, String>`
- `calendar_create_event(app: AppHandle, vault_id: String, event: CalendarEvent) -> Result<CalendarEvent, String>`
- `calendar_update_event(app: AppHandle, vault_id: String, event: CalendarEvent) -> Result<CalendarEvent, String>`
- `calendar_delete_event(app: AppHandle, vault_id: String, event_id: String) -> Result<(), String>`

**Sync:**

- `calendar_sync(app: AppHandle, vault_id: String) -> Result<(), String>`
- `calendar_sync_full(app: AppHandle, vault_id: String) -> Result<(), String>`
- `calendar_get_sync_status(app: AppHandle, vault_id: String) -> Result<SyncStatus, String>`
- `calendar_get_sync_config(app: AppHandle, vault_id: String) -> Result<SyncConfig, String>`
- `calendar_set_sync_config(app: AppHandle, config: SyncConfig) -> Result<(), String>`
- `calendar_get_events_deduplicated(app: AppHandle, vault_id: String) -> Result<Vec<DeduplicatedEvent>, String>`

**iCal:**

- `calendar_ical_add_subscription(app: AppHandle, vault_id: String, name: String, url: String) -> Result<ICalSubscription, String>`
- `calendar_ical_import_file(app: AppHandle, vault_id: String, path: String) -> Result<usize, String>`
- `calendar_ical_remove_subscription(app: AppHandle, vault_id: String, id: String) -> Result<(), String>`
- `calendar_ical_get_subscriptions(app: AppHandle, vault_id: String) -> Result<Vec<ICalSubscription>, String>`
- `calendar_ical_sync_all(app: AppHandle, vault_id: String) -> Result<(), String>`

**CalDAV:**

- `calendar_caldav_connect(app: AppHandle, server_url: String, username: String, password: String) -> Result<CalDAVAccount, String>`
- `calendar_caldav_is_connected(app: AppHandle) -> Result<bool, String>`
- `calendar_caldav_get_account(app: AppHandle) -> Result<Option<CalDAVAccount>, String>`
- `calendar_caldav_disconnect(app: AppHandle) -> Result<(), String>`
- `calendar_caldav_refresh_calendars(app: AppHandle) -> Result<Vec<Calendar>, String>`

**Task-Calendar:**

- `calendar_create_schedule_block(app: AppHandle, vault_id: String, task_id: String, event_id: String) -> Result<ScheduleBlock, String>`
- `calendar_delete_schedule_block(app: AppHandle, task_id: String, event_id: String) -> Result<(), String>`
- `calendar_get_schedule_blocks_for_task(app: AppHandle, task_id: String) -> Result<Vec<ScheduleBlock>, String>`

### Registration (`src-tauri/src/app/mod.rs`)

Add to `.invoke_handler(tauri::generate_handler![...])`:
all `calendar_*` commands from `crate::features::calendar::commands::*`

Add deep link handler for `carbide://auth/calendar/callback` routing to `google/auth.rs` completion logic.

---

## C. Frontend Changes

### Feature directory (`src/lib/features/calendar/`)

```
calendar/
├── index.ts                              # Public entrypoint; re-exports for cross-feature use
├── ports.ts                              # CalendarPort interface (all IPC contracts)
├── types/
│   ├── calendar_event.ts                 # All shared TypeScript types
│   └── calendar_service_result.ts        # Result types for service methods
├── state/
│   ├── calendar_store.svelte.ts          # CalendarStore: events, calendars, view state
│   └── calendar_view_store.svelte.ts     # CalendarViewStore: active date, view mode
├── application/
│   ├── calendar_service.ts               # Async use-cases: load, create, update, delete, sync
│   ├── calendar_sync_service.ts          # Sync-specific operations, separated for clarity
│   ├── calendar_actions.ts               # Action registry entries
│   └── time_block_service.ts             # ScheduleBlock CRUD
├── domain/
│   ├── event_utils.ts                    # Pure date/event helpers (uses date-fns)
│   ├── ec_options.ts                     # Pure: build @event-calendar/core options from store state
│   └── upcoming_events.ts               # Pure: filter/sort events for upcoming widget
├── adapters/
│   └── calendar_tauri_adapter.ts         # Implements CalendarPort via tauri invoke calls
└── ui/
    ├── calendar_panel.svelte             # Top-level panel: wraps @event-calendar/core + toolbar
    ├── calendar_toolbar.svelte           # Prev/next/today navigation + view mode toggle
    ├── event_chip.svelte                 # Single event chip (used across all views)
    ├── event_detail_popover.svelte       # Click-to-expand event details
    ├── event_form_dialog.svelte          # Create/edit event modal
    ├── calendar_sidebar.svelte           # Calendar list, provider toggles
    ├── sync_settings_panel.svelte        # Sync config, provider connect/disconnect
    ├── ical_subscription_panel.svelte    # iCal URL subscriptions management
    ├── drop_zone.svelte                  # Droppable time slot (for task scheduling)
    └── upcoming_events_widget.svelte     # Compact upcoming events for main sidebar
```

### `ports.ts`

```typescript
export interface CalendarPort {
  // Events
  get_events(
    vault_id: string,
    start: string,
    end: string,
  ): Promise<CalendarEvent[]>;
  create_event(
    vault_id: string,
    event: Omit<CalendarEvent, "id" | "created_at" | "updated_at">,
  ): Promise<CalendarEvent>;
  update_event(vault_id: string, event: CalendarEvent): Promise<CalendarEvent>;
  delete_event(vault_id: string, event_id: string): Promise<void>;
  get_events_deduplicated(vault_id: string): Promise<DeduplicatedEvent[]>;

  // Calendars
  get_calendars(vault_id: string): Promise<Calendar[]>;

  // Sync
  sync(vault_id: string): Promise<void>;
  sync_full(vault_id: string): Promise<void>;
  get_sync_status(vault_id: string): Promise<SyncStatus>;
  get_sync_config(vault_id: string): Promise<SyncConfig>;
  set_sync_config(config: SyncConfig): Promise<void>;

  // Auth
  google_auth_start(): Promise<string>;
  google_auth_complete(code: string, state: string): Promise<void>;
  google_auth_status(): Promise<boolean>;
  disconnect(provider: string): Promise<void>;

  // iCal
  ical_add_subscription(
    vault_id: string,
    name: string,
    url: string,
  ): Promise<ICalSubscription>;
  ical_import_file(vault_id: string, path: string): Promise<number>;
  ical_remove_subscription(vault_id: string, id: string): Promise<void>;
  ical_get_subscriptions(vault_id: string): Promise<ICalSubscription[]>;
  ical_sync_all(vault_id: string): Promise<void>;

  // CalDAV
  caldav_connect(
    server_url: string,
    username: string,
    password: string,
  ): Promise<CalDAVAccount>;
  caldav_is_connected(): Promise<boolean>;
  caldav_get_account(): Promise<CalDAVAccount | null>;
  caldav_disconnect(): Promise<void>;
  caldav_refresh_calendars(): Promise<Calendar[]>;

  // Schedule Blocks
  create_schedule_block(
    vault_id: string,
    task_id: string,
    event_id: string,
  ): Promise<ScheduleBlock>;
  delete_schedule_block(task_id: string, event_id: string): Promise<void>;
  get_schedule_blocks_for_task(task_id: string): Promise<ScheduleBlock[]>;
}
```

### `state/calendar_store.svelte.ts`

```typescript
export class CalendarStore {
  events = $state<Map<string, CalendarEvent>>(new Map());
  calendars = $state<Calendar[]>([]);
  deduplicated_events = $state<DeduplicatedEvent[]>([]);
  ical_subscriptions = $state<ICalSubscription[]>([]);
  caldav_account = $state<CalDAVAccount | null>(null);
  google_connected = $state(false);
  sync_config = $state<SyncConfig | null>(null);

  // Derived
  readonly events_sorted = $derived(
    [...this.events.values()].sort((a, b) => a.start.localeCompare(b.start)),
  );
  readonly upcoming_events = $derived(
    get_upcoming_events(this.events_sorted, 7), // next 7 days; pure fn from domain/
  );

  // Mutations (called by CalendarService only)
  set_events(events: CalendarEvent[]): void;
  upsert_event(event: CalendarEvent): void;
  remove_event(id: string): void;
  set_calendars(calendars: Calendar[]): void;
  set_sync_config(config: SyncConfig): void;
  set_google_connected(connected: boolean): void;
  set_caldav_account(account: CalDAVAccount | null): void;
  set_ical_subscriptions(subs: ICalSubscription[]): void;
}
```

### `state/calendar_view_store.svelte.ts`

```typescript
export class CalendarViewStore {
  view_mode = $state<CalendarViewMode>("month");
  active_date = $state<Date>(new Date());
  selected_event_id = $state<string | null>(null);
  is_event_form_open = $state(false);
  editing_event = $state<CalendarEvent | null>(null);

  readonly current_range = $derived(
    get_date_range(this.active_date, this.view_mode), // pure fn from domain/event_utils.ts
  );

  navigate_prev(): void;
  navigate_next(): void;
  navigate_today(): void;
  set_view_mode(mode: CalendarViewMode): void;
  select_event(id: string | null): void;
  open_event_form(event?: CalendarEvent): void;
  close_event_form(): void;
}
```

`view_mode` maps to `@event-calendar/core`'s `view` option (`dayGridMonth`, `timeGridWeek`, `timeGridDay`). `active_date` maps to the library's `date` option. `selected_event_id` is handled via the library's `eventClick` callback. `current_range` remains useful for fetching events from the backend for the visible window.

### `calendar_panel.svelte` — wiring `@event-calendar/core`

```svelte
<script>
  import Calendar from "@event-calendar/core";
  import DayGrid from "@event-calendar/day-grid";
  import TimeGrid from "@event-calendar/time-grid";
  import Interaction from "@event-calendar/interaction";

  // Props from CalendarStore + CalendarViewStore (passed via context)
  let { calendar_store, view_store } = $props();

  const plugins = [DayGrid, TimeGrid, Interaction];

  const options = $derived(build_ec_options(calendar_store, view_store));
</script>

<Calendar {plugins} {options} />
```

`build_ec_options` lives in `domain/ec_options.ts` — a pure function that maps store state to the library's options object (events array, view string, date, callbacks for eventClick, eventDrop, eventResize, etc.).

### `application/calendar_service.ts` key methods

```typescript
class CalendarService {
  async load_events(vault_id: string): Promise<void>;
  async load_events_for_range(
    vault_id: string,
    range: CalendarDateRange,
  ): Promise<void>;
  async create_event(
    vault_id: string,
    data: EventFormData,
  ): Promise<CalendarEvent>;
  async update_event(
    vault_id: string,
    event: CalendarEvent,
  ): Promise<CalendarEvent>;
  async delete_event(vault_id: string, event_id: string): Promise<void>;
  async load_calendars(vault_id: string): Promise<void>;
  async load_sync_config(vault_id: string): Promise<void>;
}
```

### `application/calendar_sync_service.ts` key methods

```typescript
class CalendarSyncService {
  async sync(vault_id: string): Promise<void>;
  async sync_full(vault_id: string): Promise<void>;
  async connect_google(vault_id: string): Promise<void>;
  async disconnect_provider(vault_id: string, provider: string): Promise<void>;
  async set_sync_config(config: SyncConfig): Promise<void>;
  async add_ical_subscription(
    vault_id: string,
    name: string,
    url: string,
  ): Promise<void>;
  async remove_ical_subscription(vault_id: string, id: string): Promise<void>;
  async sync_ical(vault_id: string): Promise<void>;
  async connect_caldav(
    vault_id: string,
    server_url: string,
    username: string,
    password: string,
  ): Promise<void>;
  async disconnect_caldav(): Promise<void>;
}
```

### `application/time_block_service.ts`

```typescript
class TimeBlockService {
  async create_schedule_block(
    vault_id: string,
    task_id: string,
    event_id: string,
  ): Promise<ScheduleBlock>;
  async delete_schedule_block(task_id: string, event_id: string): Promise<void>;
  async load_schedule_blocks_for_task(
    task_id: string,
  ): Promise<ScheduleBlock[]>;
}
```

### Action IDs (`application/calendar_actions.ts`)

```typescript
export const CALENDAR_ACTIONS = {
  OPEN_CALENDAR_PANEL: "calendar.open_panel",
  LOAD_EVENTS: "calendar.load_events",
  CREATE_EVENT: "calendar.create_event",
  UPDATE_EVENT: "calendar.update_event",
  DELETE_EVENT: "calendar.delete_event",
  SYNC_CALENDARS: "calendar.sync",
  SYNC_FULL: "calendar.sync_full",
  CONNECT_GOOGLE: "calendar.connect_google",
  DISCONNECT_PROVIDER: "calendar.disconnect_provider",
  ADD_ICAL_SUBSCRIPTION: "calendar.ical.add_subscription",
  REMOVE_ICAL_SUBSCRIPTION: "calendar.ical.remove_subscription",
  SYNC_ICAL: "calendar.ical.sync_all",
  CONNECT_CALDAV: "calendar.caldav.connect",
  DISCONNECT_CALDAV: "calendar.caldav.disconnect",
  NAVIGATE_PREV: "calendar.view.prev",
  NAVIGATE_NEXT: "calendar.view.next",
  NAVIGATE_TODAY: "calendar.view.today",
  SET_VIEW_MODE: "calendar.view.set_mode",
  CREATE_SCHEDULE_BLOCK: "calendar.schedule_block.create",
  DELETE_SCHEDULE_BLOCK: "calendar.schedule_block.delete",
} as const;
```

### Sync Reactor (`src/lib/reactors/calendar_sync_reactor.ts`)

```typescript
// $effect.root() observer:
// Watches CalendarStore.sync_config.auto_sync + sync_interval_minutes
// Clears and re-sets a setInterval calling CalendarSyncService.sync(vault_id)
// Fires immediate sync on vault open (watches VaultStore.active_vault_id)
// Cancels interval on vault close
```

---

## Calendar Sync Difficulty Assessment

### Google Calendar — High complexity

**Challenges:**

- OAuth 2.0 PKCE flow requires a deep link callback handler (`carbide://auth/calendar/callback`) registered with macOS/Windows/Linux
- Refresh token rotation: tokens expire in 1 hour; silent re-auth must happen transparently before sync
- Quota management: Google Calendar API has per-user rate limits (1 million queries/day, 10 queries/second). Batch operations reduce quota consumption
- Incremental sync uses `syncToken` — full re-fetch required when token expires. Engine must detect HTTP 410 Gone and fall back gracefully
- Event deletions are represented by `status: "cancelled"` entries, not absent records

**Lokus solution:** `google/auth.rs` implements PKCE with PKCE verifier generation, code exchange, and keyring-persisted token storage with automatic refresh. `google/api.rs` implements `syncToken`-based incremental sync with 410 fallback. **This is the primary reason to port the Lokus backend rather than rewrite it.**

### CalDAV — Very high complexity

**Challenges:**

- WebDAV is a superset of HTTP with custom methods (`REPORT`, `PROPFIND`, `MKCALENDAR`). Requires careful HTTP client configuration
- iCloud CalDAV is particularly non-standard: uses a different base URL discovery mechanism, requires app-specific passwords (not account password), returns Apple-specific extensions
- Server compatibility varies (iCloud, Fastmail, Nextcloud, Radicale all have quirks)
- `If-Match` ETags required for conflict-safe updates; stale ETags cause 412 Precondition Failed
- VTIMEZONE objects in iCal payloads must be parsed and stored for correct recurrence expansion
- Recurrence rule (RRULE) expansion is complex; recurring events need date-range-aware expansion at query time

**Lokus solution:** `caldav/client.rs` (~1400 LOC) handles all WebDAV methods, ETag tracking, iCloud-specific discovery, and RRULE expansion via `icalendar` crate. **Copy verbatim.**

### iCal subscriptions — Low complexity

**Challenges:**

- HTTP GET of `.ics` file; parse RFC 5545; insert events into DB
- Read-only by nature; no write-back
- URLs may require authentication (Basic Auth) in some cases
- VTIMEZONE and RRULE handling same as CalDAV
- Large feeds (public holiday calendars) can have thousands of events

**Lokus solution:** `ical/parser.rs` handles RFC 5545 parsing via the `icalendar` crate. **Copy verbatim.** Add Basic Auth support in Phase 4 if needed.

### Cross-provider deduplication — Moderate complexity

**Challenges:**

- Same event can appear in Google Calendar and a CalDAV subscription to the same underlying calendar
- No shared canonical ID across providers; must fingerprint by (title, start, end, all_day)
- Fuzzy matching needed for minor title edits or timezone normalization differences
- Conflict resolution: when two providers have conflicting edits, last-write-wins is the default

**Lokus solution:** `sync/fingerprint.rs` generates deterministic SHA-256 hashes from normalized event fields. `sync/dedup.rs` groups events by fingerprint and elects a canonical record (preferring the provider with write access). **Copy verbatim.**

---

## D. Edge Cases & Invariants

| #   | Invariant / Edge Case                                           | Handling                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | OAuth token refresh fails (revoked access, network error)       | `sync_calendars` returns `Err`; OpStore records error; UI shows "Re-authorize Google" prompt                                                                                                                        |
| E2  | Event create on a read-only calendar (iCal subscription)        | `CalendarPort.create_event` rejects at the service layer before sending IPC; UI disables create button for read-only cals                                                                                           |
| E3  | Sync while offline                                              | Rust sync command returns `Err("Network unavailable")`; OpStore records it; auto-sync reactor backs off with next interval                                                                                          |
| E4  | Vault changes while sync is in progress                         | Sync operates on a snapshot of the vault_id; vault close does not cancel in-flight sync; next open sees stale data at worst                                                                                         |
| E5  | CalDAV ETag conflict (412 Precondition Failed)                  | Re-fetch the server version, present conflict UI, let user choose local or remote                                                                                                                                   |
| E6  | iCal feed returns malformed `.ics`                              | Parser returns partial results + error list; successfully parsed events are inserted; malformed blocks are skipped                                                                                                  |
| E7  | Duplicate events from overlapping Google + CalDAV same calendar | Deduplication fingerprint collapses them to one canonical event in the deduplicated view; raw view shows both                                                                                                       |
| E8  | Event spanning midnight (all-day vs time-bounded)               | `all_day` flag normalized at import; multi-day events stored with inclusive start/exclusive end per RFC 5545. Multi-day spanning and overflow indicators in the grid are library-managed by `@event-calendar/core`. |
| E9  | `delete_event` on a recurring event instance                    | Show dialog: delete this occurrence only vs delete all future vs delete all. Translate to appropriate EXDATE/RRULE mutation                                                                                         |
| E10 | ScheduleBlock references a deleted event                        | `ON DELETE CASCADE` in SQL; when event is deleted, schedule blocks are automatically removed                                                                                                                        |
| E11 | Google 410 (sync token expired)                                 | Engine detects HTTP 410, clears syncToken, performs full re-fetch, reinserts all events                                                                                                                             |
| E12 | Multiple vaults open, sync triggered in wrong vault context     | All commands take explicit `vault_id`; no ambient vault state in Rust                                                                                                                                               |
| E13 | Calendar view date range straddles DST boundary                 | All storage in UTC; `date-fns` DST-aware helpers for display conversion                                                                                                                                             |
| E14 | User creates event with end before start                        | Validation in `calendar_service.ts` before IPC; `end` snapped to `start + 1 hour` minimum                                                                                                                           |

---

## E. Test Scenarios

### Phase 1: Local CRUD

**Scenario: Create a local event**

- Given: a vault is open, CalendarStore is initialized, a "Local" calendar exists
- When: user submits the event form with title "Team standup", start 9:00 AM, end 9:30 AM
- Then: `calendar_create_event` IPC succeeds, `CalendarStore.events` contains the new event, it appears in the week view in the correct time slot

**Scenario: Delete a local event**

- Given: CalendarStore contains event `e1`
- When: user clicks delete on event `e1` and confirms
- Then: `calendar_delete_event` IPC succeeds, `CalendarStore.events` no longer contains `e1`, the event chip disappears from the view

**Scenario: Navigate month view prev/next**

- Given: CalendarViewStore active_date is March 2026
- When: user clicks "Previous"
- Then: `active_date` is February 2026, month grid renders February dates, `current_range` spans Feb 1–Feb 28

### Phase 2: View rendering

**Scenario: Week view shows events in correct column and row**

- Given: CalendarStore has event on Tuesday 2026-03-17 at 14:00 UTC; view_store is week mode for the week of March 15
- When: `build_ec_options` produces options with the event
- Then: `@event-calendar/core` renders event in the correct column/row (visual regression test)

**Scenario: Month view shows overflow indicator**

- Given: 5 events exist on March 15
- When: month view renders (cell height limits visible chips)
- Then: cell shows visible chips and a "+N more" overflow indicator — this behavior is library-managed by `@event-calendar/core`'s built-in overflow handling; no custom logic required

### Phase 3: Google Sync

**Scenario: Successful Google auth flow**

- Given: Google Calendar is not connected
- When: user clicks "Connect Google Calendar"
- Then: browser opens Google OAuth page; user authenticates; deep link `carbide://auth/calendar/callback?code=...` fires; `calendar_google_auth_complete` IPC succeeds; `CalendarStore.google_connected` is true

**Scenario: Auto-sync reactor triggers on schedule**

- Given: sync config has `auto_sync: true, sync_interval_minutes: 30`
- When: 30 minutes elapse since last sync
- Then: `calendar_sync` IPC is called automatically; OpStore transitions `pending → success`; new events from Google appear in CalendarStore

**Scenario: Sync with expired OAuth token**

- Given: Google access token is expired; refresh token is valid
- When: sync reactor triggers
- Then: Rust backend silently refreshes token via refresh grant; sync completes; user sees no error

### Phase 4: CalDAV + iCal

**Scenario: Add iCal subscription**

- Given: user has a public `.ics` URL for a holiday calendar
- When: user submits the URL in iCal subscription panel
- Then: `calendar_ical_add_subscription` fetches the URL; events are stored; subscription appears in the sidebar with event count

**Scenario: Deduplication collapses cross-provider duplicates**

- Given: the same event exists in both Google Calendar and a CalDAV server
- When: `get_events_deduplicated` is called
- Then: only one canonical event appears in `CalendarStore.deduplicated_events`; the raw event map still contains both originals

### Phase 5: Task Integration

**Scenario: Drag task onto calendar time slot**

- Given: task "Write report" exists; week view is open; user drags the task chip onto Tuesday 10:00–11:00
- Then: `create_schedule_block` IPC creates a ScheduleBlock; task chip shows a "scheduled" badge; event chip in calendar shows the linked task title

**Scenario: Delete schedule block when event is deleted**

- Given: ScheduleBlock links task `t1` to event `e1`
- When: event `e1` is deleted
- Then: SQL `ON DELETE CASCADE` removes the ScheduleBlock; task `t1` loses its "scheduled" badge

---

## F. Files to Create / Modify

### New files — Rust backend

| Path                                                          | Purpose                                       |
| ------------------------------------------------------------- | --------------------------------------------- |
| `src-tauri/src/features/calendar/mod.rs`                      | Module root; managed state; command exports   |
| `src-tauri/src/features/calendar/models.rs`                   | All Rust types (port from Lokus)              |
| `src-tauri/src/features/calendar/storage.rs`                  | Keyring credential store (port + adapt)       |
| `src-tauri/src/features/calendar/db.rs`                       | SQLite CRUD for calendar tables               |
| `src-tauri/src/features/calendar/commands.rs`                 | All Tauri command handlers                    |
| `src-tauri/src/features/calendar/google/mod.rs`               | Google submodule root                         |
| `src-tauri/src/features/calendar/google/auth.rs`              | OAuth PKCE flow (port + update redirect URI)  |
| `src-tauri/src/features/calendar/google/api.rs`               | Google Calendar API client (port verbatim)    |
| `src-tauri/src/features/calendar/caldav/mod.rs`               | CalDAV submodule root                         |
| `src-tauri/src/features/calendar/caldav/client.rs`            | WebDAV/CalDAV protocol client (port verbatim) |
| `src-tauri/src/features/calendar/ical/mod.rs`                 | iCal submodule root                           |
| `src-tauri/src/features/calendar/ical/parser.rs`              | RFC 5545 iCalendar parser (port verbatim)     |
| `src-tauri/src/features/calendar/sync/mod.rs`                 | Sync submodule root                           |
| `src-tauri/src/features/calendar/sync/engine.rs`              | Sync orchestration (port + adapt state types) |
| `src-tauri/src/features/calendar/sync/dedup.rs`               | Deduplication logic (port verbatim)           |
| `src-tauri/src/features/calendar/sync/fingerprint.rs`         | Event fingerprinting (port verbatim)          |
| `src-tauri/src/features/calendar/sync/storage.rs`             | Sync state persistence (port + adapt paths)   |
| `src-tauri/src/features/calendar/migrations/001_calendar.sql` | Calendar SQL schema                           |

### Modified files — Rust backend

| Path                                     | Change                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `src-tauri/src/features/calendar/mod.rs` | (new) but also referenced in `app/mod.rs`                                     |
| `src-tauri/src/app/mod.rs`               | Register calendar managed state + all `calendar_*` commands in invoke handler |
| `src-tauri/Cargo.toml`                   | Add `keyring`, `icalendar`, `reqwest` (if not present), `uuid` dependencies   |
| `src-tauri/tauri.conf.json`              | Add `carbide://auth/calendar/callback` deep link scheme                       |

### New files — Frontend

| Path                                                             | Purpose                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/features/calendar/index.ts`                             | Public entrypoint                                              |
| `src/lib/features/calendar/ports.ts`                             | CalendarPort interface                                         |
| `src/lib/features/calendar/types/calendar_event.ts`              | All TypeScript types                                           |
| `src/lib/features/calendar/types/calendar_service_result.ts`     | Service result types                                           |
| `src/lib/features/calendar/state/calendar_store.svelte.ts`       | CalendarStore                                                  |
| `src/lib/features/calendar/state/calendar_view_store.svelte.ts`  | CalendarViewStore (navigation, view mode)                      |
| `src/lib/features/calendar/application/calendar_service.ts`      | Event CRUD, loading                                            |
| `src/lib/features/calendar/application/calendar_sync_service.ts` | Sync, auth, provider management                                |
| `src/lib/features/calendar/application/time_block_service.ts`    | ScheduleBlock CRUD                                             |
| `src/lib/features/calendar/application/calendar_actions.ts`      | Action registry entries                                        |
| `src/lib/features/calendar/domain/event_utils.ts`                | Pure date/event helpers                                        |
| `src/lib/features/calendar/domain/ec_options.ts`                 | Builds @event-calendar/core options object from store state    |
| `src/lib/features/calendar/domain/upcoming_events.ts`            | Pure upcoming events filter/sort                               |
| `src/lib/features/calendar/adapters/calendar_tauri_adapter.ts`   | Tauri IPC adapter implementing CalendarPort                    |
| `src/lib/features/calendar/ui/calendar_panel.svelte`             | Top-level calendar panel; wraps @event-calendar/core + toolbar |
| `src/lib/features/calendar/ui/calendar_toolbar.svelte`           | Navigation toolbar                                             |
| `src/lib/features/calendar/ui/event_chip.svelte`                 | Event chip primitive                                           |
| `src/lib/features/calendar/ui/event_detail_popover.svelte`       | Event detail popover                                           |
| `src/lib/features/calendar/ui/event_form_dialog.svelte`          | Create/edit event modal                                        |
| `src/lib/features/calendar/ui/calendar_sidebar.svelte`           | Calendar list + provider toggles                               |
| `src/lib/features/calendar/ui/sync_settings_panel.svelte`        | Sync config UI                                                 |
| `src/lib/features/calendar/ui/ical_subscription_panel.svelte`    | iCal subscription management                                   |
| `src/lib/features/calendar/ui/drop_zone.svelte`                  | Droppable time slot for task scheduling                        |
| `src/lib/features/calendar/ui/upcoming_events_widget.svelte`     | Sidebar upcoming events widget                                 |
| `src/lib/reactors/calendar_sync_reactor.ts`                      | Auto-sync interval reactor                                     |
| `tests/unit/calendar/calendar_store.test.ts`                     | CalendarStore unit tests                                       |
| `tests/unit/calendar/calendar_view_store.test.ts`                | CalendarViewStore unit tests                                   |
| `tests/unit/calendar/event_utils.test.ts`                        | Pure domain function tests                                     |
| `tests/unit/calendar/ec_options.test.ts`                         | Tests for options builder                                      |
| `tests/unit/calendar/upcoming_events.test.ts`                    | Upcoming events filter tests                                   |
| `tests/unit/calendar/calendar_tauri_adapter.test.ts`             | Adapter contract tests (mock invoke)                           |
| `tests/unit/calendar/time_block_service.test.ts`                 | TimeBlockService tests                                         |

### Modified files — Frontend

| Path                                             | Change                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `src/lib/app/bootstrap.ts`                       | Instantiate CalendarStore, CalendarViewStore; wire services |
| `src/lib/app/action_registry.ts`                 | Register all `CALENDAR_ACTIONS`                             |
| `src/lib/reactors/index.ts`                      | Mount `calendar_sync_reactor`                               |
| `src/lib/features/tab/state/tab_store.svelte.ts` | Add `calendar` as a valid tab content type (Phase 2)        |

---

## G. Dependencies

### Rust crates to add (`src-tauri/Cargo.toml`)

| Crate       | Version  | Purpose                                          | Notes                                                             |
| ----------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `keyring`   | `3.x`    | Secure credential storage (macOS Keychain, etc.) | Already in Lokus; single crate for all platforms                  |
| `icalendar` | `0.16.x` | RFC 5545 iCalendar parse + build                 | Pure Rust; used in `ical/parser.rs` and `caldav/client.rs`        |
| `oauth2`    | `4.x`    | OAuth 2.0 + PKCE primitives                      | Used in `google/auth.rs` for code verifier/challenge generation   |
| `reqwest`   | `0.12.x` | HTTP client for Google API + CalDAV + iCal fetch | Feature flags: `json`, `rustls-tls`. Likely already in Cargo.toml |
| `base64`    | `0.22.x` | Base64 encoding for PKCE verifier                | Minimal; often already transitive                                 |
| `sha2`      | `0.10.x` | SHA-256 for event fingerprinting                 | Minimal crypto primitive                                          |

### npm packages to add

| Package                       | Version  | Purpose                                    | Bundle impact            |
| ----------------------------- | -------- | ------------------------------------------ | ------------------------ |
| `date-fns`                    | `^4.1.0` | Date arithmetic, formatting, range helpers | ~13KB gzip (tree-shaken) |
| `@event-calendar/core`        | `^5.4.0` | Calendar grid engine + base styles         | ~15KB gzip               |
| `@event-calendar/day-grid`    | `^5.4.0` | Month view plugin                          | ~5KB gzip                |
| `@event-calendar/time-grid`   | `^5.4.0` | Week/day time grid plugin                  | ~8KB gzip                |
| `@event-calendar/interaction` | `^5.4.0` | Drag-drop + event resize plugin            | ~5KB gzip                |

`date-fns` handles date arithmetic throughout the feature. `@event-calendar/core` and its plugins replace the hand-rolled month/week/day grid components (~600 LOC saved). The library is native Svelte 5, MIT-licensed, and binds directly to `$state`-derived options objects.

---

## H. Performance Targets

| Metric                                         | Target       | Notes                                                                   |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| Initial event load for 90-day window           | < 100ms      | SQLite index scan on `(vault_id, start_time, end_time)`                 |
| Month view render (up to 200 events)           | < 16ms frame | Pure `$derived` computation; no network calls during view render        |
| Google Calendar incremental sync (100 changes) | < 3s         | Single API batch request; bounded by network latency, not local compute |
| iCal subscription fetch (500 events)           | < 2s         | HTTP GET + parse; deterministic for feed size                           |
| CalDAV full sync (300 events across 5 cals)    | < 10s        | WebDAV REPORT queries are not batchable; one per calendar               |
| Deduplication across 1000 events               | < 50ms       | Pure fingerprint hash + grouping; no DB reads                           |
| ScheduleBlock create                           | < 50ms       | Single SQLite INSERT                                                    |
| Memory for CalendarStore (1000 events)         | < 5MB        | Map<string, CalendarEvent>; events are small structs                    |
