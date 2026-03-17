#[path = "../../tests/notes_service_safety.rs"]
mod notes_service_safety;

#[path = "../../tests/plugin_protocol.rs"]
mod plugin_protocol;

#[path = "../../tests/search_db_behavior.rs"]
mod search_db_behavior;

#[path = "../../tests/vault_settings_service_parse.rs"]
mod vault_settings_service_parse;

#[path = "../../tests/link_rewrite.rs"]
mod link_rewrite;

mod specta_export {
    use specta_typescript::{BigIntExportBehavior, Typescript};
    use tauri_specta::{collect_commands, Builder};

    #[test]
    fn export_bindings() {
        let typescript = Typescript::default().bigint(BigIntExportBehavior::Number);
        Builder::<tauri::Wry>::new()
            .commands(collect_commands![
                // Notes commands
                crate::features::notes::service::list_notes,
                crate::features::notes::service::list_folders,
                crate::features::notes::service::read_note,
                crate::features::notes::service::write_note,
                crate::features::notes::service::create_note,
                crate::features::notes::service::create_folder,
                crate::features::notes::service::write_image_asset,
                crate::features::notes::service::rename_note,
                crate::features::notes::service::delete_note,
                crate::features::notes::service::rename_folder,
                crate::features::notes::service::move_items,
                crate::features::notes::service::delete_folder,
                crate::features::notes::service::list_folder_contents,
                crate::features::notes::service::get_folder_stats,
                crate::features::notes::service::read_vault_file,
                crate::features::notes::service::write_vault_file,
                // Search commands
                crate::features::search::service::index_build,
                crate::features::search::service::index_cancel,
                crate::features::search::service::index_rebuild,
                crate::features::search::service::index_search,
                crate::features::search::service::index_suggest,
                crate::features::search::service::index_suggest_planned,
                crate::features::search::service::index_list_note_paths_by_prefix,
                crate::features::search::service::index_upsert_note,
                crate::features::search::service::index_remove_note,
                crate::features::search::service::index_remove_notes,
                crate::features::search::service::index_remove_notes_by_prefix,
                crate::features::search::service::index_rename_folder,
                crate::features::search::service::index_rename_note,
                crate::features::search::service::index_note_links_snapshot,
                crate::features::search::service::index_extract_local_note_links,
                crate::features::search::service::rewrite_note_links,
                crate::features::search::service::resolve_note_link,
                crate::features::search::service::resolve_wiki_link,
                crate::features::search::service::semantic_search,
                crate::features::search::service::find_similar_notes,
                crate::features::search::service::semantic_search_batch,
                crate::features::search::service::hybrid_search,
                crate::features::search::service::get_embedding_status,
                crate::features::search::service::rebuild_embeddings,
                crate::features::search::service::embed_sync,
                crate::features::search::service::get_note_stats,
            ])
            .export(typescript, "../src/lib/generated/bindings.ts")
            .expect("Failed to export typescript bindings");
    }
}
