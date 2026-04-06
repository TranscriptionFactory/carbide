use serde::Serialize;
use serde_json::Value;

use crate::client::CarbideClient;
use crate::format;

#[derive(Serialize)]
struct TasksQueryParams {
    vault_id: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    filters: Vec<TaskFilter>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    sort: Vec<TaskSort>,
    limit: usize,
    offset: usize,
}

#[derive(Serialize)]
struct TaskFilter {
    property: String,
    operator: String,
    value: String,
}

#[derive(Serialize)]
struct TaskSort {
    property: String,
    descending: bool,
}

#[derive(Serialize)]
struct TaskUpdateParams {
    vault_id: String,
    path: String,
    line_number: usize,
    status: String,
}

pub async fn list(
    client: &CarbideClient,
    vault_id: &str,
    status: Option<&str>,
    path: Option<&str>,
    limit: usize,
    json: bool,
) -> Result<(), String> {
    let mut filters = Vec::new();
    if let Some(s) = status {
        filters.push(TaskFilter {
            property: "status".to_string(),
            operator: "eq".to_string(),
            value: s.to_string(),
        });
    }
    if let Some(p) = path {
        filters.push(TaskFilter {
            property: "path".to_string(),
            operator: "eq".to_string(),
            value: p.to_string(),
        });
    }

    let resp: Value = client
        .post_json(
            "/cli/tasks",
            &TasksQueryParams {
                vault_id: vault_id.to_string(),
                filters,
                sort: vec![],
                limit,
                offset: 0,
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        let empty = vec![];
        let tasks = resp.as_array().unwrap_or(&empty);
        if tasks.is_empty() {
            println!("No tasks found.");
            return Ok(());
        }
        for task in tasks {
            let checkbox = match task["status"].as_str().unwrap_or("todo") {
                "done" => "[x]",
                "doing" => "[/]",
                _ => "[ ]",
            };
            let text = task["text"].as_str().unwrap_or("?");
            let task_path = task["path"].as_str().unwrap_or("");
            let line = task["line_number"].as_u64().unwrap_or(0);
            println!("{} {} ({}:{})", checkbox, text, task_path, line);
        }
        println!("\n{} tasks", tasks.len());
    }
    Ok(())
}

pub async fn update(
    client: &CarbideClient,
    vault_id: &str,
    path: &str,
    line_number: usize,
    status: &str,
    json: bool,
) -> Result<(), String> {
    let resp: Value = client
        .post_json(
            "/cli/tasks/update",
            &TaskUpdateParams {
                vault_id: vault_id.to_string(),
                path: path.to_string(),
                line_number,
                status: status.to_string(),
            },
        )
        .await?;

    if json {
        format::print_json(&resp);
    } else {
        println!("Task updated.");
    }
    Ok(())
}
