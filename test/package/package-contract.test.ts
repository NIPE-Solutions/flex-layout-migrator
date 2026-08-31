import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('package contract', () => {
  it('declares the v2 package, executable, runtime, and public files', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

    expect(pkg).toMatchObject({
      name: '@nipe-solutions/flex-layout-codemod',
      type: 'module',
      engines: { node: '>=24' },
      bin: { 'flex-layout-codemod': './dist/cli.js' },
      files: ['dist', 'README.md', 'LICENSE', 'CHANGELOG.md'],
    });
    expect(pkg.dependencies).toMatchObject({ '@angular/compiler': '21.2.22' });
    expect(pkg.dependencies).not.toHaveProperty('cheerio');
    expect(pkg.dependencies).not.toHaveProperty('p-queue');
    expect(pkg.dependencies).not.toHaveProperty('classnames');
  });
});
