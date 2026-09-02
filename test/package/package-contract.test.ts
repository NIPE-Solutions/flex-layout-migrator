import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');

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

  it('verifies the packaged CLI against its repository manifest version', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-package-version-'));
    const scriptsDirectory = join(temporaryDirectory, 'scripts');
    const fixtureVersion = '9.8.7';

    try {
      await mkdir(scriptsDirectory);
      await writeFile(
        join(temporaryDirectory, 'package.json'),
        JSON.stringify({
          name: '@nipe-solutions/package-version-fixture',
          version: fixtureVersion,
          type: 'module',
          files: ['cli.mjs'],
          bin: { 'flex-layout-codemod': './cli.mjs' },
        }),
        'utf8',
      );
      await writeFile(
        join(temporaryDirectory, 'cli.mjs'),
        `#!/usr/bin/env node
const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) {
  console.log('--dry-run --report <path> --allow-unresolved path must end in .json single-file output must end in .html');
} else if (arguments_.includes('--version')) {
  console.log('${fixtureVersion}');
} else if (arguments_.includes('--dry-run')) {
  console.log('Dry run: 1 files scanned, 1 would change');
}
`,
        { encoding: 'utf8', mode: 0o755 },
      );
      await writeFile(
        join(scriptsDirectory, 'verify-package.mjs'),
        await readFile(join(repository, 'scripts', 'verify-package.mjs'), 'utf8'),
        'utf8',
      );

      await expect(
        execFileAsync(process.execPath, [join(scriptsDirectory, 'verify-package.mjs')], {
          cwd: temporaryDirectory,
        }),
      ).resolves.toMatchObject({ stderr: '' });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
