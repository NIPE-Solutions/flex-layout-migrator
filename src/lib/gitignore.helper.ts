import fs from 'fs-extra';
import ignore from 'ignore';
import path from 'path';
import { logger } from '../logger';
import type { IgnoreMatcher } from '../pipeline/discover/ignore-matcher.port';

export async function createGitIgnoreMatcher(root: string): Promise<IgnoreMatcher> {
  const matcher = ignore();
  const gitignorePath = path.join(root, '.gitignore');
  if (await fs.pathExists(gitignorePath)) {
    matcher.add(await fs.readFile(gitignorePath, 'utf8'));
    logger.debug(`Loaded .gitignore file from ${gitignorePath}`);
  }
  const relativeIgnorePath = (candidate: string): string => path.relative(root, candidate).split(path.sep).join('/');
  return Object.freeze({
    ignores: (candidate: string) => matcher.ignores(relativeIgnorePath(candidate)),
    ignoresDirectory: (candidate: string) => matcher.ignores(`${relativeIgnorePath(candidate)}/`),
  });
}
