import type { WatcherPort } from "$lib/features/watcher/ports";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { normalize_path_key } from "$lib/shared/utils/path";

const log = create_logger("watcher_service");

// A self-write's own FS event arrives within milliseconds; anything later is a
// genuine external write (an agent editing on disk) and must not be swallowed.
// Paired with MAX_DELAY in src-tauri/src/features/watcher/service.rs, which
// debounces change events before emitting them. Invariant: this window must
// outlast that debounce, or a self-write's own event arrives after its
// suppression entry expired and Carbide reads its own save as an external edit.
const SUPPRESS_WINDOW_MS = 2_000;

// Rust atomic_write stages "<file>.tmp" beside the target before renaming.
const ATOMIC_WRITE_TMP_SUFFIX = ".tmp";

// How long an arming stays interesting for diagnostics. Longer than
// SUPPRESS_WINDOW_MS on purpose: the question a conflict log has to answer is
// "did Carbide write this path recently?", and the interesting answers are the
// ones just outside the suppression window.
const ARMING_DIAGNOSTIC_HORIZON_MS = 30_000;

// What an arming is allowed to swallow. Armings are not interchangeable: a
// caller that rewrites a file (git discard, link repair, save) must not also
// silence the note_removed of a file it deleted, or a discarded note keeps an
// open tab pointing at a path that no longer exists.
export type SelfWriteKind = "change" | "removal";

type Arming = { at: number; kinds: readonly SelfWriteKind[] };

export type ObservedEvent = {
  kind?: SelfWriteKind;
  mtime_ms?: number | null;
};

export class WatcherService {
  private port_unsubscribe: (() => void) | null = null;
  private handlers = new Set<(event: VaultFsEvent) => void>();
  private suppressed = new Map<string, Arming>();
  // Content identity, and the reason this is not a counting problem: one write
  // can surface as several Modify events, but every one of them reports the
  // mtime Carbide wrote. Matching is exact and non-consuming, so it holds for
  // all of them; a genuine external edit carries a different mtime and passes
  // straight through. Unlike last_armed this is correctness-bearing, so it has
  // no expiry - a metadata touch hours later still reports our mtime.
  private last_written_mtime = new Map<string, number>();
  // Parallel to `suppressed` but never consumed, because is_suppressed deletes
  // the entry it matches. Without this a conflict raised by the *second* event
  // of one write looks identical to a genuine external edit.
  private last_armed = new Map<string, number>();
  private lifecycle = Promise.resolve();
  private _tree_refresh_suppressed = false;

  constructor(private readonly port: WatcherPort) {}

  suppress_tree_refresh(): void {
    this._tree_refresh_suppressed = true;
  }

  resume_tree_refresh(): void {
    this._tree_refresh_suppressed = false;
  }

  get is_tree_refresh_suppressed(): boolean {
    return this._tree_refresh_suppressed;
  }

  suppress_next(
    path: string,
    kinds: readonly SelfWriteKind[] = ["change"],
  ): void {
    const key = normalize_path_key(path);
    const existing = this.suppressed.get(key);
    const still_live =
      existing !== undefined && Date.now() - existing.at <= SUPPRESS_WINDOW_MS;
    // Kinds merge rather than replace: a rename arms one path twice, and the
    // second arming must not cancel what the first one was covering.
    this.suppressed.set(key, {
      at: Date.now(),
      kinds: still_live
        ? [...new Set([...existing.kinds, ...kinds])]
        : [...kinds],
    });
    this.last_armed.set(key, Date.now());
  }

  record_self_write(path: string, mtime_ms: number): void {
    this.last_written_mtime.set(normalize_path_key(path), mtime_ms);
  }

  arming_age_ms(path: string): number | null {
    const key = normalize_path_key(path);
    const stamp = this.last_armed.get(key);
    if (stamp === undefined) return null;
    const age = Date.now() - stamp;
    if (age > ARMING_DIAGNOSTIC_HORIZON_MS) {
      this.last_armed.delete(key);
      return null;
    }
    return age;
  }

  // Two mechanisms, in order. Content identity is exact and non-consuming, so
  // it covers every event a single write produces. The one-shot path arming
  // stays behind it for the events that carry no mtime and for the window
  // between arming and the write completing, when the mtime is not yet known.
  // The staging ".tmp" event does not consume the arming, because the real
  // event for the target path still follows it.
  is_suppressed(path: string, observed: ObservedEvent = {}): boolean {
    const kind = observed.kind ?? "change";
    const key = normalize_path_key(path);

    if (this.matches_own_write(key, observed.mtime_ms)) {
      return true;
    }
    if (this.is_key_suppressed(key, kind)) {
      this.consume_kind(key, kind);
      return true;
    }
    return (
      kind === "change" &&
      key.endsWith(ATOMIC_WRITE_TMP_SUFFIX) &&
      this.is_key_suppressed(
        key.slice(0, -ATOMIC_WRITE_TMP_SUFFIX.length),
        kind,
      )
    );
  }

  // Non-consuming variant for events that can precede the write's own change
  // event: atomic_write's tmp→target rename may surface as a Create, with the
  // Modify for the same path still to come. It reads both mechanisms for the
  // same reason is_suppressed does — an arming is spent by whichever event
  // reaches it first, and content identity is what still holds afterwards.
  peek_suppressed(path: string, observed: ObservedEvent = {}): boolean {
    const key = normalize_path_key(path);
    return (
      this.matches_own_write(key, observed.mtime_ms) ||
      this.is_key_suppressed(key, observed.kind ?? "change")
    );
  }

  // A path whose disk mtime has moved past the value Carbide wrote has been
  // touched by somebody else, so the record is spent - dropping it keeps a
  // stale mtime from ever matching a later coincidental write.
  private matches_own_write(
    key: string,
    mtime_ms: number | null | undefined,
  ): boolean {
    if (mtime_ms === undefined || mtime_ms === null) return false;
    const written = this.last_written_mtime.get(key);
    if (written === undefined) return false;
    if (written === mtime_ms) return true;
    this.last_written_mtime.delete(key);
    return false;
  }

  // One-shot per kind, not per path: an overwriting rename arms one path for
  // both a removal and a creation, and the removal arriving first must not
  // spend the arming the creation still needs.
  private consume_kind(key: string, kind: SelfWriteKind): void {
    const arming = this.suppressed.get(key);
    if (arming === undefined) return;
    const remaining = arming.kinds.filter((entry) => entry !== kind);
    if (remaining.length === 0) {
      this.suppressed.delete(key);
      return;
    }
    this.suppressed.set(key, { at: arming.at, kinds: remaining });
  }

  private is_key_suppressed(key: string, kind: SelfWriteKind): boolean {
    const arming = this.suppressed.get(key);
    if (arming === undefined) return false;
    if (Date.now() - arming.at > SUPPRESS_WINDOW_MS) {
      this.suppressed.delete(key);
      return false;
    }
    return arming.kinds.includes(kind);
  }

  async start(vault_id: VaultId): Promise<void> {
    await this.run_lifecycle(async () => {
      await this.teardown_port();
      this.port_unsubscribe = this.port.subscribe_fs_events((event) => {
        for (const handler of this.handlers) {
          handler(event);
        }
      });
      try {
        await this.port.watch_vault(vault_id);
      } catch (error) {
        log.from_error("Failed to start vault watcher", error);
      }
    });
  }

  async stop(): Promise<void> {
    await this.run_lifecycle(async () => {
      await this.teardown_port();
    });
  }

  subscribe(handler: (event: VaultFsEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private run_lifecycle(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async teardown_port(): Promise<void> {
    if (this.port_unsubscribe) {
      const unsub = this.port_unsubscribe;
      this.port_unsubscribe = null;
      unsub();
    }
    try {
      await this.port.unwatch_vault();
    } catch (error) {
      log.from_error("Failed to stop vault watcher", error);
    }
  }
}
