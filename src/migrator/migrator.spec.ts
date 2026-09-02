import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { AdapterFactory } from '../adapter/adapter.factory';
import type { OwnedCssReferences } from '../adapter/css/stylesheet/owned-stylesheet.merger';
import type { MigrationTransaction } from '../transaction/migration-transaction';
import { Migrator } from './migrator';
import type { StylesheetPlanner } from './stylesheet.planner';

describe('Migrator', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'migrator-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('returns a timed dry-run report without writing a changed file', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const clockValues = [1000, 1125];
    const now = () => clockValues.shift() ?? 1125;

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, now).migrate({ dryRun: true });

    expect(report).toMatchObject({
      schemaVersion: 1,
      target: 'tailwind',
      dryRun: true,
      durationMs: 125,
      summary: {
        filesScanned: 1,
        filesChanged: 1,
        converted: 1,
        review: 0,
        unsupported: 0,
        invalid: 0,
        parseErrors: 0,
      },
    });
    expect(report.files).toEqual([
      {
        path: 'card.html',
        changed: true,
        results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 }],
      },
    ]);
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('preflights the complete plan during a dry run without applying it', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    await new Migrator(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({ dryRun: true });

    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'tailwind',
        artifacts: [expect.objectContaining({ path: outputPath, kind: 'template' })],
      }),
    );
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('plans a changed single file from relative paths during a dry run', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await new Migrator(
      tailwindSession(),
      relative(process.cwd(), inputPath),
      relative(process.cwd(), outputPath),
      () => 0,
    ).migrate({ dryRun: true });

    expect(report.summary).toMatchObject({ filesScanned: 1, filesChanged: 1, converted: 1 });
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('applies planned template artifacts after a successful Tailwind migration', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
    });

    expect(report.summary).toMatchObject({ filesScanned: 1, filesChanged: 1, converted: 1 });
    expect(await readFile(outputPath, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('delegates one complete non-dry-run plan to the transaction', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      dryRun: false,
    });

    expect(report.summary.filesChanged).toBe(1);
    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.apply).toHaveBeenCalledOnce();
    expect(transaction.apply).toHaveBeenCalledWith(transaction.preflight.mock.calls[0]?.[0]);
  });

  test('aggregates every nested folder template into the application report', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(join(inputPath, 'nested'), { recursive: true });
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="column"></div>', 'utf8');
    await writeFile(join(inputPath, 'nested', 'b.html'), '<div class="card"></div>', 'utf8');

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, () => 20).migrate({ dryRun: true });

    expect(report.files.map(file => ({ path: file.path, changed: file.changed }))).toEqual([
      { path: 'a.html', changed: true },
      { path: 'nested/b.html', changed: false },
    ]);
    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, converted: 1 });
  });

  test('applies changed folder templates from relative paths', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(join(inputPath, 'nested'), { recursive: true });
    await writeFile(join(inputPath, 'card.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'nested', 'panel.html'), '<div fxLayout="column"></div>', 'utf8');

    const report = await new Migrator(
      tailwindSession(),
      relative(process.cwd(), inputPath),
      relative(process.cwd(), outputPath),
      () => 0,
    ).migrate({ dryRun: false });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 2, converted: 2 });
    expect(await readFile(join(outputPath, 'card.html'), 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
    expect(await readFile(join(outputPath, 'nested', 'panel.html'), 'utf8')).toBe(
      '<div class="flex flex-col box-border"></div>',
    );
  });

  test('does not apply any planned template artifact when a folder contains a parse error', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, parseErrors: 1 });
    expect(report.application).toEqual({ status: 'skipped', reason: 'parse-errors' });
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('returns the complete parse-error report without invoking transaction preflight or apply', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');
    const transaction = transactionDouble();

    const report = await new Migrator(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      dryRun: false,
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, parseErrors: 1 });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('preflights a valid plan with no artifacts and skips apply', async () => {
    const inputPath = join(temporaryDirectory, 'plain.html');
    const outputPath = join(temporaryDirectory, 'plain-output.html');
    await writeFile(inputPath, '<div class="card"></div>', 'utf8');
    const transaction = transactionDouble();

    await new Migrator(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({ dryRun: false });

    expect(transaction.preflight).toHaveBeenCalledWith(expect.objectContaining({ artifacts: [] }));
    expect(transaction.apply).not.toHaveBeenCalled();
  });

  test('rejects unsupported file extensions', async () => {
    const inputPath = join(temporaryDirectory, 'styles.css');
    await writeFile(inputPath, '.card {}', 'utf8');

    await expect(
      new Migrator(tailwindSession(), inputPath, inputPath, () => 0).migrate({ dryRun: false }),
    ).rejects.toThrow(`Unsupported file type: ${inputPath}`);
  });

  test('preflights one complete CSS template and stylesheet plan during dry-run', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await new Migrator(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
      transaction,
    ).migrate({ dryRun: true, stylesheetPath });

    expect(report).toMatchObject({
      target: 'css',
      dryRun: true,
      summary: { filesScanned: 1, filesChanged: 1, converted: 1 },
      stylesheet: { path: 'flex-layout-migration.css', change: 'created' },
    });
    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'css',
        artifacts: expect.arrayContaining([
          expect.objectContaining({ kind: 'template', path: outputPath }),
          expect.objectContaining({ kind: 'stylesheet', path: stylesheetPath }),
        ]),
      }),
    );
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('applies CSS template and stylesheet artifacts through one transaction', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'created' });
    const migrated = await readFile(outputPath, 'utf8');
    const generatedClass = migrated.match(/class="(flm-[a-f0-9]+)"/)?.[1];
    expect(generatedClass).toBeDefined();
    expect(await readFile(stylesheetPath, 'utf8')).toContain(`.${generatedClass} {`);
  });

  test('reports an unchanged stylesheet when the generated rules are already current', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('reports and applies a stylesheet update when generated rules change', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const originalStylesheet = await readFile(stylesheetPath, 'utf8');
    await writeFile(inputPath, '<div fxLayout="column"></div>', 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'updated' });
    expect(await readFile(stylesheetPath, 'utf8')).not.toBe(originalStylesheet);
  });

  test('retains generated CSS referenced by an unchanged distinct destination template', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    await writeFile(inputPath, '<div></div>', 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });

  test('retains rules from templates outside a later single-file invocation sharing the stylesheet', async () => {
    const firstTemplate = join(temporaryDirectory, 'first.html');
    const secondTemplate = join(temporaryDirectory, 'second.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(firstTemplate, '<div fxLayout="row"></div>', 'utf8');
    await writeFile(secondTemplate, '<div fxLayout="column"></div>', 'utf8');

    await new Migrator(AdapterFactory.createSession('css'), firstTemplate, firstTemplate, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const firstClass = (await readFile(firstTemplate, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(firstClass).toBeDefined();

    await new Migrator(AdapterFactory.createSession('css'), secondTemplate, secondTemplate, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const secondClass = (await readFile(secondTemplate, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(secondClass).toBeDefined();
    expect(secondClass).not.toBe(firstClass);

    const stylesheet = await readFile(stylesheetPath, 'utf8');
    expect(stylesheet).toContain(`.${firstClass} {`);
    expect(stylesheet).toContain(`.${secondClass} {`);
  });

  test('retains a live owned rule referenced through literal ngClass', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    const stylesheetBefore = await readFile(stylesheetPath, 'utf8');
    await writeFile(inputPath, `<div ngClass="${generatedClass}"></div>`, 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    expect(await readFile(stylesheetPath, 'utf8')).toBe(stylesheetBefore);
  });

  test.each([
    ['literal', `ngClass="flm-${'a'.repeat(64)}"`, [`flm-${'a'.repeat(64)}`]],
    ['property binding', '[ngClass]="classes"', []],
    ['bind syntax', 'bind-ngClass="classes"', []],
    ['responsive literal', `ngClass.sm="flm-${'a'.repeat(64)}"`, [`flm-${'a'.repeat(64)}`]],
    ['responsive property binding', '[ngClass.sm]="classes"', []],
  ] as const)(
    'marks %s ngClass authority incomplete and extracts only exact literal tokens',
    async (_label, source, tokens) => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      const transaction = transactionDouble();
      const stylesheetPlanner = {
        plan: vi.fn<StylesheetPlanner['plan']>().mockResolvedValue(undefined),
      };
      await writeFile(inputPath, `<div ${source}></div>`, 'utf8');

      await new Migrator(
        AdapterFactory.createSession('css'),
        inputPath,
        inputPath,
        () => 0,
        transaction,
        stylesheetPlanner,
      ).migrate({ dryRun: true, stylesheetPath });

      const references = stylesheetPlanner.plan.mock.calls[0]?.[2] as OwnedCssReferences;
      expect(references.complete).toBe(false);
      expect([...references.classNames]).toEqual(tokens);
    },
  );

  test('retains unmatched generated CSS without an explicit complete pruning scope', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    await writeFile(inputPath, '<div></div>', 'utf8');
    await writeFile(outputPath, '<div></div>', 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });

  test.each(['class="%s {{ extra }}"', '[class]="extra"', '[className]="extra"', 'bind-className="extra"'])(
    'preserves owned CSS when an in-place class reference is interpolation or binding uncertain',
    async classAttribute => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
      await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      });
      const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
      expect(generatedClass).toBeDefined();
      await writeFile(inputPath, `<div ${classAttribute.replace('%s', generatedClass as string)}></div>`, 'utf8');

      const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      });

      expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    },
  );

  test('retains and validates a statically named generated class binding', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    await writeFile(inputPath, `<div [class.${generatedClass}]="enabled"></div>`, 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('fails closed for a statically named generated class binding without an owned rule', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    await writeFile(inputPath, `<div [class.flm-${'f'.repeat(64)}]="enabled"></div>`, 'utf8');

    await expect(
      new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test('retains a generated class named through bind-class syntax', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    await writeFile(inputPath, `<div bind-class.${generatedClass}="enabled"></div>`, 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('fails closed for an unknown generated class named through bind-class syntax', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    await writeFile(inputPath, `<div bind-class.flm-${'f'.repeat(64)}="enabled"></div>`, 'utf8');

    await expect(
      new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test.each([`flm-${'a'.repeat(64)}-modifier`, `handwritten-flm-${'f'.repeat(64)}`])(
    'does not treat a boundary-adjacent handwritten class name as a generated authority',
    async className => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
      await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      });
      await writeFile(inputPath, `<div class="${className}"></div>`, 'utf8');

      const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      });

      expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    },
  );

  test('fails closed when a static generated-looking class has no owned rule', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      dryRun: false,
      stylesheetPath,
    });
    await writeFile(inputPath, `<div class="flm-${'f'.repeat(64)}"></div>`, 'utf8');

    await expect(
      new Migrator(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        dryRun: false,
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test('finalizes CSS after planning every folder template', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await mkdir(inputPath);
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'b.html'), '<div fxLayout="column"></div>', 'utf8');

    const report = await new Migrator(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      dryRun: true,
      stylesheetPath,
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 2, converted: 2 });
    expect(report.stylesheet).toEqual({ path: '../flex-layout-migration.css', change: 'created' });
  });

  test('returns a complete CSS parse-error report without preflighting or applying the plan', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await mkdir(inputPath);
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z.html'), '<span fxLayout="row" />', 'utf8');
    const transaction = transactionDouble();

    const report = await new Migrator(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
      transaction,
    ).migrate({ dryRun: false, stylesheetPath });

    expect(report).toMatchObject({
      target: 'css',
      application: { status: 'skipped', reason: 'parse-errors' },
      summary: { filesScanned: 2, filesChanged: 1, converted: 1, parseErrors: 1 },
      stylesheet: { path: '../flex-layout-migration.css', change: 'created' },
    });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function tailwindSession() {
  return AdapterFactory.createSession('tailwind');
}

function transactionDouble() {
  return {
    preflight: vi.fn<MigrationTransaction['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransaction['apply']>().mockResolvedValue(undefined),
  };
}
