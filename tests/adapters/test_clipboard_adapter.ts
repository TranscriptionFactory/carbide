import type {
  ClipboardPort,
  RichClipboardPayload,
} from "$lib/features/clipboard";

export function create_test_clipboard_adapter(): ClipboardPort & {
  _calls: { write_text: string[]; write_rich: RichClipboardPayload[] };
} {
  const calls = {
    write_text: [] as string[],
    write_rich: [] as RichClipboardPayload[],
  };

  return {
    _calls: calls,
    write_text(text) {
      calls.write_text.push(text);
      return Promise.resolve();
    },
    write_rich(payload) {
      calls.write_rich.push(payload);
      return Promise.resolve();
    },
  };
}
