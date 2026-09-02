import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isDirectInvocation, smokePackageTarball } from './verify-package.mjs';

describe('smokePackageTarball', () => {
  it('uses npm.cmd without a shell for a Windows exact-tarball smoke install', async () => {
    const execFileImpl = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('--help')) {
        return {
          stdout:
            '--dry-run --report <path> --allow-unresolved path must end in .json single-file output must end in .html',
          stderr: '',
        };
      }
      if (args.includes('--version')) return { stdout: '2.0.0-beta.1\n', stderr: '' };
      if (args.includes('--dry-run')) return { stdout: 'Dry run: 1 files scanned, 1 would change\n', stderr: '' };
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
            '--dry-run --report <path> --allow-unresolved path must end in .json single-file output must end in .html',
          stderr: '',
        };
      }
      if (args.includes('--version')) return { stdout: '2.0.0-beta.1\n', stderr: '' };
      if (args.includes('--dry-run')) return { stdout: 'Dry run: 1 files scanned, 1 would change\n', stderr: '' };
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
