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
});
