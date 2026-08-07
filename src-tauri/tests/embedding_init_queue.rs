use crate::features::search::embeddings::InitQueue;

const MODEL: &str = "snowflake-arctic-embed-xs";
const OTHER: &str = "bge-small-en-v1.5";

#[test]
fn second_claim_for_the_same_model_is_refused() {
    let queue = InitQueue::default();
    let first = queue.claim(MODEL);

    assert!(first.is_some());
    assert!(queue.claim(MODEL).is_none(), "one load per model at a time");
    assert!(queue.is_in_flight(MODEL));
}

#[test]
fn a_different_model_is_not_swallowed_by_an_in_flight_load() {
    // The bare `AtomicBool` this replaced gated on *any* load being in flight,
    // so switching models mid-load dropped the new model's request entirely and
    // left the old model serving every query.
    let queue = InitQueue::default();
    let _loading = queue.claim(MODEL).expect("first claim");

    let switched = queue.claim(OTHER);

    assert!(switched.is_some(), "a model switch must still start a load");
    assert!(queue.is_in_flight(MODEL));
    assert!(queue.is_in_flight(OTHER));
}

#[test]
fn dropping_a_claim_releases_the_model() {
    let queue = InitQueue::default();
    drop(queue.claim(MODEL).expect("first claim"));

    assert!(!queue.is_in_flight(MODEL));
    assert!(queue.claim(MODEL).is_some(), "a finished load can be retried");
}

#[test]
fn a_panicking_load_thread_releases_its_claim() {
    // The release profile does not set `panic = "abort"` (the HNSW
    // `catch_unwind` needs unwind), so a load that panics unwinds through the
    // claim. Before the drop guard the flag leaked, `init_in_background` became
    // a permanent no-op for that model, and — because the query path returns
    // "not ready" on a `try_get` miss without ever consulting the flag — no
    // retry path existed at all short of a restart.
    let queue = InitQueue::default();
    let thread_queue = queue.clone();

    let panicked = std::thread::spawn(move || {
        let _claim = thread_queue.claim(MODEL).expect("claim inside load thread");
        panic!("model load blew up");
    })
    .join();

    assert!(panicked.is_err(), "the load thread must have panicked");
    assert!(!queue.is_in_flight(MODEL), "the claim leaked past the unwind");
    assert!(
        queue.claim(MODEL).is_some(),
        "a later load for the same model must still start"
    );
}

#[test]
fn claims_are_released_independently() {
    let queue = InitQueue::default();
    let first = queue.claim(MODEL).expect("first claim");
    let _second = queue.claim(OTHER).expect("second claim");

    drop(first);

    assert!(!queue.is_in_flight(MODEL));
    assert!(queue.is_in_flight(OTHER));
}
