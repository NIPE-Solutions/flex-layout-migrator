import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isDirectInvocation, smokePackageTarball } from './verify-package.mjs';

async function cssWrite(arguments_: readonly string[]) {
  const output = arguments_[arguments_.indexOf('--output') + 1];
  const stylesheet = arguments_[arguments_.indexOf('--stylesheet') + 1];
  if (output === undefined || stylesheet === undefined) throw new Error('Expected CSS output paths');
  const className = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
  await mkdir(dirname(output), { recursive: true });
  await mkdir(dirname(stylesheet), { recursive: true });
  await writeFile(output, `<div class="${className}"></div>`);
  await writeFile(
    stylesheet,
    `/* flex-layout-codemod:start schema=1 */\n/* flex-layout-codemod:rule id=${className.slice(4)} */\n.${className} {\n  display: flex;\n  box-sizing: border-box;\n  flex-direction: row;\n}\n/* flex-layout-codemod:end */`,
  );
}

describe('smokePackageTarball', () => {
  it('uses npm.cmd without a shell for a Windows exact-tarball smoke install', async () => {
    const execFileImpl = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('--help')) {
        return {
          stdout:
            '--dry-run --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must\n end in .json single-file\n output must end\n in .html',
          stderr: '',
        };
      }
      if (args.includes('--version')) return { stdout: '2.0.0-beta.1\n', stderr: '' };
      if (args.includes('--dry-run')) return { stdout: 'Dry run: 1 files scanned, 1 would change\n', stderr: '' };
      if (args.includes('--target') && args.includes('css')) {
        await cssWrite(args);
        return { stdout: '1 files scanned, 1 changed\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    await smokePackageTarball({
      tarballPath: 'C:\\release\\package.tgz',
      packageName: '@nipe-solutions/flex-layout-codemod',
      expectedVersion: '2.0.0-beta.1',
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      execFileImpl,
    });

    expect(execFileImpl.mock.calls[0]?.slice(0, 2)).toEqual([
      'npm.cmd',
      ['install', '--ignore-scripts', 'C:\\release\\package.tgz'],
    ]);
    for (const call of execFileImpl.mock.calls) expect(call[2]).not.toHaveProperty('shell');
  });

  it('executes the npm-installed bin shim on POSIX package checks', async () => {
    const execFileImpl = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('--help')) {
        return {
          stdout:
            '--dry-run --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html',
          stderr: '',
        };
      }
      if (args.includes('--version')) return { stdout: '2.0.0-beta.1\n', stderr: '' };
      if (args.includes('--dry-run')) return { stdout: 'Dry run: 1 files scanned, 1 would change\n', stderr: '' };
      if (args.includes('--target') && args.includes('css')) {
        await cssWrite(args);
        return { stdout: '1 files scanned, 1 changed\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    await smokePackageTarball({
      tarballPath: '/release/package.tgz',
      packageName: '@nipe-solutions/flex-layout-codemod',
      expectedVersion: '2.0.0-beta.1',
      platform: 'linux',
      execFileImpl,
    });

    expect(execFileImpl.mock.calls[1]?.[0]).toMatch(/node_modules[/\\]\.bin[/\\]flex-layout-codemod$/u);
    expect(execFileImpl.mock.calls[1]?.[1]).toEqual(['--help']);
  });
});

describe('isDirectInvocation', () => {
  it('keeps imports inert when the process argument is not a real file', () => {
    expect(isDirectInvocation(import.meta.url, join(tmpdir(), 'flex-layout-missing-entry', String(process.pid)))).toBe(
      false,
    );
  });
});
