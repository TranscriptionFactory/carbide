export type LogEntry = {
  level: "error" | "warn" | "info" | "debug" | "trace";
  message: string;
  timestamp: number;
};

const MAX_ENTRIES = 500;

export class LogStore {
  entries = $state<LogEntry[]>([]);

  push(entry: LogEntry) {
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries = [
        ...this.entries.slice(this.entries.length - MAX_ENTRIES + 1),
        entry,
      ];
    } else {
      this.entries = [...this.entries, entry];
    }
  }

  clear() {
    this.entries = [];
  }

  entry_count = $derived(this.entries.length);
}
