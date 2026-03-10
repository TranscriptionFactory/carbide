import type {
  AiCliCheckRequest,
  AiExecutionResult,
  AiPortRequest,
} from "$lib/features/ai/domain/ai_types";

export interface AiPort {
  check_cli(input: AiCliCheckRequest): Promise<boolean>;
  execute(input: AiPortRequest): Promise<AiExecutionResult>;
}
