// The chat turn's own event payloads. AU-040b lands only the sources payload,
// which the chat store holds as pending view state; AU-040c moves the rest of
// RagStreamEvent here when the turn itself leaves rag.
//
// `pinned` records that the note was [[mentioned]] rather than retrieved, which
// is a property of how it entered the turn, not of the note.
export type AssistantChatSourceInfo = {
  note_path: string;
  title: string;
  score: number;
  truncated: boolean;
  pinned: boolean;
};
