use crate::shared::io_utils::atomic_write;
use std::sync::{Arc, Barrier};

const WRITERS: usize = 16;
const ROUNDS: usize = 25;

#[test]
fn concurrent_writes_to_one_path_all_succeed_and_leave_no_staging_file() {
    let dir = tempfile::tempdir().unwrap();
    let target = Arc::new(dir.path().join("index.json"));
    let barrier = Arc::new(Barrier::new(WRITERS));

    let handles: Vec<_> = (0..WRITERS)
        .map(|writer| {
            let target = Arc::clone(&target);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                (0..ROUNDS)
                    .map(|round| atomic_write(&*target, format!("{writer}-{round}")))
                    .collect::<Vec<_>>()
            })
        })
        .collect();

    let failures: Vec<String> = handles
        .into_iter()
        .flat_map(|handle| handle.join().unwrap())
        .filter_map(Result::err)
        .collect();

    assert!(failures.is_empty(), "writes failed: {failures:?}");
    let content = std::fs::read_to_string(&*target).unwrap();
    assert!(content.ends_with(&format!("-{}", ROUNDS - 1)), "torn content: {content}");
    assert!(!dir.path().join("index.json.tmp").exists());
}
