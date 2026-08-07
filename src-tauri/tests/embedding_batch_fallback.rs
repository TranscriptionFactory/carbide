use crate::features::search::embeddings::embed_with_singles_fallback;

const POISON: &str = "text-that-cannot-be-embedded";

fn vector_for(text: &str) -> Vec<f32> {
    vec![text.len() as f32, 1.0, 0.0]
}

/// Embeds anything except [`POISON`], which fails the way a tokenizer or a
/// device allocation would — taking down whatever batch it is part of.
fn embed_unless_poisoned(window: &[&str]) -> Result<Vec<Vec<f32>>, String> {
    if window.contains(&POISON) {
        return Err("forward: unsupported input".to_string());
    }
    Ok(window.iter().map(|text| vector_for(text)).collect())
}

fn chunk_of(size: usize, poison_at: Option<usize>) -> Vec<String> {
    (0..size)
        .map(|i| {
            if poison_at == Some(i) {
                POISON.to_string()
            } else {
                format!("note-{i} body")
            }
        })
        .collect()
}

fn as_refs(texts: &[String]) -> Vec<&str> {
    texts.iter().map(String::as_str).collect()
}

#[test]
fn a_clean_batch_is_embedded_in_one_pass() {
    let texts = chunk_of(32, None);
    let mut calls = 0usize;

    let vectors = embed_with_singles_fallback(&as_refs(&texts), |window| {
        calls += 1;
        embed_unless_poisoned(window)
    })
    .expect("not cancelled");

    assert_eq!(calls, 1, "a clean batch must not fall back");
    assert_eq!(vectors.len(), 32);
    assert!(vectors.iter().all(Option::is_some));
}

#[test]
fn one_failing_text_still_embeds_the_other_thirty_one() {
    // The batched fallback pass invalidated these notes' rows before embedding
    // them, so a batch lost whole to one bad text would leave all 32 with no
    // vector at all until a manual reindex.
    let texts = chunk_of(32, Some(7));

    let vectors =
        embed_with_singles_fallback(&as_refs(&texts), embed_unless_poisoned).expect("not cancelled");

    assert_eq!(vectors.len(), 32);
    assert!(vectors[7].is_none(), "the poisoned text yields no vector");
    for (i, vector) in vectors.iter().enumerate() {
        if i == 7 {
            continue;
        }
        assert_eq!(
            vector.as_ref(),
            Some(&vector_for(&texts[i])),
            "note {i} must survive its batch-mate's failure"
        );
    }
}

#[test]
fn results_stay_aligned_with_their_inputs() {
    // Callers zip the result against the path list, so a fallback that dropped
    // failures instead of yielding `None` would write every later note's vector
    // under the wrong path.
    let texts = chunk_of(5, Some(0));

    let vectors =
        embed_with_singles_fallback(&as_refs(&texts), embed_unless_poisoned).expect("not cancelled");

    assert_eq!(vectors.len(), texts.len());
    assert!(vectors[0].is_none());
    assert_eq!(vectors[4].as_ref(), Some(&vector_for(&texts[4])));
}

#[test]
fn cancellation_is_reported_rather_than_retried() {
    let texts = chunk_of(32, None);
    let mut calls = 0usize;

    let result = embed_with_singles_fallback(&as_refs(&texts), |_| {
        calls += 1;
        Err::<Vec<Vec<f32>>, String>("embedding cancelled".to_string())
    });

    assert!(result.is_err(), "cancellation must surface to the caller");
    assert_eq!(calls, 1, "a cancelled batch must not be retried per text");
}

#[test]
fn cancellation_partway_through_the_singles_retry_stops_immediately() {
    let texts = chunk_of(32, Some(0));
    let mut calls = 0usize;

    let result = embed_with_singles_fallback(&as_refs(&texts), |window| {
        calls += 1;
        if calls > 3 {
            return Err("embedding cancelled".to_string());
        }
        embed_unless_poisoned(window)
    });

    assert!(result.is_err());
    assert_eq!(calls, 4, "the retry loop stops at the cancellation");
}

#[test]
fn a_short_batch_result_falls_back_rather_than_misaligning() {
    // A backend that returned fewer vectors than texts would otherwise have its
    // output zipped against the wrong paths.
    let texts = chunk_of(4, None);
    let mut calls = 0usize;

    let vectors = embed_with_singles_fallback(&as_refs(&texts), |window| {
        calls += 1;
        let mut vectors = embed_unless_poisoned(window)?;
        if calls == 1 {
            vectors.pop();
        }
        Ok(vectors)
    })
    .expect("not cancelled");

    assert_eq!(vectors.len(), 4);
    assert!(vectors.iter().all(Option::is_some));
}
