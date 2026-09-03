import type { PipelineStageName } from './migration-pipeline';

export type { PipelineStageName } from './migration-pipeline';

export class PipelineStageError extends Error {
  constructor(
    readonly stage: PipelineStageName,
    override readonly cause: unknown,
  ) {
    super(`Migration pipeline ${stage} stage failed.`, { cause });
    this.name = 'PipelineStageError';
  }
}
