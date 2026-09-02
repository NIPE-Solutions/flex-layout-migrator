import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import { loadGitIgnore } from '../lib/gitignore.helper';
import { MigrationReportBuilder, type StylesheetMigrationResult } from '../report/migration-report.builder';
import type { MigrationReport } from '../report/migration-report';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { MigrationTransaction } from '../transaction/migration-transaction';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import { MigrationApplicationError } from './migration-application.error';
import { validateMigrationPaths } from './migration-path.validator';
import { migrationPlan, type FileMigrationPlan, type PlannedOutputArtifact } from './migration-plan';
import { StylesheetPlanner } from './stylesheet.planner';
import type { OwnedCssReferences } from '../adapter/css/stylesheet/owned-stylesheet.merger';

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

    // Validate all selected destinations before reference collection reads a
    // distinct output. A collision can otherwise make that path unopenable.
    await validateMigrationPaths({
      templates: filePlans.map(filePlan => filePlan.file),
      stylesheetPath: options.stylesheetPath,
      reportPath: options.reportPath,
    });

    const sessionResult = this.session.finalize();
    if (sessionResult.target !== this.session.adapter.name) {
      throw new MigrationApplicationError('internal-invariant', 'Adapter session target changed during migration.');
    }

    let stylesheetArtifact: PlannedOutputArtifact | undefined;
    let stylesheetResult: StylesheetMigrationResult | undefined;
    if (sessionResult.target === 'css') {
      const stylesheetPath = path.resolve(options.stylesheetPath as string);
      stylesheetArtifact = await this.stylesheetPlanner.plan(
        stylesheetPath,
        sessionResult.rules,
        await this.referencedCssClasses(filePlans),
      );
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

  private async referencedCssClasses(filePlans: readonly FileMigrationPlan[]): Promise<OwnedCssReferences> {
    const templates = await Promise.all(
      filePlans.map(async filePlan => {
        if (filePlan.artifact?.kind === 'template' && filePlan.artifact.proposed.status === 'present') {
          return { contents: filePlan.artifact.proposed.contents, complete: true };
        }
        if (path.resolve(filePlan.file.inputPath) === path.resolve(filePlan.file.outputPath)) {
          return { contents: await readFile(filePlan.file.inputPath, 'utf8'), complete: true };
        }
        try {
          return { contents: await readFile(filePlan.file.outputPath, 'utf8'), complete: true };
        } catch (error: unknown) {
          if (isEnoent(error)) return { contents: '', complete: false };
          throw error;
        }
      }),
    );
    const references = new Set<string>();
    let complete = true;
    const parser = new AngularTemplateParser();
    for (const template of templates) {
      complete &&= template.complete;
      const parsed = parser.parse(template.contents, 'proposed-template.html');
      if (parsed.status === 'parse-error') {
        complete = false;
        continue;
      }
      for (const attribute of parsed.elements.flatMap(element => element.attributes)) {
        const literalClass = attribute.name === 'class' && attribute.binding === 'literal';
        const namedClassBinding = attribute.binding === 'property' && attribute.bindingTarget === 'class';
        const dynamicClass =
          attribute.binding === 'property' &&
          (attribute.name === 'class' || attribute.name === 'className' || attribute.name === 'ngClass');
        if (!literalClass && !namedClassBinding && !dynamicClass) continue;

        if (literalClass) {
          for (const className of attribute.value.split(/\s+/u)) {
            if (isGeneratedCssClassName(className)) references.add(className);
          }
        }
        if (namedClassBinding) {
          const className = namedGeneratedClassName(attribute.rawName);
          if (className !== undefined) references.add(className);
        }
        if (
          dynamicClass ||
          `${attribute.value} ${attribute.rawValue}`.includes('{{') ||
          `${attribute.value} ${attribute.rawValue}`.includes('}}')
        ) {
          complete = false;
        }
      }
    }
    return { classNames: references, complete };
  }
}

function isGeneratedCssClassName(className: string): boolean {
  return /^flm-[a-f0-9]{64}$/u.test(className);
}

function namedGeneratedClassName(rawName: string): string | undefined {
  const match = rawName.match(/^\[class\.(flm-[a-f0-9]{64})\]$/u);
  return match?.[1];
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function stylesheetChange(artifact: PlannedOutputArtifact | undefined): StylesheetMigrationResult['change'] {
  if (!artifact) return 'unchanged';
  if (artifact.original.status === 'absent') return 'created';
  if (artifact.proposed.status === 'absent') return 'removed';
  return 'updated';
}
