use crate::features::markdown_lsp::types::MarkdownLspProvider;

#[test]
fn iwes_supports_inlay_hints() {
    assert!(MarkdownLspProvider::Iwes.supports_inlay_hints());
}

#[test]
fn marksman_does_not_support_inlay_hints() {
    assert!(!MarkdownLspProvider::Marksman.supports_inlay_hints());
}

#[test]
fn iwes_supports_formatting() {
    assert!(MarkdownLspProvider::Iwes.supports_formatting());
}

#[test]
fn marksman_does_not_support_formatting() {
    assert!(!MarkdownLspProvider::Marksman.supports_formatting());
}

#[test]
fn iwes_supports_transform_actions() {
    assert!(MarkdownLspProvider::Iwes.supports_transform_actions());
}

#[test]
fn marksman_does_not_support_transform_actions() {
    assert!(!MarkdownLspProvider::Marksman.supports_transform_actions());
}

#[test]
fn iwes_completion_trigger_characters() {
    let chars = MarkdownLspProvider::Iwes.completion_trigger_characters();
    assert_eq!(chars, vec!["+", "[", "("]);
}

#[test]
fn marksman_completion_trigger_characters() {
    let chars = MarkdownLspProvider::Marksman.completion_trigger_characters();
    assert_eq!(chars, vec!["[", "(", "#"]);
}

#[test]
fn provider_as_str() {
    assert_eq!(MarkdownLspProvider::Iwes.as_str(), "iwes");
    assert_eq!(MarkdownLspProvider::Marksman.as_str(), "marksman");
}

#[test]
fn provider_serde_roundtrip() {
    for provider in [MarkdownLspProvider::Iwes, MarkdownLspProvider::Marksman] {
        let json = serde_json::to_string(&provider).unwrap();
        let deserialized: MarkdownLspProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, provider);
    }
}
