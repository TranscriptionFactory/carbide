export interface MouseMovementSnapshot {
  client_x: number;
  client_y: number;
  screen_x: number;
  screen_y: number;
}

export interface MouseMovementDecision {
  moved: boolean;
  snapshot: MouseMovementSnapshot;
}

const MOUSE_POSITION_KEYS: Array<keyof MouseMovementSnapshot> = [
  "client_x",
  "client_y",
  "screen_x",
  "screen_y",
];

function has_non_zero_movement_delta(
  event: Pick<MouseEvent, "movementX" | "movementY">,
): boolean {
  return (event.movementX ?? 0) !== 0 || (event.movementY ?? 0) !== 0;
}

function has_changed_mouse_position(
  snapshot: MouseMovementSnapshot,
  previous: MouseMovementSnapshot | null,
): boolean {
  if (!previous) return false;
  return MOUSE_POSITION_KEYS.some((key) => snapshot[key] !== previous[key]);
}

export function detect_intentional_mouse_movement(
  event: Pick<
    MouseEvent,
    "clientX" | "clientY" | "screenX" | "screenY" | "movementX" | "movementY"
  >,
  previous: MouseMovementSnapshot | null,
): MouseMovementDecision {
  const snapshot: MouseMovementSnapshot = {
    client_x: event.clientX,
    client_y: event.clientY,
    screen_x: event.screenX,
    screen_y: event.screenY,
  };

  return {
    moved:
      has_non_zero_movement_delta(event) ||
      has_changed_mouse_position(snapshot, previous),
    snapshot,
  };
}
