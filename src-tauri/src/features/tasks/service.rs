use rusqlite::{params, Connection};
use crate::features::tasks::types::Task;
use regex::Regex;
use lazy_static::lazy_static;
use std::path::Path;
use crate::shared::io_utils;

lazy_static! {
    static ref TASK_REGEX: Regex = Regex::new(r"(?m)^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$").unwrap();
    static ref DUE_DATE_REGEX: Regex = Regex::new(r"📅\s*(\d{4}-\d{2}-\d{2})|due:\s*(\d{4}-\d{2}-\d{2})|@(\d{4}-\d{2}-\d{2})").unwrap();
}

pub fn extract_tasks(path: &str, markdown: &str) -> Vec<Task> {
    let mut tasks = Vec::new();
    let mut current_section = None;

    for (index, line) in markdown.lines().enumerate() {
        let line_number = index + 1;

        if line.starts_with('#') {
            current_section = Some(line.trim_start_matches('#').trim().to_string());
            continue;
        }

        if let Some(caps) = TASK_REGEX.captures(line) {
            let completed = caps.get(2).map(|m: regex::Match| m.as_str() != " ").unwrap_or(false);
            let text = caps.get(3).map(|m: regex::Match| m.as_str()).unwrap_or("");

            // Extract due date if present
            let due_date = DUE_DATE_REGEX.captures(text).and_then(|c: regex::Captures| {
                c.get(1).or(c.get(2)).or(c.get(3)).map(|m: regex::Match| m.as_str().to_string())
            });

            tasks.push(Task {
                id: format!("{}:{}", path, line_number),
                path: path.to_string(),
                text: text.to_string(),
                completed,
                due_date,
                line_number,
                section: current_section.clone(),
            });
        }
    }

    tasks
}

pub fn save_tasks(conn: &Connection, path: &str, tasks: &[Task]) -> Result<(), String> {
    conn.execute("DELETE FROM tasks WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;

    for task in tasks {
        conn.execute(
            "INSERT INTO tasks (id, path, text, completed, due_date, line_number, section) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                task.id,
                task.path,
                task.text,
                task.completed,
                task.due_date,
                task.line_number,
                task.section
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn get_tasks_for_path(conn: &Connection, path: &str) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, text, completed, due_date, line_number, section FROM tasks WHERE path = ?1 ORDER BY line_number")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![path], |row| {
            Ok(Task {
                id: row.get(0)?,
                path: row.get(1)?,
                text: row.get(2)?,
                completed: row.get(3)?,
                due_date: row.get(4)?,
                line_number: row.get(5)?,
                section: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

pub fn query_tasks(conn: &Connection, filter_completed: Option<bool>) -> Result<Vec<Task>, String> {
    let mut query = "SELECT id, path, text, completed, due_date, line_number, section FROM tasks".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(completed) = filter_completed {
        query.push_str(" WHERE completed = ?1");
        params_vec.push(Box::new(completed));
    }

    query.push_str(" ORDER BY path, line_number");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
            Ok(Task {
                id: row.get(0)?,
                path: row.get(1)?,
                text: row.get(2)?,
                completed: row.get(3)?,
                due_date: row.get(4)?,
                line_number: row.get(5)?,
                section: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

pub fn update_task_state_in_file(
    abs_path: &Path,
    line_number: usize,
    completed: bool,
) -> Result<(), String> {
    let content = io_utils::read_file_to_string(abs_path)?;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    if line_number == 0 || line_number > lines.len() {
        return Err(format!("Invalid line number: {}", line_number));
    }

    let line = &mut lines[line_number - 1];
    if let Some(caps) = TASK_REGEX.captures(line) {
        let indent = caps.get(1).map(|m: regex::Match| m.as_str()).unwrap_or("");
        let text = caps.get(3).map(|m: regex::Match| m.as_str()).unwrap_or("");
        
        // Reconstruct the line preserving bullet style
        let original_bullet = line.trim_start().chars().next().unwrap_or('-');
        *line = format!("{}{} [{}] {}", indent, original_bullet, if completed { "x" } else { " " }, text);
    } else {
        return Err(format!("Line {} is not a task", line_number));
    }

    let new_content = lines.join("\n");
    // Preserve trailing newline if it existed
    let final_content = if content.ends_with('\n') && !new_content.ends_with('\n') {
        format!("{}\n", new_content)
    } else {
        new_content
    };

    io_utils::atomic_write(abs_path, final_content.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_tasks() {
        let markdown = r#"
# Project A
- [ ] Task 1
- [x] Task 2 @2023-10-27
* [ ] Task 3 due: 2023-12-25
+ [ ] Task 4 📅 2024-01-01

## Subproject B
- [ ] Task 5
"#;
        let tasks = extract_tasks("test.md", markdown);
        assert_eq!(tasks.len(), 5);
        
        assert_eq!(tasks[0].text, "Task 1");
        assert_eq!(tasks[0].completed, false);
        assert_eq!(tasks[0].section, Some("Project A".to_string()));
        
        assert_eq!(tasks[1].text, "Task 2 @2023-10-27");
        assert_eq!(tasks[1].completed, true);
        assert_eq!(tasks[1].due_date, Some("2023-10-27".to_string()));
        
        assert_eq!(tasks[2].due_date, Some("2023-12-25".to_string()));
        assert_eq!(tasks[3].due_date, Some("2024-01-01".to_string()));
        
        assert_eq!(tasks[4].text, "Task 5");
        assert_eq!(tasks[4].section, Some("Subproject B".to_string()));
    }
}
