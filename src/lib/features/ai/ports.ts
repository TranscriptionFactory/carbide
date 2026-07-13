import type {
  AiCliCheckRequest,
  AiCliProbe,
  AiExecutionResult,
  AiPortExecuteRequest,
} from "$lib/features/ai/domain/ai_types";
import type {
  AiStreamChunk,
  AiStreamRequest,
} from "$lib/features/ai/domain/ai_stream_types";

export interface AiPort {
  check_cli(input: AiCliCheckRequest): Promise<boolean>;
  detect_cli(input: AiCliCheckRequest): Promise<AiCliProbe>;
  execute(input: AiPortExecuteRequest): Promise<AiExecutionResult>;
}

export interface AiStreamPort {
  stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk>;
}
