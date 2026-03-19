export type AiCliTransport = {
  kind: "cli";
  command: string;
  args: string[];
};

export type AiApiTransport = {
  kind: "api";
  base_url: string;
  api_key_env?: string;
};

export type AiTransport = AiCliTransport | AiApiTransport;

export type AiProviderConfig = {
  id: string;
  name: string;
  transport: AiTransport;
  model?: string;
  install_url?: string;
  is_preset?: boolean;
};

export const BUILTIN_PROVIDER_PRESETS: AiProviderConfig[] = [
  {
    id: "claude",
    name: "Claude Code",
    transport: {
      kind: "cli",
      command: "claude",
      args: ["-p", "{prompt}", "--output-format", "text"],
    },
    install_url: "https://code.claude.com/docs/en/quickstart",
    is_preset: true,
  },
  {
    id: "codex",
    name: "Codex",
    transport: {
      kind: "cli",
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "--output-last-message",
        "{output_file}",
        "-",
      ],
    },
    install_url: "https://github.com/openai/codex",
    is_preset: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    transport: {
      kind: "cli",
      command: "ollama",
      args: ["run", "{model}"],
    },
    model: "qwen3:8b",
    install_url: "https://ollama.com",
    is_preset: true,
  },
];
