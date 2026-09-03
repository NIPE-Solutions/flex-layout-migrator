import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitIgnoreMatcher } from './gitignore.helper';

describe('createGitIgnoreMatcher', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gitignore-matcher-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('keeps rules isolated to the root for which each immutable matcher was created', async () => {
    const firstRoot = join(temporaryDirectory, 'first');
    const secondRoot = join(temporaryDirectory, 'second');
    const rootWithoutRules = join(temporaryDirectory, 'without-rules');
    await Promise.all([mkdir(firstRoot), mkdir(secondRoot), mkdir(rootWithoutRules)]);
    await Promise.all([
      writeFile(join(firstRoot, '.gitignore'), 'first-only.html\nfirst-directory/\n', 'utf8'),
      writeFile(join(secondRoot, '.gitignore'), 'second-only.html\n', 'utf8'),
    ]);

    const first = await createGitIgnoreMatcher(firstRoot);
    const second = await createGitIgnoreMatcher(secondRoot);
    const withoutRules = await createGitIgnoreMatcher(rootWithoutRules);

    expect([
      first.ignores(join(firstRoot, 'first-only.html')),
      first.ignores(join(firstRoot, 'second-only.html')),
      second.ignores(join(secondRoot, 'first-only.html')),
      second.ignores(join(secondRoot, 'second-only.html')),
    ]).toEqual([true, false, false, true]);
    expect(first.ignores(join(firstRoot, 'first-directory'))).toBe(false);
    expect(first.ignoresDirectory(join(firstRoot, 'first-directory'))).toBe(true);
    expect(withoutRules.ignores(join(rootWithoutRules, 'first-only.html'))).toBe(false);
    expect(withoutRules.ignoresDirectory(join(rootWithoutRules, 'first-directory'))).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(withoutRules)).toBe(true);
  });
});
