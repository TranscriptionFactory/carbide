use std::time::Duration;

use serde::Deserialize;
use tauri::WebviewWindow;

use crate::features::clip::service::FigureSnapshot;
use crate::features::clip::webview_eval::{eval_string, snapshot_png, ViewportRect};

const SNAPSHOT_JS: &str = include_str!("figure_snapshot.js");
const READY_POLL: Duration = Duration::from_millis(200);
const READY_ATTEMPTS: u32 = 15;
const PAINT_SETTLE: Duration = Duration::from_millis(150);
// A figure clipped by the viewport edge by more than this is skipped rather
// than snapshotted with parts missing.
const MIN_VISIBLE_FRACTION: f64 = 0.95;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct FigureLayout {
    pub ready: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
}

/// Clamps the figure to the viewport; `None` when too little of it is visible.
pub fn visible_rect(layout: &FigureLayout) -> Option<ViewportRect> {
    if layout.width <= 0.0 || layout.height <= 0.0 || layout.viewport_width <= 0.0 {
        return None;
    }
    let left = layout.x.max(0.0);
    let top = layout.y.max(0.0);
    let right = (layout.x + layout.width).min(layout.viewport_width);
    let bottom = (layout.y + layout.height).min(layout.viewport_height);
    if right <= left || bottom <= top {
        return None;
    }
    let visible = (right - left) * (bottom - top);
    if visible < layout.width * layout.height * MIN_VISIBLE_FRACTION {
        return None;
    }
    Some(ViewportRect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        viewport_width: layout.viewport_width,
    })
}

pub fn parse_layout(json: &str) -> Result<Option<FigureLayout>, String> {
    serde_json::from_str(json).map_err(|e| format!("bad figure layout: {e}"))
}

/// Marks composite figures in the page and snapshots each one. Failures are
/// logged and skipped: a figure without a snapshot keeps its original markup.
pub async fn snapshot_figures(window: &WebviewWindow) -> Vec<FigureSnapshot> {
    let count = match detect(window).await {
        Ok(count) => count,
        Err(error) => {
            log::warn!("figure snapshot detection failed: {error}");
            return Vec::new();
        }
    };
    let mut snapshots = Vec::new();
    for index in 0..count {
        match snapshot_figure(window, index).await {
            Ok(Some(png)) => snapshots.push(FigureSnapshot { index, png }),
            Ok(None) => log::debug!("figure {index} not snapshotted: outside viewport"),
            Err(error) => log::warn!("figure {index} snapshot failed: {error}"),
        }
    }
    snapshots
}

async fn detect(window: &WebviewWindow) -> Result<u32, String> {
    eval_string(window, &format!("{SNAPSHOT_JS};\"ok\"")).await?;
    let count = eval_string(window, "String(window.__carbide_snapshot.detect())").await?;
    count.parse().map_err(|e| format!("bad figure count {count:?}: {e}"))
}

async fn snapshot_figure(window: &WebviewWindow, index: u32) -> Result<Option<Vec<u8>>, String> {
    let script = format!("JSON.stringify(window.__carbide_snapshot.prepare({index}))");
    let mut layout = None;
    for _ in 0..READY_ATTEMPTS {
        layout = parse_layout(&eval_string(window, &script).await?)?;
        match layout {
            Some(current) if !current.ready => tokio::time::sleep(READY_POLL).await,
            _ => break,
        }
    }
    let Some(rect) = layout.as_ref().and_then(visible_rect) else {
        return Ok(None);
    };
    tokio::time::sleep(PAINT_SETTLE).await;
    snapshot_png(window, rect).await.map(Some)
}
