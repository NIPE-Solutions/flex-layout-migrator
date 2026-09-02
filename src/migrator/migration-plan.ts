import * as path from 'node:path';
import { fileMigrationResult, type FileMigrationResult } from './file-migration-result';

export type ArtifactState = { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string };

export interface PlannedOutputArtifact {
  readonly kind: 'template' | 'stylesheet';
  readonly path: string;
  readonly original: ArtifactState;
  readonly proposed: ArtifactState;
}

export interface FileMigrationPlan {
  readonly file: FileMigrationResult;
  readonly artifact?: PlannedOutputArtifact;
}

export interface MigrationPlan {
  readonly target: 'css' | 'tailwind';
  readonly files: readonly FileMigrationResult[];
  readonly artifacts: readonly PlannedOutputArtifact[];
}

export function plannedOutputArtifact(artifact: PlannedOutputArtifact): PlannedOutputArtifact {
  if (!path.isAbsolute(artifact.path)) {
    throw new Error(`Planned artifact paths must be absolute: ${artifact.path}`);
  }
  if (artifact.kind === 'template' && artifact.proposed.status === 'absent') {
    throw new Error('Planned template artifacts must have a present proposed state.');
  }
  if (sameState(artifact.original, artifact.proposed)) {
    throw new Error('Planned artifacts require changed states.');
  }

  return Object.freeze({
    kind: artifact.kind,
    path: path.resolve(artifact.path),
    original: artifactState(artifact.original),
    proposed: artifactState(artifact.proposed),
  });
}

export function fileMigrationPlan(plan: FileMigrationPlan): FileMigrationPlan {
  return Object.freeze({
    file: fileMigrationResult(plan.file),
    ...(plan.artifact ? { artifact: plannedOutputArtifact(plan.artifact) } : {}),
  });
}

export function migrationPlan(plan: MigrationPlan): MigrationPlan {
  return Object.freeze({
    target: plan.target,
    files: Object.freeze(plan.files.map(file => fileMigrationResult(file))),
    artifacts: Object.freeze(plan.artifacts.map(artifact => plannedOutputArtifact(artifact))),
  });
}

function artifactState(state: ArtifactState): ArtifactState {
  return Object.freeze(state.status === 'absent' ? { status: 'absent' as const } : { ...state });
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}
