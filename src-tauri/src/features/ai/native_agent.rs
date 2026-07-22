use futures_util::Stream;

use crate::features::mcp::types::ToolDefinition;

use super::stream::{AiMessage, AiStreamEvent};

pub trait ModelClient: Send + Sync {
    fn stream_turn(
        &self,
        messages: Vec<AiMessage>,
        tools: Vec<ToolDefinition>,
    ) -> impl Stream<Item = AiStreamEvent> + Send;
}
