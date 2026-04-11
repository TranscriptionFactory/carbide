import { describe, it, expect } from "vitest";
import { format_bytes } from "$lib/shared/utils/format_bytes";

describe("format_bytes", () => {
  it("returns 0 B for zero", () => {
    expect(format_bytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(format_bytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(format_bytes(1024)).toBe("1.0 KB");
    expect(format_bytes(1536)).toBe("1.5 KB");
    expect(format_bytes(10 * 1024)).toBe("10 KB");
  });

  it("formats megabytes", () => {
    expect(format_bytes(1048576)).toBe("1.0 MB");
    expect(format_bytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(format_bytes(100 * 1024 * 1024)).toBe("100 MB");
  });

  it("formats gigabytes", () => {
    expect(format_bytes(1073741824)).toBe("1.0 GB");
  });
});
