import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from './migration-application.error';

type PathApi = typeof path.posix;

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
  const pathApi = pathApiFor(
    ...request.templates.flatMap(template => [template.inputPath, template.outputPath]),
    request.stylesheetPath ?? '',
    request.reportPath ?? '',
  );
  return [
    ...request.templates.flatMap((template, templateIndex) => [
      { path: pathApi.resolve(template.inputPath), kind: 'template-input' as const, templateIndex },
      { path: pathApi.resolve(template.outputPath), kind: 'template-output' as const, templateIndex },
    ]),
    ...(request.stylesheetPath ? [{ path: pathApi.resolve(request.stylesheetPath), kind: 'stylesheet' as const }] : []),
    ...(request.reportPath ? [{ path: pathApi.resolve(request.reportPath), kind: 'report' as const }] : []),
  ];
}

function validateCollisions(claims: readonly PathClaim[]): void {
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex++) {
    const left = claims[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex++) {
      const right = claims[rightIndex];
      if (!right) continue;
      if (!pathsOverlap(left.path, right.path) || isIntentionalInPlacePair(left, right)) continue;

      const collisionPaths = left.path === right.path ? [left.path] : [left.path, right.path];
      throw new MigrationApplicationError(
        'path-collision',
        `Migration paths collide: ${collisionPaths.join(' and ')}`,
        collisionPaths,
      );
    }
  }
}

function isIntentionalInPlacePair(left: PathClaim, right: PathClaim): boolean {
  return (
    left.path === right.path &&
    left.templateIndex !== undefined &&
    left.templateIndex === right.templateIndex &&
    left.kind !== right.kind &&
    left.kind.startsWith('template-') &&
    right.kind.startsWith('template-')
  );
}

export function pathsOverlap(left: string, right: string): boolean {
  const pathApi = pathApiFor(left, right);
  const normalizedLeft = pathApi.resolve(left);
  const normalizedRight = pathApi.resolve(right);
  return (
    normalizedLeft === normalizedRight ||
    isAncestor(pathApi, normalizedLeft, normalizedRight) ||
    isAncestor(pathApi, normalizedRight, normalizedLeft)
  );
}

function isAncestor(pathApi: PathApi, ancestor: string, descendant: string): boolean {
  const relative = pathApi.relative(ancestor, descendant);
  return (
    relative !== '' && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative)
  );
}

function pathApiFor(...values: readonly string[]): PathApi {
  if (values.some(value => /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\'))) return path.win32;
  if (values.some(value => value.includes('/'))) return path.posix;
  return path;
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
