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
}

pub struct ObservableCache<K, V> {
    entries: HashMap<K, CacheEntry<V>>,
    capacity: usize,
    counter: u64,
    stats: CacheStats,
}

impl<K: Eq + Hash + Clone, V: Clone> ObservableCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "cache capacity must be > 0");
        Self {
            entries: HashMap::with_capacity(capacity),
            capacity,
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

    pub fn insert(&mut self, key: K, value: V) {
        if self.entries.len() >= self.capacity && !self.entries.contains_key(&key) {
            self.evict_lru();
        }
        self.counter += 1;
        self.entries.insert(
            key,
            CacheEntry {
                value,
                access_counter: self.counter,
            },
        );
        self.stats.insertions += 1;
    }

    pub fn invalidate(&mut self, key: &K) -> bool {
        self.entries.remove(key).is_some()
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
            self.entries.remove(&key);
        }
        count
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn stats(&self) -> &CacheStats {
        &self.stats
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    fn evict_lru(&mut self) {
        if let Some(lru_key) = self
            .entries
            .iter()
            .min_by_key(|(_, entry)| entry.access_counter)
            .map(|(k, _)| k.clone())
        {
            self.entries.remove(&lru_key);
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
        cache.insert("a", 1);
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
        cache.insert("a", 1);
        cache.insert("b", 2);
        cache.get(&"a"); // touch a, making b the LRU
        cache.insert("c", 3); // should evict b
        assert_eq!(cache.get_cloned(&"a"), Some(1));
        assert_eq!(cache.get_cloned(&"b"), None);
        assert_eq!(cache.get_cloned(&"c"), Some(3));
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn invalidate_removes_entry() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1);
        assert!(cache.invalidate(&"a"));
        assert_eq!(cache.get_cloned(&"a"), None);
        assert!(!cache.invalidate(&"a"));
    }

    #[test]
    fn invalidate_matching_removes_subset() {
        let mut cache = ObservableCache::new(8);
        cache.insert("vault1:note1", 1);
        cache.insert("vault1:note2", 2);
        cache.insert("vault2:note3", 3);
        let removed = cache.invalidate_matching(|k| k.starts_with("vault1:"));
        assert_eq!(removed, 2);
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn hit_rate_calculates_correctly() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1);
        cache.get(&"a"); // hit
        cache.get(&"a"); // hit
        cache.get(&"b"); // miss
        let rate = cache.stats().hit_rate();
        assert!((rate - 2.0 / 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn clear_removes_all_entries() {
        let mut cache = ObservableCache::new(4);
        cache.insert("a", 1);
        cache.insert("b", 2);
        cache.clear();
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.get_cloned(&"a"), None);
    }

    #[test]
    fn overwrite_existing_key_does_not_evict() {
        let mut cache = ObservableCache::new(2);
        cache.insert("a", 1);
        cache.insert("b", 2);
        cache.insert("a", 10); // overwrite, not evict
        assert_eq!(cache.get_cloned(&"a"), Some(10));
        assert_eq!(cache.get_cloned(&"b"), Some(2));
        assert_eq!(cache.stats().evictions, 0);
    }
}
