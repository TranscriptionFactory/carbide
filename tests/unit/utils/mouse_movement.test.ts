import { describe, expect, it } from "vitest";
import { detect_intentional_mouse_movement } from "$lib/shared/utils/mouse_movement";

function mouse_event(overrides: Partial<MouseEvent> = {}) {
  return {
    clientX: 10,
    clientY: 20,
    screenX: 30,
    screenY: 40,
    movementX: 0,
    movementY: 0,
    ...overrides,
  } as MouseEvent;
}

function mouse_event_without_movement_deltas() {
  return {
    clientX: 10,
    clientY: 20,
    screenX: 30,
    screenY: 40,
  } as MouseEvent;
}

describe("detect_intentional_mouse_movement", () => {
  it("treats the first zero-delta mousemove as positioning noise", () => {
    const decision = detect_intentional_mouse_movement(mouse_event(), null);

    expect(decision.moved).toBe(false);
    expect(decision.snapshot).toEqual({
      client_x: 10,
      client_y: 20,
      screen_x: 30,
      screen_y: 40,
    });
  });

  it("treats missing movement deltas as zero", () => {
    const decision = detect_intentional_mouse_movement(
      mouse_event_without_movement_deltas(),
      null,
    );

    expect(decision.moved).toBe(false);
  });

  it("detects movement from browser movement deltas", () => {
    const decision = detect_intentional_mouse_movement(
      mouse_event({ movementX: 1 }),
      null,
    );

    expect(decision.moved).toBe(true);
  });

  it("detects movement by comparing coordinates", () => {
    const previous = detect_intentional_mouse_movement(
      mouse_event(),
      null,
    ).snapshot;

    const decision = detect_intentional_mouse_movement(
      mouse_event({ clientY: 21 }),
      previous,
    );

    expect(decision.moved).toBe(true);
  });

  it("ignores repeated mousemove events at the same coordinates", () => {
    const previous = detect_intentional_mouse_movement(
      mouse_event(),
      null,
    ).snapshot;

    const decision = detect_intentional_mouse_movement(mouse_event(), previous);

    expect(decision.moved).toBe(false);
  });
});
