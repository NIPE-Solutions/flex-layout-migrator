import fs from 'fs-extra';
import ignore from 'ignore';
import { Ignore } from 'ignore';
import path from 'path';

let gitignoreCache: Ignore | undefined;

/**
 * Loads the .gitignore file from the input folder and returns an instance of the ignore library.
 * @param inputFolder path to the input folder
 * @returns an instance of the ignore library
 */
export async function loadGitIgnore(inputFolder: string): Promise<void> {
  if (gitignoreCache) {
    return;
  }
  const gitignorePath = path.join(inputFolder, '.gitignore');

  gitignoreCache = ignore();

  if (await fs.pathExists(gitignorePath)) {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    gitignoreCache.add(gitignoreContent);
  }
}

/**
 * Checks if the given path should be ignored.
 * @param ig an instance of the ignore library
 * @param baseFolder the base folder
 * @param targetPath the path to check
 * @returns true if the path should be ignored, false otherwise
 */
export function shouldIgnore(baseFolder: string, targetPath: string): boolean {
  if (!gitignoreCache) {
    return false;
  }
  const relativePath = path.relative(baseFolder, targetPath);
  return gitignoreCache.ignores(relativePath);
}
