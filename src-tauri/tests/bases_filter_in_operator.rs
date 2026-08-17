use crate::features::search::db::{open_search_db_at_path, query_bases, upsert_note};
use crate::features::search::model::{BaseFilter, BaseQuery, BaseSort, IndexNoteMeta};
use rusqlite::Connection;
use tempfile::TempDir;

fn seed(conn: &Connection, path: &str, file_type: &str) {
    let meta = IndexNoteMeta {
        id: path.into(),
        path: path.into(),
        title: path.into(),
        name: path.into(),
        mtime_ms: 1_000,
        ctime_ms: 1_000,
        size_bytes: 10,
        blurb: String::new(),
        file_type: Some(file_type.into()),
        source: None,
    };
    upsert_note(conn, &meta, "body").expect("upsert should succeed");
}

fn vault(conn: &Connection) {
    seed(conn, "a_note.md", "markdown");
    seed(conn, "b_board.canvas", "canvas");
    seed(conn, "c_paper.pdf", "pdf");
    seed(conn, "d_page.html", "html");
}

fn open(tmp: &TempDir) -> Connection {
    open_search_db_at_path(&tmp.path().join("test.db")).expect("db should open")
}

fn filtered_paths(conn: &Connection, filter: BaseFilter) -> (Vec<String>, usize) {
    let results = query_bases(
        conn,
        BaseQuery {
            filters: vec![filter],
            sort: vec![BaseSort {
                property: "path".into(),
                descending: false,
            }],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases should succeed");

    let paths = results.rows.iter().map(|r| r.note.path.clone()).collect();
    (paths, results.total)
}

fn in_filter(values: &str) -> BaseFilter {
    BaseFilter {
        property: "file_type".into(),
        operator: "in".into(),
        value: values.into(),
    }
}

#[test]
fn in_filter_matches_every_listed_value() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, _) = filtered_paths(&conn, in_filter("markdown,canvas"));

    assert_eq!(paths, vec!["a_note.md", "b_board.canvas"]);
}

#[test]
fn in_filter_with_a_single_value_matches_only_that_value() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, _) = filtered_paths(&conn, in_filter("pdf"));

    assert_eq!(paths, vec!["c_paper.pdf"]);
}

#[test]
fn in_filter_with_no_values_matches_nothing() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, total) = filtered_paths(&conn, in_filter(""));

    assert!(paths.is_empty(), "empty IN list should match no rows");
    assert_eq!(total, 0);
}

#[test]
fn in_filter_tolerates_whitespace_between_values() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, _) = filtered_paths(&conn, in_filter(" markdown , canvas "));

    assert_eq!(paths, vec!["a_note.md", "b_board.canvas"]);
}

#[test]
fn in_filter_does_not_interpret_its_values_as_sql() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, total) = filtered_paths(&conn, in_filter("markdown') OR 1=1 --"));

    assert!(
        paths.is_empty(),
        "values are bound parameters, not interpolated SQL"
    );
    assert_eq!(total, 0);
}

// file_type has to be a direct column in build_bases_where. Without it the
// property falls through to the frontmatter subquery, which produces valid SQL
// that matches zero rows — a filter that silently returns nothing.
#[test]
fn file_type_filter_returns_rows_rather_than_silently_matching_nothing() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, total) = filtered_paths(
        &conn,
        BaseFilter {
            property: "file_type".into(),
            operator: "eq".into(),
            value: "pdf".into(),
        },
    );

    assert_eq!(paths, vec!["c_paper.pdf"]);
    assert_eq!(total, 1, "the count query shares the same WHERE clause");
}

// build_bases_where feeds the count query as well as the row query, so a
// file_type filter has to agree in both.
#[test]
fn in_filter_total_agrees_with_returned_rows() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    vault(&conn);

    let (paths, total) = filtered_paths(&conn, in_filter("markdown,canvas,pdf"));

    assert_eq!(paths.len(), 3);
    assert_eq!(total, 3);
}

// Seeded so that path order and file_type order disagree: sorting by file_type
// must not fall through to the frontmatter subquery, which would leave the rows
// in insertion order.
#[test]
fn sorting_by_file_type_orders_by_the_column() {
    let tmp = TempDir::new().expect("temp dir");
    let conn = open(&tmp);
    seed(&conn, "a.md", "pdf");
    seed(&conn, "b.md", "markdown");
    seed(&conn, "c.md", "canvas");

    let results = query_bases(
        &conn,
        BaseQuery {
            filters: vec![],
            sort: vec![BaseSort {
                property: "file_type".into(),
                descending: false,
            }],
            limit: 100,
            offset: 0,
        },
    )
    .expect("query_bases should succeed");

    let paths: Vec<String> = results.rows.iter().map(|r| r.note.path.clone()).collect();
    assert_eq!(paths, vec!["c.md", "b.md", "a.md"]);
}
