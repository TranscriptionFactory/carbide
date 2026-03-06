export class TerminalStore {
  panel_open = $state(false);
  focused = $state(false);

  toggle() {
    this.panel_open = !this.panel_open;
  }

  open() {
    this.panel_open = true;
  }

  close() {
    this.panel_open = false;
    this.focused = false;
  }

  set_focused(value: boolean) {
    this.focused = value;
  }

  reset() {
    this.panel_open = false;
    this.focused = false;
  }
}
