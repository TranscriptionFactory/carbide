import { beforeEach, describe, expect, it, vi } from "vitest";

const { mount_core_reactors_mock, mount_reactors_mock } = vi.hoisted(() => ({
  mount_core_reactors_mock: vi.fn(),
  mount_reactors_mock: vi.fn(),
}));

vi.mock("$lib/reactors", () => ({
  mount_core_reactors: mount_core_reactors_mock,
  mount_reactors: mount_reactors_mock,
}));

import { mount_lite_reactors } from "$lib/app/lite/mount_lite_reactors";

describe("mount_lite_reactors", () => {
  beforeEach(() => {
    mount_core_reactors_mock.mockReset();
    mount_reactors_mock.mockReset();
  });

  it("mounts only the shared core reactor set", () => {
    const context = { kind: "lite" };
    const cleanup = vi.fn();
    mount_core_reactors_mock.mockReturnValue(cleanup);

    const result = mount_lite_reactors(context as never);

    expect(result).toBe(cleanup);
    expect(mount_core_reactors_mock).toHaveBeenCalledWith(context);
    expect(mount_reactors_mock).not.toHaveBeenCalled();
  });
});
