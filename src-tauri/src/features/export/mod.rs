use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::shared::epub::{build_epub, read_epub_images, EpubInput};
use crate::shared::{io_utils, storage};

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

// Export destinations come from the native save dialog, so they are absolute
// paths outside the vault. Rejecting relative paths keeps a malformed frontend
// call from writing next to the process working directory.
fn save_destination(save_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(save_path);
    if !path.is_absolute() {
        return Err(format!("Export path must be absolute: {save_path}"));
    }
    Ok(path.to_path_buf())
}

#[tauri::command]
#[specta::specta]
pub async fn export_write_html(html: String, save_path: String) -> Result<(), String> {
    crate::shared::blocking::blocking("export_write_html", move || {
        export_write_html_inner(html, save_path)
    })
    .await
}

pub fn export_write_html_inner(html: String, save_path: String) -> Result<(), String> {
    io_utils::atomic_write(save_destination(&save_path)?, html)
}

#[tauri::command]
#[specta::specta]
pub async fn export_write_epub(
    app: AppHandle,
    vault_id: String,
    save_path: String,
    input: EpubInput,
) -> Result<(), String> {
    crate::shared::blocking::blocking("export_write_epub", move || {
        export_write_epub_inner(app, vault_id, save_path, input)
    })
    .await
}

pub fn export_write_epub_inner(
    app: AppHandle,
    vault_id: String,
    save_path: String,
    input: EpubInput,
) -> Result<(), String> {
    let destination = save_destination(&save_path)?;
    let root = storage::vault_path(&app, &vault_id)?;
    let images = read_epub_images(&root, &input.images)?;
    io_utils::atomic_write(destination, build_epub(&input, &images)?)
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

// A4 at 72pt/inch (210mm x 297mm). The print CSS supplies the inner page
// margins, so the print info margins are zeroed to avoid doubling them.
#[cfg(target_os = "macos")]
const A4_POINTS: objc2_foundation::NSSize = objc2_foundation::NSSize {
    width: 595.28,
    height: 841.89,
};

#[cfg(target_os = "macos")]
use objc2::runtime::{NSObject, NSObjectProtocol};

#[cfg(target_os = "macos")]
type CaptureSender = tokio::sync::oneshot::Sender<Result<(), String>>;

// Stateless delegate that resolves the capture channel from the print
// operation's `contextInfo` (a boxed sender). Synchronous `runOperation`
// deadlocks WKWebView (its print rendering is async/cross-process), so the
// capture must go through `runOperationModalForWindow:` + this callback.
#[cfg(target_os = "macos")]
objc2::define_class!(
    #[unsafe(super(NSObject))]
    #[name = "CarbidePdfPrintDelegate"]
    struct PdfPrintDelegate;

    impl PdfPrintDelegate {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn print_operation_did_run(
            &self,
            _operation: *mut objc2::runtime::AnyObject,
            success: bool,
            context_info: *mut std::ffi::c_void,
        ) {
            if context_info.is_null() {
                return;
            }
            let tx = unsafe { Box::from_raw(context_info.cast::<CaptureSender>()) };
            let result = if success {
                Ok(())
            } else {
                Err("NSPrintOperation reported failure".into())
            };
            let _ = tx.send(result);
        }
    }

    unsafe impl NSObjectProtocol for PdfPrintDelegate {}
);

// One reusable main-thread delegate; per-export state travels via contextInfo.
#[cfg(target_os = "macos")]
fn pdf_print_delegate() -> objc2::rc::Retained<PdfPrintDelegate> {
    use objc2::rc::Retained;
    use objc2::{msg_send, AnyThread};
    thread_local! {
        static DELEGATE: Retained<PdfPrintDelegate> = {
            let this = PdfPrintDelegate::alloc().set_ivars(());
            let delegate: Retained<PdfPrintDelegate> = unsafe { msg_send![super(this), init] };
            delegate
        };
    }
    DELEGATE.with(Retained::clone)
}

// macOS uses the AppKit print pipeline (like WebView2 PrintToPdf on Windows and
// WebKitPrintOperation on Linux) so the page is paginated to A4 honoring the
// print CSS. WKWebView's createPDF API only snapshots content as one tall page.
#[cfg(target_os = "macos")]
fn capture_platform(
    platform: tauri::webview::PlatformWebview,
    save_path: String,
    tx: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    use objc2::runtime::ProtocolObject;
    use objc2::sel;
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSPrintingPaginationMode,
    };
    use objc2_foundation::{NSCopying, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let webview: &WKWebView = unsafe { &*platform.inner().cast() };

    let window = match webview.window() {
        Some(window) => window,
        None => {
            let _ = tx.send(Err("export webview has no window to print from".into()));
            return;
        }
    };

    let print_info = NSPrintInfo::new();
    print_info.setPaperSize(A4_POINTS);
    print_info.setTopMargin(0.0);
    print_info.setBottomMargin(0.0);
    print_info.setLeftMargin(0.0);
    print_info.setRightMargin(0.0);
    print_info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    print_info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
    print_info.setJobDisposition(unsafe { NSPrintSaveJob });

    let url = NSURL::fileURLWithPath(&NSString::from_str(&save_path));
    let key: &ProtocolObject<dyn NSCopying> =
        ProtocolObject::from_ref(unsafe { NSPrintJobSavingURL });
    unsafe {
        print_info.dictionary().setObject_forKey(&url, key);
    }

    let operation = unsafe { webview.printOperationWithPrintInfo(&print_info) };
    operation.setShowsPrintPanel(false);
    operation.setShowsProgressPanel(false);
    operation.setCanSpawnSeparateThread(true);

    let delegate = pdf_print_delegate();
    let context = Box::into_raw(Box::new(tx)).cast::<std::ffi::c_void>();
    unsafe {
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &window,
            Some(&*delegate),
            Some(sel!(printOperationDidRun:success:contextInfo:)),
            context,
        );
    }
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
            let result = if error_code.is_ok() && is_successful {
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
    use std::sync::{Arc, Mutex as StdMutex};
    use webkit2gtk::PrintOperationExt;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_destination_rejects_relative_paths() {
        assert!(save_destination("notes/out.html").is_err());
        assert!(save_destination("").is_err());
    }

    #[test]
    fn save_destination_accepts_absolute_paths() {
        let path = save_destination("/tmp/carbide/out.epub").unwrap();
        assert_eq!(path, PathBuf::from("/tmp/carbide/out.epub"));
    }

    #[test]
    fn export_write_html_writes_the_document() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.html");
        export_write_html_inner(
            "<!doctype html><html><body>hi</body></html>".to_string(),
            target.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "<!doctype html><html><body>hi</body></html>"
        );
    }
}
