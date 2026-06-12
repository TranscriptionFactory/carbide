use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WindowEvent};

use crate::features::mcp::http::DEFAULT_PORT;
use crate::features::settings::service as settings;

pub const CLOSE_TO_TRAY_KEY: &str = "app.closeToTray";

pub fn close_to_tray_enabled(app: &AppHandle) -> bool {
    settings::load_settings(app)
        .map(|s| settings::read_bool(&s, CLOSE_TO_TRAY_KEY))
        .unwrap_or(false)
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

pub fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let status = MenuItemBuilder::new(format!("MCP server · localhost:{DEFAULT_PORT}"))
        .id("tray.status")
        .enabled(false)
        .build(app)?;
    let keep_running = CheckMenuItemBuilder::new("Keep running in menu bar")
        .id("tray.toggle_close")
        .checked(close_to_tray_enabled(app.handle()))
        .build(app)?;
    let show = MenuItemBuilder::new("Show Carbide")
        .id("tray.show")
        .build(app)?;
    let quit = MenuItemBuilder::new("Quit Carbide")
        .id("tray.quit")
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&status)
        .separator()
        .item(&keep_running)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    let check = keep_running.clone();
    TrayIconBuilder::with_id("carbide-tray")
        .icon(tauri::include_image!("../assets/carbide_menubar.png"))
        .icon_as_template(true)
        .tooltip("Carbide")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().0.as_str() {
            "tray.toggle_close" => {
                let next = !close_to_tray_enabled(app);
                let _ = settings::set_setting_value(app, CLOSE_TO_TRAY_KEY.into(), next.into());
                let _ = check.set_checked(next);
            }
            "tray.show" => show_main_window(app),
            "tray.quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn register_close_to_tray(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.handle().clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if close_to_tray_enabled(&handle) {
                api.prevent_close();
                hide_main_window(&handle);
            }
        }
    });
}
