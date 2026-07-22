export function error_message(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export function strip_invoke_prefix(message: string): string {
  return message.replace(/^tauri invoke failed: [^:]+: /, "");
}
