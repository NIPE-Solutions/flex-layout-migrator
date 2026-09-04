import * as path from 'node:path';
import { MigrationApplicationError } from '../../migrator/migration-application.error';
import { migrationPlan, type FileMigrationPlan, type PlannedOutputArtifact } from '../../migrator/migration-plan';
import { validateMigrationPaths } from '../../migrator/migration-path.validator';
import { StylesheetPlanner } from '../../migrator/stylesheet.planner';
import type { StylesheetMigrationResult } from '../../report/migration-report.builder';
import type { ValidateStage } from '../migration-pipeline';
import { renderedProject, type RenderedProject } from '../rendered-project';
import { validatedProjectPlan, type ValidatedProjectPlan } from '../validated-project-plan';
import { CssReferenceCollector } from './css-reference.collector';
import { TemplateProposalValidator } from './template-proposal.validator';

type TemplateProposalValidatorPort = Pick<TemplateProposalValidator, 'validate'>;
type CssReferenceCollectorPort = Pick<CssReferenceCollector, 'collect'>;
type StylesheetPlannerPort = Pick<StylesheetPlanner, 'plan'>;

export class ValidateProjectStage implements ValidateStage {
  constructor(
    private readonly templateValidator: TemplateProposalValidatorPort = new TemplateProposalValidator(),
    private readonly cssReferences: CssReferenceCollectorPort = new CssReferenceCollector(),
    private readonly stylesheetPlanner: StylesheetPlannerPort = new StylesheetPlanner(),
  ) {}

  public async run(input: RenderedProject): Promise<ValidatedProjectPlan> {
    const rendered = renderedProject(input);
    this.validateConfiguration(rendered);

    const stylesheetPath = rendered.analyzed.manifest.invocation.options.stylesheetPath;
    const reportPath = rendered.analyzed.manifest.invocation.options.reportPath;
    await validateMigrationPaths({ templates: rendered.files, stylesheetPath, reportPath });

    const files: FileMigrationPlan[] = [];
    for (const [index, renderedFile] of rendered.files.entries()) {
      const template = rendered.analyzed.templates[index];
      if (template === undefined) {
        throw new MigrationApplicationError(
          'internal-invariant',
          'Rendered project files must match its analyzed templates one-to-one and in the same order.',
        );
      }
      files.push(await this.templateValidator.validate(template, renderedFile));
    }

    let stylesheetArtifact: PlannedOutputArtifact | undefined;
    let stylesheet: StylesheetMigrationResult | undefined;
    if (rendered.session.target === 'css' && stylesheetPath !== undefined) {
      const canonicalStylesheetPath = path.resolve(stylesheetPath);
      const references = await this.cssReferences.collect(rendered, files);
      stylesheetArtifact = await this.stylesheetPlanner.plan(
        canonicalStylesheetPath,
        rendered.session.rules,
        references,
      );
      stylesheet = {
        path: canonicalStylesheetPath,
        change: stylesheetChange(stylesheetArtifact),
      };
    }

    const plan = migrationPlan({
      target: rendered.session.target,
      files: files.map(item => item.file),
      artifacts: [
        ...files.flatMap(item => (item.artifact === undefined ? [] : [item.artifact])),
        ...(stylesheetArtifact === undefined ? [] : [stylesheetArtifact]),
      ],
    });
    await validateMigrationPaths({ templates: plan.files, stylesheetPath, reportPath });

    return validatedProjectPlan({ rendered, plan, ...(stylesheet === undefined ? {} : { stylesheet }) });
  }

  private validateConfiguration(rendered: RenderedProject): void {
    const stylesheetPath = rendered.analyzed.manifest.invocation.options.stylesheetPath;
    if (rendered.target === 'css' && stylesheetPath === undefined) {
      throw new MigrationApplicationError('invalid-configuration', '--target css requires --stylesheet <path>.');
    }
    if (rendered.target === 'tailwind' && stylesheetPath !== undefined) {
      throw new MigrationApplicationError('invalid-configuration', '--stylesheet can only be used with --target css.', [
        stylesheetPath,
      ]);
    }
  }
}

function stylesheetChange(artifact: PlannedOutputArtifact | undefined): StylesheetMigrationResult['change'] {
  if (artifact === undefined) return 'unchanged';
  if (artifact.original.status === 'absent') return 'created';
  if (artifact.proposed.status === 'absent') return 'removed';
  return 'updated';
}
