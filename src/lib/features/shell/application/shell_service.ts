import type { ShellPort } from "$lib/features/shell/ports";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("shell_service");

export class ShellService {
  constructor(private readonly shell_port: ShellPort) {}

  async open_url(url: string): Promise<void> {
    try {
      await this.shell_port.open_url(url);
    } catch (error) {
      log.error("Open URL failed", { error: error_message(error), url });
    }
  }

  async open_path(path: string): Promise<void> {
    try {
      await this.shell_port.open_path(path);
    } catch (error) {
      log.error("Open path failed", { error: error_message(error), path });
    }
  }
}
