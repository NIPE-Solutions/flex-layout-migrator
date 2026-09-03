import fs from 'fs-extra';
import ignore from 'ignore';
import type { Ignore } from 'ignore';
import path from 'path';
import { logger } from '../logger';
import type { IgnoreMatcher } from '../pipeline/discover/ignore-matcher.port';

let gitignoreCache: Ignore | undefined;

export async function createGitIgnoreMatcher(root: string): Promise<IgnoreMatcher> {
  const matcher = ignore();
  const gitignorePath = path.join(root, '.gitignore');
  if (await fs.pathExists(gitignorePath)) {
    matcher.add(await fs.readFile(gitignorePath, 'utf8'));
    logger.debug(`Loaded .gitignore file from ${gitignorePath}`);
  }
  return Object.freeze({ ignores: (candidate: string) => matcher.ignores(path.relative(root, candidate)) });
}

// Compatibility exports loadGitIgnore and shouldIgnore remain for the unchanged legacy caller;
// Task 4 removes this module-global path.
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
    logger.debug(`Loaded .gitignore file from ${gitignorePath}`);
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
