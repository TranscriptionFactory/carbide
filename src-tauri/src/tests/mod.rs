#[path = "../../tests/notes_service_safety.rs"]
mod notes_service_safety;

#[path = "../../tests/plugin_protocol.rs"]
mod plugin_protocol;

#[path = "../../tests/search_db_behavior.rs"]
mod search_db_behavior;

#[path = "../../tests/vault_settings_service_parse.rs"]
mod vault_settings_service_parse;

#[path = "../../tests/mcp_types.rs"]
mod mcp_types;

#[path = "../../tests/mcp_router.rs"]
mod mcp_router;

#[path = "../../tests/mcp_tools_notes.rs"]
mod mcp_tools_notes;

#[path = "../../tests/mcp_tools_search_metadata_vault.rs"]
mod mcp_tools_search_metadata_vault;

#[path = "../../tests/smart_links_rules.rs"]
mod smart_links_rules;

#[path = "../../tests/smart_links_config.rs"]
mod smart_links_config;

mod specta_export {
    use specta_typescript::{BigIntExportBehavior, Typescript};
    use tauri_specta::{collect_commands, Builder};

    #[test]
    fn export_bindings() {
        let typescript = Typescript::default().bigint(BigIntExportBehavior::Number);
        Builder::<tauri::Wry>::new()
            .commands(collect_commands![
                // Notes commands (16)
                crate::features::notes::service::list_notes,
                crate::features::notes::service::list_folders,
                crate::features::notes::service::read_note,
                crate::features::notes::service::write_note,
                crate::features::notes::service::write_and_index_note,
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
                // Search commands (26)
                crate::features::search::service::index_build,
                crate::features::search::service::index_sync_paths,
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
                crate::features::search::service::semantic_search,
                crate::features::search::service::find_similar_notes,
                crate::features::search::service::semantic_search_batch,
                crate::features::search::service::hybrid_search,
                crate::features::search::service::get_embedding_status,
                crate::features::search::service::rebuild_embeddings,
                crate::features::search::service::embed_sync,
                crate::features::search::service::shutdown_search_worker,
                crate::features::search::service::get_note_stats,
                crate::features::search::service::query_linked_notes_by_source,
                crate::features::search::service::count_linked_notes_by_source,
                crate::features::search::service::find_note_by_citekey,
                crate::features::search::service::search_linked_notes,
                crate::features::search::service::update_linked_note_metadata,
                // Git commands (15)
                crate::features::git::service::git_has_repo,
                crate::features::git::service::git_init_repo,
                crate::features::git::service::git_status,
                crate::features::git::service::git_stage_and_commit,
                crate::features::git::service::git_log,
                crate::features::git::service::git_diff,
                crate::features::git::service::git_show_file_at_commit,
                crate::features::git::service::git_restore_file,
                crate::features::git::service::git_create_tag,
                crate::features::git::service::git_push,
                crate::features::git::service::git_fetch,
                crate::features::git::service::git_pull,
                crate::features::git::service::git_add_remote,
                crate::features::git::service::git_set_remote_url,
                crate::features::git::service::git_push_with_upstream,
                // Vault commands (10)
                crate::features::vault::service::open_vault,
                crate::features::vault::service::open_vault_by_id,
                crate::features::vault::service::open_folder,
                crate::features::vault::service::promote_to_vault,
                crate::features::vault::service::list_vaults,
                crate::features::vault::service::remove_vault_from_registry,
                crate::features::vault::service::remember_last_vault,
                crate::features::vault::service::get_last_vault_id,
                crate::features::vault::service::resolve_file_to_vault,
                crate::features::vault::service::refresh_note_count,
                // Bases commands (4)
                crate::features::bases::service::bases_list_properties,
                crate::features::bases::service::bases_query,
                crate::features::bases::service::bases_save_view,
                crate::features::bases::service::bases_load_view,
                // Watcher commands (2)
                crate::features::watcher::service::watch_vault,
                crate::features::watcher::service::unwatch_vault,
                // AI commands (2)
                crate::features::ai::service::ai_check_cli,
                crate::features::ai::service::ai_execute_cli,
                // Canvas commands (4)
                crate::features::canvas::extract_canvas_links,
                crate::features::canvas::extract_canvas_text,
                crate::features::canvas::rewrite_canvas_file_refs,
                crate::features::canvas::rewrite_canvas_refs_for_rename,
                // Tasks commands (5)
                crate::features::tasks::tasks_query,
                crate::features::tasks::tasks_get_for_note,
                crate::features::tasks::tasks_update_state,
                crate::features::tasks::tasks_create,
                crate::features::tasks::tasks_update_due_date,
                // Pipeline commands (1)
                crate::features::pipeline::service::pipeline_execute,
                // Buffer commands (5)
                crate::shared::buffer::open_buffer,
                crate::shared::buffer::update_buffer,
                crate::shared::buffer::save_buffer,
                crate::shared::buffer::read_buffer_window,
                crate::shared::buffer::close_buffer,
                // App commands (1)
                crate::app::get_pending_file_open,
                // Marksman commands (17)
                crate::features::markdown_lsp::service::markdown_lsp_start,
                crate::features::markdown_lsp::service::markdown_lsp_stop,
                crate::features::markdown_lsp::service::markdown_lsp_did_open,
                crate::features::markdown_lsp::service::markdown_lsp_did_change,
                crate::features::markdown_lsp::service::markdown_lsp_did_save,
                crate::features::markdown_lsp::service::markdown_lsp_hover,
                crate::features::markdown_lsp::service::markdown_lsp_references,
                crate::features::markdown_lsp::service::markdown_lsp_definition,
                crate::features::markdown_lsp::service::markdown_lsp_code_actions,
                crate::features::markdown_lsp::service::markdown_lsp_code_action_resolve,
                crate::features::markdown_lsp::service::markdown_lsp_workspace_symbols,
                crate::features::markdown_lsp::service::markdown_lsp_rename,
                crate::features::markdown_lsp::service::markdown_lsp_prepare_rename,
                crate::features::markdown_lsp::service::markdown_lsp_completion,
                crate::features::markdown_lsp::service::markdown_lsp_formatting,
                crate::features::markdown_lsp::service::markdown_lsp_inlay_hints,
                crate::features::markdown_lsp::service::markdown_lsp_document_symbols,
                crate::features::markdown_lsp::service::iwe_config_status,
                crate::features::markdown_lsp::service::iwe_config_reset,
                crate::features::markdown_lsp::service::iwe_config_rewrite_provider,
                crate::features::search::service::tags_list_all,
                crate::features::search::service::tags_get_notes_for_tag,
                crate::features::search::service::tags_get_notes_for_tag_prefix,
                crate::features::code_lsp::code_lsp_open_file,
                crate::features::code_lsp::code_lsp_close_file,
                crate::features::code_lsp::code_lsp_stop_vault,
                crate::features::code_lsp::code_lsp_available_languages,
                crate::features::code_lsp::code_lsp_get_status,
                // Smart Links commands (3)
                crate::features::smart_links::smart_links_load_rules,
                crate::features::smart_links::smart_links_save_rules,
                crate::features::smart_links::smart_links_compute_suggestions,
                // Note: settings and vault_settings commands are excluded because they use
                // serde_json::Value which cannot be statically typed in TypeScript
            ])
            .export(typescript, "../src/lib/generated/bindings.ts")
            .expect("Failed to export typescript bindings");
    }
}
