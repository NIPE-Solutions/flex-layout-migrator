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
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) {
  console.log('Plan migrations by default; use --write to apply. planned output HTML file or folder --write --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html');
} else if (arguments_.includes('--version')) {
  console.log('${fixtureVersion}');
} else {
  const output = arguments_[arguments_.indexOf('--output') + 1];
  const report = arguments_[arguments_.indexOf('--report') + 1];
  const write = arguments_.includes('--write');
  if (arguments_.includes('--report')) {
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, JSON.stringify({
      schemaVersion: 2,
      mode: write ? 'write' : 'plan',
      application: write ? { status: 'applied' } : { status: 'skipped', reason: 'plan-only' },
    }));
  }
  if (!write) {
    console.log('Plan: 1 files scanned, 1 would change');
  } else if (arguments_.includes('--target') && arguments_.includes('css')) {
    const stylesheet = arguments_[arguments_.indexOf('--stylesheet') + 1];
    const existed = await access(output).then(() => true, () => false);
    const className = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
    await mkdir(dirname(output), { recursive: true });
    await mkdir(dirname(stylesheet), { recursive: true });
    await writeFile(output, '<div class="' + className + '"></div>');
    await writeFile(stylesheet, '/* flex-layout-codemod:start schema=1 */\\n/* flex-layout-codemod:rule id=' + className.slice(4) + ' */\\n.' + className + ' {\\n  display: flex;\\n  box-sizing: border-box;\\n  flex-direction: row;\\n}\\n/* flex-layout-codemod:end */');
    console.log('Applied: 1 files scanned, ' + (existed ? '0 changed' : '1 changed'));
  } else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, '<div class="flex flex-row box-border"></div>');
    console.log('Applied: 1 files scanned, 1 changed');
  }
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
