import { spawn } from 'node:child_process';
import { access, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

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

    const plan = await execute([input, '--target', 'css', '--stylesheet', stylesheet], directory);
    expect(plan).toMatchObject({ status: 2, stderr: '' });
    expect(plan.stdout).toContain('Plan: 2 files scanned, 2 would change');
    expect(await readFile(first, 'utf8')).toEqual(await readFile(inputFixture, 'utf8'));
    expect(await readFile(stylesheet, 'utf8')).toBe(handwrittenCss);

    const migrated = await execute([input, '--target', 'css', '--stylesheet', stylesheet, '--write'], directory);
    expect(migrated).toMatchObject({ status: 2, stderr: '' });
    expect(migrated.stdout).toContain('Unsupported 12');
    expect(await readFile(first, 'utf8')).toBe(expectedHtml);
    expect(await readFile(second, 'utf8')).toBe(expectedHtml);
    expect(await readFile(stylesheet, 'utf8')).toBe(expectedCss);
    expect((await readFile(stylesheet, 'utf8')).match(/flex-layout-codemod:rule/g)?.length).toBe(21);

    await writeFile(first, '<div fxLayout="row"></div>\n', 'utf8');
    await writeFile(second, '<div fxLayout="row"></div>\n', 'utf8');
    const shrunk = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--allow-unresolved', '--write'],
      directory,
    );
    expect(shrunk).toMatchObject({ status: 0, stderr: '' });
    const shrunkCss = await readFile(stylesheet, 'utf8');
    expect(shrunkCss).toContain(handwrittenCss);
    expect(shrunkCss).toContain('gap: 8px;');
    expect(shrunkCss).toContain('display: flex;');
    const shrunkFirst = await readFile(first, 'utf8');
    const shrunkSecond = await readFile(second, 'utf8');

    const rerun = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--allow-unresolved', '--write'],
      directory,
    );
    expect(rerun).toMatchObject({ status: 0, stderr: '' });
    expect(rerun.stdout).toContain('2 files scanned, 0 changed');
    expect(await readFile(first, 'utf8')).toBe(shrunkFirst);
    expect(await readFile(second, 'utf8')).toBe(shrunkSecond);
    expect(await readFile(stylesheet, 'utf8')).toBe(shrunkCss);
  });

  test('does not create template or stylesheet paths during the default CSS plan', async () => {
    directory = await mkdtemp(join(tmpdir(), 'native-css-public-plan-'));
    const input = join(directory, 'input.html');
    const output = join(directory, 'generated', 'output.html');
    const stylesheet = join(directory, 'styles', 'migration.css');
    await cp(inputFixture, input, { recursive: false });

    const result = await execute([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet], directory);

    expect(result).toMatchObject({ status: 2, stderr: '' });
    expect(result.stdout).toContain('Plan: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await transactionResidue(directory)).toEqual([]);
  });

  test('keeps native CSS proposed files, diagnostics, summary, and stylesheet action identical across modes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'native-css-public-parity-'));
    const input = join(directory, 'input.html');
    const output = join(directory, 'output.html');
    const stylesheet = join(directory, 'migration.css');
    const planReportPath = join(directory, 'plan-report.json');
    const writeReportPath = join(directory, 'write-report.json');
    await cp(inputFixture, input, { recursive: false });

    const sharedArguments = [input, '--output', output, '--target', 'css', '--stylesheet', stylesheet];
    const planned = await execute([...sharedArguments, '--report', planReportPath], directory);
    const applied = await execute([...sharedArguments, '--report', writeReportPath, '--write'], directory);
    const planReport = JSON.parse(await readFile(planReportPath, 'utf8')) as Record<string, unknown>;
    const writeReport = JSON.parse(await readFile(writeReportPath, 'utf8')) as Record<string, unknown>;

    expect(planned.status).toBe(2);
    expect(applied.status).toBe(2);
    expect(planReport).toMatchObject({
      target: 'css',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      summary: { filesScanned: 1, filesChanged: 1, unsupported: 6 },
      stylesheet: { path: 'migration.css', change: 'created' },
    });
    expect(writeReport).toMatchObject({ mode: 'write', application: { status: 'applied' } });
    expect(proposedReport(planReport)).toEqual(proposedReport(writeReport));
  });

  test('preserves project bytes on parse error and succeeds byte-identically after repair', async () => {
    directory = await mkdtemp(join(tmpdir(), 'native-css-public-retry-'));
    const input = join(directory, 'input');
    const stylesheet = join(directory, 'migration.css');
    const report = join(directory, 'report.json');
    const first = join(input, 'first.html');
    const second = join(input, 'second.html');
    const invalid = '<span fxLayout="row" />\n';
    const original = await readFile(inputFixture, 'utf8');
    const expectedHtml = await readFile(expectedHtmlFixture, 'utf8');
    const expectedCss = (await readFile(expectedCssFixture, 'utf8')).replace(/\n$/u, '');
    await mkdir(input);
    await writeFile(first, original, 'utf8');
    await writeFile(second, invalid, 'utf8');
    await writeFile(stylesheet, handwrittenCss, 'utf8');

    const failed = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--report', report, '--write'],
      directory,
    );

    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('Write: 2 files scanned, 1 would change');
    const failedReport = JSON.parse(await readFile(report, 'utf8')) as Record<string, unknown>;
    expect(failedReport).toMatchObject({
      schemaVersion: 2,
      mode: 'write',
      target: 'css',
      application: { status: 'skipped', reason: 'parse-errors' },
      summary: { filesScanned: 2, filesChanged: 1, parseErrors: 1 },
    });
    expect(failedReport).not.toHaveProperty('dryRun');
    expect(await readFile(first, 'utf8')).toBe(original);
    expect(await readFile(second, 'utf8')).toBe(invalid);
    expect(await readFile(stylesheet, 'utf8')).toBe(handwrittenCss);
    expect(await transactionResidue(directory)).toEqual([]);

    await writeFile(second, original, 'utf8');
    const retried = await execute(
      [input, '--target', 'css', '--stylesheet', stylesheet, '--report', report, '--allow-unresolved', '--write'],
      directory,
    );

    expect(retried).toMatchObject({ status: 0, stderr: '' });
    expect(await readFile(first, 'utf8')).toBe(expectedHtml);
    expect(await readFile(second, 'utf8')).toBe(expectedHtml);
    expect(await readFile(stylesheet, 'utf8')).toBe(expectedCss);
    expect(await transactionResidue(directory)).toEqual([]);
  });
});

async function transactionResidue(root: string): Promise<readonly string[]> {
  return (await readdir(root, { recursive: true })).filter(path => path.endsWith('.txn')).sort();
}

function proposedReport(report: Record<string, unknown>): Record<string, unknown> {
  return {
    target: report.target,
    input: report.input,
    output: report.output,
    summary: report.summary,
    files: report.files,
    stylesheet: report.stylesheet,
  };
}
