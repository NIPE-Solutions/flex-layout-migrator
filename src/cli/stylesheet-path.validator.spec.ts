import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, posix, win32 } from 'node:path';
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

  test.each([
    ['input', (root: string) => join(root, 'input.html')],
    ['output', (root: string) => join(root, 'output.html')],
    ['report', (root: string) => join(root, 'report.json')],
  ])('rejects a stylesheet path that collides with the %s path', async (_name, stylesheetFor) => {
    const stylesheetPath = stylesheetFor(directory);

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath: join(directory, 'nested', '..', basename(stylesheetPath)),
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [stylesheetPath] });
  });

  test.each([
    [
      'stylesheet ancestor of report',
      (root: string) => [join(root, 'flex.css'), join(root, 'flex.css', 'report.json')] as const,
    ],
    [
      'report ancestor of stylesheet',
      (root: string) => [join(root, 'report.json', 'flex.css'), join(root, 'report.json')] as const,
    ],
  ])('rejects a %s collision before inspecting the input', async (_name, pathsFor) => {
    const [stylesheetPath, reportPath] = pathsFor(directory);

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath,
        inputPath: join(directory, 'missing.html'),
        outputPath: join(directory, 'output.html'),
        reportPath,
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [stylesheetPath, reportPath] });
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(reportPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a directory CSS stylesheet path without changing it', async () => {
    const stylesheetPath = join(directory, 'styles');
    await mkdir(stylesheetPath);

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath,
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [stylesheetPath] });
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });

  test('rejects a symbolic-link CSS stylesheet path without following it', async () => {
    const target = join(directory, 'target.css');
    const stylesheetPath = join(directory, 'flex.css');
    await writeFile(target, 'preserve me', 'utf8');
    await symlink(target, stylesheetPath);

    await expect(
      validateStylesheetPath({
        target: 'css',
        stylesheetPath,
        inputPath: join(directory, 'input.html'),
        outputPath: join(directory, 'output.html'),
      }),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [stylesheetPath] });
    expect(await readFile(target, 'utf8')).toBe('preserve me');
  });

  test.each([
    [
      'input',
      {
        stylesheetPath: 'C:/Project/card.html',
        inputPath: 'c:/project/CARD.HTML',
        outputPath: 'C:/Project/output.html',
        reportPath: 'C:/Project/report.json',
      },
    ],
    [
      'output',
      {
        stylesheetPath: 'C:/Project/card.html',
        inputPath: 'C:/Project/input.html',
        outputPath: 'c:/project/CARD.HTML',
        reportPath: 'C:/Project/report.json',
      },
    ],
    [
      'report',
      {
        stylesheetPath: 'C:/Project/card.html',
        inputPath: 'C:/Project/input.html',
        outputPath: 'C:/Project/output.html',
        reportPath: 'c:/project/CARD.HTML',
      },
    ],
  ])('rejects a Win32 case-only stylesheet alias of the %s path', async (_name, request) => {
    await expect(validateStylesheetPath({ target: 'css', ...request }, win32)).rejects.toMatchObject({
      code: 'path-collision',
      paths: [String.raw`C:\Project\card.html`],
    });
  });

  test('keeps a POSIX backslash stylesheet filename distinct from the report hierarchy', async () => {
    const stylesheetPath = join(directory, String.raw`flex\owned.css`);
    const reportPath = join(directory, 'flex', 'owned.css', 'report.json');

    await expect(
      validateStylesheetPath(
        {
          target: 'css',
          stylesheetPath,
          inputPath: join(directory, 'input.html'),
          outputPath: join(directory, 'output.html'),
          reportPath,
        },
        posix,
      ),
    ).resolves.toBe(stylesheetPath);
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(directory, 'flex'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
