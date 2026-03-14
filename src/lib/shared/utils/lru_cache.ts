export interface CacheStats {
  hits: number;
  misses: number;
  insertions: number;
  evictions: number;
  hit_rate: number;
}

export class LruCache<K, V> {
  private entries: Map<K, V>;
  private capacity: number;
  private _hits = 0;
  private _misses = 0;
  private _insertions = 0;
  private _evictions = 0;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error("cache capacity must be >= 1");
    this.entries = new Map();
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      this._misses++;
      return undefined;
    }
    this._hits++;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.capacity) {
      const lru_key = this.entries.keys().next().value!;
      this.entries.delete(lru_key);
      this._evictions++;
    }
    this.entries.set(key, value);
    this._insertions++;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  invalidate(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      insertions: this._insertions,
      evictions: this._evictions,
      hit_rate: total === 0 ? 0 : this._hits / total,
    };
  }
}
