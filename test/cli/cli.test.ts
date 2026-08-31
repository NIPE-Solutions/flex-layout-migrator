import { execFile, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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

  beforeAll(async () => {
    await execFileAsync('npm', ['run', 'build'], { cwd: repository });
  });

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'packaged-cli-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('prints the package version without rendering a banner', async () => {
    const result = await execute(['--version']);

    expect(result).toMatchObject({ status: 0, stdout: '2.0.0-beta.0\n', stderr: '' });
    expect(result.stdout).not.toContain('Flex-Layout Migrator');
  });

  test('exits zero after writing a clean migration', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await execute([input, '--output', output]);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(result.stdout).toContain('1 files scanned, 1 changed');
    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-row"></div>');
  });

  test('exits one and preserves output after a parse failure', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const result = await execute([input, '--output', output]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[template-parse-error]');
    await expect(access(output)).rejects.toThrow();
  });

  test('exits two after safely reporting unresolved input', async () => {
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');

    const result = await execute([input, '--dry-run']);

    expect(result).toMatchObject({ status: 2, stderr: '' });
    expect(result.stdout).toContain('Review 1');
    expect(result.stdout).toContain('[dynamic-binding]');
    expect(await readFile(input, 'utf8')).toBe('<div [fxFlex]="basis"></div>');
  });
});
