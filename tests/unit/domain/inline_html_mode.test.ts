import { describe, expect, it, vi } from "vitest";
import {
  create_inline_html_trust_config,
  effective_html_mode,
  trust_allows_live,
} from "$lib/features/editor/domain/inline_html_mode";

describe("inline html trust", () => {
  it("starts with no trust source, which reads as never live", () => {
    const config = create_inline_html_trust_config();
    expect(config.get_level).toBeNull();
    expect(config.request).toBeNull();
  });

  it("accepts both granted levels and rejects safe", () => {
    expect(trust_allows_live("live")).toBe(true);
    expect(trust_allows_live("live+net")).toBe(true);
    expect(trust_allows_live("safe")).toBe(false);
  });

  it("keeps a live preference inert until trust is granted", () => {
    expect(effective_html_mode("live", "live")).toBe("live");
    expect(effective_html_mode("live", "live+net")).toBe("live");
    expect(effective_html_mode("live", "safe")).toBe("safe");
  });

  it("never upgrades a safe preference", () => {
    expect(effective_html_mode("safe", "live")).toBe("safe");
    expect(effective_html_mode("safe", "live+net")).toBe("safe");
    expect(effective_html_mode("safe", "safe")).toBe("safe");
  });

  it("awaits the injected lookup rather than reading a store", async () => {
    const config = create_inline_html_trust_config();
    const get_level = vi.fn(() => Promise.resolve("live" as const));
    config.get_level = get_level;
    const level = await config.get_level("notes/chart.html");
    expect(level).toBe("live");
    expect(get_level).toHaveBeenCalledWith("notes/chart.html");
  });
});
