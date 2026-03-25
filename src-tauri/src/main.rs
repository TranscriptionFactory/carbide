#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 3 && args[1] == "--extract-pdf-text" {
        carbide_lib::features::reference::linked_source::run_extract_pdf_text(&args[2]);
        return;
    }
    carbide_lib::run()
}
