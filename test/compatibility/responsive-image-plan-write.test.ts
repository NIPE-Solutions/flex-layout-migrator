import { spawn } from 'node:child_process';
import { access, copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

const repository = resolve(import.meta.dirname, '../..');
const fixtures = join(repository, 'test', 'fixtures', 'compatibility');
const inputFixture = join(fixtures, 'responsive-image.input.html');
const expectedFixture = join(fixtures, 'responsive-image.expected.html');
let executable = join(repository, 'dist', 'cli.js');

interface ExecutionResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function execute(arguments_: readonly string[], cwd: string): Promise<ExecutionResult> {
  return new Promise((resolveExecution, reject) => {
    const child = spawn(process.execPath, [executable, ...arguments_], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', status => resolveExecution({ status, stdout, stderr }));
  });
}

describe('responsive image public plan/write compatibility', () => {
  let directory: string;
  let executableDirectory: string;

  beforeAll(async () => {
    executableDirectory = await mkdtemp(join(repository, '.responsive-image-public-cli-'));
    executable = join(executableDirectory, 'cli.js');
    await copyFile(join(repository, 'dist', 'cli.js'), executable);
  });

  afterAll(async () => {
    if (executableDirectory) await rm(executableDirectory, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('requires --write before wrapping responsive images and reruns byte-identically', async () => {
    directory = await mkdtemp(join(tmpdir(), 'responsive-image-public-'));
    const input = join(directory, 'input.html');
    const output = join(directory, 'generated', 'output.html');
    const expected = await readFile(expectedFixture, 'utf8');
    await copyFile(inputFixture, input);

    const plan = await execute([input, '--output', output, '--responsive-images', '--allow-unresolved'], directory);

    expect(plan).toMatchObject({ status: 0, stderr: '' });
    expect(plan.stdout).toContain('Plan: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });

    const applied = await execute(
      [input, '--output', output, '--responsive-images', '--allow-unresolved', '--write'],
      directory,
    );

    expect(applied).toMatchObject({ status: 0, stderr: '' });
    expect(applied.stdout).toContain('Applied: 1 files scanned, 1 changed');
    expect(await readFile(output, 'utf8')).toBe(expected);

    const rerun = await execute(
      [input, '--output', output, '--responsive-images', '--allow-unresolved', '--write'],
      directory,
    );

    expect(rerun).toMatchObject({ status: 0, stderr: '' });
    expect(rerun.stdout).toContain('Applied: 1 files scanned, 0 changed');
    expect(await readFile(output, 'utf8')).toBe(expected);
  });
});
