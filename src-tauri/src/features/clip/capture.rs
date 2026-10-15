use std::sync::Mutex;
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::features::clip::figure_snapshots::snapshot_figures;
use crate::features::clip::service::{check_page_size, ClipPage};
use crate::features::clip::webview_eval::eval_string;
use crate::features::plugin::http_fetch::check_ssrf;

// SECURITY INVARIANT: these labels must never appear in any capabilities file.
// Both windows load arbitrary remote pages; without capability grants they
// have no Tauri IPC, so the page cannot invoke commands. See
// capability_files_never_grant_clip_windows below.
const CAPTURE_WINDOW_LABEL: &str = "clip-capture";
const RENDER_WINDOW_LABEL: &str = "clip-render";
const CAPTURE_CLOSED_EVENT: &str = "clip:capture-closed";
const OUTER_HTML_JS: &str = "document.documentElement.outerHTML";
const RENDER_LOAD_TIMEOUT: Duration = Duration::from_secs(20);
const RENDER_SETTLE: Duration = Duration::from_secs(1);
// Tall enough that most figures fit the viewport and can be snapshotted whole.
const RENDER_SIZE: (f64, f64) = (1280.0, 2400.0);

fn parse_remote_url(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    check_ssrf(&parsed)?;
    Ok(parsed)
}

fn close_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

#[tauri::command]
#[specta::specta]
pub async fn clip_capture_start(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = parse_remote_url(&url)?;
    close_window(&app, CAPTURE_WINDOW_LABEL);

    let window = WebviewWindowBuilder::new(
        &app,
        CAPTURE_WINDOW_LABEL,
        WebviewUrl::External(parsed),
    )
    .title("Clip capture — solve any challenge, then click Capture")
    .inner_size(1100.0, 800.0)
    .build()
    .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = app_handle.emit(CAPTURE_CLOSED_EVENT, ());
        }
    });

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn clip_capture_finish(app: AppHandle) -> Result<ClipPage, String> {
    let window = app
        .get_webview_window(CAPTURE_WINDOW_LABEL)
        .ok_or_else(|| "No capture window open".to_string())?;
    let page = collect_page(&window).await;
    let _ = window.close();
    page
}

#[tauri::command]
#[specta::specta]
pub async fn clip_capture_cancel(app: AppHandle) -> Result<(), String> {
    close_window(&app, CAPTURE_WINDOW_LABEL);
    Ok(())
}

/// Loads `url` in a hidden window so composite figures can be snapshotted.
#[tauri::command]
#[specta::specta]
pub async fn clip_render_page(app: AppHandle, url: String) -> Result<ClipPage, String> {
    let parsed = parse_remote_url(&url)?;
    close_window(&app, RENDER_WINDOW_LABEL);

    let (loaded_tx, loaded_rx) = tokio::sync::oneshot::channel::<()>();
    let loaded_tx = Mutex::new(Some(loaded_tx));
    let window = WebviewWindowBuilder::new(&app, RENDER_WINDOW_LABEL, WebviewUrl::External(parsed))
        .title("Clip render")
        .inner_size(RENDER_SIZE.0, RENDER_SIZE.1)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Some(tx) = loaded_tx.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let page = match tokio::time::timeout(RENDER_LOAD_TIMEOUT, loaded_rx).await {
        Ok(Ok(())) => {
            tokio::time::sleep(RENDER_SETTLE).await;
            collect_page(&window).await
        }
        Ok(Err(_)) => Err("render window closed before the page loaded".to_string()),
        Err(_) => Err("render page load timed out".to_string()),
    };
    let _ = window.close();
    page
}

async fn collect_page(window: &WebviewWindow) -> Result<ClipPage, String> {
    let final_url = window.url().map_err(|e| e.to_string())?.to_string();
    let figure_snapshots = snapshot_figures(window).await;
    let html = eval_string(window, OUTER_HTML_JS).await?;
    check_page_size(html.len())?;
    Ok(ClipPage {
        final_url,
        html,
        content_type: "text/html".to_string(),
        figure_snapshots,
    })
}

#[cfg(test)]
mod tests {
    use super::{CAPTURE_WINDOW_LABEL, RENDER_WINDOW_LABEL};

    #[test]
    fn capability_files_never_grant_clip_windows() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        for entry in std::fs::read_dir(dir).expect("capabilities dir exists") {
            let path = entry.expect("readable dir entry").path();
            let content = std::fs::read_to_string(&path).expect("readable capability file");
            for label in [CAPTURE_WINDOW_LABEL, RENDER_WINDOW_LABEL] {
                assert!(
                    !content.contains(label),
                    "{} grants Tauri IPC to the {label} window, which loads \
                     arbitrary remote pages",
                    path.display()
                );
            }
        }
    }
}
