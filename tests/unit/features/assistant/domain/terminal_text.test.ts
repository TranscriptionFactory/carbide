import { describe, expect, it } from "vitest";
import {
  render_terminal_text,
  strip_ansi,
} from "$lib/features/assistant/domain/terminal_text";

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const ST = `${ESC}\\`;

describe("strip_ansi", () => {
  it("removes SGR colour codes and keeps the payload", () => {
    expect(strip_ansi(`${ESC}[31mred${ESC}[0m done`)).toBe("red done");
  });

  it("removes cursor-movement and erase sequences", () => {
    expect(strip_ansi(`start${ESC}[2K${ESC}[1;5Hend`)).toBe("startend");
  });

  it("removes a BEL-terminated OSC sequence", () => {
    expect(strip_ansi(`${ESC}]0;window title${BEL}hello`)).toBe("hello");
  });

  it("removes an ST-terminated OSC hyperlink", () => {
    expect(
      strip_ansi(`${ESC}]8;;https://example.com${ST}link${ESC}]8;;${ST}`),
    ).toBe("link");
  });

  it("removes single-character escapes", () => {
    expect(strip_ansi(`a${ESC}Mb`)).toBe("ab");
  });

  it("leaves plain text untouched", () => {
    expect(strip_ansi("plain output 100% [ok]")).toBe("plain output 100% [ok]");
  });
});

describe("render_terminal_text", () => {
  it("keeps only the last redraw of a carriage-returned line", () => {
    expect(render_terminal_text("10%\r55%\r100%")).toBe("100%");
  });

  it("collapses redraws per line, independently", () => {
    expect(render_terminal_text("a\rb\nc\rd")).toBe("b\nd");
  });

  it("preserves CRLF-separated lines as plain lines", () => {
    expect(render_terminal_text("one\r\ntwo\r\n")).toBe("one\ntwo\n");
  });

  it("strips ansi before collapsing redraws", () => {
    expect(render_terminal_text(`${ESC}[32m10%${ESC}[0m\rdone`)).toBe("done");
  });

  it("leaves plain multi-line output untouched", () => {
    expect(render_terminal_text("first\nsecond\n")).toBe("first\nsecond\n");
  });
});
