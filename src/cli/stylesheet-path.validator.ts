import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { PathApi } from '../migrator/migration-path.validator';

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

  return pathApi.resolve(request.stylesheetPath);
}
