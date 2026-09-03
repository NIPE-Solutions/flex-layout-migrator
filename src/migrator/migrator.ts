import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import type { OwnedCssReferences } from '../adapter/css/stylesheet/owned-stylesheet.merger';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import type { AnalyzedProject, AnalyzedTemplate } from '../pipeline/analyzed-project';
import type { MigrationApplication, MigrationReport } from '../report/migration-report';
import { MigrationReportBuilder, type StylesheetMigrationResult } from '../report/migration-report.builder';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { templateAttributeKeys } from '../template/template-attribute';
import { MigrationTransaction } from '../transaction/migration-transaction';
import { AnalyzedFileMigrator } from './analyzed-file.migrator';
import { nodeDestinationTemplateSource, type DestinationTemplateSource } from './destination-template-source';
import type { MigrationMode } from './migration-mode';
import { MigrationApplicationError } from './migration-application.error';
import { migrationPlan, type FileMigrationPlan, type PlannedOutputArtifact } from './migration-plan';
import { validateMigrationPaths } from './migration-path.validator';
import { StylesheetPlanner } from './stylesheet.planner';

export interface MigrationOptions {
  readonly mode: MigrationMode;
  readonly responsiveImages?: boolean;
  readonly stylesheetPath?: string;
  readonly reportPath?: string;
}

export interface MigrationExecutionContext {
  readonly mapDestinationReadError?: (error: unknown) => unknown;
  readonly now?: () => number;
  readonly startedAt?: number;
}

export type AnalyzedFileMigratorFactory = (
  adapter: ConversionAdapter,
  template: AnalyzedTemplate,
  destinationTemplates: DestinationTemplateSource,
) => Pick<AnalyzedFileMigrator, 'plan'>;

export interface MigratorDependencies {
  readonly destinationTemplates: DestinationTemplateSource;
  readonly referenceParser: TemplateParser;
  readonly createFileMigrator: AnalyzedFileMigratorFactory;
}

export class Migrator {
  constructor(
    private readonly session: ConversionAdapterSession,
    private readonly analyzed: AnalyzedProject,
    private readonly now: () => number = Date.now,
    private readonly transaction: Pick<MigrationTransaction, 'preflight' | 'apply'> = new MigrationTransaction(),
    private readonly stylesheetPlanner: Pick<StylesheetPlanner, 'plan'> = new StylesheetPlanner(),
    private readonly dependencies: MigratorDependencies = defaultMigratorDependencies(),
  ) {}

  public async migrate(
    options: MigrationOptions = { mode: 'plan' },
    execution: MigrationExecutionContext = {},
  ): Promise<MigrationReport> {
    this.validateOptions(options);

    const now = execution.now ?? this.now;
    const startedAt = execution.startedAt ?? now();
    const readDestinationTemplate = mapDestinationReadErrors(
      this.dependencies.destinationTemplates,
      execution.mapDestinationReadError,
    );
    const destinationTemplates =
      execution.mapDestinationReadError === undefined
        ? this.dependencies.destinationTemplates
        : Object.freeze({ read: readDestinationTemplate });
    const filePlans: FileMigrationPlan[] = [];
    for (const template of this.analyzed.templates) {
      const analyzedFileMigrator = this.dependencies.createFileMigrator(
        this.session.adapter,
        template,
        destinationTemplates,
      );
      filePlans.push(
        await analyzedFileMigrator.plan({
          responsiveImages: options.responsiveImages ?? false,
        }),
      );
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
        await this.referencedCssClasses(filePlans, readDestinationTemplate),
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
    let application: MigrationApplication;
    if (options.mode === 'plan') {
      if (!hasParseError) await this.transaction.preflight(plan);
      application = { status: 'skipped', reason: 'plan-only' };
    } else if (hasParseError) {
      application = { status: 'skipped', reason: 'parse-errors' };
    } else {
      await this.transaction.preflight(plan);
      if (plan.artifacts.length > 0) await this.transaction.apply(plan);
      application = { status: 'applied' };
    }

    return new MigrationReportBuilder().build(
      this.analyzed.manifest.invocation.inputPath,
      this.analyzed.manifest.invocation.outputPath,
      sessionResult.target,
      options.mode,
      application,
      now() - startedAt,
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

  private async referencedCssClasses(
    filePlans: readonly FileMigrationPlan[],
    readDestinationTemplate: DestinationTemplateSource['read'],
  ): Promise<OwnedCssReferences> {
    const templates = await Promise.all(
      filePlans.map(async (filePlan, index) => {
        const analyzedTemplate = this.analyzed.templates[index];
        if (analyzedTemplate === undefined) {
          throw new MigrationApplicationError(
            'internal-invariant',
            'Rendered file plans must match analyzed templates one-to-one and in the same order.',
          );
        }
        if (filePlan.artifact?.kind === 'template' && filePlan.artifact.proposed.status === 'present') {
          return { contents: filePlan.artifact.proposed.contents, complete: true };
        }
        if (path.resolve(filePlan.file.inputPath) === path.resolve(filePlan.file.outputPath)) {
          return { contents: analyzedTemplate.source, complete: true };
        }
        try {
          return {
            contents: await readDestinationTemplate(filePlan.file.outputPath),
            complete: true,
          };
        } catch (error: unknown) {
          if (isEnoent(error)) return { contents: '', complete: false };
          throw error;
        }
      }),
    );
    const references = new Set<string>();
    let complete = true;
    for (const template of templates) {
      complete &&= template.complete;
      const parsed = this.dependencies.referenceParser.parse(template.contents, 'proposed-template.html');
      if (parsed.status === 'parse-error') {
        complete = false;
        continue;
      }
      for (const attribute of parsed.elements.flatMap(element => element.attributes)) {
        const ngClassAuthority = [...templateAttributeKeys(attribute)].some(
          key => key === 'ngclass' || key.startsWith('ngclass.'),
        );
        const literalClass = attribute.name === 'class' && attribute.binding === 'literal';
        const namedClassBinding = attribute.binding === 'property' && attribute.bindingTarget === 'class';
        const dynamicClass =
          attribute.binding === 'property' && (attribute.name === 'class' || attribute.name === 'className');
        if (!literalClass && !namedClassBinding && !dynamicClass && !ngClassAuthority) continue;

        if (literalClass || (ngClassAuthority && attribute.binding === 'literal')) {
          for (const className of attribute.value.split(/\s+/u)) {
            if (isGeneratedCssClassName(className)) references.add(className);
          }
        }
        if (namedClassBinding) {
          const className = namedGeneratedClassName(attribute.name);
          if (className !== undefined) references.add(className);
        }
        if (
          dynamicClass ||
          ngClassAuthority ||
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

function mapDestinationReadErrors(
  source: DestinationTemplateSource,
  mapper: MigrationExecutionContext['mapDestinationReadError'],
): DestinationTemplateSource['read'] {
  return async (path: string): Promise<string> => {
    try {
      return await source.read(path);
    } catch (error: unknown) {
      throw mapper === undefined ? error : mapper(error);
    }
  };
}

function defaultMigratorDependencies(): MigratorDependencies {
  return {
    destinationTemplates: nodeDestinationTemplateSource,
    referenceParser: new AngularTemplateParser(),
    createFileMigrator: (adapter, template, destinationTemplates) =>
      new AnalyzedFileMigrator(adapter, template, undefined, destinationTemplates),
  };
}

function isGeneratedCssClassName(className: string): boolean {
  return /^flm-[a-f0-9]{64}$/u.test(className);
}

function namedGeneratedClassName(name: string): string | undefined {
  return isGeneratedCssClassName(name) ? name : undefined;
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
