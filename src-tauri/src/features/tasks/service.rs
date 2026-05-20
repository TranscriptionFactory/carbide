use crate::features::tasks::types::{
    FilterExpr, Task, TaskFilter, TaskQuery, TaskSort, TaskStatus,
};
use crate::shared::io_utils;
use lazy_static::lazy_static;
use regex::Regex;
use rusqlite::{params, Connection};
use std::path::Path;

lazy_static! {
    static ref TASK_REGEX: Regex = Regex::new(r"(?m)^(\s*)[-*+]\s+\[(.)\]\s+(.*)$").unwrap();
    static ref DUE_DATE_REGEX: Regex =
        Regex::new(r"📅\s*(\d{4}-\d{2}-\d{2})|due:\s*(\d{4}-\d{2}-\d{2})|@(\d{4}-\d{2}-\d{2})")
            .unwrap();
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
            let status_char = caps.get(2).map(|m: regex::Match| m.as_str()).unwrap_or(" ");
            let status = match status_char {
                "x" | "X" => TaskStatus::Done,
                "/" | "-" => TaskStatus::Doing,
                _ => TaskStatus::Todo,
            };
            let text = caps.get(3).map(|m: regex::Match| m.as_str()).unwrap_or("");

            let due_date = DUE_DATE_REGEX
                .captures(text)
                .and_then(|c: regex::Captures| {
                    c.get(1)
                        .or(c.get(2))
                        .or(c.get(3))
                        .map(|m: regex::Match| m.as_str().to_string())
                });

            tasks.push(Task {
                id: format!("{}:{}", path, line_number),
                path: path.to_string(),
                text: text.to_string(),
                status,
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
        let status_str = match task.status {
            TaskStatus::Todo => "todo",
            TaskStatus::Doing => "doing",
            TaskStatus::Done => "done",
        };

        conn.execute(
            "INSERT INTO tasks (id, path, text, status, due_date, line_number, section) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                task.id,
                task.path,
                task.text,
                status_str,
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
        .prepare("SELECT id, path, text, status, due_date, line_number, section FROM tasks WHERE path = ?1 ORDER BY line_number")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![path], |row| {
            let status_str: String = row.get(3)?;
            let status = match status_str.as_str() {
                "doing" => TaskStatus::Doing,
                "done" => TaskStatus::Done,
                _ => TaskStatus::Todo,
            };

            Ok(Task {
                id: row.get(0)?,
                path: row.get(1)?,
                text: row.get(2)?,
                status,
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

fn build_atom_sql(
    q: &TaskFilter,
    params_vec: &mut Vec<Box<dyn rusqlite::ToSql>>,
) -> Option<String> {
    let col = match q.property.as_str() {
        "status" => "status",
        "due_date" => "due_date",
        "path" => "path",
        "text" => "text",
        "section" => "section",
        _ => return None,
    };
    let idx = params_vec.len() + 1;
    let clause = match q.operator.as_str() {
        "eq" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} = ?{}", col, idx)
        }
        "neq" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} != ?{}", col, idx)
        }
        "contains" => {
            params_vec.push(Box::new(format!("%{}%", q.value)));
            format!("{} LIKE ?{}", col, idx)
        }
        "gt" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} > ?{}", col, idx)
        }
        "lt" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} < ?{}", col, idx)
        }
        "gte" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} >= ?{}", col, idx)
        }
        "lte" => {
            params_vec.push(Box::new(q.value.clone()));
            format!("{} <= ?{}", col, idx)
        }
        _ => return None,
    };
    Some(clause)
}

fn build_filter_sql(
    expr: &FilterExpr,
    params: &mut Vec<Box<dyn rusqlite::ToSql>>,
) -> Option<String> {
    match expr {
        FilterExpr::Atom { filter } => build_atom_sql(filter, params),
        FilterExpr::And { operands } => {
            let parts: Vec<_> = operands
                .iter()
                .filter_map(|e| build_filter_sql(e, params))
                .collect();
            if parts.is_empty() {
                None
            } else {
                Some(format!("({})", parts.join(" AND ")))
            }
        }
        FilterExpr::Or { operands } => {
            let parts: Vec<_> = operands
                .iter()
                .filter_map(|e| build_filter_sql(e, params))
                .collect();
            if parts.is_empty() {
                None
            } else {
                Some(format!("({})", parts.join(" OR ")))
            }
        }
        FilterExpr::Not { operand } => {
            build_filter_sql(operand, params).map(|s| format!("NOT ({})", s))
        }
    }
}

fn build_order_clause(sort: &[TaskSort]) -> String {
    if sort.is_empty() {
        return " ORDER BY path, line_number".to_string();
    }
    let parts: Vec<String> = sort
        .iter()
        .filter_map(|s| {
            let col = match s.property.as_str() {
                "status" => "status",
                "due_date" => "due_date",
                "path" => "path",
                "text" => "text",
                "line_number" => "line_number",
                _ => return None,
            };
            Some(format!(
                "{} {}",
                col,
                if s.descending { "DESC" } else { "ASC" }
            ))
        })
        .collect();
    if parts.is_empty() {
        " ORDER BY path, line_number".to_string()
    } else {
        format!(" ORDER BY {}", parts.join(", "))
    }
}

pub fn query_tasks(conn: &Connection, task_query: TaskQuery) -> Result<Vec<Task>, String> {
    let mut sql =
        "SELECT id, path, text, status, due_date, line_number, section FROM tasks".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref filter_expr) = task_query.filter {
        if let Some(where_sql) = build_filter_sql(filter_expr, &mut params_vec) {
            sql.push_str(" WHERE ");
            sql.push_str(&where_sql);
        }
    }
    sql.push_str(&build_order_clause(&task_query.sort));
    if task_query.limit > 0 {
        sql.push_str(&format!(
            " LIMIT {} OFFSET {}",
            task_query.limit, task_query.offset
        ));
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
            let status_str: String = row.get(3)?;
            let status = match status_str.as_str() {
                "doing" => TaskStatus::Doing,
                "done" => TaskStatus::Done,
                _ => TaskStatus::Todo,
            };

            Ok(Task {
                id: row.get(0)?,
                path: row.get(1)?,
                text: row.get(2)?,
                status,
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
    status: TaskStatus,
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

        let status_char = match status {
            TaskStatus::Todo => " ",
            TaskStatus::Doing => "-",
            TaskStatus::Done => "x",
        };

        let original_bullet = line.trim_start().chars().next().unwrap_or('-');
        *line = format!("{}{} [{}] {}", indent, original_bullet, status_char, text);
    } else {
        return Err(format!("Line {} is not a task", line_number));
    }

    let new_content = lines.join("\n");
    let final_content = if content.ends_with('\n') && !new_content.ends_with('\n') {
        format!("{}\n", new_content)
    } else {
        new_content
    };

    io_utils::atomic_write(abs_path, final_content.as_bytes())
}

pub fn update_task_due_date_in_file(
    abs_path: &Path,
    line_number: usize,
    new_due_date: Option<&str>,
) -> Result<(), String> {
    let content = io_utils::read_file_to_string(abs_path)?;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    if line_number == 0 || line_number > lines.len() {
        return Err(format!("Invalid line number: {}", line_number));
    }

    let line = &mut lines[line_number - 1];
    if TASK_REGEX.captures(line).is_none() {
        return Err(format!("Line {} is not a task", line_number));
    }

    let cleaned = DUE_DATE_REGEX.replace_all(line, "").trim().to_string();

    *line = if let Some(date) = new_due_date {
        format!("{} @{}", cleaned, date)
    } else {
        cleaned
    };

    let new_content = lines.join("\n");
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
- [-] Task 3 in progress
* [ ] Task 4 due: 2023-12-25
+ [ ] Task 5 📅 2024-01-01

## Subproject B
- [ ] Task 6
"#;
        let tasks = extract_tasks("test.md", markdown);
        assert_eq!(tasks.len(), 6);

        assert_eq!(tasks[0].text, "Task 1");
        assert_eq!(tasks[0].status, TaskStatus::Todo);
        assert_eq!(tasks[0].section, Some("Project A".to_string()));

        assert_eq!(tasks[1].text, "Task 2 @2023-10-27");
        assert_eq!(tasks[1].status, TaskStatus::Done);

        assert_eq!(tasks[2].text, "Task 3 in progress");
        assert_eq!(tasks[2].status, TaskStatus::Doing);

        assert_eq!(tasks[4].due_date, Some("2024-01-01".to_string()));
    }

    fn make_atom(property: &str, operator: &str, value: &str) -> FilterExpr {
        FilterExpr::Atom {
            filter: TaskFilter {
                property: property.to_string(),
                operator: operator.to_string(),
                value: value.to_string(),
            },
        }
    }

    #[test]
    fn test_build_filter_sql_atom() {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let expr = make_atom("status", "eq", "todo");
        let sql = build_filter_sql(&expr, &mut params);
        assert_eq!(sql, Some("status = ?1".to_string()));
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn test_build_filter_sql_and() {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let expr = FilterExpr::And {
            operands: vec![
                make_atom("status", "eq", "todo"),
                make_atom("path", "contains", "daily"),
            ],
        };
        let sql = build_filter_sql(&expr, &mut params);
        assert_eq!(sql, Some("(status = ?1 AND path LIKE ?2)".to_string()));
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn test_build_filter_sql_or() {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let expr = FilterExpr::Or {
            operands: vec![
                make_atom("section", "contains", "urgent"),
                make_atom("section", "contains", "reminders"),
            ],
        };
        let sql = build_filter_sql(&expr, &mut params);
        assert_eq!(
            sql,
            Some("(section LIKE ?1 OR section LIKE ?2)".to_string())
        );
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn test_build_filter_sql_not() {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let expr = FilterExpr::Not {
            operand: Box::new(make_atom("status", "eq", "done")),
        };
        let sql = build_filter_sql(&expr, &mut params);
        assert_eq!(sql, Some("NOT (status = ?1)".to_string()));
        assert_eq!(params.len(), 1);
    }

    #[test]
    fn test_build_filter_sql_nested() {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let expr = FilterExpr::Or {
            operands: vec![
                FilterExpr::And {
                    operands: vec![
                        make_atom("status", "eq", "todo"),
                        make_atom("path", "contains", "projects"),
                    ],
                },
                make_atom("section", "contains", "urgent"),
            ],
        };
        let sql = build_filter_sql(&expr, &mut params);
        assert_eq!(
            sql,
            Some("((status = ?1 AND path LIKE ?2) OR section LIKE ?3)".to_string())
        );
        assert_eq!(params.len(), 3);
    }
}
