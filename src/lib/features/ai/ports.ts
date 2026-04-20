import type {
  AiCliCheckRequest,
  AiExecutionResult,
  AiPortExecuteRequest,
} from "$lib/features/ai/domain/ai_types";
import type {
  AiStreamChunk,
  AiStreamRequest,
} from "$lib/features/ai/domain/ai_stream_types";

export interface AiPort {
  check_cli(input: AiCliCheckRequest): Promise<boolean>;
  execute(input: AiPortExecuteRequest): Promise<AiExecutionResult>;
}

export interface AiStreamPort {
  stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk>;
  abort(request_id: string): void;
}
