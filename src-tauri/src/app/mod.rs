pub mod menu;

use crate::features;
use crate::shared;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

include!(concat!(env!("OUT_DIR"), "/icon_stamp.rs"));

#[derive(Default)]
pub struct PendingFileOpen(pub Mutex<Option<String>>);

#[tauri::command]
#[specta::specta]
pub fn get_pending_file_open(state: tauri::State<PendingFileOpen>) -> Option<String> {
    state.0.lock().unwrap().take()
}

fn handle_file_open(app: &tauri::AppHandle, path: String) {
    log::info!("File open event: {}", path);
    let state = app.state::<PendingFileOpen>();
    *state.0.lock().unwrap() = Some(path.clone());

    // Delay emission slightly to ensure frontend is ready to receive it
    // especially during cold start or single-instance wake-up
    let app_handle = app.clone();
    let path_clone = path.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let _ = app_handle.emit("file-open", &path_clone);
    });

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let _ = ICON_STAMP;
    log::info!("Badgerly starting");

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let mut log_builder = tauri_plugin_log::Builder::new().level(log_level).targets([
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
    ]);

    if std::env::var("BADGERLY_LOG_FORMAT").as_deref() == Ok("json") {
        log_builder = log_builder.format(|callback, message, record| {
            callback.finish(format_args!(
                r#"{{"level":"{}","target":"{}","message":"{}"}}"#,
                record.level(),
                record.target(),
                message
            ))
        });
    }

    tauri::Builder::default()
        .manage(PendingFileOpen::default())
        .manage(features::watcher::service::WatcherState::default())
        .manage(features::search::service::SearchDbState::default())
        .manage(features::search::embeddings::EmbeddingServiceState::default())
        .manage(features::plugin::service::PluginService::new())
        .manage(features::plugin::watcher::PluginWatcherState::default())
        .manage(shared::buffer::BufferManager::new())
        .manage(features::graph::service::GraphCacheState::default())
        .manage(features::graph::service::VaultGraphCacheState::default())
        .manage(features::lint::service::LintState::default())
        .manage(features::code_lsp::CodeLspState::default())
        .manage(features::iwe::IweState::default())
        .manage(features::toolchain::service::ToolchainState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            log::info!("Second instance launched with args: {:?}", args);
            for arg in args.iter().skip(1) {
                if arg == "--restart-iwe" {
                    let _ = app.emit("iwe-restart-requested", ());
                    return;
                }
                if !arg.starts_with('-') {
                    handle_file_open(app, arg.clone());
                    break;
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(log_builder.build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    StateFlags::SIZE
                        | StateFlags::POSITION
                        | StateFlags::MAXIMIZED
                        | StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .setup(|app| {
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let id = event.id().0.as_str();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-action", id);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            features::ai::service::ai_check_cli,
            features::ai::service::ai_execute_cli,
            features::pipeline::service::pipeline_execute,
            features::vault::service::open_vault,
            features::vault::service::open_vault_by_id,
            features::vault::service::open_folder,
            features::vault::service::promote_to_vault,
            features::vault::service::list_vaults,
            features::vault::service::remove_vault_from_registry,
            features::vault::service::remember_last_vault,
            features::vault::service::get_last_vault_id,
            features::watcher::service::watch_vault,
            features::watcher::service::unwatch_vault,
            features::search::service::index_build,
            features::search::service::index_sync_paths,
            features::search::service::index_cancel,
            features::search::service::index_rebuild,
            features::search::service::index_search,
            features::search::service::index_suggest,
            features::search::service::index_suggest_planned,
            features::search::service::index_list_note_paths_by_prefix,
            features::search::service::index_upsert_note,
            features::search::service::index_remove_note,
            features::search::service::index_remove_notes,
            features::search::service::index_remove_notes_by_prefix,
            features::search::service::index_rename_note,
            features::search::service::index_rename_folder,
            features::search::service::index_note_links_snapshot,
            features::search::service::index_extract_local_note_links,
            features::search::service::rewrite_note_links,
            features::search::service::resolve_note_link,
            features::search::service::resolve_wiki_link,
            features::search::service::semantic_search,
            features::search::service::semantic_search_batch,
            features::search::service::find_similar_notes,
            features::search::service::hybrid_search,
            features::search::service::get_embedding_status,
            features::search::service::rebuild_embeddings,
            features::search::service::embed_sync,
            features::search::service::shutdown_search_worker,
            features::search::service::get_note_stats,
            features::bases::service::bases_list_properties,
            features::bases::service::bases_query,
            features::bases::service::bases_save_view,
            features::bases::service::bases_load_view,
            features::tags::service::tags_list_all,
            features::tags::service::tags_list_all_unified,
            features::tags::service::tags_get_notes_for_tag,
            features::tags::service::tags_get_notes_for_tag_prefix,
            features::tags::service::notes_with_code_language,
            features::tags::service::property_registry_list,
            features::tags::service::notes_with_tag_in_section,
            features::tags::service::notes_by_property_filter,
            features::tags::service::note_get_metadata,
            features::tags::service::section_get_range,
            features::tasks::tasks_query,
            features::tasks::tasks_get_for_note,
            features::tasks::tasks_update_state,
            features::tasks::tasks_create,
            features::graph::service::graph_load_note_neighborhood,
            features::graph::service::graph_invalidate_cache,
            features::graph::service::graph_cache_stats,
            features::graph::service::graph_load_vault_graph,
            features::graph::service::graph_load_vault_graph_streamed,
            features::notes::service::list_notes,
            features::notes::service::list_folders,
            features::notes::service::read_note,
            features::notes::service::write_note,
            features::notes::service::write_and_index_note,
            features::notes::service::create_note,
            features::notes::service::create_folder,
            features::notes::service::write_image_asset,
            features::notes::service::rename_note,
            features::notes::service::delete_note,
            features::notes::service::rename_folder,
            features::notes::service::move_items,
            features::notes::service::delete_folder,
            features::notes::service::list_folder_contents,
            features::notes::service::get_folder_stats,
            features::notes::service::read_vault_file,
            features::notes::service::write_vault_file,
            features::notes::service::write_bytes_to_path,
            features::notes::service::delete_vault_file,
            features::notes::service::list_vault_files_by_extension,
            features::notes::service::search_vault_assets,
            features::settings::service::get_setting,
            features::settings::service::set_setting,
            features::vault_settings::service::get_vault_setting,
            features::vault_settings::service::set_vault_setting,
            features::vault_settings::service::get_local_setting,
            features::vault_settings::service::set_local_setting,
            features::git::service::git_has_repo,
            features::git::service::git_init_repo,
            features::git::service::git_status,
            features::git::service::git_stage_and_commit,
            features::git::service::git_log,
            features::git::service::git_diff,
            features::git::service::git_show_file_at_commit,
            features::git::service::git_restore_file,
            features::git::service::git_create_tag,
            features::git::service::git_push,
            features::git::service::git_fetch,
            features::git::service::git_pull,
            features::git::service::git_add_remote,
            features::git::service::git_set_remote_url,
            features::git::service::git_push_with_upstream,
            features::vault::service::resolve_file_to_vault,
            features::vault::service::refresh_note_count,
            features::plugin::plugin_discover,
            features::plugin::plugin_load,
            features::plugin::plugin_unload,
            features::plugin::plugin_read_settings,
            features::plugin::plugin_write_settings,
            features::plugin::plugin_approve_permission,
            features::plugin::plugin_deny_permission,
            features::plugin::watcher::watch_plugins,
            features::plugin::watcher::unwatch_plugins,
            shared::buffer::open_buffer,
            shared::buffer::update_buffer,
            shared::buffer::save_buffer,
            shared::buffer::read_buffer_window,
            shared::buffer::close_buffer,
            get_pending_file_open,
            features::canvas::extract_canvas_links,
            features::canvas::extract_canvas_text,
            features::canvas::rewrite_canvas_file_refs,
            features::canvas::rewrite_canvas_refs_for_rename,
            features::lint::lint_start,
            features::lint::lint_stop,
            features::lint::lint_open_file,
            features::lint::lint_update_file,
            features::lint::lint_close_file,
            features::lint::lint_format_file,
            features::lint::lint_fix_all,
            features::lint::lint_check_vault,
            features::lint::lint_format_vault,
            features::lint::lint_get_status,
            features::code_lsp::code_lsp_open_file,
            features::code_lsp::code_lsp_close_file,
            features::code_lsp::code_lsp_stop_vault,
            features::code_lsp::code_lsp_available_languages,
            features::code_lsp::code_lsp_get_status,
            features::iwe::service::iwe_start,
            features::iwe::service::iwe_stop,
            features::iwe::service::iwe_did_open,
            features::iwe::service::iwe_did_change,
            features::iwe::service::iwe_did_save,
            features::iwe::service::iwe_hover,
            features::iwe::service::iwe_references,
            features::iwe::service::iwe_definition,
            features::iwe::service::iwe_code_actions,
            features::iwe::service::iwe_code_action_resolve,
            features::iwe::service::iwe_workspace_symbols,
            features::iwe::service::iwe_rename,
            features::iwe::service::iwe_prepare_rename,
            features::iwe::service::iwe_completion,
            features::iwe::service::iwe_formatting,
            features::iwe::service::iwe_inlay_hints,
            features::iwe::service::iwe_document_symbols,
            features::iwe::service::iwe_hierarchy_tree,
            features::toolchain::service::toolchain_list_tools,
            features::toolchain::service::toolchain_install,
            features::toolchain::service::toolchain_uninstall,
            features::toolchain::service::toolchain_resolve,
            features::reference::service::reference_load_library,
            features::reference::service::reference_save_library,
            features::reference::service::reference_add_item,
            features::reference::service::reference_remove_item,
            features::reference::service::reference_doi_lookup,
            features::reference::service::reference_bbt_test_connection,
            features::reference::service::reference_bbt_search,
            features::reference::service::reference_bbt_get_item,
            features::reference::service::reference_bbt_collections,
            features::reference::service::reference_bbt_collection_items,
            features::reference::service::reference_bbt_bibliography,
        ])
        .register_uri_scheme_protocol("badgerly-asset", |ctx, req| {
            shared::storage::handle_asset_request(ctx.app_handle(), req)
        })
        .register_uri_scheme_protocol("badgerly-plugin", |_ctx, req| {
            shared::storage::handle_plugin_request(req)
        })
        .register_uri_scheme_protocol("badgerly-excalidraw", |ctx, req| {
            shared::storage::handle_excalidraw_request(ctx.app_handle(), req)
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Opened { urls } = &event {
                    for url in urls {
                        if url.scheme() == "file" {
                            if let Ok(path) = url.to_file_path() {
                                handle_file_open(app, path.to_string_lossy().into_owned());
                            }
                        }
                    }
                }
            }
            let _ = (&app, &event);
        });
}
