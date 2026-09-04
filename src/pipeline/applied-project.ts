import type { MigrationApplication } from '../report/migration-report';
import type { ValidatedProjectPlan } from './validated-project-plan';

export interface AppliedProject {
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

export function appliedProject(project: AppliedProject): AppliedProject {
  return Object.freeze({
    validated: project.validated,
    application: Object.freeze({ ...project.application }),
  });
}
