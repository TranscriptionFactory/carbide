import type {
  AiCliCheckRequest,
  AiCliProbe,
  AiExecutionResult,
  AiPortExecuteRequest,
  AiProviderConfig,
} from "$lib/features/ai/domain/ai_types";
import type {
  AiStreamChunk,
  AiStreamRequest,
} from "$lib/features/ai/domain/ai_stream_types";

export interface AiPort {
  check_cli(input: AiCliCheckRequest): Promise<boolean>;
  detect_cli(input: AiCliCheckRequest): Promise<AiCliProbe>;
  execute(input: AiPortExecuteRequest): Promise<AiExecutionResult>;
  set_api_key(provider_id: string, key: string): Promise<void>;
  delete_api_key(provider_id: string): Promise<void>;
  get_api_key_hint(provider_id: string): Promise<string | null>;
  test_provider(config: AiProviderConfig): Promise<string>;
}

export interface AiStreamPort {
  stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk>;
}
