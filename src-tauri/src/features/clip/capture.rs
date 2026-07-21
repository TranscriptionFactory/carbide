use std::time::Duration;

use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::features::clip::service::{check_page_size, ClipPage};
use crate::features::plugin::http_fetch::check_ssrf;

// SECURITY INVARIANT: this label must never appear in any capabilities file.
// The window loads arbitrary remote pages; without capability grants it has no
// Tauri IPC, so the page cannot invoke commands. See capability_files_never_
// grant_capture_window below.
const CAPTURE_WINDOW_LABEL: &str = "clip-capture";
const CAPTURE_CLOSED_EVENT: &str = "clip:capture-closed";
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(30);
const OUTER_HTML_JS: &str = "document.documentElement.outerHTML";

#[tauri::command]
#[specta::specta]
pub async fn clip_capture_start(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    check_ssrf(&parsed)?;

    if let Some(stale) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        let _ = stale.close();
    }

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

    let final_url = window.url().map_err(|e| e.to_string())?.to_string();
    let html = evaluate_outer_html(&window).await;
    let _ = window.close();
    let html = html?;
    check_page_size(html.len())?;

    Ok(ClipPage {
        final_url,
        html,
        content_type: "text/html".to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn clip_capture_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        let _ = window.close();
    }
    Ok(())
}

async fn evaluate_outer_html(window: &WebviewWindow) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();

    window
        .with_webview(move |platform| evaluate_platform(platform, tx))
        .map_err(|e| e.to_string())?;

    match tokio::time::timeout(CAPTURE_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("page capture handler dropped before completing".into()),
        Err(_) => Err("page capture timed out".into()),
    }
}

#[cfg(target_os = "macos")]
fn evaluate_platform(
    platform: tauri::webview::PlatformWebview,
    tx: tokio::sync::oneshot::Sender<Result<String, String>>,
) {
    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSError, NSString};
    use objc2_web_kit::WKWebView;
    use std::sync::Mutex;

    let webview: &WKWebView = unsafe { &*platform.inner().cast() };
    let sender = Mutex::new(Some(tx));

    let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        let outcome = if !error.is_null() {
            let description = unsafe { &*error }.localizedDescription();
            Err(format!("evaluateJavaScript failed: {description}"))
        } else if result.is_null() {
            Err("evaluateJavaScript returned no value".to_string())
        } else {
            match unsafe { &*result }.downcast_ref::<NSString>() {
                Some(html) => Ok(html.to_string()),
                None => Err("evaluateJavaScript returned a non-string value".to_string()),
            }
        };
        if let Ok(mut guard) = sender.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(outcome);
            }
        }
    });

    unsafe {
        webview.evaluateJavaScript_completionHandler(
            &NSString::from_str(OUTER_HTML_JS),
            Some(&handler),
        );
    }
}

// Windows (ICoreWebView2::ExecuteScript) and Linux (webkit2gtk run_javascript)
// land in a follow-up phase; the seam and choreography are identical.
#[cfg(not(target_os = "macos"))]
fn evaluate_platform(
    _platform: tauri::webview::PlatformWebview,
    tx: tokio::sync::oneshot::Sender<Result<String, String>>,
) {
    let _ = tx.send(Err(
        "Browser capture is not yet supported on this platform".to_string()
    ));
}

#[cfg(test)]
mod tests {
    use super::CAPTURE_WINDOW_LABEL;

    #[test]
    fn capability_files_never_grant_capture_window() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        for entry in std::fs::read_dir(dir).expect("capabilities dir exists") {
            let path = entry.expect("readable dir entry").path();
            let content = std::fs::read_to_string(&path).expect("readable capability file");
            assert!(
                !content.contains(CAPTURE_WINDOW_LABEL),
                "{} grants Tauri IPC to the {CAPTURE_WINDOW_LABEL} window, which loads \
                 arbitrary remote pages",
                path.display()
            );
        }
    }
}
