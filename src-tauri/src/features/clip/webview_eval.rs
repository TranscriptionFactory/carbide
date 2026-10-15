use std::time::Duration;

use tauri::WebviewWindow;
use tokio::sync::oneshot;

const CALL_TIMEOUT: Duration = Duration::from_secs(30);

/// A rectangle in CSS pixels of the webview's current viewport.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewportRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub viewport_width: f64,
}

type Reply<T> = oneshot::Sender<Result<T, String>>;

/// Evaluates `script` in the page and returns its value, which must be a string.
pub async fn eval_string(window: &WebviewWindow, script: &str) -> Result<String, String> {
    let script = script.to_string();
    call_platform(window, move |platform, tx| eval_platform(platform, &script, tx)).await
}

/// Snapshots `rect` of the visible viewport as PNG bytes.
pub async fn snapshot_png(window: &WebviewWindow, rect: ViewportRect) -> Result<Vec<u8>, String> {
    call_platform(window, move |platform, tx| snapshot_platform(platform, rect, tx)).await
}

async fn call_platform<T: Send + 'static>(
    window: &WebviewWindow,
    run: impl FnOnce(tauri::webview::PlatformWebview, Reply<T>) + Send + 'static,
) -> Result<T, String> {
    let (tx, rx) = oneshot::channel::<Result<T, String>>();
    window
        .with_webview(move |platform| run(platform, tx))
        .map_err(|e| e.to_string())?;
    match tokio::time::timeout(CALL_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("webview handler dropped before completing".into()),
        Err(_) => Err("webview call timed out".into()),
    }
}

#[cfg(target_os = "macos")]
fn eval_platform(platform: tauri::webview::PlatformWebview, script: &str, tx: Reply<String>) {
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
                Some(value) => Ok(value.to_string()),
                None => Err("evaluateJavaScript returned a non-string value".to_string()),
            }
        };
        if let Some(tx) = sender.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = tx.send(outcome);
        }
    });

    unsafe {
        webview.evaluateJavaScript_completionHandler(&NSString::from_str(script), Some(&handler));
    }
}

#[cfg(target_os = "macos")]
fn snapshot_platform(platform: tauri::webview::PlatformWebview, rect: ViewportRect, tx: Reply<Vec<u8>>) {
    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
    use std::sync::Mutex;

    let Some(mtm) = MainThreadMarker::new() else {
        let _ = tx.send(Err("snapshot must run on the main thread".into()));
        return;
    };
    let webview: &WKWebView = unsafe { &*platform.inner().cast() };
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };
    unsafe {
        config.setRect(CGRect::new(
            CGPoint::new(rect.x, rect.y),
            CGSize::new(rect.width, rect.height),
        ));
    }
    let sender = Mutex::new(Some(tx));

    let handler = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let outcome = if !error.is_null() {
            let description = unsafe { &*error }.localizedDescription();
            Err(format!("takeSnapshot failed: {description}"))
        } else if image.is_null() {
            Err("takeSnapshot returned no image".to_string())
        } else {
            let image = unsafe { &*image };
            image
                .TIFFRepresentation()
                .and_then(|tiff| NSBitmapImageRep::imageRepWithData(&tiff))
                .and_then(|rep| unsafe {
                    rep.representationUsingType_properties(
                        NSBitmapImageFileType::PNG,
                        &NSDictionary::new(),
                    )
                })
                .map(|png| png.to_vec())
                .ok_or_else(|| "could not encode snapshot as PNG".to_string())
        };
        if let Some(tx) = sender.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = tx.send(outcome);
        }
    });

    unsafe {
        webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler);
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn eval_platform(platform: tauri::webview::PlatformWebview, script: &str, tx: Reply<String>) {
    use javascriptcore::ValueExt;
    use webkit2gtk::WebViewExt;

    let webview = platform.inner();
    #[allow(deprecated)]
    webview.run_javascript(script, None::<&webkit2gtk::gio::Cancellable>, move |result| {
        let outcome = result
            .map_err(|e| format!("run_javascript failed: {e}"))
            .and_then(|value| {
                value
                    .js_value()
                    .filter(|js| js.is_string())
                    .map(|js| js.to_str().to_string())
                    .ok_or_else(|| "run_javascript returned a non-string value".to_string())
            });
        let _ = tx.send(outcome);
    });
}

#[cfg(all(unix, not(target_os = "macos")))]
fn snapshot_platform(platform: tauri::webview::PlatformWebview, rect: ViewportRect, tx: Reply<Vec<u8>>) {
    use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};

    platform.inner().snapshot(
        SnapshotRegion::Visible,
        SnapshotOptions::NONE,
        None::<&webkit2gtk::gio::Cancellable>,
        move |result| {
            let outcome = result
                .map_err(|e| format!("snapshot failed: {e}"))
                .and_then(|surface| crop_to_png(surface, rect));
            let _ = tx.send(outcome);
        },
    );
}

#[cfg(all(unix, not(target_os = "macos")))]
fn crop_to_png(surface: cairo::Surface, rect: ViewportRect) -> Result<Vec<u8>, String> {
    let viewport = cairo::ImageSurface::try_from(surface)
        .map_err(|_| "snapshot is not an image surface".to_string())?;
    let scale = f64::from(viewport.width()) / rect.viewport_width;
    let width = (rect.width * scale).round() as i32;
    let height = (rect.height * scale).round() as i32;
    let cropped = cairo::ImageSurface::create(cairo::Format::ARgb32, width, height)
        .map_err(|e| e.to_string())?;
    {
        let context = cairo::Context::new(&cropped).map_err(|e| e.to_string())?;
        context
            .set_source_surface(&viewport, -(rect.x * scale), -(rect.y * scale))
            .map_err(|e| e.to_string())?;
        context.paint().map_err(|e| e.to_string())?;
    }
    let mut png = Vec::new();
    cropped.write_to_png(&mut png).map_err(|e| e.to_string())?;
    Ok(png)
}

#[cfg(not(unix))]
fn eval_platform(_platform: tauri::webview::PlatformWebview, _script: &str, tx: Reply<String>) {
    let _ = tx.send(Err("Browser capture is not yet supported on this platform".into()));
}

#[cfg(not(unix))]
fn snapshot_platform(_platform: tauri::webview::PlatformWebview, _rect: ViewportRect, tx: Reply<Vec<u8>>) {
    let _ = tx.send(Err("Figure snapshots are not yet supported on this platform".into()));
}
