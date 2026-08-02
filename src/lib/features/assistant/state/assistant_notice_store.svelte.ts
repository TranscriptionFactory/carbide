import type {
  AmbientNotice,
  AmbientNoticeId,
} from "$lib/features/assistant/types/ambient";

// I6: the one ambient notice queue. In-memory by contract (I8) — no
// persistence port, no hydration reactor, nothing survives a restart, exactly
// like the proposal store it feeds.
//
// Read paths are REAL because they are the frozen shape AU-061 builds its rail
// against while AU-060 is still implementing the producers; every mutator is
// AU-060's to implement.
//
// No injectable clock, deliberately — the same ruling as the proposal store
// (D2-3). `add_many` takes fully formed notices whose `created_at` the producer
// supplies; this store is hydrate-shaped, not create-shaped.
export class AssistantNoticeStore {
  notices = $state<AmbientNotice[]>([]);

  get(id: AmbientNoticeId): AmbientNotice | null {
    return this.notices.find((notice) => notice.id === id) ?? null;
  }

  // The rail renders one note at a time; the cap and overflow split is
  // `partition_notices`, not this store's business.
  for_note(note_path: string): AmbientNotice[] {
    return this.notices.filter((notice) => notice.note_path === note_path);
  }

  get count(): number {
    return this.notices.length;
  }

  // A producer replaces its whole finding set for a note rather than diffing:
  // the deterministic producers recompute from scratch, so a merge would leave
  // findings behind that the source no longer reports.
  replace_for_note(note_path: string, notices: AmbientNotice[]): void {
    this.notices = [
      ...this.notices.filter((notice) => notice.note_path !== note_path),
      ...notices,
    ];
  }

  dismiss(id: AmbientNoticeId): void {
    this.notices = this.notices.filter((notice) => notice.id !== id);
  }

  // Vault switch clears everything — notices are scoped to the vault whose
  // links produced them.
  clear(): void {
    this.notices = [];
  }
}
