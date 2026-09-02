import { access, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { validateMigrationPaths } from './migration-path.validator';

describe('validateMigrationPaths', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'migration-path-validator-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('rejects normalized duplicate template destinations', async () => {
    const destination = join(directory, 'output', 'card.html');

    await expect(
      validateMigrationPaths({
        templates: [
          {
            inputPath: join(directory, 'first.html'),
            outputPath: join(directory, 'output', 'nested', '..', 'card.html'),
          },
          { inputPath: join(directory, 'second.html'), outputPath: destination },
        ],
        stylesheetPath: join(directory, 'flex.css'),
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [destination] });
  });

  test('allows one template to intentionally write in place without creating any paths', async () => {
    const template = join(directory, 'input', 'card.html');
    const stylesheet = join(directory, 'styles', 'flex.css');
    const report = join(directory, 'reports', 'migration.json');

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: template, outputPath: template }],
        stylesheetPath: stylesheet,
        reportPath: report,
      }),
    ).resolves.toBeUndefined();

    await expect(access(template)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(report)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a stylesheet that collides with a template destination', async () => {
    const template = join(directory, 'card.html');

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: join(directory, 'input.html'), outputPath: template }],
        stylesheetPath: template,
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [template] });
  });

  test('rejects a report path that collides with a project destination', async () => {
    const stylesheet = join(directory, 'flex.css');

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: join(directory, 'input.html'), outputPath: join(directory, 'output.html') }],
        stylesheetPath: stylesheet,
        reportPath: stylesheet,
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [stylesheet] });
  });

  test('rejects directory destinations', async () => {
    const stylesheet = join(directory, 'styles');
    await mkdir(stylesheet);

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: join(directory, 'input.html'), outputPath: join(directory, 'output.html') }],
        stylesheetPath: stylesheet,
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [stylesheet] });
  });

  test('rejects symbolic-link destinations', async () => {
    const target = join(directory, 'target.css');
    const stylesheet = join(directory, 'flex.css');
    await symlink(target, stylesheet);

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: join(directory, 'input.html'), outputPath: join(directory, 'output.html') }],
        stylesheetPath: stylesheet,
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [stylesheet] });
  });

  test('rejects lexical stylesheet aliases that resolve to a template input', async () => {
    const template = join(directory, 'templates', 'card.html');

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: template, outputPath: join(directory, 'output', 'card.html') }],
        stylesheetPath: join(directory, 'templates', 'nested', '..', 'card.html'),
        reportPath: join(directory, 'report.json'),
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [template] });
  });

  test.each([
    [
      'stylesheet ancestor of template output',
      (root: string) => ({
        templates: [
          {
            inputPath: join(root, 'input.html'),
            outputPath: join(root, 'generated', 'card.html'),
          },
        ],
        stylesheetPath: join(root, 'generated'),
        reportPath: join(root, 'report.json'),
        collision: [join(root, 'generated', 'card.html'), join(root, 'generated')],
      }),
    ],
    [
      'template output ancestor of stylesheet',
      (root: string) => ({
        templates: [
          {
            inputPath: join(root, 'input.html'),
            outputPath: join(root, 'generated', 'card.html'),
          },
        ],
        stylesheetPath: join(root, 'generated', 'card.html', 'flex.css'),
        reportPath: join(root, 'report.json'),
        collision: [join(root, 'generated', 'card.html'), join(root, 'generated', 'card.html', 'flex.css')],
      }),
    ],
    [
      'report ancestor of template input',
      (root: string) => ({
        templates: [
          {
            inputPath: join(root, 'report.json', 'input.html'),
            outputPath: join(root, 'output.html'),
          },
        ],
        stylesheetPath: join(root, 'flex.css'),
        reportPath: join(root, 'report.json'),
        collision: [join(root, 'report.json', 'input.html'), join(root, 'report.json')],
      }),
    ],
    [
      'template input ancestor of report',
      (root: string) => ({
        templates: [
          {
            inputPath: join(root, 'input.html'),
            outputPath: join(root, 'output.html'),
          },
        ],
        stylesheetPath: join(root, 'flex.css'),
        reportPath: join(root, 'input.html', 'report.json'),
        collision: [join(root, 'input.html'), join(root, 'input.html', 'report.json')],
      }),
    ],
    [
      'stylesheet ancestor of report',
      (root: string) => ({
        templates: [{ inputPath: join(root, 'input.html'), outputPath: join(root, 'output.html') }],
        stylesheetPath: join(root, 'flex.css'),
        reportPath: join(root, 'flex.css', 'report.json'),
        collision: [join(root, 'flex.css'), join(root, 'flex.css', 'report.json')],
      }),
    ],
    [
      'report ancestor of stylesheet',
      (root: string) => ({
        templates: [{ inputPath: join(root, 'input.html'), outputPath: join(root, 'output.html') }],
        stylesheetPath: join(root, 'report.json', 'flex.css'),
        reportPath: join(root, 'report.json'),
        collision: [join(root, 'report.json', 'flex.css'), join(root, 'report.json')],
      }),
    ],
  ])('rejects a normalized %s collision without creating either path', async (_name, requestFor) => {
    const request = requestFor(directory);

    await expect(validateMigrationPaths(request)).rejects.toMatchObject({
      code: 'path-collision',
      paths: request.collision,
    });
    for (const collisionPath of request.collision) {
      await expect(access(collisionPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  test('rejects an ancestor relationship between different template claims', async () => {
    const firstOutput = join(directory, 'generated', 'card.html');
    const secondInput = join(firstOutput, 'nested.html');

    await expect(
      validateMigrationPaths({
        templates: [
          { inputPath: join(directory, 'first.html'), outputPath: firstOutput },
          { inputPath: secondInput, outputPath: join(directory, 'second.html') },
        ],
      }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [firstOutput, secondInput] });
  });

  test('rejects an ancestor relationship within one template instead of treating it as in-place', async () => {
    const input = join(directory, 'card.html');
    const output = join(input, 'nested.html');

    await expect(
      validateMigrationPaths({ templates: [{ inputPath: input, outputPath: output }] }),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [input, output] });
  });

  test('allows path-segment prefix siblings without creating them', async () => {
    const input = join(directory, 'card');
    const output = join(directory, 'card-copy');
    const stylesheet = join(directory, 'flex.css');
    const report = join(directory, 'flex.css-report.json');

    await expect(
      validateMigrationPaths({
        templates: [{ inputPath: input, outputPath: output }],
        stylesheetPath: stylesheet,
        reportPath: report,
      }),
    ).resolves.toBeUndefined();
    for (const candidate of [input, output, stylesheet, report]) {
      await expect(access(candidate)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  test('rejects an ancestor collision using Windows path semantics', async () => {
    const stylesheet = String.raw`C:\project\flex.css`;
    const report = String.raw`C:\project\flex.css\report.json`;

    await expect(
      validateMigrationPaths(
        {
          templates: [
            {
              inputPath: String.raw`C:\project\input.html`,
              outputPath: String.raw`C:\project\output.html`,
            },
          ],
          stylesheetPath: stylesheet,
          reportPath: report,
        },
        win32,
      ),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [stylesheet, report] });
  });

  test('allows Windows path-segment prefix siblings', async () => {
    await expect(
      validateMigrationPaths(
        {
          templates: [
            {
              inputPath: String.raw`C:\project\card`,
              outputPath: String.raw`C:\project\card-copy`,
            },
          ],
          stylesheetPath: String.raw`C:\project\flex.css`,
          reportPath: String.raw`C:\project\flex.css-report.json`,
        },
        win32,
      ),
    ).resolves.toBeUndefined();
  });

  test.each([
    [
      'template input and stylesheet',
      {
        templates: [
          {
            inputPath: String.raw`C:\Project\card.html`,
            outputPath: String.raw`C:\Project\output.html`,
          },
        ],
        stylesheetPath: String.raw`c:\project\CARD.HTML`,
        reportPath: String.raw`C:\Project\report.json`,
      },
      String.raw`C:\Project\card.html`,
    ],
    [
      'template output and report',
      {
        templates: [
          {
            inputPath: String.raw`C:\Project\input.html`,
            outputPath: String.raw`C:\Project\card.html`,
          },
        ],
        stylesheetPath: String.raw`C:\Project\flex.css`,
        reportPath: String.raw`c:\project\CARD.HTML`,
      },
      String.raw`C:\Project\card.html`,
    ],
    [
      'stylesheet and report expressed with forward slashes',
      {
        templates: [
          {
            inputPath: 'C:/Project/input.html',
            outputPath: 'C:/Project/output.html',
          },
        ],
        stylesheetPath: 'C:/Project/flex.css',
        reportPath: 'c:/project/FLEX.CSS',
      },
      String.raw`C:\Project\flex.css`,
    ],
  ])('rejects Win32 case-only aliases between %s', async (_name, request, collisionPath) => {
    await expect(validateMigrationPaths(request, win32)).rejects.toMatchObject({
      code: 'path-collision',
      paths: [collisionPath],
    });
  });

  test('allows an intentional Win32 case-only in-place template alias', async () => {
    await expect(
      validateMigrationPaths(
        {
          templates: [
            {
              inputPath: String.raw`C:\Project\card.html`,
              outputPath: String.raw`c:\project\CARD.HTML`,
            },
          ],
        },
        win32,
      ),
    ).resolves.toBeUndefined();
  });

  test('keeps a POSIX backslash filename distinct from separator-delimited descendants', async () => {
    const stylesheet = join(directory, String.raw`flex\owned.css`);
    const report = join(directory, 'flex', 'owned.css', 'report.json');

    await expect(
      validateMigrationPaths(
        {
          templates: [
            {
              inputPath: join(directory, 'input.html'),
              outputPath: join(directory, 'output.html'),
            },
          ],
          stylesheetPath: stylesheet,
          reportPath: report,
        },
        posix,
      ),
    ).resolves.toBeUndefined();
    await expect(access(stylesheet)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(report)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
