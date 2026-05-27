use std::borrow::Cow;
use std::sync::Mutex;
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const EXPORT_WINDOW_LABEL: &str = "pdf-export";
const EXPORT_URL: &str = "pdfexport://localhost/";
const LOAD_TIMEOUT: Duration = Duration::from_secs(20);
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(30);
const SETTLE_DELAY: Duration = Duration::from_millis(300);

#[derive(Default)]
pub struct ExportHtmlState(Mutex<Option<String>>);

impl ExportHtmlState {
    fn set(&self, html: String) {
        *self.lock() = Some(html);
    }

    fn current(&self) -> Option<String> {
        self.lock().clone()
    }

    fn clear(&self) {
        *self.lock() = None;
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<String>> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

pub fn handle_export_request<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri::http::Response<Cow<'static, [u8]>> {
    let builder = tauri::http::Response::builder();
    match app.state::<ExportHtmlState>().current() {
        Some(html) => builder
            .header("Content-Type", "text/html; charset=utf-8")
            .header(
                "Content-Security-Policy",
                "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob:; font-src data:;",
            )
            .body(Cow::Owned(html.into_bytes()))
            .expect("export response is well-formed"),
        None => builder
            .status(404)
            .body(Cow::Borrowed(&b"no pending export"[..]))
            .expect("export response is well-formed"),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn export_html_to_pdf(
    app: AppHandle,
    html: String,
    save_path: String,
) -> Result<(), String> {
    app.state::<ExportHtmlState>().set(html);
    let result = run_export(&app, save_path).await;
    cleanup(&app);
    result
}

fn cleanup<R: Runtime>(app: &AppHandle<R>) {
    app.state::<ExportHtmlState>().clear();
    if let Some(window) = app.get_webview_window(EXPORT_WINDOW_LABEL) {
        let _ = window.close();
    }
}

async fn run_export<R: Runtime>(app: &AppHandle<R>, save_path: String) -> Result<(), String> {
    if let Some(stale) = app.get_webview_window(EXPORT_WINDOW_LABEL) {
        let _ = stale.close();
    }

    let url = EXPORT_URL
        .parse()
        .map_err(|err: url::ParseError| err.to_string())?;

    let (load_tx, load_rx) = tokio::sync::oneshot::channel::<()>();
    let load_tx = Mutex::new(Some(load_tx));

    let window =
        WebviewWindowBuilder::new(app, EXPORT_WINDOW_LABEL, WebviewUrl::CustomProtocol(url))
            .visible(false)
            .inner_size(960.0, 1200.0)
            .on_page_load(move |_webview, payload| {
                if matches!(payload.event(), PageLoadEvent::Finished) {
                    if let Ok(mut guard) = load_tx.lock() {
                        if let Some(tx) = guard.take() {
                            let _ = tx.send(());
                        }
                    }
                }
            })
            .build()
            .map_err(|err| err.to_string())?;

    match tokio::time::timeout(LOAD_TIMEOUT, load_rx).await {
        Ok(Ok(())) => {}
        Ok(Err(_)) => return Err("hidden export window closed before loading".into()),
        Err(_) => return Err("hidden export window timed out while loading".into()),
    }

    // Content is pre-rendered (no async JS); a short settle lets KaTeX/mermaid paint.
    tokio::time::sleep(SETTLE_DELAY).await;

    capture_pdf(&window, save_path).await
}

async fn capture_pdf<R: Runtime>(
    window: &WebviewWindow<R>,
    save_path: String,
) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    window
        .with_webview(move |platform| capture_platform(platform, save_path, tx))
        .map_err(|err| err.to_string())?;

    match tokio::time::timeout(CAPTURE_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("pdf capture handler dropped before completing".into()),
        Err(_) => Err("pdf capture timed out".into()),
    }
}

#[cfg(target_os = "macos")]
fn capture_platform(
    platform: tauri::webview::PlatformWebview,
    save_path: String,
    tx: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::WKWebView;

    let webview: &WKWebView = unsafe { &*platform.inner().cast() };
    let sender = Mutex::new(Some(tx));

    let handler = block2::RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
        let result = unsafe { write_macos_pdf(data, error, &save_path) };
        if let Ok(mut guard) = sender.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(result);
            }
        }
    });

    unsafe {
        webview.createPDFWithConfiguration_completionHandler(None, &handler);
    }
}

#[cfg(target_os = "macos")]
unsafe fn write_macos_pdf(
    data: *mut objc2_foundation::NSData,
    error: *mut objc2_foundation::NSError,
    save_path: &str,
) -> Result<(), String> {
    if let Some(data) = data.as_ref() {
        return crate::shared::io_utils::atomic_write(save_path, data.to_vec());
    }
    if let Some(error) = error.as_ref() {
        return Err(format!("createPDF failed: {}", error.localizedDescription()));
    }
    Err("createPDF returned neither data nor error".into())
}

#[cfg(not(target_os = "macos"))]
fn capture_platform(
    _platform: tauri::webview::PlatformWebview,
    _save_path: String,
    tx: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    let _ = tx.send(Err(
        "PDF export is not yet implemented on this platform".into()
    ));
}
