// AU-040a moved AgentEvent into the assistant slice, where its only consumer
// lives, and dissolved AgentDoneStats into RunStats. What is left is the chat
// panel's own permission-mode view state; AU-040c retires it in favour of
// AssistantPermissionMode when that view state leaves this slice. The filename
// outlives its contents by one commit on purpose — renaming it now would churn
// four importers that all move in AU-040c anyway.
export type AgentPermissionMode = "safe" | "power";
