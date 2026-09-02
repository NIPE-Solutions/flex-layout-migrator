import { access, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
