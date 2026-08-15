// Which ACP agent drives agent mode for this provider. A preset resolves to a
// known launch — an npx adapter, or the agent's own ACP subcommand when it
// speaks the protocol itself; custom is any command speaking ACP on stdio.
// The preset keeps the plain CLI command/args too — text mode and terminal
// handoff still run the bare CLI.
export type AcpAgentSpec =
  | { kind: "preset"; id: "claude" | "codex" | "opencode" | "pi" }
  | { kind: "custom"; command: string; args: string[] };

// Declaring stream_args is what makes a CLI streaming-capable, and it is the
// invocation every streamed run uses — ask mode and inline generation alike.
// Both open a text-mode run, and the transport sends any provider declaring
// stream_args down the streaming channel, so there is no per-surface arg set:
// a CLI streams one way or not at all.
//
// `args` is the one-shot invocation. Only `ai_execute_cli` reads it, serving
// providers that declare no streaming list.
export type AiCliTransport = {
  kind: "cli";
  command: string;
  args: string[];
  stream_args?: string[];
  acp?: AcpAgentSpec;
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
      args: ["-p", "--output-format", "text"],
      // `--output-format text` buffers until the process exits, so the one-shot
      // list cannot stream. The streaming list also strips every tool: ask mode
      // answers from the retrieved context it was handed, and a full-toolset
      // agent rooted in the vault would grep and edit its way through the
      // question instead of answering it. `--tools ""` clears the built-ins and
      // `--strict-mcp-config` clears the user's MCP servers; the empty value
      // must stay last so it cannot swallow a following flag.
      stream_args: [
        "-p",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--strict-mcp-config",
        "--tools",
        "",
      ],
      acp: { kind: "preset", id: "claude" },
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
      acp: { kind: "preset", id: "codex" },
    },
    install_url: "https://github.com/openai/codex",
    is_preset: true,
  },
  {
    id: "opencode",
    name: "opencode",
    transport: {
      kind: "cli",
      command: "opencode",
      args: ["run"],
      stream_args: ["run"],
      acp: { kind: "preset", id: "opencode" },
    },
    install_url: "https://opencode.ai/docs",
    is_preset: true,
  },
  {
    id: "pi",
    name: "pi",
    transport: {
      kind: "cli",
      command: "pi",
      args: ["-p"],
      stream_args: ["-p"],
      acp: { kind: "preset", id: "pi" },
    },
    install_url: "https://pi.dev",
    is_preset: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    transport: {
      kind: "cli",
      command: "ollama",
      args: ["run", "{model}"],
      stream_args: ["run", "{model}"],
    },
    model: "qwen3:8b",
    install_url: "https://ollama.com",
    is_preset: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio (server)",
    transport: {
      kind: "api",
      base_url: "http://localhost:1234/v1",
    },
    install_url: "https://lmstudio.ai/docs/app/api",
    is_preset: true,
  },
  {
    id: "llama-server",
    name: "llama.cpp (llama-server)",
    transport: {
      kind: "api",
      base_url: "http://localhost:8080/v1",
    },
    install_url:
      "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md",
    is_preset: true,
  },
];
