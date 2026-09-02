import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import { loadGitIgnore } from '../lib/gitignore.helper';
import { MigrationReportBuilder, type StylesheetMigrationResult } from '../report/migration-report.builder';
import type { MigrationReport } from '../report/migration-report';
import { MigrationTransaction } from '../transaction/migration-transaction';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import { MigrationApplicationError } from './migration-application.error';
import { validateMigrationPaths } from './migration-path.validator';
import { migrationPlan, type FileMigrationPlan, type PlannedOutputArtifact } from './migration-plan';
import { StylesheetPlanner } from './stylesheet.planner';

export interface MigrationOptions {
  readonly dryRun: boolean;
  readonly responsiveImages?: boolean;
  readonly stylesheetPath?: string;
  readonly reportPath?: string;
}

export class Migrator {
  constructor(
    private readonly session: ConversionAdapterSession,
    private readonly inputPath: string,
    private readonly outputPath: string,
    private readonly now: () => number = Date.now,
    private readonly transaction: Pick<MigrationTransaction, 'preflight' | 'apply'> = new MigrationTransaction(),
    private readonly stylesheetPlanner: Pick<StylesheetPlanner, 'plan'> = new StylesheetPlanner(),
  ) {}

  public async migrate(options: MigrationOptions = { dryRun: false }): Promise<MigrationReport> {
    this.validateOptions(options);

    const startedAt = this.now();
    const inputStat = await stat(this.inputPath);

    await loadGitIgnore(this.inputPath);

    let filePlans: readonly FileMigrationPlan[];
    if (inputStat.isFile()) {
      if (path.extname(this.inputPath).toLowerCase() !== '.html') {
        throw new Error(`Unsupported file type: ${this.inputPath}`);
      }
      if (path.extname(this.outputPath).toLowerCase() !== '.html') {
        throw new Error('Single-file output path must have a .html extension.');
      }
      filePlans = [
        await new FileMigrator(this.session.adapter, this.inputPath, this.outputPath).plan({
          responsiveImages: options.responsiveImages ?? false,
        }),
      ];
    } else if (inputStat.isDirectory()) {
      filePlans = await new FolderMigrator(this.session.adapter, this.inputPath, this.outputPath).plan({
        responsiveImages: options.responsiveImages ?? false,
      });
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    const sessionResult = this.session.finalize();
    if (sessionResult.target !== this.session.adapter.name) {
      throw new MigrationApplicationError('internal-invariant', 'Adapter session target changed during migration.');
    }

    let stylesheetArtifact: PlannedOutputArtifact | undefined;
    let stylesheetResult: StylesheetMigrationResult | undefined;
    if (sessionResult.target === 'css') {
      const stylesheetPath = path.resolve(options.stylesheetPath as string);
      stylesheetArtifact = await this.stylesheetPlanner.plan(stylesheetPath, sessionResult.rules);
      stylesheetResult = {
        path: stylesheetPath,
        change: stylesheetChange(stylesheetArtifact),
      };
    }

    const plan = migrationPlan({
      target: sessionResult.target,
      files: filePlans.map(filePlan => filePlan.file),
      artifacts: [
        ...filePlans.flatMap(filePlan => (filePlan.artifact ? [filePlan.artifact] : [])),
        ...(stylesheetArtifact ? [stylesheetArtifact] : []),
      ],
    });
    await validateMigrationPaths({
      templates: plan.files,
      stylesheetPath: options.stylesheetPath,
      reportPath: options.reportPath,
    });
    const hasParseError = plan.files.some(file => file.results.some(result => result.status === 'parse-error'));
    if (!hasParseError) {
      await this.transaction.preflight(plan);
      if (!options.dryRun && plan.artifacts.length > 0) await this.transaction.apply(plan);
    }

    return new MigrationReportBuilder().build(
      this.inputPath,
      this.outputPath,
      sessionResult.target,
      options.dryRun,
      this.now() - startedAt,
      plan.files,
      stylesheetResult,
    );
  }

  private validateOptions(options: MigrationOptions): void {
    if (this.session.adapter.name === 'css' && options.stylesheetPath === undefined) {
      throw new MigrationApplicationError('invalid-configuration', '--target css requires --stylesheet <path>.');
    }
    if (this.session.adapter.name === 'tailwind' && options.stylesheetPath !== undefined) {
      throw new MigrationApplicationError('invalid-configuration', '--stylesheet can only be used with --target css.', [
        options.stylesheetPath,
      ]);
    }
  }
}

function stylesheetChange(artifact: PlannedOutputArtifact | undefined): StylesheetMigrationResult['change'] {
  if (!artifact) return 'unchanged';
  if (artifact.original.status === 'absent') return 'created';
  if (artifact.proposed.status === 'absent') return 'removed';
  return 'updated';
}
