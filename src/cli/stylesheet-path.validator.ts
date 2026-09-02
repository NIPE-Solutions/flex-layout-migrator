import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';

export interface StylesheetPathValidationRequest {
  readonly target: string;
  readonly stylesheetPath?: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly reportPath?: string;
}

export async function validateStylesheetPath(request: StylesheetPathValidationRequest): Promise<string | undefined> {
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

  const stylesheetPath = path.resolve(request.stylesheetPath);
  const claims = [request.inputPath, request.outputPath, request.reportPath]
    .filter((claim): claim is string => claim !== undefined)
    .map(claim => path.resolve(claim));
  if (claims.includes(stylesheetPath)) {
    throw new MigrationApplicationError(
      'path-collision',
      `Stylesheet path collides with another migration path: ${request.stylesheetPath}`,
      [stylesheetPath],
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
