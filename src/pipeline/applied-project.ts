import type { MigrationApplication } from '../report/migration-report';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ValidatedProjectPlan } from './validated-project-plan';

export interface AppliedProject {
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

export function appliedProject(project: AppliedProject): AppliedProject {
  const mode = project.validated.rendered.analyzed.manifest.invocation.options.mode;
  const coherent =
    mode === 'plan'
      ? project.application.status === 'skipped' && project.application.reason === 'plan-only'
      : !(project.application.status === 'skipped' && project.application.reason === 'plan-only');
  if (!coherent) {
    throw new MigrationApplicationError(
      'internal-invariant',
      `Application result is incompatible with validated manifest mode "${mode}".`,
    );
  }
  return Object.freeze({
    validated: project.validated,
    application: Object.freeze({ ...project.application }),
  });
}
