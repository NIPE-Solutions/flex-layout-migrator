import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');
const fixtureVersion = '9.8.7';

async function createPackageFixture({ missingFile, extraFile }: { missingFile?: string; extraFile?: string } = {}) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-package-version-'));
  const scriptsDirectory = join(temporaryDirectory, 'scripts');
  const publicFiles = ['dist', 'README.md', 'LICENSE', 'CHANGELOG.md'];
  if (extraFile?.startsWith('src/')) publicFiles.push('src');

  await mkdir(scriptsDirectory);
  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({
      name: '@nipe-solutions/package-version-fixture',
      version: fixtureVersion,
      type: 'module',
      files: publicFiles,
      bin: { 'flex-layout-codemod': './dist/cli.js' },
    }),
    'utf8',
  );

  const fixtureFiles = new Map([
    [
      'dist/cli.js',
      `#!/usr/bin/env node
const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) {
  console.log('--dry-run --report <path> --allow-unresolved --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html');
} else if (arguments_.includes('--version')) {
  console.log('${fixtureVersion}');
} else if (arguments_.includes('--dry-run')) {
  console.log('Dry run: 1 files scanned, 1 would change');
}
`,
    ],
    ['dist/cli.js.map', '{}'],
    ['README.md', '# Fixture'],
    ['LICENSE', 'Fixture license'],
    ['CHANGELOG.md', '# Changelog'],
  ]);
  if (extraFile) fixtureFiles.set(extraFile, 'unexpected');

  for (const [path, contents] of fixtureFiles) {
    if (path === missingFile) continue;
    const target = join(temporaryDirectory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, path === 'dist/cli.js' ? { encoding: 'utf8', mode: 0o755 } : 'utf8');
  }
  await writeFile(
    join(scriptsDirectory, 'verify-package.mjs'),
    await readFile(join(repository, 'scripts', 'verify-package.mjs'), 'utf8'),
    'utf8',
  );

  return {
    temporaryDirectory,
    verify: () =>
      execFileAsync(process.execPath, [join(scriptsDirectory, 'verify-package.mjs')], {
        cwd: temporaryDirectory,
      }),
  };
}

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
    const fixture = await createPackageFixture();

    try {
      await expect(fixture.verify()).resolves.toMatchObject({ stderr: '' });
    } finally {
      await rm(fixture.temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects an unexpected packaged file', async () => {
    const fixture = await createPackageFixture({ extraFile: 'dist/extra.js' });

    try {
      await expect(fixture.verify()).rejects.toMatchObject({
        stderr: expect.stringContaining('unexpected [dist/extra.js]'),
      });
    } finally {
      await rm(fixture.temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects a missing packaged file', async () => {
    const fixture = await createPackageFixture({ missingFile: 'LICENSE' });

    try {
      await expect(fixture.verify()).rejects.toMatchObject({
        stderr: expect.stringContaining('missing [LICENSE]'),
      });
    } finally {
      await rm(fixture.temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('preserves the forbidden-file diagnostic', async () => {
    const fixture = await createPackageFixture({ extraFile: 'src/secret.js' });

    try {
      await expect(fixture.verify()).rejects.toMatchObject({
        stderr: expect.stringContaining('Package contains forbidden files: src/secret.js'),
      });
    } finally {
      await rm(fixture.temporaryDirectory, { recursive: true, force: true });
    }
  });
});
