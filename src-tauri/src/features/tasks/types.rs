use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub path: String,
    pub text: String,
    pub completed: bool,
    pub due_date: Option<String>,
    pub line_number: usize,
    pub section: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskUpdate {
    pub path: String,
    pub line_number: usize,
    pub completed: bool,
}
