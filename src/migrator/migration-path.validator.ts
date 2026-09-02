import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from './migration-application.error';

export type PathApi = typeof path.posix;

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

export async function validateMigrationPaths(
  request: MigrationPathValidationRequest,
  pathApi: PathApi = path,
): Promise<void> {
  const claims = normalizedClaims(request, pathApi);
  validateCollisions(claims, pathApi);

  const destinations = claims.filter(claim => claim.kind !== 'template-input');
  for (const destination of destinations) {
    await validateDestination(destination.path);
  }
}

function normalizedClaims(request: MigrationPathValidationRequest, pathApi: PathApi): readonly PathClaim[] {
  return [
    ...request.templates.flatMap((template, templateIndex) => [
      { path: pathApi.resolve(template.inputPath), kind: 'template-input' as const, templateIndex },
      { path: pathApi.resolve(template.outputPath), kind: 'template-output' as const, templateIndex },
    ]),
    ...(request.stylesheetPath ? [{ path: pathApi.resolve(request.stylesheetPath), kind: 'stylesheet' as const }] : []),
    ...(request.reportPath ? [{ path: pathApi.resolve(request.reportPath), kind: 'report' as const }] : []),
  ];
}

function validateCollisions(claims: readonly PathClaim[], pathApi: PathApi): void {
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex++) {
    const left = claims[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex++) {
      const right = claims[rightIndex];
      if (!right) continue;
      if (!pathsOverlap(left.path, right.path, pathApi) || isIntentionalInPlacePair(left, right, pathApi)) continue;

      const collisionPaths = pathsEquivalent(left.path, right.path, pathApi) ? [left.path] : [left.path, right.path];
      throw new MigrationApplicationError(
        'path-collision',
        `Migration paths collide: ${collisionPaths.join(' and ')}`,
        collisionPaths,
      );
    }
  }
}

function isIntentionalInPlacePair(left: PathClaim, right: PathClaim, pathApi: PathApi): boolean {
  return (
    pathsEquivalent(left.path, right.path, pathApi) &&
    left.templateIndex !== undefined &&
    left.templateIndex === right.templateIndex &&
    left.kind !== right.kind &&
    left.kind.startsWith('template-') &&
    right.kind.startsWith('template-')
  );
}

export function pathsOverlap(left: string, right: string, pathApi: PathApi = path): boolean {
  const normalizedLeft = pathApi.resolve(left);
  const normalizedRight = pathApi.resolve(right);
  return (
    normalizedPathsEquivalent(pathApi, normalizedLeft, normalizedRight) ||
    isAncestor(pathApi, normalizedLeft, normalizedRight) ||
    isAncestor(pathApi, normalizedRight, normalizedLeft)
  );
}

export function pathsEquivalent(left: string, right: string, pathApi: PathApi = path): boolean {
  return normalizedPathsEquivalent(pathApi, pathApi.resolve(left), pathApi.resolve(right));
}

function normalizedPathsEquivalent(pathApi: PathApi, left: string, right: string): boolean {
  return pathApi.relative(left, right) === '';
}

function isAncestor(pathApi: PathApi, ancestor: string, descendant: string): boolean {
  const relative = pathApi.relative(ancestor, descendant);
  return (
    relative !== '' && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative)
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
