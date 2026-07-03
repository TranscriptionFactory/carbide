export const MACOS_TRAFFIC_LIGHT_SAFE_PADDING = 90;

function get_user_agent(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent;
}

export function is_linux(): boolean {
  const ua = get_user_agent();
  return ua.includes("Linux") && !ua.includes("Android");
}

export function is_mac(): boolean {
  const ua = get_user_agent();
  return ua.includes("Mac OS X") || ua.includes("Macintosh");
}

export function is_windows(): boolean {
  return get_user_agent().includes("Windows");
}

export function is_tauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
  );
}

export function should_use_custom_window_chrome(): boolean {
  return is_tauri() && (is_linux() || is_windows());
}

export function should_show_macos_drag_strip(
  is_mac_desktop: boolean,
  lattice_title_bar_visible: boolean,
): boolean {
  return is_mac_desktop && !lattice_title_bar_visible;
}
