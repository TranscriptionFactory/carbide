use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::features::mcp::tools::{op_err_to_tool_result, parse_args, prop};
use crate::features::mcp::types::{InputSchema, PropertySchema, ToolDefinition, ToolResult};
use crate::features::search::db as search_db;
use crate::features::tasks::service::query_tasks;
use crate::features::tasks::types::{FilterExpr, TaskFilter, TaskQuery, TaskSort};

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![query_tasks_def()]
}

pub fn dispatch(app: &AppHandle, name: &str, arguments: Option<&Value>) -> Option<ToolResult> {
    match name {
        "query_tasks" => Some(handle_query_tasks(app, arguments)),
        _ => None,
    }
}

#[derive(Deserialize)]
struct QueryTasksArgs {
    vault_id: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    due_before: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

fn query_tasks_def() -> ToolDefinition {
    let mut properties = HashMap::new();
    properties.insert(
        "vault_id".into(),
        prop("string", "Vault identifier (optional if an active vault is set)"),
    );
    properties.insert(
        "status".into(),
        PropertySchema {
            prop_type: "string".into(),
            description: Some("Filter by task status".into()),
            enum_values: Some(vec!["todo".into(), "doing".into(), "done".into()]),
            default: None,
        },
    );
    properties.insert(
        "path".into(),
        prop("string", "Optional. Filter to tasks in this folder or file path"),
    );
    properties.insert(
        "due_before".into(),
        prop("string", "Optional. Filter tasks due before this date (YYYY-MM-DD)"),
    );
    properties.insert(
        "limit".into(),
        PropertySchema {
            prop_type: "integer".into(),
            description: Some("Optional. Maximum number of results (default: 50)".into()),
            enum_values: None,
            default: Some(Value::Number(50.into())),
        },
    );

    ToolDefinition {
        name: "query_tasks".into(),
        mutating: false,
        description: "Query tasks (checkboxes) across vault notes. Filter by status, path, or due date. Returns tab-separated lines of status, path, text, due_date, and section.".into(),
        input_schema: InputSchema {
            schema_type: "object".into(),
            properties,
            required: vec!["vault_id".into()],
        },
    }
}

fn handle_query_tasks(app: &AppHandle, arguments: Option<&Value>) -> ToolResult {
    let args: QueryTasksArgs = match parse_args(arguments) {
        Ok(a) => a,
        Err(e) => return e,
    };

    let mut filters = Vec::new();

    if let Some(status) = &args.status {
        filters.push(TaskFilter {
            property: "status".into(),
            operator: "eq".into(),
            value: status.clone(),
        });
    }

    if let Some(path) = &args.path {
        filters.push(TaskFilter {
            property: "path".into(),
            operator: "starts_with".into(),
            value: path.clone(),
        });
    }

    if let Some(due_before) = &args.due_before {
        filters.push(TaskFilter {
            property: "due_date".into(),
            operator: "lt".into(),
            value: due_before.clone(),
        });
    }

    let limit = args.limit.unwrap_or(50).min(200);

    let filter = if filters.is_empty() {
        None
    } else {
        let operands: Vec<FilterExpr> = filters
            .into_iter()
            .map(|f| FilterExpr::Atom { filter: f })
            .collect();
        if operands.len() == 1 {
            Some(operands.into_iter().next().unwrap())
        } else {
            Some(FilterExpr::And { operands })
        }
    };

    let query = TaskQuery {
        filter,
        sort: vec![TaskSort {
            property: "due_date".into(),
            descending: false,
        }],
        limit,
        offset: 0,
    };

    let conn = match search_db::open_search_db(app, &args.vault_id) {
        Ok(c) => c,
        Err(e) => return ToolResult::error(e),
    };

    match query_tasks(&conn, query) {
        Ok(tasks) => {
            if tasks.is_empty() {
                return ToolResult::text("No tasks found.".into());
            }
            let lines: Vec<String> = tasks
                .iter()
                .map(|t| {
                    let status = match t.status {
                        crate::features::tasks::types::TaskStatus::Todo => "todo",
                        crate::features::tasks::types::TaskStatus::Doing => "doing",
                        crate::features::tasks::types::TaskStatus::Done => "done",
                    };
                    let due = t.due_date.as_deref().unwrap_or("");
                    let section = t.section.as_deref().unwrap_or("");
                    format!("{}\t{}\t{}\t{}\t{}", status, t.path, t.text, due, section)
                })
                .collect();
            ToolResult::text(lines.join("\n"))
        }
        Err(e) => op_err_to_tool_result(crate::features::mcp::shared_ops::OpError::Internal(e)),
    }
}
