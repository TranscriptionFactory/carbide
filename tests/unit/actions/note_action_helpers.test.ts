import { describe, it, expect, vi } from "vitest";
import { save_and_insert_file } from "$lib/features/note/application/note_action_helpers";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { PastedImagePayload } from "$lib/shared/types/editor";
import { as_note_path, as_asset_path } from "$lib/shared/types/ids";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

function make_input(
  note_id: NoteId,
  note_path: NotePath,
  save_result:
    | { status: "saved"; asset_path: ReturnType<typeof as_asset_path> }
    | { status: "skipped" },
) {
  const insert_text = vi.fn();

  const input = {
    stores: {
      editor: {
        open_note: {
          meta: { id: note_id, path: note_path },
        },
      },
    },
    services: {
      note: {
        save_pasted_image: vi.fn().mockResolvedValue(save_result),
      },
      editor: {
        insert_text,
      },
    },
  } as unknown as ActionRegistrationInput;

  return { input, insert_text };
}

function make_payload(
  file_name: string | null,
  mime_type = "application/octet-stream",
): PastedImagePayload {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mime_type,
    file_name,
  };
}

const NOTE_ID = "notes/my-note" as NoteId;
const NOTE_PATH = as_note_path("notes/my-note.md");
const ASSET_PATH = as_asset_path("notes/.assets/my-note-1.png");

describe("save_and_insert_file", () => {
  it("inserts markdown image syntax for image files", async () => {
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: ASSET_PATH,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("photo.png", "image/png"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[photo\]\(/);
    expect(syntax).toMatch(/\.png\)$/);
  });

  it("inserts embed syntax for PDF files", async () => {
    const pdf_asset = as_asset_path("notes/.assets/my-note-1.pdf");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: pdf_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("document.pdf", "application/pdf"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[\[/);
    expect(syntax).toMatch(/\]\]$/);
  });

  it("inserts embed syntax for video files", async () => {
    const video_asset = as_asset_path("notes/.assets/clip-1.mp4");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: video_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("video.mp4", "video/mp4"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[\[/);
    expect(syntax).toMatch(/\]\]$/);
  });

  it("inserts embed syntax for audio files", async () => {
    const audio_asset = as_asset_path("notes/.assets/song-1.mp3");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: audio_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("song.mp3", "audio/mpeg"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[\[/);
    expect(syntax).toMatch(/\]\]$/);
  });

  it("inserts inline link syntax for regular files", async () => {
    const csv_asset = as_asset_path("notes/.assets/data-1.csv");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: csv_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("data.csv", "text/csv"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^\[data\.csv\]\(/);
    expect(syntax).toMatch(/\)$/);
  });

  it("uses 'file' as fallback name when file_name is null", async () => {
    const other_asset = as_asset_path("notes/.assets/my-note-1.bin");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: other_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload(null, "application/octet-stream"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^\[file\]\(/);
  });

  it("does nothing when save_pasted_image returns skipped", async () => {
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "skipped",
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("photo.png", "image/png"),
    );

    expect(insert_text).not.toHaveBeenCalled();
  });

  it("does nothing when open_note id does not match", async () => {
    const other_id = "notes/other-note" as NoteId;
    const save_result = {
      status: "saved" as const,
      asset_path: ASSET_PATH,
    };
    const insert_text = vi.fn();

    const input = {
      stores: {
        editor: {
          open_note: {
            meta: { id: other_id },
          },
        },
      },
      services: {
        note: {
          save_pasted_image: vi.fn().mockResolvedValue(save_result),
        },
        editor: { insert_text },
      },
    } as unknown as ActionRegistrationInput;

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("photo.png", "image/png"),
    );

    expect(insert_text).not.toHaveBeenCalled();
  });

  it("inserts embed syntax for webm video files", async () => {
    const webm_asset = as_asset_path("notes/.assets/clip-1.webm");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: webm_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("clip.webm", "video/webm"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[\[/);
  });

  it("inserts embed syntax for wav audio files", async () => {
    const wav_asset = as_asset_path("notes/.assets/sound-1.wav");
    const { input, insert_text } = make_input(NOTE_ID, NOTE_PATH, {
      status: "saved",
      asset_path: wav_asset,
    });

    await save_and_insert_file(
      input,
      NOTE_ID,
      NOTE_PATH,
      make_payload("sound.wav", "audio/wav"),
    );

    expect(insert_text).toHaveBeenCalledOnce();
    const [syntax] = insert_text.mock.calls[0]!;
    expect(syntax).toMatch(/^!\[\[/);
  });
});
