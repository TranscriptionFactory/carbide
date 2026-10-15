use crate::features::clip::figure_snapshots::{parse_layout, visible_rect, FigureLayout};
use crate::features::clip::webview_eval::ViewportRect;

fn layout(x: f64, y: f64, width: f64, height: f64) -> FigureLayout {
    FigureLayout {
        ready: true,
        x,
        y,
        width,
        height,
        viewport_width: 1280.0,
        viewport_height: 2400.0,
    }
}

#[test]
fn visible_rect_keeps_a_figure_fully_inside_the_viewport() {
    assert_eq!(
        visible_rect(&layout(40.0, 0.0, 800.0, 600.0)),
        Some(ViewportRect {
            x: 40.0,
            y: 0.0,
            width: 800.0,
            height: 600.0,
            viewport_width: 1280.0,
        })
    );
}

#[test]
fn visible_rect_trims_a_sliver_past_the_viewport_edge() {
    let rect = visible_rect(&layout(-4.0, 0.0, 800.0, 600.0)).expect("mostly visible");
    assert_eq!((rect.x, rect.width), (0.0, 796.0));
}

#[test]
fn visible_rect_skips_figures_taller_than_the_viewport() {
    assert_eq!(visible_rect(&layout(0.0, 0.0, 800.0, 3000.0)), None);
}

#[test]
fn visible_rect_skips_empty_and_offscreen_figures() {
    assert_eq!(visible_rect(&layout(0.0, 0.0, 0.0, 600.0)), None);
    assert_eq!(visible_rect(&layout(0.0, 2500.0, 800.0, 600.0)), None);
}

#[test]
fn parse_layout_reads_the_page_reply() {
    let json = r#"{"ready":false,"x":1,"y":2,"width":3,"height":4,"viewport_width":5,"viewport_height":6}"#;
    let parsed = parse_layout(json).unwrap().unwrap();
    assert!(!parsed.ready);
    assert_eq!((parsed.x, parsed.height, parsed.viewport_height), (1.0, 4.0, 6.0));
    assert_eq!(parse_layout("null").unwrap(), None);
    assert!(parse_layout("{oops").is_err());
}
