use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Todo,
    Doing,
    Done,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct Task {
    pub id: String,
    pub path: String,
    pub text: String,
    pub status: TaskStatus,
    pub due_date: Option<String>,
    pub line_number: usize,
    pub section: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TaskUpdate {
    pub path: String,
    pub line_number: usize,
    pub status: TaskStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct TaskFilter {
    pub property: String,
    pub operator: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct TaskSort {
    pub property: String,
    pub descending: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct TaskQuery {
    pub filters: Vec<TaskFilter>,
    pub sort: Vec<TaskSort>,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct TaskDueDateUpdate {
    pub path: String,
    pub line_number: usize,
    pub new_due_date: Option<String>,
}
