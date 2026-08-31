import { access, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col gap-4"></div>');
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

  test('rejects a blank report path instead of silently ignoring it', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--dry-run', '--report', '']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path must not be empty');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('rejects a relative report alias of the input before a dry-run', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--dry-run', '--report', relative(process.cwd(), input)]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path conflicts with a template path');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('rejects an input report collision before parsing malformed Angular', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const source = '<span fxLayout="row" />';
    await writeFile(input, source, 'utf8');

    const result = await run([input, '--report', input]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path conflicts with a template path');
    expect(await readFile(input, 'utf8')).toBe(source);
  });

  test('rejects a symlink report alias of an input template', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const reportAlias = join(temporaryDirectory, 'report.json');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');
    await symlink(input, reportAlias);

    const result = await run([input, '--dry-run', '--report', reportAlias]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path conflicts with a template path');
    expect(await readFile(input, 'utf8')).toBe(source);
    expect(await readlink(reportAlias)).toBe(input);
  });

  test('rejects a report collision with a discovered folder template', async () => {
    const input = join(temporaryDirectory, 'input');
    const nestedInput = join(input, 'nested', 'card.html');
    const source = '<div fxLayout="row"></div>';
    await mkdir(join(input, 'nested'), { recursive: true });
    await writeFile(nestedInput, source, 'utf8');

    const result = await run([input, '--dry-run', '--report', nestedInput]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path conflicts with a template path');
    expect(await readFile(nestedInput, 'utf8')).toBe(source);
  });

  test('rejects a planned output collision before writing any folder template', async () => {
    const input = join(temporaryDirectory, 'input');
    const output = join(temporaryDirectory, 'output');
    await mkdir(input);
    await writeFile(join(input, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(input, 'z.html'), '<div fxLayout="column"></div>', 'utf8');

    const result = await run([input, '--output', output, '--report', join(output, 'z.html')]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Report path conflicts with a template path');
    await expect(access(output)).rejects.toThrow();
  });

  test('creates a missing output directory when a changed template is written', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'new', 'nested', 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await run([input, '--output', output]);

    expect(result.exitCode).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row"></div>');
  });

  test.each([
    ['a missing input', () => join(temporaryDirectory, 'missing.html'), ['--dry-run'], 'ENOENT'],
    ['an invalid target', () => join(temporaryDirectory, 'input.html'), ['--target', 'css'], 'Allowed choices'],
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
