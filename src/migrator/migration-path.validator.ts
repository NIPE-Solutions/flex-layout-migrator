import { lstat, stat } from 'node:fs/promises';
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

interface FileSystemIdentity {
  readonly device: string;
  readonly inode: string;
}

interface ExistingPathPrefix {
  readonly identity: FileSystemIdentity;
  readonly suffix: readonly string[];
}

interface ObservedPath {
  readonly exactIdentity?: FileSystemIdentity;
  readonly prefixes: readonly ExistingPathPrefix[];
}

type PathRelationship = 'equivalent' | 'ancestor' | 'descendant' | 'distinct';
type PathObserver = (candidate: string) => Promise<ObservedPath>;

export async function validateMigrationPaths(
  request: MigrationPathValidationRequest,
  pathApi: PathApi = path,
): Promise<void> {
  const claims = normalizedClaims(request, pathApi);
  await validateCollisions(claims, pathApi);

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

async function validateCollisions(claims: readonly PathClaim[], pathApi: PathApi): Promise<void> {
  const observations = new Map<string, Promise<ObservedPath>>();
  const observe: PathObserver = candidate => {
    const normalized = pathApi.resolve(candidate);
    const existing = observations.get(normalized);
    if (existing) return existing;
    const pending = observePath(normalized, pathApi);
    observations.set(normalized, pending);
    return pending;
  };

  for (let leftIndex = 0; leftIndex < claims.length; leftIndex++) {
    const left = claims[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex++) {
      const right = claims[rightIndex];
      if (!right) continue;
      const relationship = await fileSystemPathRelationship(left.path, right.path, pathApi, observe);
      if (relationship === 'distinct' || isIntentionalInPlacePair(left, right, pathApi)) continue;

      const collisionPaths = relationship === 'equivalent' ? [left.path] : [left.path, right.path];
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

export async function pathsEquivalentOnFileSystem(
  left: string,
  right: string,
  pathApi: PathApi = path,
): Promise<boolean> {
  return (await fileSystemPathRelationship(left, right, pathApi)) === 'equivalent';
}

export async function pathsOverlapOnFileSystem(left: string, right: string, pathApi: PathApi = path): Promise<boolean> {
  return (await fileSystemPathRelationship(left, right, pathApi)) !== 'distinct';
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

async function fileSystemPathRelationship(
  left: string,
  right: string,
  pathApi: PathApi,
  observe: PathObserver = candidate => observePath(candidate, pathApi),
): Promise<PathRelationship> {
  const normalizedLeft = pathApi.resolve(left);
  const normalizedRight = pathApi.resolve(right);
  if (normalizedPathsEquivalent(pathApi, normalizedLeft, normalizedRight)) return 'equivalent';
  if (isAncestor(pathApi, normalizedLeft, normalizedRight)) return 'ancestor';
  if (isAncestor(pathApi, normalizedRight, normalizedLeft)) return 'descendant';

  const [observedLeft, observedRight] = await Promise.all([observe(normalizedLeft), observe(normalizedRight)]);
  if (observedLeft.exactIdentity && observedRight.exactIdentity) {
    if (sameIdentity(observedLeft.exactIdentity, observedRight.exactIdentity)) return 'equivalent';
    if (hasIdentityBelow(observedRight, observedLeft.exactIdentity)) return 'ancestor';
    if (hasIdentityBelow(observedLeft, observedRight.exactIdentity)) return 'descendant';
    return 'distinct';
  }

  return relationshipThroughExistingPrefixes(observedLeft, observedRight);
}

async function observePath(candidate: string, pathApi: PathApi): Promise<ObservedPath> {
  const prefixes: ExistingPathPrefix[] = [];
  const suffix: string[] = [];
  let current = candidate;
  let exactIdentity: FileSystemIdentity | undefined;

  while (true) {
    try {
      const currentStat = await stat(current, { bigint: true });
      const currentIdentity = identity(currentStat);
      if (suffix.length === 0) exactIdentity = currentIdentity;
      prefixes.push({ identity: currentIdentity, suffix: [...suffix] });
    } catch (error: unknown) {
      if (!isMissingPath(error)) throw error;
    }

    const parent = pathApi.dirname(current);
    if (parent === current) break;
    suffix.unshift(pathApi.basename(current));
    current = parent;
  }

  return { ...(exactIdentity ? { exactIdentity } : {}), prefixes };
}

function relationshipThroughExistingPrefixes(left: ObservedPath, right: ObservedPath): PathRelationship {
  for (const leftPrefix of left.prefixes) {
    for (const rightPrefix of right.prefixes) {
      if (!sameIdentity(leftPrefix.identity, rightPrefix.identity)) continue;
      const relationship = suffixRelationship(leftPrefix.suffix, rightPrefix.suffix);
      if (relationship !== 'distinct') return relationship;
    }
  }
  return 'distinct';
}

function hasIdentityBelow(observed: ObservedPath, candidate: FileSystemIdentity): boolean {
  return observed.prefixes.some(prefix => prefix.suffix.length > 0 && sameIdentity(prefix.identity, candidate));
}

function suffixRelationship(left: readonly string[], right: readonly string[]): PathRelationship {
  const normalizedLeft = left.map(portablePathSegment);
  const normalizedRight = right.map(portablePathSegment);
  const sharedLength = Math.min(normalizedLeft.length, normalizedRight.length);
  for (let index = 0; index < sharedLength; index++) {
    if (normalizedLeft[index] !== normalizedRight[index]) return 'distinct';
  }
  if (normalizedLeft.length === normalizedRight.length) return 'equivalent';
  return normalizedLeft.length < normalizedRight.length ? 'ancestor' : 'descendant';
}

function portablePathSegment(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

function identity(value: { readonly dev: number | bigint; readonly ino: number | bigint }): FileSystemIdentity {
  return { device: String(value.dev), inode: String(value.ino) };
}

function sameIdentity(left: FileSystemIdentity, right: FileSystemIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
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

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
