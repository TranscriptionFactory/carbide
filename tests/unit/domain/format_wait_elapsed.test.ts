import { describe, expect, it } from "vitest";
import { format_wait_elapsed } from "$lib/features/assistant/domain/format_wait_elapsed";

describe("format_wait_elapsed", () => {
  it("counts whole seconds below a minute", () => {
    expect(format_wait_elapsed(0)).toBe("0s");
    expect(format_wait_elapsed(1999)).toBe("1s");
    expect(format_wait_elapsed(59_400)).toBe("59s");
  });

  it("switches to minutes and zero-padded seconds at a minute", () => {
    expect(format_wait_elapsed(60_000)).toBe("1m 00s");
    expect(format_wait_elapsed(65_000)).toBe("1m 05s");
    expect(format_wait_elapsed(300_000)).toBe("5m 00s");
  });

  it("clamps a negative clock reading to zero", () => {
    expect(format_wait_elapsed(-5000)).toBe("0s");
  });
});
