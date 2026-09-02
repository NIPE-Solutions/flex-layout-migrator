import { execFile, spawn } from 'node:child_process';
import { access, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');
let executable = join(repository, 'dist', 'cli.js');
const fixtures = join(repository, 'test', 'fixtures', 'compatibility');
const inputFixture = join(fixtures, 'native-css.input.html');
const expectedHtmlFixture = join(fixtures, 'native-css.expected.html');
const expectedCssFixture = join(fixtures, 'native-css.expected.css');
const handwrittenCss = '/* handwritten CSS */\n.keep { color: rebeccapurple; }\n';

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

describe('native CSS public compatibility', () => {
  let directory: string;
  let executableDirectory: string;

  beforeAll(async () => {
    await execFileAsync('npm', ['run', 'build'], { cwd: repository });
    executableDirectory = await mkdtemp(join(repository, '.native-css-public-cli-'));
    executable = join(executableDirectory, 'cli.js');
    await copyFile(join(repository, 'dist', 'cli.js'), executable);
  });

  afterAll(async () => {
    if (executableDirectory) await rm(executableDirectory, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('migrates the documented Flex surface transactionally without changing preserved CSS inputs', async () => {
    directory = await mkdtemp(join(tmpdir(), 'native-css-public-compatibility-'));
    const input = join(directory, 'input');
    const stylesheet = join(directory, 'migration.css');
    const first = join(input, 'first.html');
    const second = join(input, 'nested', 'second.html');
    const expectedHtml = await readFile(expectedHtmlFixture, 'utf8');
    const expectedCss = (await readFile(expectedCssFixture, 'utf8')).replace(/\n$/u, '');
    await mkdir(join(input, 'nested'), { recursive: true });
    await cp(inputFixture, first, { recursive: false });
    await cp(inputFixture, second, { recursive: false });
    await writeFile(stylesheet, handwrittenCss, 'utf8');

    const dryRun = await execute([input, '--target', 'css', '--stylesheet', stylesheet, '--dry-run'], directory);
    expect(dryRun).toMatchObject({ status: 2, stderr: '' });
    expect(dryRun.stdout).toContain('Dry run: 2 files scanned, 2 would change');
    expect(await readFile(first, 'utf8')).toEqual(await readFile(inputFixture, 'utf8'));
    expect(await readFile(stylesheet, 'utf8')).toBe(handwrittenCss);

    const migrated = await execute([input, '--target', 'css', '--stylesheet', stylesheet], directory);
    expect(migrated).toMatchObject({ status: 2, stderr: '' });
    expect(migrated.stdout).toContain('Unsupported 12');
    expect(await readFile(first, 'utf8')).toBe(expectedHtml);
    expect(await readFile(second, 'utf8')).toBe(expectedHtml);
    expect(await readFile(stylesheet, 'utf8')).toBe(expectedCss);
    expect((await readFile(stylesheet, 'utf8')).match(/flex-layout-codemod:rule/g)?.length).toBe(21);

    await writeFile(first, '<div fxLayout="row"></div>\n', 'utf8');
    await writeFile(second, '<div fxLayout="row"></div>\n', 'utf8');
    const shrunk = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--allow-unresolved'],
      directory,
    );
    expect(shrunk).toMatchObject({ status: 0, stderr: '' });
    const shrunkCss = await readFile(stylesheet, 'utf8');
    expect(shrunkCss).toContain(handwrittenCss);
    expect(shrunkCss).not.toContain('gap: 8px;');
    expect(shrunkCss).toContain('display: flex;');

    const rerun = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--allow-unresolved'],
      directory,
    );
    expect(rerun).toMatchObject({ status: 0, stderr: '' });
    expect(rerun.stdout).toContain('2 files scanned, 0 changed');
    expect(await readFile(stylesheet, 'utf8')).toBe(shrunkCss);
  });

  test('does not create template or stylesheet paths during a CSS dry run', async () => {
    directory = await mkdtemp(join(tmpdir(), 'native-css-public-dry-run-'));
    const input = join(directory, 'input.html');
    const output = join(directory, 'generated', 'output.html');
    const stylesheet = join(directory, 'styles', 'migration.css');
    await cp(inputFixture, input, { recursive: false });

    const result = await execute(
      [input, '--output', output, '--target', 'css', '--stylesheet', stylesheet, '--dry-run'],
      directory,
    );

    expect(result).toMatchObject({ status: 2, stderr: '' });
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
