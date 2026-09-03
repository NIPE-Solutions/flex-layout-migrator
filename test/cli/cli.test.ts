import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

const repository = resolve(import.meta.dirname, '../..');
const executable = join(repository, 'dist', 'cli.js');

interface ExecutionResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function execute(arguments_: readonly string[]): Promise<ExecutionResult> {
  return new Promise((resolveExecution, reject) => {
    const child = spawn(process.execPath, [executable, ...arguments_], {
      cwd: repository,
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

  test('plans a clean Tailwind migration by default and applies it only with --write', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const report = join(temporaryDirectory, 'report.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const plan = await execute([input, '--output', output, '--report', report]);

    expect(plan).toMatchObject({ status: 0, stderr: '' });
    expect(plan.stdout).toContain('Plan: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(input, 'utf8')).toBe('<div fxLayout="row"></div>');
    const planReport = JSON.parse(await readFile(report, 'utf8')) as Record<string, unknown>;
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
