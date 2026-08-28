use crate::features::search::embedding_model::Pooling;
use crate::features::search::embeddings::{
    excerpt, unusable_query_log_message, unusable_rows_log_message, usable_query_vector,
    EXCERPT_CHARS,
};
use candle_core::Device;

#[test]
fn usable_query_vector_passes_a_usable_vector_through() {
    let vector = vec![0.5, 0.25, 0.25];
    assert_eq!(
        usable_query_vector(vector.clone(), "any query"),
        Some(vector)
    );
}

#[test]
fn usable_query_vector_rejects_an_all_nan_pooled_row() {
    assert!(usable_query_vector(vec![f32::NAN; 384], "poisoned query").is_none());
}

#[test]
fn usable_query_vector_rejects_a_zeroed_row() {
    // What a NaN row looks like once normalize_rows zeroed it — the shape
    // callers actually see.
    assert!(usable_query_vector(vec![0.0; 384], "poisoned query").is_none());
}

#[test]
fn unusable_query_log_message_names_the_query_excerpt() {
    let message = unusable_query_log_message("what did I write about\nNaN triggers?");
    assert!(message.contains("query vector unusable"));
    assert!(message.contains("skipping vector leg"));
    assert!(message.contains("query=what did I write about\\nNaN triggers?"));
}

#[test]
fn unusable_rows_message_names_caller_and_first_bad_input() {
    let texts = ["harmless note text", "the poisoned\nfirst line"];
    let pooled = vec![vec![0.25; 4], vec![f32::NAN; 4]];
    let message = unusable_rows_log_message(&Device::Cpu, Pooling::Cls, "documents", &texts, &pooled)
        .expect("one unusable row should produce a message");
    assert!(message.contains("1/2 pooled rows unusable"));
    assert!(message.contains("caller=documents"));
    // The excerpt belongs to the row that failed, not the batch's first text.
    assert!(message.contains("input=the poisoned\\nfirst line"));
    assert!(message.contains("nan=4"));
}

#[test]
fn unusable_rows_message_carries_the_query_caller_for_query_batches() {
    let message = unusable_rows_log_message(
        &Device::Cpu,
        Pooling::Cls,
        "query",
        &["Represent this sentence:"],
        &[vec![0.0; 8]],
    )
    .expect("a zeroed row should produce a message");
    assert!(message.contains("caller=query"));
    assert!(message.contains("input=Represent this sentence:"));
    assert!(message.contains("zero=8"));
}

#[test]
fn unusable_rows_message_is_none_when_every_row_is_usable() {
    let pooled = vec![vec![0.5, 0.5], vec![1.0, 0.0]];
    assert!(unusable_rows_log_message(
        &Device::Cpu,
        Pooling::Cls,
        "documents",
        &["a", "b"],
        &pooled
    )
    .is_none());
}

#[test]
fn excerpt_escapes_control_characters() {
    assert_eq!(excerpt("one\ntwo\u{0}"), "one\\ntwo\\u0000");
    assert_eq!(excerpt("tab\tcr\r"), "tab\\tcr\\r");
}

#[test]
fn excerpt_truncates_at_eighty_chars() {
    let out = excerpt(&"x".repeat(120));
    assert_eq!(out.chars().count(), EXCERPT_CHARS + 1);
    assert!(out.ends_with('…'));
}

#[test]
fn excerpt_keeps_short_text_whole() {
    assert_eq!(excerpt("short query"), "short query");
}
