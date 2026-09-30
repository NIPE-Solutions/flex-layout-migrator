import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

const repository = resolve(import.meta.dirname, '../..');
const executable = join(repository, 'dist', 'cli.js');

interface ExecutionResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function execute(arguments_: readonly string[], cwd = repository): Promise<ExecutionResult> {
  return new Promise((resolveExecution, reject) => {
    const child = spawn(process.execPath, [executable, ...arguments_], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectStringValues);
  }
  return [];
}

describe('packaged CLI execution', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'packaged-cli-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('prints the package version without rendering a banner', async () => {
    const result = await execute(['--version']);

    expect(result).toMatchObject({ status: 0, stdout: `${packageJson.version}\n`, stderr: '' });
    expect(result.stdout).not.toContain('Flex-Layout Migrator');
  });

  test('keeps unresolved stylesheet imports portable in reports and terminal diagnostics', async () => {
    const source = '<div fxLayout="row"></div>';
    await writeFile(join(temporaryDirectory, 'input.html'), source);
    await writeFile(join(temporaryDirectory, 'style.css'), '@import "tailwindcss"; @import "./missing-private.css";');
    const result = await execute(
      ['input.html', '--tailwind-stylesheet', 'style.css', '--report', 'report.json'],
      temporaryDirectory,
    );
    const reportText = await readFile(join(temporaryDirectory, 'report.json'), 'utf8');
    const report = JSON.parse(reportText);
    expect(result.status).toBe(2);
    expect(report).toMatchObject({ schemaVersion: 2, mode: 'plan', application: { status: 'skipped' } });
    expect(report.targetProfile.diagnostics).toContainEqual({
      code: 'tailwind-import-unresolved',
      message: expect.stringMatching(/style\.css: \.\/missing-private\.css: ENOENT/),
    });
    for (const text of [reportText, result.stdout + result.stderr]) {
      expect(text).toContain('./missing-private.css');
      expect(text).toContain('ENOENT');
      expect(text).not.toContain(temporaryDirectory);
      expect(text).not.toContain('file://');
    }
    expect(await readFile(join(temporaryDirectory, 'input.html'), 'utf8')).toBe(source);
  });

  test('preserves the relative missing input path in the packaged CLI error', async () => {
    const input = `${basename(temporaryDirectory)}-missing.html`;

    const result = await execute([input]);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: `Error: ENOENT: no such file or directory, stat '${input}'\n`,
    });
  });

  test('rejects a trailing separator on a packaged single-file HTML input', async () => {
    const input = join(temporaryDirectory, 'trailing.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    const relativeInput = `${relative(repository, input)}${sep}`;

    const result = await execute([relativeInput]);

    expect(result).toEqual({
      status: 1,
      stdout: '',
      stderr: `Error: ENOTDIR: not a directory, stat '${relativeInput}'\n`,
    });
  });

  test('plans a clean Tailwind migration by default and applies it only with --write', async () => {
    const sourceTemplate = '<div fxLayout="row"></div>';
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const report = join(temporaryDirectory, 'report.json');
    await writeFile(input, sourceTemplate, 'utf8');

    const plan = await execute([input, '--output', output, '--report', report]);

    expect(plan).toMatchObject({ status: 0, stderr: '' });
    expect(plan.stdout).toContain('Plan: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(input, 'utf8')).toBe(sourceTemplate);
    const planReport = JSON.parse(await readFile(report, 'utf8')) as Record<string, unknown>;
    const planReportStrings = collectStringValues(planReport);
    expect(collectStringValues({ source: sourceTemplate }).some(value => value.includes(sourceTemplate))).toBe(true);
    expect(planReportStrings.some(value => value.includes(temporaryDirectory))).toBe(false);
    expect(planReportStrings.some(value => value.includes(sourceTemplate))).toBe(false);
    expect(planReport).toMatchObject({
      schemaVersion: 2,
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
    });
    expect(planReport).not.toHaveProperty('dryRun');

    const applied = await execute([input, '--output', output, '--report', report, '--write']);

    expect(applied).toMatchObject({ status: 0, stderr: '' });
    expect(applied.stdout).toContain('Applied: 1 files scanned, 1 changed');
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
    expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      mode: 'write',
      application: { status: 'applied' },
    });
  });

  test.runIf(process.platform !== 'win32')('rejects a symbolic-link output without changing its target', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const target = join(temporaryDirectory, 'protected.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    await writeFile(target, 'protected bytes', 'utf8');
    await symlink(target, output);

    const result = await execute([input, '--output', output, '--write']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not be a symbolic link');
    expect(await readFile(target, 'utf8')).toBe('protected bytes');
    expect(await readFile(input, 'utf8')).toBe('<div fxLayout="row"></div>');
  });

  test('preserves the adapter-session debug message through the real CLI route', async () => {
    const input = join(temporaryDirectory, 'debug-input.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await execute([input, '--debug']);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(result.stdout).toContain('Creating adapter session [tailwind]');
    expect(result.stdout).not.toContain('Creating render session [tailwind]');
  });

  test('executes the packaged CSS target with its companion stylesheet', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await execute([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet, '--write']);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(result.stdout).toContain('Stylesheet: created flex-layout-migration.css');
    const migrated = await readFile(output, 'utf8');
    const generatedClass = migrated.match(/class="(flm-[a-f0-9]+)"/)?.[1];
    expect(generatedClass).toBeDefined();
    expect(await readFile(stylesheet, 'utf8')).toContain(`.${generatedClass} {`);
  });

  test('reports a default plan with parse errors as plan-only and preserves output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const report = join(temporaryDirectory, 'report.json');
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const result = await execute([input, '--output', output, '--report', report]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Plan: 1 files scanned, 0 would change');
    expect(result.stderr).toContain('[template-parse-error]');
    const parsedReport = JSON.parse(await readFile(report, 'utf8')) as Record<string, unknown>;
    expect(parsedReport).toMatchObject({
      schemaVersion: 2,
      mode: 'plan',
      summary: { filesScanned: 1, filesChanged: 0, parseErrors: 1 },
    });
    expect(parsedReport.application).toEqual({ status: 'skipped', reason: 'plan-only' });
    expect(parsedReport).not.toHaveProperty('dryRun');
    await expect(access(output)).rejects.toThrow();
  });

  test('exits two after safely reporting unresolved input', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const result = await execute([input]);

    expect(result).toMatchObject({ status: 2, stderr: '' });
    expect(result.stdout).toContain('Review 1');
    expect(result.stdout).toContain('[dynamic-binding]');
    expect(await readFile(input, 'utf8')).toBe('<div [fxFlex]="basis"></div>');
  });

  test('documents and executes the packaged responsive image opt-in', async () => {
    const help = await execute(['--help']);
    const normalizedHelp = help.stdout.replace(/\s+/g, ' ');
    expect(help.stdout).toContain('--responsive-images');
    expect(help.stdout).toContain('--write');
    expect(normalizedHelp).toContain('Plan Angular Flex-Layout migrations by default; use --write to apply');
    expect(normalizedHelp).toContain('planned output HTML file or folder');
    expect(help.stdout).not.toContain('--dry-run');

    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<img src="base.png" src.sm="small.png">', 'utf8');

    const result = await execute([input, '--output', output, '--responsive-images', '--write']);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(await readFile(output, 'utf8')).toContain('<picture>');
  });
});
