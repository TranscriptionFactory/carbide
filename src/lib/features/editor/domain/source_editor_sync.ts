export type SourceEditorMarkdownSyncInput = {
  content: string;
  applied_markdown: string | null;
  next_markdown: string;
};

export type SourceEditorMarkdownSyncState = {
  content: string;
  applied_markdown: string | null;
};

export function sync_source_editor_markdown(
  input: SourceEditorMarkdownSyncInput,
): SourceEditorMarkdownSyncState {
  if (input.applied_markdown === input.next_markdown) {
    return {
      content: input.content,
      applied_markdown: input.applied_markdown,
    };
  }

  return {
    content: input.next_markdown,
    applied_markdown: input.next_markdown,
  };
}
