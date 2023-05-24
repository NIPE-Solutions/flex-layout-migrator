import { resolveConfig, format, Options } from 'prettier';
import { logger } from '../logger';

let prettierOptions: Options;

/**
 * Load the prettier options from the given directory and cache them for later use.
 * @param directory the directory to load the prettier options from
 * @returns the prettier options
 */
export async function loadPrettierOptions(directory: string): Promise<void> {
  // Only load the options once
  if (prettierOptions) {
    return;
  }

  const loadedOptions = await resolveConfig(directory);

  prettierOptions = loadedOptions ?? {};
  logger.debug(`Loaded prettier options from ${directory}`);
}

/**
 * Format the given file content using prettier. The prettier options are loaded from the given root directory (only once).
 * @param fileContent the file content to format
 * @returns the formatted file content
 */
export function formatFile(fileContent: string, options?: Options): string {
  logger.debug('Formatting file content using prettier');
  return format(fileContent, { parser: 'html', printWidth: 80, ...prettierOptions, ...options });
}
