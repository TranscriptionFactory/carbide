pub mod menu;

use crate::features;
use crate::shared;
use std::panic::{catch_unwind, AssertUnwindSafe};
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

async fn shutdown_managed_processes(app: &tauri::AppHandle) {
    app.state::<features::mcp::http::HttpServerState>()
        .shutdown()
        .await;
    app.state::<features::markdown_lsp::MarkdownLspState>()
        .shutdown()
        .await;
    app.state::<features::code_lsp::CodeLspState>()
        .shutdown()
        .await;
    app.state::<features::lint::service::LintState>()
        .shutdown()
        .await;
    app.state::<features::watcher::service::WatcherState>()
        .shutdown();
    log::info!("Process cleanup complete");
}

// STT commands removed — archived on archive/stt-main

pub fn run() {
    let _ = ICON_STAMP;

    std::panic::set_hook(Box::new(|info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .unwrap_or("unknown");
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();
        log::error!("PANIC at {}: {}", location, payload);
        eprintln!("PANIC at {}: {}", location, payload);
    }));

    log::info!("Carbide starting");

    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let mut log_builder = tauri_plugin_log::Builder::new()
        .level(log_level)
        .level_for("hnsw_rs", log::LevelFilter::Warn)
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
        ]);

    if std::env::var("CARBIDE_LOG_FORMAT").as_deref() == Ok("json") {
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
        .manage(features::lint::service::LintState::default())
        .manage(features::code_lsp::CodeLspState::default())
        .manage(features::markdown_lsp::MarkdownLspState::default())
        .manage(features::toolchain::service::ToolchainState::default())
        .manage(shared::asset_cache::AssetCacheState::new())
        .manage(features::mcp::http::HttpServerState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            log::info!("Second instance launched with args: {:?}", args);
            for arg in args.iter().skip(1) {
                if arg == "--restart-markdown-lsp" {
                    let _ = app.emit("markdown-lsp-restart-requested", ());
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

            // STT init removed — archived on archive/stt-main

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
            features::search::service::query_linked_notes_by_source,
            features::search::service::count_linked_notes_by_source,
            features::search::service::find_note_by_citekey,
            features::search::service::search_linked_notes,
            features::search::service::update_linked_note_metadata,
            features::search::service::semantic_search,
            features::search::service::semantic_search_batch,
            features::search::service::find_similar_notes,
            features::search::service::find_similar_blocks,
            features::search::service::hybrid_search,
            features::search::service::get_embedding_status,
            features::search::service::rebuild_embeddings,
            features::search::service::embed_sync,
            features::search::service::shutdown_search_worker,
            features::search::service::get_storage_stats,
            features::search::service::cleanup_orphaned_dbs,
            features::search::service::clear_embedding_model_cache,
            shared::asset_cache::purge_all_asset_caches,
            features::search::service::get_note_stats,
            features::search::service::get_note_headings,
            features::search::service::get_note_links,
            features::search::service::note_get_file_cache,
            features::search::service::resolve_note_link,
            features::search::service::resolve_wiki_link,
            features::bases::service::bases_list_properties,
            features::bases::service::bases_query,
            features::bases::service::bases_save_view,
            features::bases::service::bases_load_view,
            features::bases::service::bases_list_views,
            features::bases::service::bases_delete_view,
            features::tasks::tasks_query,
            features::tasks::tasks_get_for_note,
            features::tasks::tasks_update_state,
            features::tasks::tasks_create,
            features::tasks::tasks_update_due_date,
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
            features::notes::service::read_absolute_text_file,
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
            features::plugin::http_fetch::plugin_http_fetch,
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
            features::markdown_lsp::service::markdown_lsp_start,
            features::markdown_lsp::service::markdown_lsp_stop,
            features::markdown_lsp::service::markdown_lsp_did_open,
            features::markdown_lsp::service::markdown_lsp_did_change,
            features::markdown_lsp::service::markdown_lsp_did_save,
            features::markdown_lsp::service::markdown_lsp_did_close,
            features::markdown_lsp::service::markdown_lsp_hover,
            features::markdown_lsp::service::markdown_lsp_references,
            features::markdown_lsp::service::markdown_lsp_definition,
            features::markdown_lsp::service::markdown_lsp_code_actions,
            features::markdown_lsp::service::markdown_lsp_code_action_resolve,
            features::markdown_lsp::service::markdown_lsp_workspace_symbols,
            features::markdown_lsp::service::markdown_lsp_rename,
            features::markdown_lsp::service::markdown_lsp_prepare_rename,
            features::markdown_lsp::service::markdown_lsp_completion,
            features::markdown_lsp::service::markdown_lsp_formatting,
            features::markdown_lsp::service::markdown_lsp_inlay_hints,
            features::markdown_lsp::service::markdown_lsp_document_symbols,
            features::markdown_lsp::service::iwe_config_status,
            features::markdown_lsp::service::iwe_config_reset,
            features::markdown_lsp::service::iwe_config_rewrite_provider,
            features::search::service::tags_list_all,
            features::search::service::tags_get_notes_for_tag,
            features::search::service::tags_get_notes_for_tag_prefix,
            features::toolchain::service::toolchain_list_tools,
            features::toolchain::service::toolchain_install,
            features::toolchain::service::toolchain_uninstall,
            features::toolchain::service::toolchain_resolve,
            shared::asset_cache::invalidate_asset_cache,
            features::reference::linked_source::linked_source_scan_folder,
            features::reference::linked_source::linked_source_extract_file,
            features::reference::linked_source::linked_source_list_files,
            features::reference::linked_source::linked_source_index_content,
            features::reference::linked_source::linked_source_remove_content,
            features::reference::linked_source::linked_source_clear_source,
            features::reference::linked_source::resolve_home_dir,
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
            features::reference::service::reference_bbt_annotations,
            features::reference::service::reference_save_annotation_note,
            features::reference::service::reference_read_annotation_note,
            features::mcp::http::http_server_start,
            features::mcp::http::http_server_stop,
            features::mcp::http::http_server_status,
            features::mcp::setup::mcp_setup_claude_desktop,
            features::mcp::setup::mcp_setup_claude_code,
            features::mcp::setup::mcp_regenerate_token,
            features::mcp::setup::mcp_get_setup_status,
            features::mcp::setup::mcp_install_cli,
            features::mcp::setup::mcp_uninstall_cli,
            features::smart_links::smart_links_load_rules,
            features::smart_links::smart_links_save_rules,
            features::smart_links::smart_links_compute_suggestions,
        ])
        .register_asynchronous_uri_scheme_protocol("carbide-asset", |ctx, req, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let uri = req.uri().to_string();
                let response = catch_unwind(AssertUnwindSafe(|| {
                    shared::storage::handle_asset_request(&app, req)
                }))
                .unwrap_or_else(|_| {
                    shared::storage::internal_error_response(
                        "carbide-asset",
                        format!("panic while handling {}", uri),
                    )
                });
                responder.respond(response);
            });
        })
        .register_asynchronous_uri_scheme_protocol("carbide-plugin", |ctx, req, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let uri = req.uri().to_string();
                let response = catch_unwind(AssertUnwindSafe(|| {
                    shared::storage::handle_plugin_request(&app, req)
                }))
                .unwrap_or_else(|_| {
                    shared::storage::internal_error_response(
                        "carbide-plugin",
                        format!("panic while handling {}", uri),
                    )
                });
                responder.respond(response);
            });
        })
        .register_asynchronous_uri_scheme_protocol("carbide-excalidraw", |ctx, req, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let uri = req.uri().to_string();
                let response = catch_unwind(AssertUnwindSafe(|| {
                    shared::storage::handle_excalidraw_request(&app, req)
                }))
                .unwrap_or_else(|_| {
                    shared::storage::internal_error_response(
                        "carbide-excalidraw",
                        format!("panic while handling {}", uri),
                    )
                });
                responder.respond(response);
            });
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
            if let tauri::RunEvent::Exit = &event {
                log::info!("Carbide exiting — cleaning up child processes");
                let app = app.clone();
                tauri::async_runtime::block_on(async move {
                    shutdown_managed_processes(&app).await;
                });
            }
            let _ = (&app, &event);
        });
}
