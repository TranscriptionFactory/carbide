export type PlatformInfo = {
  is_tauri: boolean;
  is_mobile: boolean;
  is_mobile_tauri: boolean;
  is_desktop_tauri: boolean;
};

function detect_mobile_user_agent(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const user_agent_data = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  if (user_agent_data.userAgentData?.mobile === true) {
    return true;
  }

  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function detect_platform(): PlatformInfo {
  if (typeof window === "undefined") {
    return {
      is_tauri: false,
      is_mobile: false,
      is_mobile_tauri: false,
      is_desktop_tauri: false,
    };
  }

  const is_tauri = "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
  const is_mobile = detect_mobile_user_agent();

  return {
    is_tauri,
    is_mobile,
    is_mobile_tauri: is_tauri && is_mobile,
    is_desktop_tauri: is_tauri && !is_mobile,
  };
}

export const { is_tauri, is_mobile, is_mobile_tauri, is_desktop_tauri } =
  detect_platform();
