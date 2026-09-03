import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import { Migrator } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import type { MigrationInvocation } from './project-manifest';

export interface MigrationRunner {
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}

export type MigratorFactory = (
  session: ConversionAdapterSession,
  inputPath: string,
  outputPath: string,
) => Pick<Migrator, 'migrate'>;

const defaultMigratorFactory: MigratorFactory = (session, inputPath, outputPath) =>
  new Migrator(session, inputPath, outputPath);

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(
    private readonly session: ConversionAdapterSession,
    private readonly createMigrator: MigratorFactory = defaultMigratorFactory,
  ) {}

  public run(invocation: MigrationInvocation): Promise<MigrationReport> {
    return this.createMigrator(this.session, invocation.inputPath, invocation.outputPath).migrate(invocation.options);
  }
}
