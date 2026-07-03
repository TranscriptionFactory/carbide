import type { BaseNoteRow } from "$lib/features/bases";

export class InboxStore {
  results = $state<BaseNoteRow[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  set_results(rows: BaseNoteRow[]) {
    this.results = rows;
  }
}
