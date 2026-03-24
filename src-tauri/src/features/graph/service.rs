use crate::features::graph::types::{
    GraphCacheStatsSnapshot, GraphNeighborhoodSnapshot, GraphNeighborhoodStats, GraphNoteMeta,
    GraphOrphanLink, VaultGraphChunkEvent, VaultGraphEdge, VaultGraphNode, VaultGraphSnapshot,
    VaultGraphStats,
};
use crate::features::search::db as search_db;
use crate::shared::cache::ObservableCache;
use rusqlite::Connection;
use std::collections::BTreeSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct GraphCacheState(pub Mutex<ObservableCache<String, GraphNeighborhoodSnapshot>>);

impl Default for GraphCacheState {
    fn default() -> Self {
        Self(Mutex::new(ObservableCache::new(64)))
    }
}

pub struct VaultGraphCacheState(pub Mutex<ObservableCache<String, VaultGraphSnapshot>>);

impl Default for VaultGraphCacheState {
    fn default() -> Self {
        Self(Mutex::new(ObservableCache::new(4)))
    }
}

fn cache_key(vault_id: &str, note_id: &str) -> String {
    format!("{vault_id}:{note_id}")
}

fn build_stats(
    backlinks: &[GraphNoteMeta],
    outlinks: &[GraphNoteMeta],
    orphan_links: &[GraphOrphanLink],
) -> GraphNeighborhoodStats {
    let backlink_paths: BTreeSet<&str> = backlinks.iter().map(|note| note.path.as_str()).collect();
    let outlink_paths: BTreeSet<&str> = outlinks.iter().map(|note| note.path.as_str()).collect();
    let bidirectional_count = backlink_paths.intersection(&outlink_paths).count();
    let related_note_count = backlink_paths.union(&outlink_paths).count();

    GraphNeighborhoodStats {
        node_count: 1 + related_note_count + orphan_links.len(),
        edge_count: backlinks.len() + outlinks.len() + orphan_links.len(),
        backlink_count: backlinks.len(),
        outlink_count: outlinks.len(),
        orphan_count: orphan_links.len(),
        bidirectional_count,
    }
}

fn load_note_neighborhood(
    conn: &Connection,
    note_id: &str,
) -> Result<GraphNeighborhoodSnapshot, String> {
    let center = search_db::get_note_meta(conn, note_id)?
        .ok_or_else(|| format!("note not found in index: {note_id}"))?
        .into();
    let backlinks: Vec<GraphNoteMeta> = search_db::get_backlinks(conn, note_id)?
        .into_iter()
        .map(Into::into)
        .collect();
    let outlinks: Vec<GraphNoteMeta> = search_db::get_outlinks(conn, note_id)?
        .into_iter()
        .map(Into::into)
        .collect();
    let orphan_links: Vec<GraphOrphanLink> = search_db::get_orphan_outlinks(conn, note_id)?
        .into_iter()
        .map(|link| GraphOrphanLink {
            target_path: link.target_path,
            ref_count: link.ref_count,
        })
        .collect();
    let stats = build_stats(&backlinks, &outlinks, &orphan_links);

    Ok(GraphNeighborhoodSnapshot {
        center,
        backlinks,
        outlinks,
        orphan_links,
        stats,
    })
}

#[tauri::command]
#[specta::specta]
pub fn graph_load_note_neighborhood(
    app: AppHandle,
    vault_id: String,
    note_id: String,
    cache_state: State<'_, GraphCacheState>,
) -> Result<GraphNeighborhoodSnapshot, String> {
    let key = cache_key(&vault_id, &note_id);

    {
        let mut cache = cache_state.0.lock().map_err(|e| e.to_string())?;
        if let Some(snapshot) = cache.get_cloned(&key) {
            return Ok(snapshot);
        }
    }

    let conn = search_db::open_search_db(&app, &vault_id)?;
    let snapshot = load_note_neighborhood(&conn, &note_id)?;

    {
        let mut cache = cache_state.0.lock().map_err(|e| e.to_string())?;
        cache.insert(key, snapshot.clone());
    }

    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub fn graph_invalidate_cache(
    app: AppHandle,
    vault_id: String,
    note_id: Option<String>,
    cache_state: State<'_, GraphCacheState>,
    vault_cache_state: State<'_, VaultGraphCacheState>,
) -> Result<(), String> {
    {
        let mut cache = cache_state.0.lock().map_err(|e| e.to_string())?;
        match &note_id {
            Some(id) => {
                let key = cache_key(&vault_id, id);
                cache.invalidate(&key);

                let connected = get_connected_paths(&app, &vault_id, id);
                let connected_keys: BTreeSet<String> =
                    connected.iter().map(|p| cache_key(&vault_id, p)).collect();
                cache.invalidate_matching(|k| connected_keys.contains(k));
            }
            None => {
                let prefix = format!("{vault_id}:");
                cache.invalidate_matching(|k| k.starts_with(&prefix));
            }
        }
    }

    {
        let mut vault_cache = vault_cache_state.0.lock().map_err(|e| e.to_string())?;
        let vault_key = format!("vault:{vault_id}");
        vault_cache.invalidate(&vault_key);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn graph_load_vault_graph(
    app: AppHandle,
    vault_id: String,
    vault_cache_state: State<'_, VaultGraphCacheState>,
) -> Result<VaultGraphSnapshot, String> {
    let cache_key = format!("vault:{vault_id}");

    {
        let mut cache = vault_cache_state.0.lock().map_err(|e| e.to_string())?;
        if let Some(snapshot) = cache.get_cloned(&cache_key) {
            return Ok(snapshot);
        }
    }

    let conn = search_db::open_search_db(&app, &vault_id)?;
    let notes_map = search_db::get_all_notes_from_db(&conn)?;
    let edge_pairs = search_db::get_all_graph_edges(&conn)?;

    let nodes: Vec<VaultGraphNode> = notes_map
        .values()
        .map(|meta| VaultGraphNode {
            path: meta.path.clone(),
            title: meta.title.clone(),
        })
        .collect();

    let edges: Vec<VaultGraphEdge> = edge_pairs
        .into_iter()
        .map(|(source, target)| VaultGraphEdge { source, target })
        .collect();

    let stats = VaultGraphStats {
        node_count: nodes.len(),
        edge_count: edges.len(),
    };

    let snapshot = VaultGraphSnapshot {
        nodes,
        edges,
        stats,
    };

    {
        let mut cache = vault_cache_state.0.lock().map_err(|e| e.to_string())?;
        cache.insert(cache_key, snapshot.clone());
    }

    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub fn graph_load_vault_graph_streamed(
    app: AppHandle,
    vault_id: String,
    chunk_size: Option<usize>,
) -> Result<(), String> {
    let chunk_size = chunk_size.unwrap_or(1000);
    let conn = search_db::open_search_db(&app, &vault_id)?;

    let total_notes = search_db::get_note_count(&conn).unwrap_or(0);

    search_db::get_all_notes_chunked(&conn, chunk_size, &|batch, emitted| {
        let nodes: Vec<VaultGraphNode> = batch
            .into_iter()
            .map(|meta| VaultGraphNode {
                path: meta.path,
                title: meta.title,
            })
            .collect();
        let _ = app.emit(
            "graph-chunk",
            VaultGraphChunkEvent::Nodes {
                nodes,
                total: total_notes,
                progress: emitted,
            },
        );
    })?;

    let total_edges =
        search_db::get_all_graph_edges_chunked(&conn, chunk_size, &|batch, emitted| {
            let edges: Vec<VaultGraphEdge> = batch
                .into_iter()
                .map(|(source, target)| VaultGraphEdge { source, target })
                .collect();
            let _ = app.emit(
                "graph-chunk",
                VaultGraphChunkEvent::Edges {
                    edges,
                    total: 0,
                    progress: emitted,
                },
            );
        })?;

    let _ = app.emit(
        "graph-chunk",
        VaultGraphChunkEvent::Done {
            stats: VaultGraphStats {
                node_count: total_notes,
                edge_count: total_edges,
            },
        },
    );

    Ok(())
}

fn get_connected_paths(app: &AppHandle, vault_id: &str, note_path: &str) -> Vec<String> {
    let conn = match search_db::open_search_db(app, vault_id) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("get_connected_paths: failed to open db for {vault_id}: {e}");
            return vec![];
        }
    };

    let mut paths = Vec::new();
    if let Ok(backlinks) = search_db::get_backlinks(&conn, note_path) {
        for n in backlinks {
            paths.push(n.path);
        }
    }
    if let Ok(outlinks) = search_db::get_outlinks(&conn, note_path) {
        for n in outlinks {
            paths.push(n.path);
        }
    }
    paths
}

#[tauri::command]
#[specta::specta]
pub fn graph_cache_stats(
    cache_state: State<'_, GraphCacheState>,
) -> Result<GraphCacheStatsSnapshot, String> {
    let cache = cache_state.0.lock().map_err(|e| e.to_string())?;
    let stats = cache.stats();
    Ok(GraphCacheStatsSnapshot {
        size: cache.len(),
        hits: stats.hits,
        misses: stats.misses,
        insertions: stats.insertions,
        evictions: stats.evictions,
        hit_rate: stats.hit_rate(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn init_test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(
            "CREATE TABLE notes (
                path TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                mtime_ms INTEGER NOT NULL,
                size_bytes INTEGER NOT NULL,
                file_type TEXT DEFAULT 'markdown'
            );
            CREATE TABLE outlinks (
                source_path TEXT NOT NULL,
                target_path TEXT NOT NULL,
                PRIMARY KEY (source_path, target_path)
            );",
        )
        .expect("schema should initialize");
        conn
    }

    fn insert_note(conn: &Connection, path: &str, title: &str) {
        conn.execute(
            "INSERT INTO notes (path, title, mtime_ms, size_bytes) VALUES (?1, ?2, ?3, ?4)",
            params![path, title, 100_i64, 10_i64],
        )
        .expect("note should insert");
    }

    #[test]
    fn load_note_neighborhood_returns_center_neighbors_orphans_and_stats() {
        let conn = init_test_conn();
        insert_note(&conn, "notes/center.md", "Center");
        insert_note(&conn, "notes/backlink.md", "Backlink");
        insert_note(&conn, "notes/outlink.md", "Outlink");
        insert_note(&conn, "notes/bidirectional.md", "Bidirectional");

        conn.execute(
            "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
            params!["notes/backlink.md", "notes/center.md"],
        )
        .expect("backlink edge should insert");
        conn.execute(
            "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
            params!["notes/center.md", "notes/outlink.md"],
        )
        .expect("outlink edge should insert");
        conn.execute(
            "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
            params!["notes/center.md", "notes/bidirectional.md"],
        )
        .expect("forward bidirectional edge should insert");
        conn.execute(
            "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
            params!["notes/bidirectional.md", "notes/center.md"],
        )
        .expect("reverse bidirectional edge should insert");
        conn.execute(
            "INSERT INTO outlinks (source_path, target_path) VALUES (?1, ?2)",
            params!["notes/center.md", "planned/future.md"],
        )
        .expect("planned edge should insert");

        let snapshot =
            load_note_neighborhood(&conn, "notes/center.md").expect("snapshot should load");

        assert_eq!(snapshot.center.path, "notes/center.md");
        assert_eq!(snapshot.backlinks.len(), 2);
        assert_eq!(snapshot.outlinks.len(), 2);
        assert_eq!(snapshot.orphan_links.len(), 1);
        assert_eq!(snapshot.orphan_links[0].target_path, "planned/future.md");
        assert_eq!(snapshot.stats.node_count, 5);
        assert_eq!(snapshot.stats.edge_count, 5);
        assert_eq!(snapshot.stats.backlink_count, 2);
        assert_eq!(snapshot.stats.outlink_count, 2);
        assert_eq!(snapshot.stats.orphan_count, 1);
        assert_eq!(snapshot.stats.bidirectional_count, 1);
    }
}
