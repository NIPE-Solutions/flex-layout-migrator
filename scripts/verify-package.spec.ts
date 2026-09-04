import { tmpdir } from 'node:os';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isDirectInvocation, smokePackageTarball } from './verify-package.mjs';

async function cssWrite(arguments_: readonly string[]): Promise<boolean> {
  const output = arguments_[arguments_.indexOf('--output') + 1];
  const stylesheet = arguments_[arguments_.indexOf('--stylesheet') + 1];
  if (output === undefined || stylesheet === undefined) throw new Error('Expected CSS output paths');
  const changed = await access(output).then(
    () => false,
    () => true,
  );
  const className = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
  await mkdir(dirname(output), { recursive: true });
  await mkdir(dirname(stylesheet), { recursive: true });
  await writeFile(output, `<div class="${className}"></div>`);
  await writeFile(
    stylesheet,
    `/* flex-layout-codemod:start schema=1 */\n/* flex-layout-codemod:rule id=${className.slice(4)} */\n.${className} {\n  display: flex;\n  box-sizing: border-box;\n  flex-direction: row;\n}\n/* flex-layout-codemod:end */`,
  );
  return changed;
}

function createExecFileImpl(help: string) {
  return vi.fn(async (_file: string, args: string[]) => {
    if (args.includes('--help')) return { stdout: help, stderr: '' };
    if (args.includes('--version')) return { stdout: '2.0.0-beta.1\n', stderr: '' };

    const report = args[args.indexOf('--report') + 1];
    const write = args.includes('--write');
    if (args.includes('--report') && report !== undefined) {
      await mkdir(dirname(report), { recursive: true });
      await writeFile(
        report,
        JSON.stringify({
          schemaVersion: 2,
          mode: write ? 'write' : 'plan',
          application: write ? { status: 'applied' } : { status: 'skipped', reason: 'plan-only' },
        }),
      );
    }
    if (!write) return { stdout: 'Plan: 1 files scanned, 1 would change\n', stderr: '' };

    if (args.includes('--target') && args.includes('css')) {
      const changed = await cssWrite(args);
      return { stdout: `Applied: 1 files scanned, ${changed ? '1 changed' : '0 changed'}\n`, stderr: '' };
    }

    const output = args[args.indexOf('--output') + 1];
    if (output === undefined) throw new Error('Expected Tailwind output path');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, '<div class="flex flex-row box-border"></div>');
    return { stdout: 'Applied: 1 files scanned, 1 changed\n', stderr: '' };
  });
}

describe('smokePackageTarball', () => {
  const completeHelp =
    'Plan migrations by default; use --write to apply. planned output HTML file or folder --write --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html';

  it('uses npm.cmd without a shell for a Windows exact-tarball smoke install', async () => {
    const execFileImpl = createExecFileImpl(
      'Plan migrations by default; use --write to apply. planned output HTML file or folder --write --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must\n end in .json single-file\n output must end\n in .html',
    );

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
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'C:\\release\\package.tgz'],
    ]);
    for (const call of execFileImpl.mock.calls) expect(call[2]).not.toHaveProperty('shell');
  });

  it('executes the npm-installed bin shim on POSIX package checks', async () => {
    const execFileImpl = createExecFileImpl(
      'Plan migrations by default; use --write to apply. planned output HTML file or folder --write --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html',
    );

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

  it.each([
    [
      'the plan-only default',
      completeHelp.replace('Plan migrations by default; use --write to apply. ', ''),
      'Packaged CLI help does not disclose the plan-only default',
    ],
    [
      'the planned output meaning',
      completeHelp.replace('planned output HTML file or folder ', ''),
      'Packaged CLI help does not describe --output as planned output',
    ],
  ])('rejects packaged help that omits %s', async (_label, help, message) => {
    await expect(
      smokePackageTarball({
        tarballPath: '/release/package.tgz',
        packageName: '@nipe-solutions/flex-layout-codemod',
        expectedVersion: '2.0.0-beta.1',
        platform: 'linux',
        execFileImpl: createExecFileImpl(help),
      }),
    ).rejects.toThrow(message);
  });
});

describe('isDirectInvocation', () => {
  it('keeps imports inert when the process argument is not a real file', () => {
    expect(isDirectInvocation(import.meta.url, join(tmpdir(), 'flex-layout-missing-entry', String(process.pid)))).toBe(
      false,
    );
  });
});
