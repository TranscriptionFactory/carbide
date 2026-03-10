import type { AiProvider } from "$lib/features/ai/domain/ai_types";
import type { AiDefaultBackend } from "$lib/shared/types/editor_settings";

const AUTO_BACKEND_ORDER: AiProvider[] = ["claude", "codex", "ollama"];

export function preferred_ai_backend_order(
  default_backend: AiDefaultBackend,
): AiProvider[] {
  if (default_backend === "auto") {
    return [...AUTO_BACKEND_ORDER];
  }

  return [default_backend];
}

export async function resolve_auto_ai_backend(input: {
  check_availability: (provider: AiProvider) => Promise<boolean>;
}): Promise<AiProvider | null> {
  for (const provider of AUTO_BACKEND_ORDER) {
    if (await input.check_availability(provider)) {
      return provider;
    }
  }

  return null;
}
