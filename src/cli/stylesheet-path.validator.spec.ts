import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStylesheetPath } from './stylesheet-path.validator';

describe('validateStylesheetPath', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'stylesheet-path-validator-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('accepts Tailwind without a stylesheet', async () => {
    await expect(
      validateStylesheetPath({
        target: 'tailwind',
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).resolves.toBeUndefined();
  });

  test('requires a stylesheet for CSS', async () => {
    await expect(
      validateStylesheetPath({
        target: 'css',
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-configuration' });
  });

  test('rejects an empty CSS stylesheet path', async () => {
    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath: '  ',
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-configuration' });
  });

  test('rejects a stylesheet for Tailwind', async () => {
    const stylesheetPath = join(directory, 'flex.css');

    await expect(
      validateStylesheetPath({
        target: 'tailwind',
        stylesheetPath,
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-configuration', paths: [stylesheetPath] });
  });

  test('normalizes an absent CSS stylesheet path without creating it', async () => {
    const stylesheetPath = join(directory, 'styles', 'nested', '..', 'flex.css');
    const normalizedPath = join(directory, 'styles', 'flex.css');

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath,
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).resolves.toBe(normalizedPath);
    await expect(access(join(directory, 'styles'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('normalizes syntax without inspecting the filesystem path type', async () => {
    const stylesheetPath = join(directory, 'styles');
    await mkdir(stylesheetPath);

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath,
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).resolves.toBe(stylesheetPath);
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });
});
