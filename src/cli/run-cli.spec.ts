import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import {
  CurrentMigrationPipeline,
  type MigrationRunner,
  type MigratorFactory,
} from '../pipeline/current-migration.pipeline';
import type { DiscoverStage } from '../pipeline/migration-pipeline';
import { projectManifest, type MigrationInvocation } from '../pipeline/project-manifest';
import type { MigrationReport } from '../report/migration-report';
import type { TextOutput } from '../report/terminal.presenter';
import { runCli, type CliOutput, type RunCliDependencies } from './run-cli';

class MemoryOutput implements TextOutput {
  public text = '';

  public readonly isTTY = false;

  public write(text: string): void {
    this.text += text;
  }
}

describe('runCli', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'run-cli-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function run(
    arguments_: readonly string[],
    dependencies: RunCliDependencies = {},
  ): Promise<{
    readonly exitCode: 0 | 1 | 2;
    readonly stdout: string;
    readonly stderr: string;
  }> {
    const stdout = new MemoryOutput();
    const stderr = new MemoryOutput();
    const output: CliOutput = { stdout, stderr };
    const exitCode = await runCli(['node', 'flex-layout-codemod', ...arguments_], output, dependencies);
    return { exitCode, stdout: stdout.text, stderr: stderr.text };
  }

  test('runs one immutable invocation with raw execution paths and canonical identities through the injected runner', async () => {
    const input = `${join(temporaryDirectory, 'templates')}${sep}..${sep}input.html`;
    const outputPath = `${join(temporaryDirectory, 'generated')}${sep}..${sep}output.html`;
    const reportPath = join(temporaryDirectory, 'migration.json');
    const expectedReport: MigrationReport = {
      schemaVersion: 2,
      mode: 'plan',
      target: 'tailwind',
      application: { status: 'skipped', reason: 'plan-only' },
      input: 'validated-input',
      output: 'validated-output',
      durationMs: 7,
      summary: {
        filesScanned: 1,
        filesChanged: 0,
        converted: 0,
        review: 1,
        unsupported: 0,
        invalid: 0,
        parseErrors: 0,
      },
      files: [],
    };
    const sessions: ConversionAdapterSession[] = [];
    const invocations: MigrationInvocation[] = [];
    const stdout = new MemoryOutput();
    const stderr = new MemoryOutput();

    const exitCode = await runCli(
      ['node', 'flex-layout-codemod', input, '--output', outputPath, '--responsive-images', '--report', reportPath],
      { stdout, stderr },
      {
        createMigrationRunner(session): MigrationRunner {
          sessions.push(session);
          return {
            run(invocation) {
              invocations.push(invocation);
              return Promise.resolve(expectedReport);
            },
          };
        },
      },
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.adapter.name).toBe('tailwind');
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toEqual({
      inputPath: input,
      outputPath,
      canonicalInputPath: resolve(input),
      canonicalOutputPath: resolve(outputPath),
      options: {
        mode: 'plan',
        responsiveImages: true,
        stylesheetPath: undefined,
        reportPath,
      },
    });
    expect(Object.isFrozen(invocations[0])).toBe(true);
    expect(Object.isFrozen(invocations[0]?.options)).toBe(true);
    expect(exitCode).toBe(2);
    expect(stdout.text).toBe(
      'Plan: 1 files scanned, 0 would change\nConverted 0 | Review 1 | Unsupported 0 | Invalid 0 | Parse errors 0\nNo project files were written. Run again with --write to apply this plan.\n',
    );
    expect(stderr.text).toBe('');
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual(expectedReport);
  });

  test('prints the raw relative analyzed-read error and does not write a requested JSON report', async () => {
    const rawInputPath = 'relative-fixtures/input';
    const rawTemplatePath = join(rawInputPath, 'nested', 'card.html');
    const reportPath = join(temporaryDirectory, 'migration.json');
    const canonicalTemplatePath = resolve(rawTemplatePath);
    const cause = new Error('filesystem cause');
    const error = Object.assign(
      new Error(`ENOENT: no such file or directory, open '${canonicalTemplatePath}'`, { cause }),
      {
        code: 'ENOENT',
        errno: -2,
        syscall: 'open',
        path: canonicalTemplatePath,
      },
    );
    const discover: DiscoverStage = {
      async run(invocation) {
        return projectManifest({
          invocation,
          templates: [
            {
              inputPath: canonicalTemplatePath,
              outputPath: join(invocation.canonicalOutputPath, 'nested', 'card.html'),
            },
          ],
        });
      },
    };
    const analyze = new AnalyzeProjectStage(
      { read: vi.fn(async () => Promise.reject(error)) },
      {
        parse() {
          throw new Error('Source-read failure must prevent parsing.');
        },
      },
      {
        analyze() {
          throw new Error('Source-read failure must prevent analysis.');
        },
      },
    );
    const createMigrator = vi.fn<MigratorFactory>();

    const result = await run([rawInputPath, '--report', reportPath], {
      createMigrationRunner: session => new CurrentMigrationPipeline(session, discover, analyze, createMigrator),
    });

    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: `Error: ENOENT: no such file or directory, open '${rawTemplatePath}'\n`,
    });
    expect(error.path).toBe(rawTemplatePath);
    expect(error.code).toBe('ENOENT');
    expect(error.cause).toBe(cause);
    expect(createMigrator).not.toHaveBeenCalled();
    await expect(access(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('defaults a clean Tailwind migration to a plan without creating its output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result).toEqual({
      exitCode: 0,
      stdout:
        'Plan: 1 files scanned, 1 would change\nConverted 2 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nNo project files were written. Run again with --write to apply this plan.\n',
      stderr: '',
    });
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('--write applies a clean Tailwind migration', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result).toEqual({
      exitCode: 0,
      stdout:
        'Applied: 1 files scanned, 1 changed\nConverted 2 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
      stderr: '',
    });
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col box-border gap-[4px]"></div>');
  });

  test('returns two and reports unresolved input in strict mode', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const result = await run([input]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('Review 1');
    expect(result.stdout).toContain('input.html:5 [dynamic-binding]');
    expect(result.stderr).toBe('');
  });

  test('allow-unresolved changes only the unresolved exit code', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const strict = await run([input]);
    const allowed = await run([input, '--allow-unresolved']);

    expect(allowed.exitCode).toBe(0);
    expect(allowed.stdout).toBe(strict.stdout);
    expect(allowed.stderr).toBe(strict.stderr);
  });

  test('returns one on malformed Angular and does not write output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Parse errors 1');
    expect(result.stderr).toContain('[template-parse-error]');
    await expect(access(output)).rejects.toThrow();
  });

  test('plan mode reports a change without creating template output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'missing', 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Plan: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toThrow();
  });

  test('writes a schema-2 JSON report during plan mode without creating project output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'missing-output', 'output.html');
    const reportPath = join(temporaryDirectory, 'missing-reports', 'report.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--report', reportPath]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
    });
    await expect(access(output)).rejects.toThrow();
  });

  test('defaults CSS migration to a plan without creating its template or stylesheet output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'generated', 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    const reportPath = join(temporaryDirectory, 'reports', 'report.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Plan: 1 files scanned, 1 would change');
    expect(result.stdout).toContain('Stylesheet: would create flex-layout-migration.css');
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      target: 'css',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      summary: { filesScanned: 1, filesChanged: 1, converted: 1 },
      stylesheet: { path: 'flex-layout-migration.css', change: 'created' },
    });
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('writes a CSS template and stylesheet in one completed migration', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'generated', 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet, '--write']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Stylesheet: created flex-layout-migration.css');
    const migrated = await readFile(output, 'utf8');
    const generatedClass = migrated.match(/class="(flm-[a-f0-9]+)"/)?.[1];
    expect(generatedClass).toBeDefined();
    expect(await readFile(stylesheet, 'utf8')).toContain(`.${generatedClass} {`);
  });

  test('rejects a case-only report alias before it can replace a CSS stylesheet', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const stylesheet = join(temporaryDirectory, 'result.JSON');
    const reportPath = join(temporaryDirectory, 'RESULT.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('collides');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('reports an unchanged absent stylesheet for a completed CSS migration with no generated rules', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(input, '<div class="card"></div>', 'utf8');

    const result = await run([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet, '--write']);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Stylesheet: unchanged flex-layout-migration.css');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('excludes a selected HTML-named stylesheet from folder discovery on a byte-idempotent rerun', async () => {
    const input = join(temporaryDirectory, 'input');
    const template = join(input, 'card.html');
    const stylesheet = join(input, 'owned-styles.html');
    await mkdir(input);
    await writeFile(template, '<div fxLayout="row"></div>', 'utf8');

    const first = await run([input, '--target', 'css', '--stylesheet', stylesheet, '--write']);
    expect(first).toMatchObject({ exitCode: 0, stderr: '' });
    const firstTemplate = await readFile(template, 'utf8');
    const firstStylesheet = await readFile(stylesheet, 'utf8');

    const rerun = await run([input, '--target', 'css', '--stylesheet', stylesheet, '--write']);

    expect(rerun).toMatchObject({ exitCode: 0, stderr: '' });
    expect(rerun.stdout).toContain('1 files scanned, 0 changed');
    expect(rerun.stdout).toContain('Stylesheet: unchanged owned-styles.html');
    expect(await readFile(template, 'utf8')).toBe(firstTemplate);
    expect(await readFile(stylesheet, 'utf8')).toBe(firstStylesheet);
  });

  test('returns a complete CSS parse-error report without writing project artifacts', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'output');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    const reportPath = join(temporaryDirectory, 'report.json');
    await mkdir(input);
    await writeFile(join(input, 'a-valid.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(input, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
      '--write',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Write: 2 files scanned, 1 would change');
    expect(result.stderr).toContain('Stylesheet: would create ../flex-layout-migration.css');
    expect(result.stderr).not.toContain('Stylesheet: created');
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      mode: 'write',
      target: 'css',
      application: { status: 'skipped', reason: 'parse-errors' },
      summary: { filesScanned: 2, filesChanged: 1, parseErrors: 1 },
      stylesheet: { path: '../flex-layout-migration.css', change: 'created' },
    });
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test.each([
    ['CSS without --stylesheet', ['--target', 'css'], '--target css requires --stylesheet <path>'],
    [
      'Tailwind with --stylesheet',
      ['--target', 'tailwind', '--stylesheet', 'flex.css'],
      '--stylesheet can only be used with --target css',
    ],
    ['CSS with an empty stylesheet', ['--target', 'css', '--stylesheet', ''], 'Stylesheet path must not be empty'],
  ] as const)('rejects %s before discovering a missing input', async (_name, arguments_, expectedError) => {
    const missingInput = join(temporaryDirectory, 'missing.html');

    const result = await run([missingInput, ...arguments_]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(expectedError);
    expect(result.stderr).not.toContain('ENOENT');
    await expect(access(missingInput)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects repeated stylesheet options before discovery and preserves every candidate output', async () => {
    const missingInput = join(temporaryDirectory, 'missing.html');
    const output = join(temporaryDirectory, 'output.html');
    const firstStylesheet = join(temporaryDirectory, 'first.css');
    const secondStylesheet = join(temporaryDirectory, 'second.css');
    const reportPath = join(temporaryDirectory, 'report.json');
    await writeFile(firstStylesheet, 'preserve stylesheet', 'utf8');
    await writeFile(reportPath, 'preserve report', 'utf8');

    const result = await run([
      missingInput,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      firstStylesheet,
      '--stylesheet',
      secondStylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--stylesheet may only be specified once');
    expect(result.stderr).not.toContain('ENOENT');
    expect(await readFile(firstStylesheet, 'utf8')).toBe('preserve stylesheet');
    expect(await readFile(reportPath, 'utf8')).toBe('preserve report');
    await expect(access(missingInput)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(secondStylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test.each([
    ['input', (root: string) => join(root, 'missing.html'), undefined],
    ['output', (root: string) => join(root, 'stylesheet.css'), undefined],
    ['report', (root: string) => join(root, 'stylesheet.json'), (root: string) => join(root, 'stylesheet.json')],
  ] as const)(
    'rejects a stylesheet collision with the %s path before discovering a missing input',
    async (_name, stylesheetFor, reportFor) => {
      const missingInput = join(temporaryDirectory, 'missing.html');
      const output = join(temporaryDirectory, 'stylesheet.css');
      const stylesheet = stylesheetFor(temporaryDirectory);
      const report = reportFor?.(temporaryDirectory);
      const arguments_ = [missingInput, '--output', output, '--target', 'css', '--stylesheet', stylesheet];
      if (report !== undefined) arguments_.push('--report', report);

      const result = await run(arguments_);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Stylesheet path collides with another migration path');
      expect(result.stderr).not.toContain('ENOENT');
      await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
      if (report !== undefined) await expect(access(report)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  test.each([
    [
      'stylesheet ancestor of report',
      (root: string) => [join(root, 'flex.css'), join(root, 'flex.css', 'report.json')] as const,
    ],
    [
      'report ancestor of stylesheet',
      (root: string) => [join(root, 'report.json', 'flex.css'), join(root, 'report.json')] as const,
    ],
  ])('rejects a %s path collision before discovering a missing input', async (_name, pathsFor) => {
    const missingInput = join(temporaryDirectory, 'missing.html');
    const output = join(temporaryDirectory, 'output.html');
    const [stylesheet, reportPath] = pathsFor(temporaryDirectory);

    const result = await run([
      missingInput,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Stylesheet path collides with another migration path');
    expect(result.stderr).not.toContain('ENOENT');
    for (const candidate of [missingInput, output, stylesheet, reportPath]) {
      await expect(access(candidate)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  test('rejects a stylesheet ancestor of a no-rule template output without mutating any file', async () => {
    const input = join(temporaryDirectory, 'input');
    const nestedInput = join(input, 'generated', 'card.html');
    const output = temporaryDirectory;
    const stylesheet = join(temporaryDirectory, 'generated');
    const plannedTemplate = join(stylesheet, 'card.html');
    const reportPath = join(temporaryDirectory, 'report.json');
    await mkdir(join(input, 'generated'), { recursive: true });
    await writeFile(nestedInput, '<div class="card"></div>', 'utf8');
    await writeFile(stylesheet, 'preserve stylesheet', 'utf8');
    await writeFile(reportPath, 'preserve report', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Migration paths collide');
    expect(await readFile(nestedInput, 'utf8')).toBe('<div class="card"></div>');
    expect(await readFile(stylesheet, 'utf8')).toBe('preserve stylesheet');
    expect(await readFile(reportPath, 'utf8')).toBe('preserve report');
    await expect(access(plannedTemplate)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  test('rejects a no-rule template output ancestor of a stylesheet without creating its directory', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'generated');
    const plannedTemplate = join(output, 'card.html');
    const stylesheet = join(plannedTemplate, 'flex.css');
    const reportPath = join(temporaryDirectory, 'report.json');
    await mkdir(input);
    await writeFile(join(input, 'card.html'), '<div class="card"></div>', 'utf8');
    await writeFile(reportPath, 'preserve report', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Migration paths collide');
    expect(await readFile(join(input, 'card.html'), 'utf8')).toBe('<div class="card"></div>');
    expect(await readFile(reportPath, 'utf8')).toBe('preserve report');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test.each(['directory', 'symlink'] as const)(
    'rejects a stylesheet %s before discovering templates and preserves every existing file',
    async kind => {
      const missingInput = join(temporaryDirectory, 'missing.html');
      const output = join(temporaryDirectory, 'output.html');
      const stylesheet = join(temporaryDirectory, 'flex.css');
      const preserved = join(temporaryDirectory, 'preserved.css');
      await writeFile(preserved, 'preserve me', 'utf8');
      if (kind === 'directory') await mkdir(stylesheet);
      else await symlink(preserved, stylesheet);

      const result = await run([missingInput, '--output', output, '--target', 'css', '--stylesheet', stylesheet]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        kind === 'directory' ? 'Stylesheet path must be a regular file' : 'Stylesheet path must not be a symbolic link',
      );
      expect(result.stderr).not.toContain('ENOENT');
      expect(await readFile(preserved, 'utf8')).toBe('preserve me');
      await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  test('preserves an explicitly requested report when stylesheet planning throws', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex.css');
    const reportPath = join(temporaryDirectory, 'report.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    await writeFile(stylesheet, '/* flex-layout-codemod:start schema=1 */', 'utf8');
    await writeFile(reportPath, 'preserve report', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
      '--report',
      reportPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Cannot safely update stylesheet ownership');
    expect(await readFile(reportPath, 'utf8')).toBe('preserve report');
    expect(await readFile(stylesheet, 'utf8')).toBe('/* flex-layout-codemod:start schema=1 */');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a JSON single-file output before it can collide with the report', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const outputAndReport = join(temporaryDirectory, 'result.json');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--output', outputAndReport, '--report', outputAndReport]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Single-file output path must have a .html extension');
    expect(await readFile(input, 'utf8')).toBe(source);
    await expect(access(outputAndReport)).rejects.toThrow();
  });

  test.each([
    ['an extensionless output', 'result'],
    ['a non-HTML output', 'result.css'],
  ])('rejects %s before writing', async (_name, outputName) => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, outputName);
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Single-file output path must have a .html extension');
    expect(await readFile(input, 'utf8')).toBe(source);
    await expect(access(output)).rejects.toThrow();
  });

  test('accepts a mixed-case HTML single-file output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'result.HTML');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('retains the input bytes during a default in-place plan', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Plan: 1 files scanned, 1 would change');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('treats a folder output as a directory regardless of its suffix', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'generated.json');
    await mkdir(input);
    await writeFile(join(input, 'card.html'), '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(output, 'card.html'), 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test.each([
    ['an extensionless path', 'report'],
    ['an HTML path', 'report.html'],
    ['a mixed-case HTML path', 'report.HTML'],
  ])('rejects %s before migration without creating side effects', async (_name, reportName) => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'missing-output', 'output.html');
    const reportDirectory = join(temporaryDirectory, 'missing-reports');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--output', output, '--report', join(reportDirectory, reportName)]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path must have a .json extension');
    expect(await readFile(input, 'utf8')).toBe(source);
    await expect(access(output)).rejects.toThrow();
    await expect(access(reportDirectory)).rejects.toThrow();
  });

  test.each([
    ['a .json report inside the input tree', 'input', 'report.json'],
    ['a .JSON report inside the output tree', 'output', 'report.JSON'],
  ] as const)('accepts %s', async (_name, reportTree, reportName) => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'output');
    const template = join(input, 'card.html');
    const source = '<div fxLayout="row"></div>';
    await mkdir(input);
    await writeFile(template, source, 'utf8');
    const reportRoot = reportTree === 'input' ? input : output;
    const reportPath = join(reportRoot, 'reports', reportName);

    const result = await run([input, '--output', output, '--report', reportPath]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
    });
    expect(await readFile(template, 'utf8')).toBe(source);
    await expect(access(join(output, 'card.html'))).rejects.toThrow();
  });

  test('rejects a blank report path instead of silently ignoring it', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--report', '']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path must not be empty');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('rejects an input report collision before parsing malformed Angular', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<span fxLayout="row" />';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--report', input]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path must have a .json extension');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('rejects a planned output collision before writing any folder template', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'output');
    await mkdir(input);
    await writeFile(join(input, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(input, 'z.html'), '<div fxLayout="column"></div>', 'utf8');

    const result = await run([input, '--output', output, '--report', join(output, 'z.html')]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path must have a .json extension');
    await expect(access(output)).rejects.toThrow();
  });

  test('documents the JSON extension requirement in help output', async () => {
    const result = await run(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--report <path>');
    const normalizedOutput = result.stdout.replace(/\s+/g, ' ');
    expect(normalizedOutput).toContain('path must end in .json');
    expect(normalizedOutput).toContain('single-file output must end in .html');
    expect(result.stderr).toBe('');
  });

  test('documents the CSS target and its required stylesheet option in help output', async () => {
    const result = await run(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--target <target>');
    expect(result.stdout).toContain('--stylesheet <path>');
    expect(result.stdout.replace(/\s+/g, ' ')).toContain('css requires --stylesheet');
    expect(result.stderr).toBe('');
  });

  test('documents explicit write authorization without advertising the obsolete dry-run option', async () => {
    const result = await run(['--help']);
    const normalizedOutput = result.stdout.replace(/\s+/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--write');
    expect(result.stdout).toContain('apply the validated migration plan');
    expect(normalizedOutput).toContain('Plan Angular Flex-Layout migrations by default; use --write to apply');
    expect(normalizedOutput).toContain('planned output HTML file or folder');
    expect(result.stdout).not.toContain('--dry-run');
    expect(result.stderr).toBe('');
  });

  test.each(['--dry-run', '--dry-run=true'])('%s fails before input discovery or report writing', async option => {
    const missingInput = join(temporaryDirectory, 'missing.html');
    const reportPath = join(temporaryDirectory, 'reports', 'report.json');

    const result = await run([missingInput, option, '--report', reportPath]);

    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: Planning is now the default. Remove --dry-run; use --write to apply changes.\n',
    });
    await expect(access(missingInput)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects duplicate --write before input discovery, report creation, or project mutation', async () => {
    const missingInput = join(temporaryDirectory, 'missing.html');
    const output = join(temporaryDirectory, 'output.html');
    const reportPath = join(temporaryDirectory, 'reports', 'report.json');
    await writeFile(output, 'preserve output', 'utf8');

    const result = await run([missingInput, '--write', '--write', '--output', output, '--report', reportPath]);

    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: --write may only be specified once.\n',
    });
    await expect(access(missingInput)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(output, 'utf8')).toBe('preserve output');
    await expect(access(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('allows an input filename containing the dry-run substring', async () => {
    const input = join(temporaryDirectory, 'component--dry-run.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Plan: 1 files scanned, 1 would change');
  });

  test('documents project-aware breakpoint options in help output', async () => {
    const result = await run(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--orientation-breakpoints');
    expect(result.stdout).toContain('--print-with-breakpoints <aliases>');
    expect(result.stdout).toContain('--responsive-images');
    expect(result.stdout).toContain('picture');
  });

  test('preserves responsive images by default and identifies the opt-in', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<img src="base.png" src.sm="small.png">';
    await writeFile(input, source, 'utf8');

    const result = await run([input]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('[target-unsupported]');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('writes responsive image output only with acknowledgement and write authorization', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const report = join(temporaryDirectory, 'report.json');
    await writeFile(input, '<img src="base.png" src.sm="small.png">', 'utf8');

    const result = await run([input, '--output', output, '--responsive-images', '--report', report, '--write']);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toContain('<picture>');
    expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      mode: 'write',
      application: { status: 'applied' },
      files: [{ results: [{ status: 'converted', directive: 'imgSrc', sourceName: 'src.sm', offset: 20 }] }],
    });
  });

  test('plans responsive image output without writing by default', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<img src.sm="small.png">', 'utf8');

    const result = await run([input, '--output', output, '--responsive-images']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 would change');
    await expect(access(output)).rejects.toThrow();
  });

  test('rejects invalid print breakpoint configuration before reading input', async () => {
    const input = join(temporaryDirectory, 'missing.html');

    const result = await run([input, '--print-with-breakpoints', 'handset']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('requires --orientation-breakpoints');
    await expect(access(input)).rejects.toThrow();
  });

  test('converts configured orientation and print fallback behavior end to end', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout.handset="column" fxLayout.md="row"></div>', 'utf8');

    const result = await run([
      input,
      '--output',
      output,
      '--orientation-breakpoints',
      '--print-with-breakpoints',
      'md',
      '--write',
    ]);

    expect(result.exitCode).toBe(0);
    const migrated = await readFile(output, 'utf8');
    expect(migrated).toContain('[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:flex-col');
    expect(migrated).toContain('[@media_print]:flex-row');
  });

  test('creates a missing output directory when a changed template is written', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'new', 'nested', 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--write']);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test.each([
    ['a missing input', () => join(temporaryDirectory, 'missing.html'), [], 'ENOENT'],
    ['an invalid target', () => join(temporaryDirectory, 'input.html'), ['--target', 'sass'], 'Allowed choices'],
  ])('returns one on %s without terminating the process', async (_name, inputPath, arguments_, expectedError) => {
    const input = inputPath();
    if (expectedError === 'Allowed choices') {
      await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    }

    const result = await run([input, ...arguments_]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });
});
