import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';

const repository = resolve(import.meta.dirname, '../..');
const executable = join(repository, 'dist', 'cli.js');
const fixtures = join(repository, 'test', 'fixtures', 'enterprise-architecture');
const handwrittenStylesheet = '/* enterprise architecture handwritten CSS */\n.keep { color: rebeccapurple; }\n';

interface ParityCase {
  readonly name: string;
  readonly target: 'tailwind' | 'css';
  readonly inputFixture: string;
  readonly expectedTemplateFixture: string;
  readonly expectedStylesheetFixture?: string;
  readonly responsiveImages: boolean;
}

interface ExecutionResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface MatrixExpectation {
  readonly plan: ExecutionResult;
  readonly write: ExecutionResult;
  readonly rerun: ExecutionResult;
  readonly planReport: object;
  readonly writeReport: object;
  readonly rerunReport: object;
}

const cases: readonly ParityCase[] = [
  {
    name: 'Tailwind Flex and Grid migration',
    target: 'tailwind',
    inputFixture: 'tailwind.input.html',
    expectedTemplateFixture: 'tailwind.expected.html',
    responsiveImages: false,
  },
  {
    name: 'native CSS Flex migration',
    target: 'css',
    inputFixture: 'native-css.input.html',
    expectedTemplateFixture: 'native-css.expected.html',
    expectedStylesheetFixture: 'native-css.expected.css',
    responsiveImages: false,
  },
  {
    name: 'responsive image migration',
    target: 'tailwind',
    inputFixture: 'responsive-image.input.html',
    expectedTemplateFixture: 'responsive-image.expected.html',
    responsiveImages: true,
  },
];

const matrixExpectations: Record<ParityCase['name'], MatrixExpectation> = {
  'Tailwind Flex and Grid migration': {
    plan: terminal(
      'Plan: 1 files scanned, 1 would change\nConverted 7 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nNo project files were written. Run again with --write to apply this plan.\n',
    ),
    write: terminal(
      'Applied: 1 files scanned, 1 changed\nConverted 7 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    ),
    rerun: terminal(
      'Applied: 1 files scanned, 0 changed\nConverted 0 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    ),
    planReport: report({
      target: 'tailwind',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      converted: 7,
      changed: true,
      results: [
        converted('fxLayout', 'fxLayout', 9),
        converted('fxLayoutGap', 'fxLayoutGap', 24),
        converted('fxFlex', 'fxFlex', 50),
        converted('fxLayout', 'fxLayout', 85),
        converted('fxLayout', 'fxLayout.sm', 100),
        converted('gdColumns', 'gdColumns', 133),
        converted('gdGap', 'gdGap', 160),
      ],
    }),
    writeReport: report({
      target: 'tailwind',
      mode: 'write',
      application: { status: 'applied' },
      converted: 7,
      changed: true,
      results: [
        converted('fxLayout', 'fxLayout', 9),
        converted('fxLayoutGap', 'fxLayoutGap', 24),
        converted('fxFlex', 'fxFlex', 50),
        converted('fxLayout', 'fxLayout', 85),
        converted('fxLayout', 'fxLayout.sm', 100),
        converted('gdColumns', 'gdColumns', 133),
        converted('gdGap', 'gdGap', 160),
      ],
    }),
    rerunReport: report({ target: 'tailwind', mode: 'write', application: { status: 'applied' }, converted: 0 }),
  },
  'native CSS Flex migration': {
    plan: terminal(
      'Plan: 1 files scanned, 1 would change\nConverted 5 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nStylesheet: would update migration.css\nNo project files were written. Run again with --write to apply this plan.\n',
    ),
    write: terminal(
      'Applied: 1 files scanned, 1 changed\nConverted 5 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nStylesheet: updated migration.css\n',
    ),
    rerun: terminal(
      'Applied: 1 files scanned, 0 changed\nConverted 0 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nStylesheet: unchanged migration.css\n',
    ),
    planReport: report({
      target: 'css',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      converted: 5,
      changed: true,
      stylesheetChange: 'updated',
      results: [
        converted('fxLayout', 'fxLayout', 9),
        converted('fxLayoutGap', 'fxLayoutGap', 24),
        converted('fxFlex', 'fxFlex', 50),
        converted('fxLayout', 'fxLayout', 85),
        converted('fxLayoutGap', 'fxLayoutGap.sm', 103),
      ],
    }),
    writeReport: report({
      target: 'css',
      mode: 'write',
      application: { status: 'applied' },
      converted: 5,
      changed: true,
      stylesheetChange: 'updated',
      results: [
        converted('fxLayout', 'fxLayout', 9),
        converted('fxLayoutGap', 'fxLayoutGap', 24),
        converted('fxFlex', 'fxFlex', 50),
        converted('fxLayout', 'fxLayout', 85),
        converted('fxLayoutGap', 'fxLayoutGap.sm', 103),
      ],
    }),
    rerunReport: report({
      target: 'css',
      mode: 'write',
      application: { status: 'applied' },
      converted: 0,
      stylesheetChange: 'unchanged',
    }),
  },
  'responsive image migration': {
    plan: terminal(
      'Plan: 1 files scanned, 1 would change\nConverted 2 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\nNo project files were written. Run again with --write to apply this plan.\n',
    ),
    write: terminal(
      'Applied: 1 files scanned, 1 changed\nConverted 2 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    ),
    rerun: terminal(
      'Applied: 1 files scanned, 0 changed\nConverted 0 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    ),
    planReport: report({
      target: 'tailwind',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      converted: 2,
      changed: true,
      results: [converted('imgSrc', 'src.xs', 31), converted('imgSrc', 'src.md', 50)],
    }),
    writeReport: report({
      target: 'tailwind',
      mode: 'write',
      application: { status: 'applied' },
      converted: 2,
      changed: true,
      results: [converted('imgSrc', 'src.xs', 31), converted('imgSrc', 'src.md', 50)],
    }),
    rerunReport: report({ target: 'tailwind', mode: 'write', application: { status: 'applied' }, converted: 0 }),
  },
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('enterprise architecture packaged CLI parity', () => {
  test.each(cases)('$name preserves the public plan/write contract', async parityCase => {
    const directory = await mkdtemp(join(tmpdir(), 'enterprise-rewrite-parity-'));
    temporaryDirectories.push(directory);
    const expectation = matrixExpectations[parityCase.name];
    if (expectation === undefined) throw new Error(`Missing matrix expectation for ${parityCase.name}.`);
    const input = join(directory, 'input.html');
    const report = join(directory, 'report.json');
    const stylesheet = join(directory, 'migration.css');
    const sourceFixture = join(fixtures, parityCase.inputFixture);
    const expectedTemplate = await readFile(join(fixtures, parityCase.expectedTemplateFixture), 'utf8');
    const expectedStylesheet =
      parityCase.expectedStylesheetFixture === undefined
        ? undefined
        : await readFile(join(fixtures, parityCase.expectedStylesheetFixture), 'utf8');
    await cp(sourceFixture, input);
    if (parityCase.target === 'css') await writeFile(stylesheet, handwrittenStylesheet, 'utf8');

    const originalTemplate = await readFile(input, 'utf8');
    const originalStylesheet = parityCase.target === 'css' ? await readFile(stylesheet, 'utf8') : undefined;
    const baseArguments = [input, '--target', parityCase.target, '--report', report];
    if (parityCase.target === 'css') baseArguments.push('--stylesheet', stylesheet);
    if (parityCase.responsiveImages) baseArguments.push('--responsive-images');

    const plan = execute(baseArguments, directory);
    expect(plan).toEqual(expectation.plan);
    expect(await readFile(input, 'utf8')).toBe(originalTemplate);
    if (originalStylesheet !== undefined) expect(await readFile(stylesheet, 'utf8')).toBe(originalStylesheet);
    expect(normalizeTemporaryPaths(JSON.parse(await readFile(report, 'utf8')), directory)).toEqual(
      expectation.planReport,
    );

    const applied = execute([...baseArguments, '--write'], directory);
    expect(applied).toEqual(expectation.write);
    expect(await readFile(input, 'utf8')).toBe(expectedTemplate);
    if (expectedStylesheet !== undefined) expect(await readFile(stylesheet, 'utf8')).toBe(expectedStylesheet);
    expect(normalizeTemporaryPaths(JSON.parse(await readFile(report, 'utf8')), directory)).toEqual(
      expectation.writeReport,
    );

    const firstTemplate = await readFile(input, 'utf8');
    const firstStylesheet = expectedStylesheet === undefined ? undefined : await readFile(stylesheet, 'utf8');
    const rerun = execute([...baseArguments, '--write'], directory);
    expect(rerun).toEqual(expectation.rerun);
    expect(await readFile(input, 'utf8')).toBe(firstTemplate);
    if (firstStylesheet !== undefined) expect(await readFile(stylesheet, 'utf8')).toBe(firstStylesheet);
    expect(normalizeTemporaryPaths(JSON.parse(await readFile(report, 'utf8')), directory)).toEqual(
      expectation.rerunReport,
    );
  });
});

function terminal(stdout: string): ExecutionResult {
  return { status: 0, stdout, stderr: '' };
}

function converted(directive: string, sourceName: string, offset: number): object {
  return { status: 'converted', directive, sourceName, offset };
}

function report({
  target,
  mode,
  application,
  converted: convertedCount,
  changed = false,
  results = [],
  stylesheetChange,
}: {
  readonly target: 'tailwind' | 'css';
  readonly mode: 'plan' | 'write';
  readonly application: object;
  readonly converted: number;
  readonly changed?: boolean;
  readonly results?: readonly object[];
  readonly stylesheetChange?: 'updated' | 'unchanged';
}): object {
  return {
    schemaVersion: 2,
    mode,
    target,
    application,
    input: 'input.html',
    output: 'input.html',
    durationMs: expect.any(Number),
    summary: {
      filesScanned: 1,
      filesChanged: changed ? 1 : 0,
      converted: convertedCount,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
    },
    files: [{ path: 'input.html', changed, results }],
    ...(stylesheetChange === undefined ? {} : { stylesheet: { path: 'migration.css', change: stylesheetChange } }),
  };
}

function execute(arguments_: readonly string[], cwd: string): ExecutionResult {
  const execution = spawnSync(process.execPath, [executable, ...arguments_], { cwd, encoding: 'utf8' });
  if (execution.error !== undefined) throw execution.error;
  return { status: execution.status, stdout: execution.stdout, stderr: execution.stderr };
}

function normalizeTemporaryPaths(value: unknown, temporaryDirectory: string): unknown {
  return JSON.parse(JSON.stringify(value).replaceAll(temporaryDirectory, '<temporary-directory>'));
}
