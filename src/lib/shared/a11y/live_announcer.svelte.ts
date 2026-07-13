const RESET_DELAY_MS = 50;

class LiveAnnouncer {
  message = $state("");
  #reset_timer: ReturnType<typeof setTimeout> | undefined;

  announce(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    clearTimeout(this.#reset_timer);
    this.message = "";
    this.#reset_timer = setTimeout(() => {
      this.message = trimmed;
    }, RESET_DELAY_MS);
  }
}

export const live_announcer = new LiveAnnouncer();

export function announce(message: string) {
  live_announcer.announce(message);
}
