import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { type PathApi, pathsEquivalent, pathsOverlap } from '../migrator/migration-path.validator';

export interface StylesheetPathValidationRequest {
  readonly target: string;
  readonly stylesheetPath?: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly reportPath?: string;
}

export async function validateStylesheetPath(
  request: StylesheetPathValidationRequest,
  pathApi: PathApi = path,
): Promise<string | undefined> {
  if (request.target !== 'css') {
    if (request.stylesheetPath !== undefined) {
      throw new MigrationApplicationError('invalid-configuration', '--stylesheet can only be used with --target css.', [
        request.stylesheetPath,
      ]);
    }
    return undefined;
  }

  if (request.stylesheetPath === undefined) {
    throw new MigrationApplicationError('invalid-configuration', '--target css requires --stylesheet <path>.');
  }
  if (request.stylesheetPath.trim().length === 0) {
    throw new MigrationApplicationError('invalid-configuration', 'Stylesheet path must not be empty.');
  }

  const stylesheetPath = pathApi.resolve(request.stylesheetPath);
  const templateRoots = [request.inputPath, request.outputPath].map(claim => pathApi.resolve(claim));
  const reportPath = request.reportPath === undefined ? undefined : pathApi.resolve(request.reportPath);
  const exactCollision = [...templateRoots, reportPath].some(
    claim => claim !== undefined && pathsEquivalent(stylesheetPath, claim, pathApi),
  );
  const reportHierarchyCollision = reportPath !== undefined && pathsOverlap(stylesheetPath, reportPath, pathApi);
  if (exactCollision || reportHierarchyCollision) {
    const collisionPaths =
      reportHierarchyCollision && reportPath !== undefined && !pathsEquivalent(stylesheetPath, reportPath, pathApi)
        ? [stylesheetPath, reportPath]
        : [stylesheetPath];
    throw new MigrationApplicationError(
      'path-collision',
      `Stylesheet path collides with another migration path: ${request.stylesheetPath}`,
      collisionPaths,
    );
  }

  let stat: Awaited<ReturnType<typeof lstat>>;
  try {
    stat = await lstat(stylesheetPath);
  } catch (error: unknown) {
    if (isEnoent(error)) return stylesheetPath;
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new MigrationApplicationError(
      'unsupported-path-type',
      `Stylesheet path must not be a symbolic link: ${request.stylesheetPath}`,
      [stylesheetPath],
    );
  }
  if (!stat.isFile()) {
    throw new MigrationApplicationError(
      'unsupported-path-type',
      `Stylesheet path must be a regular file: ${request.stylesheetPath}`,
      [stylesheetPath],
    );
  }

  return stylesheetPath;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
