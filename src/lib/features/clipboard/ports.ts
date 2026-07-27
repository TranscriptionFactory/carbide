export type RichClipboardPayload = {
  html: string;
  text: string;
};

export interface ClipboardPort {
  write_text: (text: string) => Promise<void>;
  write_rich: (payload: RichClipboardPayload) => Promise<void>;
}
