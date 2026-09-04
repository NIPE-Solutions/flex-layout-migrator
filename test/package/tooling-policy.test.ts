import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('local quality tooling', () => {
  it('formats and lints staged files without mutating the index directly', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

    expect(pkg['lint-staged']).toEqual({
      '*.{js,mjs,ts}': ['eslint --fix', 'prettier --write'],
      '*.{json,md,yml,yaml}': ['prettier --write'],
    });
    expect(JSON.stringify(pkg['lint-staged'])).not.toContain('git add');
    expect(pkg.scripts).not.toHaveProperty('postinstall');
  });

  it('locks every direct runtime package at the manifest root without classifying it as development tooling', async () => {
    const [pkg, lock] = await Promise.all(
      ['../../package.json', '../../package-lock.json'].map(async path =>
        JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')),
      ),
    );

    expect(pkg.dependencies.ignore).toBe('5.2.4');
    expect(lock.packages[''].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages['node_modules/ignore']?.version).toBe('5.2.4');
    expect(pkg.devDependencies).not.toHaveProperty('ignore');
  });
});
