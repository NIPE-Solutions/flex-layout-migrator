import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from './migration-application.error';

export interface MigrationPathValidationRequest {
  readonly templates: readonly { readonly inputPath: string; readonly outputPath: string }[];
  readonly stylesheetPath?: string;
  readonly reportPath?: string;
}

interface PathClaim {
  readonly path: string;
  readonly kind: 'template-input' | 'template-output' | 'stylesheet' | 'report';
  readonly templateIndex?: number;
}

export async function validateMigrationPaths(request: MigrationPathValidationRequest): Promise<void> {
  const claims = normalizedClaims(request);
  validateCollisions(claims);

  const destinations = claims.filter(claim => claim.kind !== 'template-input');
  for (const destination of destinations) {
    await validateDestination(destination.path);
  }
}

function normalizedClaims(request: MigrationPathValidationRequest): readonly PathClaim[] {
  return [
    ...request.templates.flatMap((template, templateIndex) => [
      { path: path.resolve(template.inputPath), kind: 'template-input' as const, templateIndex },
      { path: path.resolve(template.outputPath), kind: 'template-output' as const, templateIndex },
    ]),
    ...(request.stylesheetPath ? [{ path: path.resolve(request.stylesheetPath), kind: 'stylesheet' as const }] : []),
    ...(request.reportPath ? [{ path: path.resolve(request.reportPath), kind: 'report' as const }] : []),
  ];
}

function validateCollisions(claims: readonly PathClaim[]): void {
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex++) {
    const left = claims[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex++) {
      const right = claims[rightIndex];
      if (!right) continue;
      if (left.path !== right.path || isIntentionalInPlacePair(left, right)) continue;

      throw new MigrationApplicationError('path-collision', `Migration paths collide: ${left.path}`, [left.path]);
    }
  }
}

function isIntentionalInPlacePair(left: PathClaim, right: PathClaim): boolean {
  return (
    left.templateIndex !== undefined &&
    left.templateIndex === right.templateIndex &&
    left.kind !== right.kind &&
    left.kind.startsWith('template-') &&
    right.kind.startsWith('template-')
  );
}

async function validateDestination(destination: string): Promise<void> {
  let stat: Awaited<ReturnType<typeof lstat>>;
  try {
    stat = await lstat(destination);
  } catch (error: unknown) {
    if (isEnoent(error)) return;
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new MigrationApplicationError(
      'unsupported-path-type',
      `Migration destination must not be a symbolic link: ${destination}`,
      [destination],
    );
  }
  if (!stat.isFile()) {
    throw new MigrationApplicationError(
      'unsupported-path-type',
      `Migration destination must be a regular file: ${destination}`,
      [destination],
    );
  }
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
