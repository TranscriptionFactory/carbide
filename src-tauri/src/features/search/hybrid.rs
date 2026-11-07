use crate::features::search::db as search_db;
use crate::features::search::embeddings::{usable_query_vector, EmbeddingService};
use crate::features::search::hnsw_index::VectorIndex;
use crate::features::search::model::{
    HitSource, HybridSearchHit, ScopeFilter, SearchHit, SearchScope,
};
use crate::features::search::service::SearchQueryInput;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};

/// Above this many allowed keys, an exact scan restricted to the scope costs
/// more than the existing over-fetch-then-filter pool. The vector index keeps
/// every vector resident (`hnsw_index.rs`), so a scan bounded by the allowed
/// set is cheap regardless of the index's own `EXACT_SEARCH_MAX_POINTS`; above
/// this size the over-fetch path is kept so a very large scope still degrades
/// rather than paying for a full scan.
pub(crate) const FILTERED_EXACT_MAX: usize = 20_000;

/// Resolves a date range, a path scope and/or a `path:` folder filter to the
/// set of note paths a query is allowed to return, or `None` when none of them
/// restricts anything. They are ANDed together: a path must satisfy all of
/// them to survive. An empty set means nothing is eligible, not "unrestricted".
pub(crate) fn resolve_allowed_paths(
    conn: &Connection,
    date_range: Option<(i64, i64)>,
    path_scope: Option<&ScopeFilter>,
    path_filter: Option<&str>,
) -> Result<Option<HashSet<String>>, String> {
    let mut allowed = date_range
        .map(|(start_ms, end_ms)| search_db::paths_in_mtime_range(conn, start_ms, end_ms))
        .transpose()?;

    if let Some(sf) = path_scope.filter(|s| s.is_active()) {
        let scoped = search_db::paths_matching_scope(conn, sf)?;
        allowed = Some(intersect_allowed(allowed, scoped));
    }

    if let Some(value) = path_filter {
        let in_folder = paths_in_matching_folder(conn, value)?;
        allowed = Some(intersect_allowed(allowed, in_folder));
    }

    Ok(allowed)
}

fn intersect_allowed(
    allowed: Option<HashSet<String>>,
    paths: HashSet<String>,
) -> HashSet<String> {
    match allowed {
        Some(existing) => existing.intersection(&paths).cloned().collect(),
        None => paths,
    }
}

fn paths_in_matching_folder(conn: &Connection, value: &str) -> Result<HashSet<String>, String> {
    let needle = value.to_lowercase();
    let paths = search_db::list_note_paths_by_prefix(conn, "")?;
    Ok(paths
        .into_iter()
        .filter(|path| folder_contains(path, &needle))
        .collect())
}

// Only the folders count: `1_LOGS/2_REFS notes.md` is not under `2_REFS`. The
// trailing slash stays in the haystack so `path:2_REFS/` matches too.
fn folder_contains(path: &str, lowercase_needle: &str) -> bool {
    path.rfind('/').is_some_and(|slash| {
        path[..=slash].to_lowercase().contains(lowercase_needle)
    })
}

/// FTS-only search honouring the query's `path:` filter, for callers without
/// the vector index.
pub(crate) fn fts_search(
    conn: &Connection,
    query: &SearchQueryInput,
    limit: usize,
    include_linked: bool,
) -> Result<Vec<SearchHit>, String> {
    let allowed = resolve_allowed_paths(conn, None, None, query.path_filter.as_deref())?;
    if let Some(hits) = folder_listing(conn, query, allowed.as_ref(), limit, include_linked)? {
        return Ok(hits);
    }

    let scope = allowed.as_ref().map(exact_paths_scope);
    let hits = search_db::search(
        conn,
        &query.text,
        query.scope,
        limit * 3,
        None,
        include_linked,
        scope.as_ref(),
    )?;
    let filenames = filename_hits(conn, query, allowed.as_ref(), include_linked)?;
    Ok(merge_filename_hits(
        hits.into_iter()
            .enumerate()
            .map(|(rank, hit)| {
                let mut hit = listed_hybrid_hit(hit);
                hit.score = 1.0 / (61.0 + rank as f32);
                hit
            })
            .collect(),
        filenames,
        limit,
    )
    .into_iter()
    .map(|hit| SearchHit {
        note: hit.note,
        score: hit.score,
        snippet: hit.snippet,
        snippet_page: hit.snippet_page,
    })
    .collect())
}

// The `path:` outcomes no ranked search can give: an empty `ScopeFilter` is
// inactive, so a folder that matched nothing must stop here or FTS would search
// the whole vault, and blank text has nothing to rank on.
fn folder_listing(
    conn: &Connection,
    query: &SearchQueryInput,
    allowed: Option<&HashSet<String>>,
    limit: usize,
    include_linked: bool,
) -> Result<Option<Vec<SearchHit>>, String> {
    let needs_listing = |allowed: &&HashSet<String>| {
        query.path_filter.is_some() && (allowed.is_empty() || query.text.trim().is_empty())
    };
    allowed
        .filter(needs_listing)
        .map(|allowed| list_allowed_notes(conn, allowed, limit, include_linked))
        .transpose()
}

fn exact_paths_scope(allowed: &HashSet<String>) -> ScopeFilter {
    ScopeFilter {
        paths: allowed.iter().cloned().collect(),
        prefixes: Vec::new(),
    }
}

fn list_allowed_notes(
    conn: &Connection,
    allowed: &HashSet<String>,
    limit: usize,
    include_linked: bool,
) -> Result<Vec<SearchHit>, String> {
    let mut paths: Vec<&String> = allowed
        .iter()
        .filter(|path| include_linked || !search_db::is_linked_path(path))
        .collect();
    paths.sort();

    let mut hits = Vec::new();
    for path in paths.into_iter().take(limit) {
        if let Some(note) = search_db::get_note_meta(conn, path)? {
            hits.push(SearchHit {
                note,
                score: 0.0,
                snippet: None,
                snippet_page: None,
            });
        }
    }
    Ok(hits)
}

pub fn hybrid_search(
    conn: &Connection,
    note_index: &VectorIndex,
    model: &EmbeddingService,
    query: &SearchQueryInput,
    limit: usize,
    date_range: Option<(i64, i64)>,
    include_linked: bool,
    path_scope: Option<&ScopeFilter>,
) -> Result<Vec<HybridSearchHit>, String> {
    search_with_embedder(
        conn,
        note_index,
        || model.embed_query(&query.text),
        query,
        limit,
        date_range,
        include_linked,
        path_scope,
    )
}

#[allow(clippy::too_many_arguments)]
fn search_with_embedder(
    conn: &Connection,
    note_index: &VectorIndex,
    embed_query: impl FnOnce() -> Result<Vec<f32>, String>,
    query: &SearchQueryInput,
    limit: usize,
    date_range: Option<(i64, i64)>,
    include_linked: bool,
    path_scope: Option<&ScopeFilter>,
) -> Result<Vec<HybridSearchHit>, String> {
    let over_fetch = limit * 3;
    // FTS pushes the date and scope filters into SQL, but the vector index has
    // no filter API below FILTERED_EXACT_MAX, so both over-fetch and filter
    // afterward. In a very large vault the surviving notes may fall outside
    // this pool; FTS still covers those, so retrieval degrades rather than
    // failing.
    let vector_fetch = if date_range.is_some() {
        (limit * 20).max(500)
    } else {
        over_fetch
    };

    let allowed = resolve_allowed_paths(
        conn,
        date_range,
        path_scope,
        query.path_filter.as_deref(),
    )?;

    if let Some(hits) = folder_listing(conn, query, allowed.as_ref(), limit, include_linked)? {
        return Ok(hits.into_iter().map(listed_hybrid_hit).collect());
    }

    let query_vec = embed_query()?;
    let folder_scope = allowed
        .as_ref()
        .filter(|_| query.path_filter.is_some())
        .map(exact_paths_scope);

    let mut vector_hits = vector_leg(
        note_index,
        query_vec,
        &query.text,
        vector_fetch,
        over_fetch,
        limit,
        allowed.as_ref(),
        include_linked,
    );

    let fts_hits = search_db::search(
        conn,
        &query.text,
        query.scope,
        over_fetch,
        date_range,
        include_linked,
        folder_scope.as_ref().or(path_scope),
    )
    .unwrap_or_default();

    let fts_paths: Vec<&str> = fts_hits.iter().map(|h| h.note.path.as_str()).collect();

    // A column operator asks for matches in that column, which only FTS can
    // tell: the vector leg may rerank those notes but not add to them.
    if !matches!(query.scope, SearchScope::All) {
        vector_hits.retain(|(path, _)| fts_paths.contains(&path.as_str()));
    }

    let phrase_paths = search_db::paths_matching_phrase(conn, &query.text, query.scope, &fts_paths)
        .unwrap_or_default();

    let filenames = filename_hits(conn, query, allowed.as_ref(), include_linked)?;
    let merged = rrf_merge(
        conn,
        &fts_hits,
        &vector_hits,
        &phrase_paths,
        usize::MAX,
        &query.text,
    );

    Ok(merge_filename_hits(merged, filenames, limit))
}

fn normalize_filename(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|c| !matches!(c, ' ' | '_' | '-'))
        .collect()
}

fn filename_score(query: &str, target: &str) -> f32 {
    if query.is_empty() {
        return 0.0;
    }
    if target == query {
        return 1.0;
    }
    if target.starts_with(query) {
        return 0.9;
    }
    if target.contains(query) {
        return 0.75;
    }
    let mut chars = target.chars();
    if query.chars().all(|c| chars.by_ref().any(|t| t == c)) {
        0.45
    } else {
        0.0
    }
}

fn filename_hits(
    conn: &Connection,
    query: &SearchQueryInput,
    allowed: Option<&HashSet<String>>,
    include_linked: bool,
) -> Result<Vec<HybridSearchHit>, String> {
    let needle = normalize_filename(query.text.trim());
    if needle.is_empty() || allowed.is_some_and(HashSet::is_empty) {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    for (path, note) in search_db::get_all_notes_from_db(conn)? {
        if allowed.is_some_and(|paths| !paths.contains(&path))
            || (!include_linked && search_db::is_linked_path(&path))
        {
            continue;
        }
        let normalized = normalize_filename(&path);
        let basename = normalized.rsplit('/').next().unwrap_or(&normalized);
        let score =
            filename_score(&needle, basename).max(0.8 * filename_score(&needle, &normalized));
        if score > 0.0 {
            hits.push(HybridSearchHit {
                note,
                score,
                snippet: None,
                snippet_page: None,
                source: HitSource::Fts,
            });
        }
    }
    if !hits.is_empty() && matches!(query.scope, SearchScope::Title | SearchScope::Content) {
        let scope = ScopeFilter {
            paths: hits.iter().map(|hit| hit.note.path.clone()).collect(),
            prefixes: Vec::new(),
        };
        let matching: HashSet<String> = search_db::search(
            conn,
            &query.text,
            query.scope,
            hits.len(),
            None,
            include_linked,
            Some(&scope),
        )?
        .into_iter()
        .map(|hit| hit.note.path)
        .collect();
        hits.retain(|hit| matching.contains(&hit.note.path));
    }
    Ok(hits)
}

fn merge_filename_hits(
    mut hits: Vec<HybridSearchHit>,
    filenames: Vec<HybridSearchHit>,
    limit: usize,
) -> Vec<HybridSearchHit> {
    let exact: HashSet<String> = filenames
        .iter()
        .filter(|h| h.score == 1.0)
        .map(|h| h.note.path.clone())
        .collect();
    let positions: HashMap<String, usize> = hits
        .iter()
        .enumerate()
        .map(|(index, hit)| (hit.note.path.clone(), index))
        .collect();
    for mut filename in filenames {
        if let Some(&index) = positions.get(&filename.note.path) {
            hits[index].score += filename.score * 0.1;
        } else {
            filename.score *= 0.1;
            hits.push(filename);
        }
    }
    hits.sort_by(|a, b| {
        exact
            .contains(&b.note.path)
            .cmp(&exact.contains(&a.note.path))
            .then_with(|| b.score.total_cmp(&a.score))
            .then_with(|| b.note.mtime_ms.cmp(&a.note.mtime_ms))
            .then_with(|| a.note.path.cmp(&b.note.path))
    });
    hits.truncate(limit);
    hits
}

fn listed_hybrid_hit(hit: SearchHit) -> HybridSearchHit {
    HybridSearchHit {
        note: hit.note,
        score: hit.score,
        snippet: hit.snippet,
        snippet_page: hit.snippet_page,
        source: HitSource::Fts,
    }
}

// An unusable query vector (encoder NaN, zeroed by normalization) is
// cosine-equidistant from every point: searching with it returns arbitrary
// neighbours, so the vector leg is skipped entirely and FTS alone ranks.
//
// A small enough `allowed` set is scanned exactly via `search_within`, so a
// scope match ranking outside the global top-`over_fetch` is still found. A
// larger one falls back to the existing over-fetch-then-filter pool, where
// `allowed` is applied before the final `truncate`, not after: the widened
// `vector_fetch` pool exists to survive that filter, so cutting the pool down
// to `over_fetch` ahead of it would throw most of the pool away before the
// filter ever sees it.
#[allow(clippy::too_many_arguments)]
pub(crate) fn vector_leg(
    note_index: &VectorIndex,
    query_vec: Vec<f32>,
    query_text: &str,
    vector_fetch: usize,
    over_fetch: usize,
    limit: usize,
    allowed: Option<&HashSet<String>>,
    include_linked: bool,
) -> Vec<(String, f32)> {
    let Some(query_vec) = usable_query_vector(query_vec, query_text) else {
        return Vec::new();
    };

    if let Some(allowed) = allowed {
        if allowed.len() <= FILTERED_EXACT_MAX {
            let keys = allowed
                .iter()
                .filter(|p| include_linked || !search_db::is_linked_path(p))
                .map(String::as_str);
            return note_index.search_within(&query_vec, keys, over_fetch);
        }
    }

    let mut hits = note_index.search(&query_vec, vector_fetch);
    if let Some(allowed) = allowed {
        hits.retain(|(path, _)| allowed.contains(path));
    }

    if !include_linked {
        hits.retain(|(path, _)| !search_db::is_linked_path(path));
        // Only a pool the filter actually emptied pays for a second, wider sweep:
        // above EXACT_SEARCH_MAX_POINTS a fetch of 200 costs ~3x the graph
        // traversal of 60, and a vault with few linked sources loses nothing here.
        let widened = vector_fetch.max((limit * 10).max(200));
        if hits.len() < limit && widened > vector_fetch {
            hits = note_index.search(&query_vec, widened);
            if let Some(allowed) = allowed {
                hits.retain(|(path, _)| allowed.contains(path));
            }
            hits.retain(|(path, _)| !search_db::is_linked_path(path));
        }
    }

    hits.truncate(over_fetch);
    hits
}

// Verbatim phrase matches form a third ranked list, in FTS order. Without it a
// note that is the only exact match ranks behind long notes that merely
// contain every term and sit mid-pack in both the FTS and vector lists.
fn rrf_merge(
    conn: &Connection,
    fts_hits: &[SearchHit],
    vector_hits: &[(String, f32)],
    phrase_paths: &HashSet<String>,
    limit: usize,
    query: &str,
) -> Vec<HybridSearchHit> {
    const K: f64 = 60.0;
    // Title boosts act like one extra RRF list (max ~1/K total) so rank fusion
    // stays the primary signal; whole-word matching keeps substring/stopword
    // hits ("the" in "theory") from counting.
    const TITLE_BONUS: f64 = 0.5 / K;

    let mut scores: HashMap<String, (f64, HitSource)> = HashMap::new();

    for (rank, hit) in fts_hits.iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f64 + 1.0);
        let entry = scores
            .entry(hit.note.path.clone())
            .or_insert((0.0, HitSource::Fts));
        entry.0 += rrf_score;
    }

    for (rank, (path, _distance)) in vector_hits.iter().enumerate() {
        let rrf_score = 1.0 / (K + rank as f64 + 1.0);
        let entry = scores
            .entry(path.clone())
            .or_insert((0.0, HitSource::Vector));
        if entry.1 == HitSource::Fts {
            entry.1 = HitSource::Both;
        }
        entry.0 += rrf_score;
    }

    let phrase_ranked = fts_hits
        .iter()
        .filter(|h| phrase_paths.contains(&h.note.path));
    for (rank, hit) in phrase_ranked.enumerate() {
        if let Some(entry) = scores.get_mut(&hit.note.path) {
            entry.0 += 1.0 / (K + rank as f64 + 1.0);
        }
    }

    let fts_map: HashMap<&str, &SearchHit> =
        fts_hits.iter().map(|h| (h.note.path.as_str(), h)).collect();

    let query_lower = query.to_lowercase();
    let query_terms: Vec<&str> = query_lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .collect();

    let mut results: Vec<HybridSearchHit> = scores
        .into_iter()
        .filter_map(|(path, (base_score, source))| {
            let fts_hit = fts_map.get(path.as_str());
            let note = if let Some(h) = fts_hit {
                h.note.clone()
            } else {
                match search_db::get_note_meta(conn, &path) {
                    Ok(Some(meta)) => meta,
                    _ => return None,
                }
            };

            let title_lower = note.title.to_lowercase();
            let title_words: HashSet<&str> = title_lower
                .split(|c: char| !c.is_alphanumeric())
                .filter(|w| !w.is_empty())
                .collect();
            let mut final_score = base_score;

            let term_overlap = query_terms
                .iter()
                .filter(|t| title_words.contains(**t))
                .count() as f64
                / query_terms.len().max(1) as f64;
            final_score += term_overlap * TITLE_BONUS;

            if term_overlap == 1.0 && title_lower.contains(&query_lower) {
                final_score += TITLE_BONUS;
            }

            let snippet = fts_hit.and_then(|h| h.snippet.clone());
            let snippet_page = fts_hit.and_then(|h| h.snippet_page);

            Some(HybridSearchHit {
                note,
                score: final_score as f32,
                snippet,
                snippet_page,
                source,
            })
        })
        .collect();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::search::model::IndexNoteMeta;

    fn hit(path: &str, title: &str) -> SearchHit {
        SearchHit {
            note: IndexNoteMeta {
                id: path.into(),
                path: path.into(),
                title: title.into(),
                name: path.trim_end_matches(".md").into(),
                mtime_ms: 0,
                ctime_ms: 0,
                size_bytes: 0,
                blurb: String::new(),
                file_type: None,
                source: None,
            },
            score: -1.0,
            snippet: None,
            snippet_page: None,
        }
    }

    // All candidates appear in fts_hits, so rrf_merge never touches the conn.
    fn merge(fts: &[SearchHit], vector: &[(String, f32)], query: &str) -> Vec<HybridSearchHit> {
        merge_with_phrase(fts, vector, &[], query)
    }

    fn merge_with_phrase(
        fts: &[SearchHit],
        vector: &[(String, f32)],
        phrase: &[&str],
        query: &str,
    ) -> Vec<HybridSearchHit> {
        let conn = Connection::open_in_memory().expect("in-memory db");
        let phrase: HashSet<String> = phrase.iter().map(|p| p.to_string()).collect();
        rrf_merge(&conn, fts, vector, &phrase, 10, query)
    }

    // The reported failure: the only verbatim match ranks first in FTS but is
    // absent from the vector list, while long digests that contain every term
    // sit mid-pack in both lists and outscore it on two contributions.
    #[test]
    fn sole_phrase_match_outranks_notes_in_both_lists() {
        let mut fts = vec![hit("exact.md", "Overlap Registry")];
        let mut vector = Vec::new();
        for i in 0..10 {
            let digest = format!("digest{i}.md");
            fts.push(hit(&digest, "Digest"));
            vector.push((digest, 0.4f32));
        }
        let query = "Example Invocation and Outcome";

        let without = merge(&fts, &vector, query);
        assert_ne!(without[0].note.path, "exact.md", "test setup: dual-list hits must win without the phrase list");

        let with = merge_with_phrase(&fts, &vector, &["exact.md"], query);
        assert_eq!(with[0].note.path, "exact.md");
    }

    #[test]
    fn dual_rank_one_outranks_deep_title_match() {
        let mut fts = vec![hit("a.md", "Unrelated Alpha")];
        for i in 0..8 {
            fts.push(hit(&format!("filler{i}.md"), "Filler Note"));
        }
        fts.push(hit("t.md", "Machine Learning"));
        let vector = vec![("a.md".to_string(), 0.1f32)];

        let results = merge(&fts, &vector, "machine learning");
        assert_eq!(results[0].note.path, "a.md");
    }

    #[test]
    fn title_match_breaks_near_ties() {
        let fts = vec![hit("a.md", "Plain Note"), hit("b.md", "Machine Learning")];

        let results = merge(&fts, &[], "machine learning");
        assert_eq!(results[0].note.path, "b.md");
    }

    fn synth_index(n: usize) -> VectorIndex {
        let mut idx = VectorIndex::new(2);
        for i in 0..n {
            let theta = i as f32 * 0.1;
            idx.insert(&format!("n{i}"), vec![theta.cos(), theta.sin()]);
        }
        idx
    }

    // Regression for the bug where `!include_linked` truncated the vector pool
    // to `over_fetch` before the date-range filter ran: a date-scoped match
    // ranking outside the raw top-`over_fetch` (n7 is the farthest of 8 points
    // from the query) was thrown away before `allowed_by_date` ever saw it.
    #[test]
    fn date_filter_survives_the_include_linked_truncate() {
        let idx = synth_index(8);
        let allowed: HashSet<String> = ["n7".to_string()].into_iter().collect();

        let hits = vector_leg(&idx, vec![1.0, 0.0], "q", 8, 3, 1, Some(&allowed), false);

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, "n7");
    }

    #[test]
    fn date_filter_survives_the_include_linked_truncate_in_large_scope_fallback() {
        let idx = synth_index(8);
        let mut allowed: HashSet<String> = (0..FILTERED_EXACT_MAX)
            .map(|i| format!("absent{i}"))
            .collect();
        allowed.insert("n7".into());
        assert!(allowed.len() > FILTERED_EXACT_MAX);

        let over_fetch = 3;
        let vector_fetch = 500;
        assert!(!idx.search(&[1.0, 0.0], over_fetch)
            .iter().any(|(path, _)| path == "n7"));
        assert!(idx.search(&[1.0, 0.0], vector_fetch)
            .iter().any(|(path, _)| path == "n7"));

        let hits = vector_leg(
            &idx, vec![1.0, 0.0], "q", vector_fetch, over_fetch, 1, Some(&allowed), false,
        );

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, "n7");
    }

    // The key invariant: a scope whose only match ranks outside the global
    // over-fetch pool must still be found. n29 is the farthest of 30 points
    // from the query, so the raw over-fetch pool (size 9) never contains it —
    // that's the failure mode a plain over-fetch-then-filter search has. With
    // a small `allowed` set, vector_leg takes the exact-scan branch instead
    // and finds it regardless of its rank.
    #[test]
    fn narrow_scope_match_outside_the_overfetch_pool_is_still_found() {
        let idx = synth_index(30);
        let limit = 3;
        let over_fetch = limit * 3;

        let raw_pool = idx.search(&[1.0, 0.0], over_fetch);
        assert!(
            !raw_pool.iter().any(|(k, _)| k == "n29"),
            "test setup: n29 must rank outside the raw over-fetch pool"
        );

        let allowed: HashSet<String> = ["n29".to_string()].into_iter().collect();
        let hits = vector_leg(
            &idx,
            vec![1.0, 0.0],
            "q",
            over_fetch,
            over_fetch,
            limit,
            Some(&allowed),
            true,
        );

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, "n29");
    }

    fn indexed_vault(notes: &[(&str, &str)]) -> (tempfile::TempDir, Connection, VectorIndex) {
        let dir = tempfile::tempdir().expect("tempdir");
        let conn = search_db::open_search_db_at_path(&dir.path().join("search.db")).expect("db");
        let mut index = VectorIndex::new(2);
        for (path, body) in notes {
            let meta = hit(path, path).note;
            search_db::upsert_note(&conn, &meta, body).expect("upsert");
            index.insert(path, vec![1.0, 0.0]);
        }
        (dir, conn, index)
    }

    fn result_paths(hits: &[HybridSearchHit]) -> Vec<&str> {
        hits.iter().map(|h| h.note.path.as_str()).collect()
    }

    fn query(text: &str, scope: SearchScope, path_filter: Option<&str>) -> SearchQueryInput {
        SearchQueryInput {
            raw: text.into(),
            text: text.into(),
            scope,
            path_filter: path_filter.map(String::from),
        }
    }

    fn unit_vector() -> Result<Vec<f32>, String> {
        Ok(vec![1.0, 0.0])
    }

    fn search(
        conn: &Connection,
        index: &VectorIndex,
        query: &SearchQueryInput,
    ) -> Vec<HybridSearchHit> {
        search_with_embedder(conn, index, unit_vector, query, 20, None, true, None)
            .expect("search")
    }

    fn sorted_paths(hits: &[HybridSearchHit]) -> Vec<&str> {
        let mut paths = result_paths(hits);
        paths.sort();
        paths
    }

    #[test]
    fn path_operator_excludes_vector_hits_outside_the_scoped_folder() {
        let (_dir, conn, index) =
            indexed_vault(&[("2_REFS/a.md", "text in refs"), ("1_LOGS/b.md", "text in logs")]);

        let hits = search(&conn, &index, &query("text", SearchScope::All, Some("2_REFS")));

        assert_eq!(result_paths(&hits), vec!["2_REFS/a.md"]);
        assert_eq!(hits[0].source, HitSource::Both);
    }

    #[test]
    fn path_operator_ranks_on_the_free_text_not_the_folder_name() {
        let (_dir, conn, index) =
            indexed_vault(&[("2_REFS/a.md", "unrelated"), ("2_REFS/b.md", "needle")]);

        let hits = search(&conn, &index, &query("needle", SearchScope::All, Some("2_REFS")));

        assert_eq!(hits[0].note.path, "2_REFS/b.md");
    }

    #[test]
    fn path_operator_alone_lists_only_that_folders_notes() {
        let (_dir, conn, index) = indexed_vault(&[
            ("2_REFS/b.md", "one"),
            ("2_REFS/a.md", "two"),
            ("1_LOGS/c.md", "three"),
        ]);

        let hits = search(&conn, &index, &query("", SearchScope::All, Some("2_REFS")));

        assert_eq!(result_paths(&hits), vec!["2_REFS/a.md", "2_REFS/b.md"]);
    }

    #[test]
    fn path_operator_matches_any_folder_segment_case_insensitively() {
        let (_dir, conn, index) = indexed_vault(&[
            ("2_REFS/a.md", "text"),
            ("a/2_REFS/b.md", "text"),
            ("a/2_REFS/deep/c.md", "text"),
            ("1_LOGS/d.md", "text"),
        ]);

        let hits = search(&conn, &index, &query("text", SearchScope::All, Some("refs")));

        assert_eq!(
            sorted_paths(&hits),
            vec!["2_REFS/a.md", "a/2_REFS/b.md", "a/2_REFS/deep/c.md"]
        );
    }

    #[test]
    fn path_operator_matches_a_folder_name_containing_a_space() {
        let (_dir, conn, index) =
            indexed_vault(&[("My Folder/a.md", "text"), ("Other/b.md", "text")]);

        let hits = search(&conn, &index, &query("text", SearchScope::All, Some("My Folder")));

        assert_eq!(result_paths(&hits), vec!["My Folder/a.md"]);
    }

    #[test]
    fn path_operator_ignores_file_names_and_vault_root_notes() {
        let (_dir, conn, index) = indexed_vault(&[
            ("2_REFS/a.md", "text"),
            ("1_LOGS/2_REFS notes.md", "text"),
            ("2_REFS.md", "text"),
        ]);

        let hits = search(&conn, &index, &query("text", SearchScope::All, Some("2_REFS")));

        assert_eq!(result_paths(&hits), vec!["2_REFS/a.md"]);
    }

    #[test]
    fn path_operator_accepts_a_trailing_slash() {
        let (_dir, conn, index) =
            indexed_vault(&[("2_REFS/a.md", "text"), ("2_REFS_old/b.md", "text")]);

        let hits = search(&conn, &index, &query("text", SearchScope::All, Some("2_REFS/")));

        assert_eq!(result_paths(&hits), vec!["2_REFS/a.md"]);
    }

    #[test]
    fn path_operator_matching_no_folder_returns_nothing() {
        let (_dir, conn, index) = indexed_vault(&[("2_REFS/a.md", "text")]);

        let with_text = query("text", SearchScope::All, Some("missing"));
        let alone = query("", SearchScope::All, Some("missing"));

        assert!(search(&conn, &index, &with_text).is_empty());
        assert!(search(&conn, &index, &alone).is_empty());
        assert!(fts_search(&conn, &with_text, 20, true).expect("fts").is_empty());
        assert!(fts_search(&conn, &alone, 20, true).expect("fts").is_empty());
    }

    #[test]
    fn path_operator_listing_never_embeds_the_query() {
        let (_dir, conn, index) = indexed_vault(&[("2_REFS/a.md", "text")]);
        let alone = query("", SearchScope::All, Some("2_REFS"));

        let hits = search_with_embedder(
            &conn,
            &index,
            || Err("embedder unavailable".to_string()),
            &alone,
            20,
            None,
            true,
            None,
        )
        .expect("search");

        assert_eq!(result_paths(&hits), vec!["2_REFS/a.md"]);
    }

    #[test]
    fn path_operator_listing_respects_the_linked_source_setting() {
        let (_dir, conn, index) =
            indexed_vault(&[("@linked/refs/a.md", "text"), ("refs/b.md", "text")]);
        let alone = query("", SearchScope::All, Some("refs"));

        let hits =
            search_with_embedder(&conn, &index, unit_vector, &alone, 20, None, false, None)
                .expect("search");

        assert_eq!(result_paths(&hits), vec!["refs/b.md"]);
    }

    #[test]
    fn fts_search_applies_the_path_operator_without_the_vector_index() {
        let (_dir, conn, _index) =
            indexed_vault(&[("2_REFS/a.md", "text"), ("1_LOGS/b.md", "text")]);

        let with_text = query("text", SearchScope::All, Some("2_REFS"));
        let alone = query("", SearchScope::All, Some("2_REFS"));

        for hits in [
            fts_search(&conn, &with_text, 20, true).expect("fts"),
            fts_search(&conn, &alone, 20, true).expect("fts"),
        ] {
            let paths: Vec<&str> = hits.iter().map(|h| h.note.path.as_str()).collect();
            assert_eq!(paths, vec!["2_REFS/a.md"]);
        }
    }

    #[test]
    fn allowed_paths_intersect_the_folder_filter_with_the_path_scope() {
        let (_dir, conn, _index) =
            indexed_vault(&[("2_REFS/a.md", "text"), ("2_REFS/b.md", "text")]);
        let scope = ScopeFilter {
            paths: vec!["2_REFS/a.md".into()],
            prefixes: Vec::new(),
        };

        let allowed = resolve_allowed_paths(&conn, None, Some(&scope), Some("refs"))
            .expect("resolve")
            .expect("restricted");

        assert_eq!(allowed, HashSet::from(["2_REFS/a.md".to_string()]));
    }

    #[test]
    fn title_operator_returns_no_vector_only_hits() {
        let (_dir, conn, index) = indexed_vault(&[("foo.md", "body"), ("other.md", "foo")]);

        let hits = search(&conn, &index, &query("foo", SearchScope::Title, None));

        assert_eq!(result_paths(&hits), vec!["foo.md"]);
    }

    #[test]
    fn content_operator_returns_no_vector_only_hits() {
        let (_dir, conn, index) = indexed_vault(&[("a.md", "foo here"), ("b.md", "nothing")]);

        let hits = search(&conn, &index, &query("foo", SearchScope::Content, None));

        assert_eq!(result_paths(&hits), vec!["a.md"]);
    }

    #[test]
    fn unscoped_query_keeps_vector_only_hits() {
        let (_dir, conn, index) = indexed_vault(&[("a.md", "foo here"), ("b.md", "nothing")]);

        let hits = search(&conn, &index, &query("foo", SearchScope::All, None));

        assert_eq!(sorted_paths(&hits), vec!["a.md", "b.md"]);
    }

    #[test]
    fn stopword_substring_in_title_gets_no_bonus() {
        let fts = vec![hit("a.md", "Theory of Mind"), hit("b.md", "Unrelated")];

        let results = merge(&fts, &[], "the");
        assert_eq!(results[0].note.path, "a.md");
        // "the" is a substring of "theory" but not a whole word: pure RRF score.
        assert!((results[0].score as f64 - 1.0 / 61.0).abs() < 1e-6);
    }
    #[test]
    fn filename_queries_find_dotted_paths_substrings_and_all_document_types() {
        let (_dir, conn, index) = indexed_vault(&[
            ("2_REFS/annualreport.pdf", "unrelated"),
            ("report.pdf", "unrelated"),
            ("annualreport.md", "unrelated"),
            ("annualreport.html", "unrelated"),
            ("annualreport.epub", "unrelated"),
            ("annualreport.py", "unrelated"),
            ("annualreport.sh", "unrelated"),
            ("annualreport.zsh", "unrelated"),
        ]);
        for text in ["report.pdf", "2_REFS/report", "report", "anrpt"] {
            let q = query(text, SearchScope::All, None);
            let hits = search(&conn, &index, &q);
            assert!(
                result_paths(&hits).contains(&"2_REFS/annualreport.pdf"),
                "{text}"
            );
            let fts = fts_search(&conn, &q, 20, true).expect("fts");
            assert!(
                fts.iter().any(|h| h.note.path == "2_REFS/annualreport.pdf"),
                "{text}"
            );
        }
        let q = query("report", SearchScope::All, None);
        assert_eq!(
            filename_hits(&conn, &q, None, true).expect("names").len(),
            8
        );
    }

    #[test]
    fn filename_exact_match_and_name_only_hit_survive_twenty_dual_list_hits() {
        let (_dir, conn, index) =
            indexed_vault(&[("report.pdf", "nothing"), ("annualreport.pdf", "nothing")]);
        conn.execute("UPDATE notes SET title = 'Unrelated'", [])
            .expect("titles");
        let fts: Vec<SearchHit> = (0..25)
            .map(|i| hit(&format!("digest{i}.md"), "report.pdf"))
            .collect();
        let vector: Vec<(String, f32)> = fts.iter().map(|h| (h.note.path.clone(), 0.1)).collect();
        let merged = rrf_merge(
            &conn,
            &fts,
            &vector,
            &HashSet::new(),
            usize::MAX,
            "report.pdf",
        );
        let names = filename_hits(
            &conn,
            &query("report.pdf", SearchScope::All, None),
            None,
            true,
        )
        .expect("names");
        let hits = merge_filename_hits(merged, names, 20);
        assert_eq!(hits[0].note.path, "report.pdf");
        assert!(result_paths(&hits).contains(&"annualreport.pdf"));
        assert_eq!(hits.len(), 20);
        assert_eq!(
            search(&conn, &index, &query("report.pdf", SearchScope::All, None))[0]
                .note
                .path,
            "report.pdf"
        );
    }

    #[test]
    fn filename_matches_respect_folder_date_path_and_column_restrictions() {
        let (_dir, conn, index) = indexed_vault(&[
            ("refs/annualreport.pdf", "unrelated"),
            ("logs/report.pdf", "report"),
        ]);
        conn.execute(
            "UPDATE notes SET title = 'Unrelated', mtime_ms = 10 WHERE path LIKE 'refs/%'",
            [],
        )
        .expect("metadata");
        let q = query("report", SearchScope::All, Some("refs"));
        assert_eq!(
            result_paths(&search(&conn, &index, &q)),
            vec!["refs/annualreport.pdf"]
        );
        for scope in [SearchScope::Title, SearchScope::Content] {
            let q = query("report", scope, Some("refs"));
            assert!(search(&conn, &index, &q).is_empty());
            assert!(fts_search(&conn, &q, 20, true).expect("fts").is_empty());
        }
        for range in [(0, 5), (20, 30)] {
            let hits =
                search_with_embedder(&conn, &index, unit_vector, &q, 20, Some(range), true, None)
                    .expect("search");
            assert!(hits.is_empty());
        }
        let hits = search_with_embedder(
            &conn,
            &index,
            unit_vector,
            &q,
            20,
            Some((5, 15)),
            true,
            None,
        )
        .expect("search");
        assert_eq!(result_paths(&hits), vec!["refs/annualreport.pdf"]);
        let scope = ScopeFilter {
            paths: vec!["logs/report.pdf".into()],
            prefixes: vec![],
        };
        assert!(
            search_with_embedder(&conn, &index, unit_vector, &q, 20, None, true, Some(&scope))
                .expect("search")
                .is_empty()
        );
    }
    #[test]
    fn fts_only_preserves_bm25_order_for_body_only_hits() {
        let (_dir, conn, _index) = indexed_vault(&[
            ("a.md", "needle needle needle"),
            (
                "b.md",
                "needle and many other irrelevant words in a longer document",
            ),
        ]);
        let expected = search_db::search(&conn, "needle", SearchScope::All, 20, None, true, None)
            .expect("fts");
        let actual =
            fts_search(&conn, &query("needle", SearchScope::All, None), 20, true).expect("merged");
        assert_eq!(
            actual.iter().map(|h| &h.note.path).collect::<Vec<_>>(),
            expected.iter().map(|h| &h.note.path).collect::<Vec<_>>()
        );
    }

    #[test]
    fn exact_filename_with_matching_column_survives_a_capped_fts_pool() {
        let (_dir, conn, index) = indexed_vault(&[(
            "needle.pdf",
            "needle.pdf and many other irrelevant words in a longer document",
        )]);
        for i in 0..10 {
            search_db::upsert_note(
                &conn,
                &hit(&format!("digest{i}.md"), "needle.pdf needle.pdf needle.pdf").note,
                "needle.pdf needle.pdf needle.pdf",
            )
            .expect("upsert");
        }

        for scope in [SearchScope::Title, SearchScope::Content] {
            let q = query("needle.pdf", scope, None);
            let capped =
                search_db::search(&conn, &q.text, scope, 3, None, true, None).expect("capped fts");
            assert!(!capped.iter().any(|hit| hit.note.path == "needle.pdf"));
            assert_eq!(
                fts_search(&conn, &q, 1, true).expect("fts")[0].note.path,
                "needle.pdf"
            );
            assert_eq!(
                search_with_embedder(&conn, &index, unit_vector, &q, 1, None, true, None)
                    .expect("hybrid")[0]
                    .note
                    .path,
                "needle.pdf"
            );
        }
    }

    #[test]
    fn filename_scoring_orders_exact_prefix_substring_subsequence_and_discounts_paths() {
        assert_eq!(filename_score("report.pdf", "report.pdf"), 1.0);
        assert_eq!(filename_score("report", "report.pdf"), 0.9);
        assert_eq!(filename_score("report", "annualreport.pdf"), 0.75);
        assert_eq!(filename_score("rpt", "report.pdf"), 0.45);
        assert_eq!(filename_score("zxy", "report.pdf"), 0.0);
        let (_dir, conn, _index) = indexed_vault(&[("report/a.md", ""), ("report.md", "")]);
        let hits = filename_hits(&conn, &query("report", SearchScope::All, None), None, true)
            .expect("names");
        assert_eq!(
            hits.iter()
                .find(|h| h.note.path == "report/a.md")
                .expect("folder")
                .score,
            0.8 * 0.9
        );
        assert_eq!(
            hits.iter()
                .find(|h| h.note.path == "report.md")
                .expect("basename")
                .score,
            0.9
        );
        assert_eq!(
            normalize_filename("Annual_Report-file Name.PDF"),
            "annualreportfilename.pdf"
        );
    }

    #[test]
    fn filename_matches_respect_linked_source_exclusion() {
        let (_dir, conn, index) = indexed_vault(&[
            ("@linked/refs/report.pdf", ""),
            ("refs/annualreport.pdf", ""),
        ]);
        let q = query("report", SearchScope::All, None);
        let hits = search_with_embedder(&conn, &index, unit_vector, &q, 20, None, false, None)
            .expect("search");
        assert_eq!(result_paths(&hits), vec!["refs/annualreport.pdf"]);
        assert_eq!(
            fts_search(&conn, &q, 20, false).expect("fts")[0].note.path,
            "refs/annualreport.pdf"
        );
    }
}
