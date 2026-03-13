use crate::features::graph::types::{
    GraphNeighborhoodSnapshot, GraphNeighborhoodStats, GraphNoteMeta, GraphOrphanLink,
};
use crate::features::search::db as search_db;
use rusqlite::Connection;
use std::collections::BTreeSet;
use tauri::AppHandle;

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
pub fn graph_load_note_neighborhood(
    app: AppHandle,
    vault_id: String,
    note_id: String,
) -> Result<GraphNeighborhoodSnapshot, String> {
    let conn = search_db::open_search_db(&app, &vault_id)?;
    load_note_neighborhood(&conn, &note_id)
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
                size_bytes INTEGER NOT NULL
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
