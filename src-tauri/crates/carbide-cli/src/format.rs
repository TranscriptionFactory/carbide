use serde_json::Value;

pub fn print_json(value: &Value) {
    println!("{}", serde_json::to_string_pretty(value).unwrap_or_default());
}

pub fn print_lines(items: &[String]) {
    for item in items {
        println!("{}", item);
    }
}

pub fn indent_tree(text: &str, level: usize) -> String {
    let indent = "  ".repeat(level);
    format!("{}{}", indent, text)
}

pub fn format_heading(level: u32, text: &str) -> String {
    let prefix = "#".repeat(level as usize);
    format!("{} {}", prefix, text)
}
