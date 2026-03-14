use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

pub fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    // App menu
    let settings = MenuItemBuilder::new("Settings...")
        .id("settings_open")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let check_updates = MenuItemBuilder::new("Check for Updates...")
        .id("app_check_for_updates")
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, "badgerly")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .separator()
        .item(&settings)
        .item(&check_updates)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    // File menu
    let new_note = MenuItemBuilder::new("New Note")
        .id("note_create")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_canvas = MenuItemBuilder::new("New Canvas")
        .id("canvas_create")
        .accelerator("CmdOrCtrl+Shift+C")
        .build(app)?;
    let open_notes = MenuItemBuilder::new("Open Notes...")
        .id("omnibar_open")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let switch_vault = MenuItemBuilder::new("Switch Vault")
        .id("vault_open_switcher")
        .accelerator("CmdOrCtrl+Shift+V")
        .build(app)?;
    let save = MenuItemBuilder::new("Save")
        .id("note_request_save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let export_pdf = MenuItemBuilder::new("Export as PDF")
        .id("document_export_pdf")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)?;
    let close_tab = MenuItemBuilder::new("Close Tab")
        .id("tab_close")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_note)
        .item(&new_canvas)
        .separator()
        .item(&open_notes)
        .item(&switch_vault)
        .separator()
        .item(&save)
        .item(&export_pdf)
        .separator()
        .item(&close_tab)
        .build()?;

    // Edit menu
    let find = MenuItemBuilder::new("Find")
        .id("find_in_file_toggle")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let find_next = MenuItemBuilder::new("Find Next")
        .id("find_in_file_next")
        .accelerator("CmdOrCtrl+G")
        .build(app)?;
    let find_prev = MenuItemBuilder::new("Find Previous")
        .id("find_in_file_prev")
        .accelerator("CmdOrCtrl+Shift+G")
        .build(app)?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find)
        .item(&find_next)
        .item(&find_prev)
        .build()?;

    // View menu
    let command_palette = MenuItemBuilder::new("Command Palette")
        .id("omnibar_toggle")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let toggle_sidebar = MenuItemBuilder::new("Toggle Sidebar")
        .id("ui_toggle_sidebar")
        .accelerator("CmdOrCtrl+Shift+B")
        .build(app)?;
    let toggle_outline = MenuItemBuilder::new("Toggle Outline")
        .id("ui_toggle_outline_panel")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let toggle_links = MenuItemBuilder::new("Toggle Links Panel")
        .id("ui_toggle_context_rail")
        .accelerator("CmdOrCtrl+Shift+L")
        .build(app)?;
    let toggle_tasks = MenuItemBuilder::new("Toggle Tasks Panel")
        .id("ui_toggle_tasks_panel")
        .accelerator("CmdOrCtrl+Alt+T")
        .build(app)?;
    let toggle_terminal = MenuItemBuilder::new("Toggle Terminal")
        .id("terminal_toggle")
        .accelerator("CmdOrCtrl+Shift+`")
        .build(app)?;
    let toggle_split = MenuItemBuilder::new("Toggle Split View")
        .id("split_view_toggle")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;
    let toggle_editor_mode = MenuItemBuilder::new("Toggle Editor Mode")
        .id("editor_toggle_mode")
        .accelerator("CmdOrCtrl+/")
        .build(app)?;
    let vault_dashboard = MenuItemBuilder::new("Vault Dashboard")
        .id("ui_open_vault_dashboard")
        .accelerator("CmdOrCtrl+Shift+D")
        .build(app)?;
    let search_all_vaults = MenuItemBuilder::new("Search All Vaults")
        .id("omnibar_open_all_vaults")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&command_palette)
        .separator()
        .item(&toggle_sidebar)
        .item(&toggle_outline)
        .item(&toggle_links)
        .item(&toggle_tasks)
        .separator()
        .item(&toggle_terminal)
        .item(&toggle_split)
        .item(&toggle_editor_mode)
        .separator()
        .item(&vault_dashboard)
        .item(&search_all_vaults)
        .build()?;

    // Git menu
    let git_checkpoint = MenuItemBuilder::new("Create Checkpoint...")
        .id("git_open_checkpoint")
        .build(app)?;
    let git_history = MenuItemBuilder::new("Version History")
        .id("git_open_history")
        .accelerator("CmdOrCtrl+Shift+H")
        .build(app)?;
    let git_push = MenuItemBuilder::new("Push")
        .id("git_push")
        .accelerator("CmdOrCtrl+Alt+Shift+P")
        .build(app)?;
    let git_pull = MenuItemBuilder::new("Pull")
        .id("git_pull")
        .accelerator("CmdOrCtrl+Alt+Shift+U")
        .build(app)?;
    let git_fetch = MenuItemBuilder::new("Fetch")
        .id("git_fetch")
        .accelerator("CmdOrCtrl+Alt+Shift+F")
        .build(app)?;
    let git_sync = MenuItemBuilder::new("Sync")
        .id("git_sync")
        .build(app)?;
    let git_init = MenuItemBuilder::new("Initialize Repository")
        .id("git_init")
        .build(app)?;
    let git_add_remote = MenuItemBuilder::new("Add Remote...")
        .id("git_add_remote")
        .accelerator("CmdOrCtrl+Alt+Shift+R")
        .build(app)?;
    let git_menu = SubmenuBuilder::new(app, "Git")
        .item(&git_checkpoint)
        .item(&git_history)
        .separator()
        .item(&git_push)
        .item(&git_pull)
        .item(&git_fetch)
        .item(&git_sync)
        .separator()
        .item(&git_init)
        .item(&git_add_remote)
        .build()?;

    // Tools menu
    let ai_assistant = MenuItemBuilder::new("AI Assistant")
        .id("ai_open_assistant")
        .build(app)?;
    let plugins = MenuItemBuilder::new("Plugins")
        .id("ui_open_plugins")
        .build(app)?;
    let quick_capture = MenuItemBuilder::new("Quick Capture Task")
        .id("ui_quick_capture")
        .accelerator("CmdOrCtrl+Shift+K")
        .build(app)?;
    let sync_index = MenuItemBuilder::new("Sync Index")
        .id("vault_sync_index")
        .build(app)?;
    let reindex_vault = MenuItemBuilder::new("Reindex Vault")
        .id("vault_reindex")
        .build(app)?;
    let new_terminal_session = MenuItemBuilder::new("New Terminal Session")
        .id("terminal_new_session")
        .accelerator("CmdOrCtrl+Alt+Shift+T")
        .build(app)?;
    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&ai_assistant)
        .item(&plugins)
        .separator()
        .item(&quick_capture)
        .separator()
        .item(&sync_index)
        .item(&reindex_vault)
        .separator()
        .item(&new_terminal_session)
        .build()?;

    // Window menu
    let new_window = MenuItemBuilder::new("New Window")
        .id("window_open_new")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&new_window)
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    // Help menu
    let keyboard_shortcuts = MenuItemBuilder::new("Keyboard Shortcuts")
        .id("hotkey_open_editor")
        .accelerator("F1")
        .build(app)?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&keyboard_shortcuts)
        .separator()
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&git_menu)
        .item(&tools_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}
