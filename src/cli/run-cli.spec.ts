import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TextOutput } from '../report/terminal.presenter';
import { runCli, type CliOutput } from './run-cli';

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

  async function run(arguments_: readonly string[]): Promise<{
    readonly exitCode: 0 | 1 | 2;
    readonly stdout: string;
    readonly stderr: string;
  }> {
    const stdout = new MemoryOutput();
    const stderr = new MemoryOutput();
    const output: CliOutput = { stdout, stderr };
    const exitCode = await runCli(['node', 'flex-layout-codemod', ...arguments_], output);
    return { exitCode, stdout: stdout.text, stderr: stderr.text };
  }

  test('returns zero and writes a clean static migration', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: '1 files scanned, 1 changed\nConverted 2 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
      stderr: '',
    });
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col box-border gap-[4px]"></div>');
  });

  test('returns two and reports unresolved input in strict mode', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const result = await run([input, '--dry-run']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('Review 1');
    expect(result.stdout).toContain('input.html:5 [dynamic-binding]');
    expect(result.stderr).toBe('');
  });

  test('allow-unresolved changes only the unresolved exit code', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const strict = await run([input, '--dry-run']);
    const allowed = await run([input, '--dry-run', '--allow-unresolved']);

    expect(allowed.exitCode).toBe(0);
    expect(allowed.stdout).toBe(strict.stdout);
    expect(allowed.stderr).toBe(strict.stderr);
  });

  test('returns one on malformed Angular and does not write output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Parse errors 1');
    expect(result.stderr).toContain('[template-parse-error]');
    await expect(access(output)).rejects.toThrow();
  });

  test('dry-run reports a change without creating template output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'missing', 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dry run: 1 files scanned, 1 would change');
    await expect(access(output)).rejects.toThrow();
  });

  test('writes a versioned JSON report during dry-run', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'missing-output', 'output.html');
    const reportPath = join(temporaryDirectory, 'missing-reports', 'report.json');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output, '--dry-run', '--report', reportPath]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({ schemaVersion: 1, dryRun: true });
    await expect(access(output)).rejects.toThrow();
  });

  test('plans a CSS template and stylesheet during dry-run without creating either output', async () => {
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
      '--dry-run',
      '--report',
      reportPath,
    ]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Dry run: 1 files scanned, 1 would change');
    expect(result.stdout).toContain('Stylesheet: would create flex-layout-migration.css');
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      target: 'css',
      dryRun: true,
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

    const result = await run([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Stylesheet: created flex-layout-migration.css');
    const migrated = await readFile(output, 'utf8');
    const generatedClass = migrated.match(/class="(flm-[a-f0-9]+)"/)?.[1];
    expect(generatedClass).toBeDefined();
    expect(await readFile(stylesheet, 'utf8')).toContain(`.${generatedClass} {`);
  });

  test('reports an unchanged absent stylesheet for a completed CSS migration with no generated rules', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const stylesheet = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(input, '<div class="card"></div>', 'utf8');

    const result = await run([input, '--output', output, '--target', 'css', '--stylesheet', stylesheet]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Stylesheet: unchanged flex-layout-migration.css');
    await expect(access(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
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
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('2 files scanned, 1 changed');
    expect(result.stderr).toContain('Stylesheet: created ../flex-layout-migration.css');
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({
      target: 'css',
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

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Single-file output path must have a .html extension');
    expect(await readFile(input, 'utf8')).toBe(source);
    await expect(access(output)).rejects.toThrow();
  });

  test('accepts a mixed-case HTML single-file output', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'result.HTML');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('retains default in-place output for a single file', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input]);

    expect(result.exitCode).toBe(0);
    expect(await readFile(input, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('treats a folder output as a directory regardless of its suffix', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'generated.json');
    await mkdir(input);
    await writeFile(join(input, 'card.html'), '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output]);

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

    const result = await run([input, '--output', output, '--dry-run', '--report', reportPath]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toMatchObject({ schemaVersion: 1, dryRun: true });
    expect(await readFile(template, 'utf8')).toBe(source);
    await expect(access(join(output, 'card.html'))).rejects.toThrow();
  });

  test('rejects a blank report path instead of silently ignoring it', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--dry-run', '--report', '']);

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

  test('converts responsive images only with explicit acknowledgement and reports their location', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    const report = join(temporaryDirectory, 'report.json');
    await writeFile(input, '<img src="base.png" src.sm="small.png">', 'utf8');

    const result = await run([input, '--output', output, '--responsive-images', '--report', report]);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toContain('<picture>');
    expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      files: [{ results: [{ status: 'converted', directive: 'imgSrc', sourceName: 'src.sm', offset: 20 }] }],
    });
  });

  test('plans responsive image output without writing during dry-run', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<img src.sm="small.png">', 'utf8');

    const result = await run([input, '--output', output, '--responsive-images', '--dry-run']);

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

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test.each([
    ['a missing input', () => join(temporaryDirectory, 'missing.html'), ['--dry-run'], 'ENOENT'],
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
