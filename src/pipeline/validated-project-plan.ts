import type { StylesheetMigrationResult } from '../report/migration-report.builder';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { migrationPlan, type MigrationPlan } from '../migrator/migration-plan';
import { renderedProject, type RenderedProject } from './rendered-project';

export interface ValidatedProjectPlan {
  readonly rendered: RenderedProject;
  readonly plan: MigrationPlan;
  readonly stylesheet?: StylesheetMigrationResult;
}

export function validatedProjectPlan(project: ValidatedProjectPlan): ValidatedProjectPlan {
  const rendered = renderedProject(project.rendered);
  const plan = migrationPlan(project.plan);

  if (plan.target !== rendered.session.target) {
    throw internalInvariant('Validated migration plan target differs from its finalized adapter session target.');
  }

  return Object.freeze({
    rendered,
    plan,
    ...(project.stylesheet === undefined ? {} : { stylesheet: Object.freeze({ ...project.stylesheet }) }),
  });
}

function internalInvariant(message: string): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message);
}
