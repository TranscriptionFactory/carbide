use std::collections::HashMap;
use std::hash::Hash;

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub insertions: u64,
    pub evictions: u64,
}

impl CacheStats {
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            return 0.0;
        }
        self.hits as f64 / total as f64
    }
}

struct CacheEntry<V> {
    value: V,
    access_counter: u64,
    size_bytes: usize,
}

pub struct ObservableCache<K, V> {
    entries: HashMap<K, CacheEntry<V>>,
    capacity: usize,
    max_bytes: usize,
    current_bytes: usize,
    counter: u64,
    stats: CacheStats,
}

impl<K: Eq + Hash + Clone, V: Clone> ObservableCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        Self::new_with_byte_limit(capacity, usize::MAX)
    }

    pub fn new_with_byte_limit(capacity: usize, max_bytes: usize) -> Self {
        assert!(capacity > 0, "cache capacity must be > 0");
        assert!(max_bytes > 0, "cache max_bytes must be > 0");
        Self {
            entries: HashMap::with_capacity(capacity),
            capacity,
            max_bytes,
            current_bytes: 0,
            counter: 0,
            stats: CacheStats {
                hits: 0,
                misses: 0,
                insertions: 0,
                evictions: 0,
            },
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        if self.entries.contains_key(key) {
            self.counter += 1;
            let entry = self.entries.get_mut(key).unwrap();
            entry.access_counter = self.counter;
            self.stats.hits += 1;
            Some(&entry.value)
        } else {
            self.stats.misses += 1;
            None
        }
    }

    pub fn get_cloned(&mut self, key: &K) -> Option<V> {
        self.get(key).cloned()
    }

    pub fn insert(&mut self, key: K, value: V, size_bytes: usize) {
        if let Some(existing) = self.entries.remove(&key) {
            self.current_bytes -= existing.size_bytes;
        }

        while self.entries.len() >= self.capacity
            || (self.current_bytes + size_bytes > self.max_bytes && !self.entries.is_empty())
        {
            self.evict_lru();
        }

        self.counter += 1;
        self.current_bytes += size_bytes;
        self.entries.insert(
            key,
            CacheEntry {
                value,
                access_counter: self.counter,
                size_bytes,
            },
        );
        self.stats.insertions += 1;
    }

    pub fn invalidate(&mut self, key: &K) -> bool {
        if let Some(entry) = self.entries.remove(key) {
            self.current_bytes -= entry.size_bytes;
            true
        } else {
            false
        }
    }

    pub fn invalidate_matching(&mut self, predicate: impl Fn(&K) -> bool) -> usize {
        let keys_to_remove: Vec<K> = self
            .entries
            .keys()
            .filter(|k| predicate(k))
            .cloned()
            .collect();
        let count = keys_to_remove.len();
        for key in keys_to_remove {
            if let Some(entry) = self.entries.remove(&key) {
                self.current_bytes -= entry.size_bytes;
            }
        }
        count
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.current_bytes = 0;
    }

    pub fn stats(&self) -> &CacheStats {
        &self.stats
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn current_bytes(&self) -> usize {
        self.current_bytes
    }

    fn evict_lru(&mut self) {
        if let Some(lru_key) = self
            .entries
            .iter()
            .min_by_key(|(_, entry)| entry.access_counter)
            .map(|(k, _)| k.clone())
        {
            if let Some(entry) = self.entries.remove(&lru_key) {
                self.current_bytes -= entry.size_bytes;
            }
            self.stats.evictions += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_get_returns_cached_value() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1, 0);
        assert_eq!(cache.get_cloned(&"a"), Some(1));
        assert_eq!(cache.stats().hits, 1);
        assert_eq!(cache.stats().misses, 0);
    }

    #[test]
    fn miss_increments_miss_counter() {
        let mut cache: ObservableCache<&str, i32> = ObservableCache::new(4);
        assert_eq!(cache.get(&"missing"), None);
        assert_eq!(cache.stats().misses, 1);
        assert_eq!(cache.stats().hits, 0);
    }

    #[test]
    fn evicts_lru_entry_when_full() {
        let mut cache = ObservableCache::new(2);
        cache.insert("a", 1, 0);
        cache.insert("b", 2, 0);
        cache.get(&"a"); // touch a, making b the LRU
        cache.insert("c", 3, 0); // should evict b
        assert_eq!(cache.get_cloned(&"a"), Some(1));
        assert_eq!(cache.get_cloned(&"b"), None);
        assert_eq!(cache.get_cloned(&"c"), Some(3));
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn invalidate_removes_entry() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1, 100);
        assert_eq!(cache.current_bytes(), 100);
        assert!(cache.invalidate(&"a"));
        assert_eq!(cache.get_cloned(&"a"), None);
        assert_eq!(cache.current_bytes(), 0);
        assert!(!cache.invalidate(&"a"));
    }

    #[test]
    fn invalidate_matching_removes_subset() {
        let mut cache = ObservableCache::new(8);
        cache.insert("vault1:note1", 1, 50);
        cache.insert("vault1:note2", 2, 50);
        cache.insert("vault2:note3", 3, 50);
        let removed = cache.invalidate_matching(|k| k.starts_with("vault1:"));
        assert_eq!(removed, 2);
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.current_bytes(), 50);
    }

    #[test]
    fn hit_rate_calculates_correctly() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1, 0);
        cache.get(&"a"); // hit
        cache.get(&"a"); // hit
        cache.get(&"b"); // miss
        let rate = cache.stats().hit_rate();
        assert!((rate - 2.0 / 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn clear_removes_all_entries() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1, 100);
        cache.insert("b", 2, 200);
        cache.clear();
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.current_bytes(), 0);
        assert_eq!(cache.get_cloned(&"a"), None);
    }

    #[test]
    fn overwrite_existing_key_does_not_evict() {
        let mut cache = ObservableCache::new(2);
        cache.insert("a", 1, 100);
        cache.insert("b", 2, 200);
        cache.insert("a", 10, 150); // overwrite, not evict
        assert_eq!(cache.get_cloned(&"a"), Some(10));
        assert_eq!(cache.get_cloned(&"b"), Some(2));
        assert_eq!(cache.stats().evictions, 0);
        assert_eq!(cache.current_bytes(), 350);
    }

    #[test]
    fn evicts_when_byte_limit_exceeded() {
        let mut cache = ObservableCache::new_with_byte_limit(10, 500);
        cache.insert("a", 1, 200);
        cache.insert("b", 2, 200);
        cache.get(&"a"); // touch a, making b the LRU
        cache.insert("c", 3, 200); // 600 > 500, should evict b
        assert_eq!(cache.get_cloned(&"a"), Some(1));
        assert_eq!(cache.get_cloned(&"b"), None);
        assert_eq!(cache.get_cloned(&"c"), Some(3));
        assert_eq!(cache.current_bytes(), 400);
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn evicts_multiple_to_fit_large_entry() {
        let mut cache = ObservableCache::new_with_byte_limit(10, 300);
        cache.insert("a", 1, 100);
        cache.insert("b", 2, 100);
        cache.insert("c", 3, 100);
        // inserting 250 bytes requires evicting at least 2 entries
        cache.insert("d", 4, 250);
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get_cloned(&"d"), Some(4));
        assert_eq!(cache.current_bytes(), 250);
    }

    #[test]
    fn overwrite_updates_byte_tracking() {
        let mut cache = ObservableCache::new_with_byte_limit(4, 1000);
        cache.insert("a", 1, 300);
        assert_eq!(cache.current_bytes(), 300);
        cache.insert("a", 2, 100); // overwrite with smaller
        assert_eq!(cache.current_bytes(), 100);
        assert_eq!(cache.get_cloned(&"a"), Some(2));
    }
}
