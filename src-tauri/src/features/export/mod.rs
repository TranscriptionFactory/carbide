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

#[cfg(target_os = "windows")]
fn capture_platform(
    platform: tauri::webview::PlatformWebview,
    save_path: String,
    tx: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    use std::sync::{Arc, Mutex as StdMutex};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let sender = Arc::new(StdMutex::new(Some(tx)));

    let result: Result<(), String> = (|| {
        let controller = platform.controller();
        let webview2 = unsafe { controller.CoreWebView2() }
            .map_err(|e| format!("CoreWebView2() failed: {e}"))?;
        let webview7 = webview2
            .cast::<ICoreWebView2_7>()
            .map_err(|e| format!("cast to ICoreWebView2_7 failed: {e}"))?;

        let path_hstring = HSTRING::from(&save_path);
        let sender_cb = Arc::clone(&sender);

        let handler = PrintToPdfCompletedHandler::create(Box::new(move |error_code, is_successful| {
            let result = if error_code.is_ok() && is_successful.as_bool() {
                Ok(())
            } else if error_code.is_err() {
                Err(format!("PrintToPdf failed: {:?}", error_code))
            } else {
                Err("PrintToPdf reported failure (isSuccessful = false)".into())
            };
            if let Ok(mut guard) = sender_cb.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(result);
                }
            }
            Ok(())
        }));

        unsafe { webview7.PrintToPdf(&path_hstring, None, &handler) }
            .map_err(|e| format!("PrintToPdf call failed: {e}"))
    })();

    if let Err(err) = result {
        if let Ok(mut guard) = sender.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(Err(err));
            }
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn capture_platform(
    platform: tauri::webview::PlatformWebview,
    save_path: String,
    tx: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    use gtk::prelude::PrintSettingsExt;
    use std::sync::{Arc, Mutex as StdMutex};
    use webkit2gtk::prelude::PrintOperationExt;

    let wv = platform.inner();
    let operation = webkit2gtk::PrintOperation::new(&wv);

    let settings = gtk::PrintSettings::new();
    let file_uri = format!("file://{save_path}");
    settings.set("output-uri", Some(&file_uri));
    settings.set("output-file-format", Some("pdf"));
    operation.set_print_settings(&settings);

    let sender = Arc::new(StdMutex::new(Some(tx)));

    let sender_finished = Arc::clone(&sender);
    operation.connect_finished(move |_op| {
        if let Ok(mut guard) = sender_finished.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(Ok(()));
            }
        }
    });

    let sender_failed = Arc::clone(&sender);
    operation.connect_failed(move |_op, error| {
        let msg = error.message().to_owned();
        if let Ok(mut guard) = sender_failed.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(Err(format!("WebKitPrintOperation failed: {msg}")));
            }
        }
    });

    operation.print();
}
